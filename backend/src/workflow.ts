import OpenAI from 'openai'
import { readFile } from 'fs/promises'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { log, clearLog } from './logger.ts'
import type { Contact } from '../../fixtures/types.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CONTACTS_PATH = resolve(__dirname, '../../fixtures/contacts.json')
const TYPES_PATH = resolve(__dirname, '../../fixtures/types.ts')

const LM_STUDIO_BASE_URL = process.env.LM_STUDIO_URL ?? 'http://localhost:1234/v1'

const client = new OpenAI({
  baseURL: LM_STUDIO_BASE_URL,
  apiKey: 'lm-studio',
  maxRetries: 0,
})

type TokenUsage = { promptTokens: number; completionTokens: number; totalTokens: number }

function addUsage(total: TokenUsage, usage?: OpenAI.CompletionUsage | null) {
  if (!usage) return
  total.promptTokens += usage.prompt_tokens ?? 0
  total.completionTokens += usage.completion_tokens ?? 0
  total.totalTokens += usage.total_tokens ?? 0
}

async function loadContacts(): Promise<Contact[]> {
  const raw = await readFile(CONTACTS_PATH, 'utf-8')
  return JSON.parse(raw) as Contact[]
}

async function loadWorkflowTypes(): Promise<string> {
  return await readFile(TYPES_PATH, 'utf-8')
}

async function interpretImage(imageBase64: string, mimeType: string, usage: TokenUsage): Promise<string> {
  const systemText = `You are an expert at reading approval workflow diagrams. Your job is to extract ALL information accurately.

RULES:
- Each rectangle/box in the diagram is a SEPARATE stage. Count every single one — do NOT merge or skip any.
- Stages positioned side-by-side (horizontally aligned) are PARALLEL — they start at the same time and have NO dependency on each other.
- Stages positioned one below/after another (vertically or sequentially connected) are SEQUENTIAL.
- Pay very close attention to arrows and connectors: they show dependencies and conditions between stages.
- Read ALL text inside and near each box carefully: stage names, people names, roles, conditions.
- OCR can be tricky — read names character by character. Common OCR errors: 'ng' misread as 'no', 'rn' misread as 'm', letters confused. Double-check every person's name.
- A participant name might be very short — even a single character (e.g. "H"). If two names appear on separate lines inside a box, they are SEPARATE participants. Do NOT merge them into one name.
- For each stage, list: stage name, all participants (names exactly as written), their roles, and any conditions/decisions on connecting arrows.
- Describe the FULL dependency graph: which stages depend on which, and what condition triggers the next stage (e.g. "approved", "approved or approved with changes", "completed").
- If an arrow/condition says "approved/with changes", interpret it as TWO conditions: "approved" AND "approved with changes". Both outcomes lead to the next stage.
- If a stage has no participants listed, explicitly note that.

Output a structured text description with numbered stages.`
  const userText = 'Analyze this approval workflow diagram. Count ALL rectangles/boxes — each one is a stage. List every stage with its participants, roles, and the dependency/condition arrows between stages. Pay special attention to parallel vs sequential stages and read all names very carefully character by character.'

  log('\n[VISION] Sending prompt to qwen/qwen3-vl-8b')
  log('[VISION] System:', systemText)
  log('[VISION] User:', userText)
  log(`[VISION] Image: ${mimeType}, ${Math.round(imageBase64.length * 0.75 / 1024)}KB`)

  let response
  try {
    response = await client.chat.completions.create({
      model: 'qwen/qwen3-vl-8b',
      temperature: 0.1,
      messages: [
        { role: 'system', content: systemText },
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
            { type: 'text', text: userText },
          ],
        },
      ],
    })
  } catch (err) {
    log('[VISION] ERROR calling vision model:', (err as Error).message)
    log('[VISION] Stack:', (err as Error).stack)
    throw err
  }

  addUsage(usage, response.usage)
  const result = response.choices[0]?.message?.content ?? ''
  log('[VISION] Response:', result)
  return result
}

