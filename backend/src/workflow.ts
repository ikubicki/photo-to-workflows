import { ChatOpenAI } from '@langchain/openai'
import { HumanMessage, SystemMessage, type BaseMessage } from '@langchain/core/messages'
import { type AIMessage } from '@langchain/core/messages'
import { allTools } from './tools.ts'
import { log, clearLog } from './logger.ts'

const LM_STUDIO_BASE_URL = process.env.LM_STUDIO_URL ?? 'http://localhost:1234/v1'

type TokenUsage = { promptTokens: number; completionTokens: number; totalTokens: number }

function addUsage(total: TokenUsage, response: { response_metadata?: Record<string, unknown> }) {
  const usage = (response.response_metadata?.tokenUsage ?? response.response_metadata?.usage) as Record<string, number> | undefined
  if (!usage) return
  total.promptTokens += usage.promptTokens ?? usage.prompt_tokens ?? 0
  total.completionTokens += usage.completionTokens ?? usage.completion_tokens ?? 0
  total.totalTokens += usage.totalTokens ?? usage.total_tokens ?? 0
}

// Vision model for interpreting the workflow diagram image
const visionModel = new ChatOpenAI({
  model: 'qwen/qwen3-vl-8b',
  configuration: { baseURL: LM_STUDIO_BASE_URL, apiKey: 'lm-studio' },
  temperature: 0.1,
  maxRetries: 0,
})

// Main LLM for reasoning and tool use
const mainModel = new ChatOpenAI({
  model: 'openai/gpt-oss-20b',
  configuration: { baseURL: LM_STUDIO_BASE_URL, apiKey: 'lm-studio' },
  temperature: 0.5,
  maxRetries: 0,
}).bindTools(allTools, { tool_choice: 'auto' })

const WORKFLOW_TYPES = `
export enum Decision {
    APPROVED = 'approved',
    REJECTED = 'rejected',
    CHANGE_REQUESTED = 'change_requested',
    PENDING = 'pending',
    COMPLETED = 'completed',
}

export type Participant = {
    name: string,
    id?: string,
    role: 'approver' | 'reviewer' | 'readonly',
    decision?: Decision,
}

export type StageDependency = {
    parentStageId: string,
    condition: 'decision' | 'deadline' | 'completion',
    decision?: Decision,
    deadline?: Date,
}

export type Stage = {
    name: string,
    participants: Participant[],
    dependsOn?: StageDependency[],
    deadline?: Date,
    decision?: Decision,
    metadata?: Record<string, any>,
}

export type Workflow = {
    name: string,
    stages: Stage[],
    metadata?: Record<string, any>,
    decision?: Decision,
}
`

async function interpretImage(imageBase64: string, mimeType: string, usage: TokenUsage): Promise<string> {
  const systemText = `You are an expert at reading approval workflow diagrams. Your job is to extract ALL information accurately.

RULES:
- Each rectangle/box in the diagram is a SEPARATE stage. Count every single one — do NOT merge or skip any.
- Stages positioned side-by-side (horizontally aligned) are PARALLEL — they start at the same time and have NO dependency on each other.
- Stages positioned one below/after another (vertically or sequentially connected) are SEQUENTIAL.
- Pay very close attention to arrows and connectors: they show dependencies and conditions between stages.
- Read ALL text inside and near each box carefully: stage names, people names, roles, conditions.
- OCR can be tricky — read names character by character. Common OCR errors: 'ng' misread as 'no', 'rn' misread as 'm', letters confused. Double-check every person's name.
- For each stage, list: stage name, all participants (names exactly as written), their roles, and any conditions/decisions on connecting arrows.
- Describe the FULL dependency graph: which stages depend on which, and what condition triggers the next stage (e.g. "approved", "approved or approved with changes", "completed").
- If a stage has no participants listed, explicitly note that.

Output a structured text description with numbered stages.`
  const userText = 'Analyze this approval workflow diagram. Count ALL rectangles/boxes — each one is a stage. List every stage with its participants, roles, and the dependency/condition arrows between stages. Pay special attention to parallel vs sequential stages and read all names very carefully character by character.'

  log('\n[VISION] Sending prompt to qwen/qwen3-vl-8b')
  log('[VISION] System:', systemText)
  log('[VISION] User:', userText)
  log(`[VISION] Image: ${mimeType}, ${Math.round(imageBase64.length * 0.75 / 1024)}KB`)

  let response
  try {
    response = await visionModel.invoke([
      new SystemMessage(systemText),
      new HumanMessage({
        content: [
          {
            type: 'image_url',
            image_url: { url: `data:${mimeType};base64,${imageBase64}` },
          },
          {
            type: 'text',
            text: userText,
          },
        ],
      }),
    ])
  } catch (err) {
    log('[VISION] ERROR calling vision model:', (err as Error).message)
    log('[VISION] Stack:', (err as Error).stack)
    throw err
  }

  addUsage(usage, response)

  const result = typeof response.content === 'string'
    ? response.content
    : JSON.stringify(response.content)

  log('[VISION] Response:', result)
  return result
}

