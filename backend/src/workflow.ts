import OpenAI from 'openai'
import { readFile } from 'fs/promises'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { log, clearLog } from './logger.ts'
import type { Contact } from '../../fixtures/types.ts'
import { b } from '../baml_client/index.js'
import { Collector, BamlValidationError } from '@boundaryml/baml'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CONTACTS_PATH = resolve(__dirname, '../../fixtures/contacts.json')

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

function buildInstructions(): string {
  return `You are an expert workflow architect. Your task is to build a structured Workflow JSON object from a workflow diagram description.

CRITICAL: Every rectangle/box in the diagram description MUST become a separate Stage in the output. Do NOT skip or merge any stages. If a box has no people/names listed inside, create the stage with an EMPTY participants array.

Your job:
1. First, create ALL stages from the diagram — one Stage per box/rectangle described. Preserve the exact stage names and dependency structure.
2. Compare ALL person names from the diagram against the contacts list provided. Account for OCR errors — names may be misspelled, truncated, or slightly wrong (e.g. "Ping" instead of "Pino", "Cutlor" instead of "Cutler", "Karthi" instead of "Karthikeyan"). Use fuzzy/partial matching on first name or last name.
3. For each matched person, populate "name" (use the contact's name, NOT the OCR'd name from the diagram), "id", and "role" from the contacts list provided.
4. If a person from the diagram does NOT match any contact even with fuzzy matching, set ONLY "name" (as written in diagram) and "role". Do NOT populate "id" or invent data.
5. For stages WITHOUT specific people assigned, suggest 1-2 contacts based on position relevance. For sign-off/final approval stages, pick the HIGHEST-ranking contacts (CTO, VP, Director).

IMPORTANT RULES:
- Every box/rectangle in the diagram = one Stage. No exceptions. No merging. No duplicating — each box appears EXACTLY once.
- Do NOT make up data. Only use contacts from the contacts list provided.
- The "role" should default to "approver" unless the diagram indicates otherwise (e.g. "reviewer", "readonly").
- All decisions should default to "pending".
- The workflow decision should be "pending".
- Parallel stages (no dependency between them) should NOT have dependsOn referencing each other.`
}

export async function analyzeWorkflow(imageBase64: string, mimeType: string) {
  clearLog()
  const usage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }

  log('Step 1: Interpreting workflow diagram image with vision model...')
  const imageDescription = await interpretImage(imageBase64, mimeType, usage)
  log('Image interpretation complete.')

  log('\nStep 2: Loading contacts...')
  const contacts = await loadContacts()
  log(`Loaded ${contacts.length} contacts.`)

  log('\nStep 3: Building workflow structure with BAML...')
  const collector = new Collector("reasoning-model")
  const instructions = buildInstructions()
  const contactsJson = JSON.stringify(contacts, null, 2)

  try {
    const workflow = await b.ExtractWorkflow(imageDescription, contactsJson, instructions, { collector })

    const bamlUsage = collector.last
    usage.promptTokens += bamlUsage?.usage?.inputTokens ?? 0
    usage.completionTokens += bamlUsage?.usage?.outputTokens ?? 0
    usage.totalTokens += (bamlUsage?.usage?.inputTokens ?? 0) + (bamlUsage?.usage?.outputTokens ?? 0)

    log('\nWorkflow analysis complete.')
    log('[RESULT]', JSON.stringify(workflow))
    log('[USAGE]', JSON.stringify(usage))

    return { workflow, usage }
  } catch (e) {
    if (e instanceof BamlValidationError) {
      log('[BAML_ERROR] Validation failed, raw output:', e.raw_output)
      return { raw: e.raw_output, usage }
    }
    throw e
  }
}