async function buildWorkflow(imageDescription: string, contacts: Contact[], workflowTypes: string, usage: TokenUsage): Promise<string> {
  const contactsJson = JSON.stringify(contacts, null, 2)

  const systemPrompt = `You are an expert workflow architect. Your task is to build a structured Workflow JSON object from a workflow diagram description.

Here is the FULL LIST of contacts in the organization:
${contactsJson}

Your job:
1. Compare ALL person names from the diagram against the contacts list above. Account for OCR errors — names may be misspelled, truncated, or slightly wrong (e.g. "Ping" instead of "Pino", "Cutlor" instead of "Cutler", "Karthi" instead of "Karthikeyan"). Use fuzzy/partial matching on first name or last name.
2. For each matched person, populate "name" (use the contact's name, NOT the OCR'd name from the diagram), "id", and "role" from the contacts list.
3. If a person from the diagram does NOT match any contact even with fuzzy matching, set ONLY "name" (as written in diagram) and "role". Do NOT populate "id" or invent data.
4. For stages WITHOUT specific people assigned, suggest 1-2 contacts based on position relevance. For sign-off/final approval stages, pick the HIGHEST-ranking contacts (CTO, VP, Director).
5. Output a valid JSON object matching the Workflow type.

Use the following TypeScript types to structure your output:
${workflowTypes}

IMPORTANT RULES:
- Do NOT make up data. Only use contacts from the list above.
- The "role" should default to "approver" unless the diagram indicates otherwise (e.g. "reviewer", "readonly").
- All decisions should default to "pending".
- The workflow decision should be "pending".
- Parallel stages (no dependency between them) should NOT have dependsOn referencing each other.
- Output ONLY a valid JSON object matching the Workflow type. No extra text, no markdown fences, no explanations.`

  const userMessage = `Here is the description of the approval workflow diagram:\n\n${imageDescription}\n\nBuild the complete Workflow JSON object. Match all people from the diagram to contacts using fuzzy matching. Stages without assigned people need a suggested contact based on position relevance.`

  log('\n[BUILD] Sending prompt to openai/gpt-oss-20b')
  log('[BUILD] System prompt:', systemPrompt)
  log('[BUILD] User message:', userMessage)

  let response
  try {
    response = await client.chat.completions.create({
      model: 'openai/gpt-oss-20b',
      temperature: 0.5,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
    })
  } catch (err) {
    log('[BUILD] ERROR calling reasoning model:', (err as Error).message)
    log('[BUILD] Stack:', (err as Error).stack)
    throw err
  }

  addUsage(usage, response.usage)
  const result = response.choices[0]?.message?.content ?? ''
  log('[BUILD] Response:', result)
  return result
}

export async function analyzeWorkflow(imageBase64: string, mimeType: string) {
  clearLog()
  const usage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }

  log('Step 1: Interpreting workflow diagram image with vision model...')
  const imageDescription = await interpretImage(imageBase64, mimeType, usage)
  log('Image interpretation complete.')

  log('\nStep 2: Loading contacts and types...')
  const [contacts, workflowTypes] = await Promise.all([loadContacts(), loadWorkflowTypes()])
  log(`Loaded ${contacts.length} contacts.`)

  log('\nStep 3: Building workflow structure with reasoning model...')
  const result = await buildWorkflow(imageDescription, contacts, workflowTypes, usage)

  log('\nWorkflow analysis complete.')
  log('[RESULT]', result)

  const cleaned = extractJson(result)
  log('[CLEANED]', cleaned)
  log('[USAGE]', JSON.stringify(usage))

  try {
    const parsed = JSON.parse(cleaned)
    if (isValidWorkflow(parsed)) {
      return { workflow: parsed, usage }
    }
    log('[WARN] Parsed JSON is not a valid Workflow (missing stages). Raw:', cleaned)
    return { raw: result, usage }
  } catch {
    return { raw: result, usage }
  }
}

function isValidWorkflow(obj: unknown): boolean {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'stages' in obj &&
    Array.isArray((obj as Record<string, unknown>).stages)
  )
}

function extractJson(text: string): string {
  let cleaned = text.replace(/<\|[^>]*\|>/g, '')
  cleaned = cleaned.replace(/```json\s*/g, '').replace(/```\s*/g, '')
  cleaned = cleaned.trim()

  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start !== -1 && end !== -1 && end > start) {
    return cleaned.slice(start, end + 1)
  }

  return cleaned
}