async function runAgentLoop(messages: BaseMessage[], usage: TokenUsage): Promise<string> {
  const toolsByName = Object.fromEntries(allTools.map(t => [t.name, t]))
  let currentMessages = [...messages]

  // Agent loop: call model, handle tool calls, repeat until final answer
  for (let i = 0; i < 50; i++) {
    log()
    log('------------------------------')
    log()
    log(`\n[AGENT] Iteration ${i + 1} — invoking openai/gpt-oss-20b`)
    log('[AGENT] Messages sent to model:')
    for (const msg of currentMessages) {
      const role = msg.getType()
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
      if (role === 'ai') {
        log('AI----', JSON.stringify(msg))
      }
      log(`  [${role}] ${content}`)
    }
    let response: AIMessage
    try {
      response = await mainModel.invoke(currentMessages) as AIMessage
    } catch (err) {
      log('[AGENT] ERROR calling reasoning model:', (err as Error).message)
      log('[AGENT] Stack:', (err as Error).stack)
      throw err
    }
    addUsage(usage, response)
    currentMessages.push(response)
    log('----R----', JSON.stringify(response))
    const responseText = typeof response.content === 'string'
      ? response.content
      : JSON.stringify(response.content)
    log(`[AGENT] Response:`, responseText)
    log(`[AGENT] Tool calls:`, JSON.stringify(response.tool_calls))
    log(`[AGENT] Additional kwargs:`, JSON.stringify(response.additional_kwargs))

    // Try structured tool_calls first
    const toolCalls = response.tool_calls ?? []

    if (!toolCalls || toolCalls.length === 0) {
      // If content is empty or not valid JSON, nudge the model for proper output
      if (!responseText || responseText === '""' || responseText === '[]' || !looksLikeWorkflowJson(responseText)) {
        log('[AGENT] No tool calls and response is not valid Workflow JSON — nudging model')
        currentMessages.push(new HumanMessage(
          'You did not produce a valid Workflow JSON. Do NOT write tool calls as text. ' +
          'Output the complete Workflow JSON object now with "name", "stages" (array), and "decision" fields. ' +
          'Each stage must have "name", "participants" (array), and optionally "dependsOn". ' +
          'Output ONLY the raw JSON object, nothing else.'
        ))
        continue
      }
      log('[AGENT] No tool calls — final answer produced')
      return responseText
    }

    log(`[AGENT] Tool calls: ${toolCalls.length}`)

    // Execute all tool calls
    for (const tc of toolCalls) {
      log(`[TOOL] Calling: ${tc.name}`, JSON.stringify(tc.args))
      const selectedTool = toolsByName[tc.name]
      if (!selectedTool) {
        log(`[TOOL] Not found: ${tc.name}`)
        currentMessages.push(new HumanMessage(`Tool "${tc.name}" not found.`))
        continue
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const toolResult = await (selectedTool as any).invoke(tc.args)
      const resultStr = typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult)
      log(`[TOOL] ${tc.name} result:`, resultStr)
      const { ToolMessage } = await import('@langchain/core/messages')
      currentMessages.push(new ToolMessage({
        tool_call_id: tc.id!,
        content: resultStr,
      }))
    }
  }

  return 'Agent loop reached maximum iterations without producing a final answer.'
}

export async function analyzeWorkflow(imageBase64: string, mimeType: string) {
  clearLog()
  const usage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
  log('Step 1: Interpreting workflow diagram image with vision model...')
  const imageDescription = await interpretImage(imageBase64, mimeType, usage)
  log('Image interpretation complete.')

  log('\nStep 2: Running agent to build workflow structure...')
  const systemPrompt = `You are an expert workflow architect. Your task is to build a structured Workflow object from a workflow diagram description.

CRITICAL: You have tools available via the function calling API. You MUST invoke tools using the structured tool_call mechanism — this means generating a proper function call, NOT writing text like "to=functions.find_contact_by_name?..." or "find_contact_by_name({...})". Text-based tool invocations will be IGNORED. Only structured tool_calls will be executed. When you need data, make a real tool call.

You have access to tools to look up contacts in the organization. Follow this OPTIMIZED workflow:

STEP 1 — Get all contacts in one call:
  Call get_contacts to fetch the full list of contacts with their id, name, email, and position.

STEP 2 — Match ALL diagram participants against the contacts list at once:
  Compare every person name from the diagram against the returned contacts list. Account for OCR errors — names may be misspelled, truncated, or slightly wrong (e.g. "Ping" instead of "Pino", "Cutlor" instead of "Cutler"). Use fuzzy/partial matching: if a first name or last name partially matches a contact, consider it a match.
  For each person:
  - If matched → use the contact's name, id, and role
  - If NOT matched → use find_contact_by_name with spelling variations to double-check before giving up

STEP 3 — Fill empty stages:
  For any stage that does NOT have specific people assigned, use find_contact_by_position to suggest 1-2 people. For final/sign-off stages, pick people with the HIGHEST positions in the organization (e.g. CTO, VP, Director).

STEP 4 — Output the Workflow JSON immediately after matching is done. Do NOT make unnecessary extra tool calls.

Use the following TypeScript types to structure your output:
${WORKFLOW_TYPES}

IMPORTANT RULES:
- Do NOT make up data. Only use contacts returned by the tools.
- For EVERY person name from the diagram, call find_contact_by_name at least once. If no result, try variations (partial name, corrected spelling).
- If you CANNOT find a matching contact after trying variations, set ONLY "name" (from diagram) and "role" for that participant. Do NOT populate "id" or invent an email.
- If a contact IS matched, populate "name", "id", and "role" from the contacts list.
- The "role" should default to "approver" unless the diagram indicates otherwise.
- All decisions should default to "pending".
- The workflow decision should be "pending".
- Stages with no explicit people assigned MUST have at least one suggested participant.
- For sign-off / final approval stages without people, suggest 1-2 contacts with the highest-ranking positions (CTO, VP, Director, Manager).
- Parallel stages (no dependency between them) should NOT have dependsOn referencing each other.
- Output ONLY a valid JSON object matching the Workflow type. No extra text, no markdown fences.`

  log('[AGENT] System prompt:', systemPrompt)
  const userMessage = `Here is the description of the approval workflow diagram:\n\n${imageDescription}\n\n` +
    'Use the available tools to fetch contacts and build the complete Workflow JSON object. ' +
    'Remember: stages without assigned people need a suggested contact based on position relevance.'
  log('[AGENT] User message:', userMessage)

  const result = await runAgentLoop([
    new SystemMessage(systemPrompt),
    new HumanMessage(userMessage),
  ], usage)

  log('\nWorkflow analysis complete.')
  log('[RESULT]', result)

  // Strip special tokens and extract JSON
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

function looksLikeWorkflowJson(text: string): boolean {
  const cleaned = extractJson(text)
  try {
    const obj = JSON.parse(cleaned)
    return isValidWorkflow(obj)
  } catch {
    return false
  }
}

function extractJson(text: string): string {
  // Remove common LLM special tokens
  let cleaned = text.replace(/<\|[^>]*\|>/g, '')
  // Remove markdown code fences
  cleaned = cleaned.replace(/```json\s*/g, '').replace(/```\s*/g, '')
  cleaned = cleaned.trim()

  // Try to extract JSON object from the text
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start !== -1 && end !== -1 && end > start) {
    return cleaned.slice(start, end + 1)
  }

  return cleaned
}
