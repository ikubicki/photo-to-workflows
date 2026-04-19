# Current Codebase Analysis: What BAML Would Replace

## Research Question
What exactly does the current `extractJson` + `buildWorkflow` implementation do, and what would BAML need to replace?

---

## 1. Pipeline Overview (`analyzeWorkflow()`)

**File**: `backend/src/workflow.ts` (lines 153–185)

The main pipeline is a 3-step process:

```typescript
export async function analyzeWorkflow(imageBase64: string, mimeType: string) {
  clearLog()
  const usage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }

  // Step 1: Vision model interprets the image → text description
  const imageDescription = await interpretImage(imageBase64, mimeType, usage)

  // Step 2: Load contacts + types from disk
  const [contacts, workflowTypes] = await Promise.all([loadContacts(), loadWorkflowTypes()])

  // Step 3: Reasoning model builds Workflow JSON from description + contacts
  const result = await buildWorkflow(imageDescription, contacts, workflowTypes, usage)

  // Post-processing: extract JSON, validate, return
  const cleaned = extractJson(result)
  try {
    const parsed = JSON.parse(cleaned)
    if (isValidWorkflow(parsed)) {
      return { workflow: parsed, usage }
    }
    return { raw: result, usage }
  } catch {
    return { raw: result, usage }
  }
}
```

**What stays**: Step 1 (`interpretImage`) — vision model call is out of scope for BAML replacement.  
**What BAML replaces**: Step 3 (`buildWorkflow`) + post-processing (`extractJson` + `isValidWorkflow` + `JSON.parse`).

---

## 2. `extractJson()` Function

**File**: `backend/src/workflow.ts` (lines 193–203)

```typescript
function extractJson(text: string): string {
  // Step 1: Strip LLM special tokens like <|im_end|>, <|endoftext|>, etc.
  let cleaned = text.replace(/<\|[^>]*\|>/g, '')

  // Step 2: Remove markdown code fences (```json and ```)
  cleaned = cleaned.replace(/```json\s*/g, '').replace(/```\s*/g, '')
  cleaned = cleaned.trim()

  // Step 3: Extract JSON object — first '{' to last '}'
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start !== -1 && end !== -1 && end > start) {
    return cleaned.slice(start, end + 1)
  }

  // Fallback: return cleaned text as-is
  return cleaned
}
```

### Edge cases handled:
1. **LLM special tokens**: `<|im_end|>`, `<|endoftext|>`, `<|assistant|>` — regex `/<\|[^>]*\|>/g` strips all such tokens
2. **Markdown fences**: Models often wrap JSON in ` ```json ... ``` ` — stripped away
3. **Surrounding text**: Any explanation/preamble before `{` or after `}` is discarded
4. **No JSON found**: Returns the cleaned text as-is (caller handles parse failure)

### What BAML replaces here:
BAML's structured output extraction would eliminate the need for all of this manual string cleanup. BAML handles JSON extraction, fence stripping, and validation internally.

---

## 3. `isValidWorkflow()` Function

**File**: `backend/src/workflow.ts` (lines 187–192)

```typescript
function isValidWorkflow(obj: unknown): boolean {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'stages' in obj &&
    Array.isArray((obj as Record<string, unknown>).stages)
  )
}
```

### Validation logic:
- Checks that the parsed JSON is an object (not null)
- Checks that it has a `stages` property
- Checks that `stages` is an array

### What it does NOT validate:
- Stage structure (no check for `name`, `participants`, etc.)
- Participant structure (no check for `role`, `decision`, etc.)
- Enum values (no validation that `decision` is a valid `Decision` value)
- Required fields within stages
- Type correctness of nested objects

### What BAML replaces here:
BAML would provide full structural validation against the schema — every field, enum value, and nested type would be validated at parse time.

---

## 4. `buildWorkflow()` Function — The Core Replacement Target

**File**: `backend/src/workflow.ts` (lines 101–150)

### Model Configuration:
- **Model**: `openai/gpt-oss-20b` (via LM Studio)
- **Temperature**: `0.5`
- **No special response_format**: Relies entirely on prompt engineering for JSON output

### System Prompt Strategy:
The system prompt includes:
1. **Full contacts list** — the entire `contacts.json` serialized as JSON, embedded in the prompt
2. **Instructions for fuzzy name matching** — handling OCR errors (e.g., "Ping" → "Pino", "Cutlor" → "Cutler")
3. **Rules for unmatched contacts** — set only `name` + `role`, no `id`
4. **Rules for stages without people** — suggest contacts by position relevance
5. **Full TypeScript types** — the entire `fixtures/types.ts` content is embedded for reference
6. **Output format instruction**: "Output ONLY a valid JSON object matching the Workflow type. No extra text, no markdown fences, no explanations."

### Key System Prompt Excerpt:
```
Your job:
1. Compare ALL person names from the diagram against the contacts list above.
   Account for OCR errors — names may be misspelled, truncated, or slightly wrong.
   Use fuzzy/partial matching on first name or last name.
2. For each matched person, populate "name" (use the contact's name, NOT the OCR'd name),
   "id", and "role" from the contacts list.
3. If a person does NOT match any contact even with fuzzy matching,
   set ONLY "name" and "role". Do NOT populate "id" or invent data.
4. For stages WITHOUT specific people assigned, suggest 1-2 contacts based on position relevance.
   For sign-off/final approval stages, pick the HIGHEST-ranking contacts (CTO, VP, Director).
5. Output a valid JSON object matching the Workflow type.
```

### What BAML replaces here:
- **Type embedding in prompt**: BAML auto-generates output format instructions from its schema
- **"Output ONLY valid JSON" instruction**: BAML enforces this structurally
- **JSON parsing + validation**: BAML returns a typed object directly
- **The prompt itself stays** — the business logic (fuzzy matching, contact suggestions, OCR error awareness) remains in the prompt; only the output format enforcement moves to BAML

---

## 5. TypeScript Types That Need BAML Equivalents

**File**: `fixtures/types.ts` (full file)

### `Decision` (enum)
```typescript
export enum Decision {
    APPROVED = 'approved',
    REJECTED = 'rejected',
    CHANGE_REQUESTED = 'change_requested',
    PENDING = 'pending',
    COMPLETED = 'completed',
}
```
BAML equivalent: `enum Decision { approved rejected change_requested pending completed }`

### `Participant`
```typescript
export type Participant = {
    name: string,
    id?: string,            // optional — only if matched
    role: 'approver' | 'reviewer' | 'readonly',
    decision?: Decision,    // optional, defaults to 'pending'
}
```
Notable: `role` is a string union (not the `Decision` enum) — BAML will need a separate enum or inline union.  
Notable: `id` is optional — only populated when a contact match is found.

### `StageDependency`
```typescript
export type StageDependency = {
    parentStageId: string,
    condition: 'decision' | 'deadline' | 'completion',
    decision?: Decision,     // required if condition is 'decision'
    deadline?: Date,         // required if condition is 'deadline'
}
```
Notable: Conditional required fields (`decision` required when `condition === 'decision'`). BAML may not support conditional requirements — these would likely all be optional in the BAML schema.

### `Stage`
```typescript
export type Stage = {
    name: string,
    participants: Participant[],
    dependsOn?: StageDependency[],
    deadline?: Date,
    decision?: Decision,
    metadata?: Record<string, any>,
}
```
Notable: `metadata` is `Record<string, any>` — BAML equivalent would be a `map<string, string>` or a dynamic JSON type.

### `Workflow` (top-level output type)
```typescript
export type Workflow = {
    name: string,
    stages: Stage[],
    metadata?: Record<string, any>,
    decision?: Decision | Decision[],  // can be single or array!
}
```
Notable: `decision` can be `Decision | Decision[]` — a union of a single enum value or an array of them. This is tricky for BAML schemas.

### `Contact` (input data, NOT an output type)
```typescript
export type Contact = {
    id: string,
    name: string,
    email: string,
    position: string,
}
```
This type is used for loading contacts from `contacts.json` — it is NOT part of the LLM output schema. It does NOT need a BAML equivalent.

---

## 6. OpenAI SDK Usage Pattern

### Client Setup
```typescript
const client = new OpenAI({
  baseURL: LM_STUDIO_BASE_URL,  // 'http://localhost:1234/v1'
  apiKey: 'lm-studio',          // dummy API key
  maxRetries: 0,                // no retries — surface errors immediately
})
```

### Model Call Pattern
```typescript
const response = await client.chat.completions.create({
  model: 'openai/gpt-oss-20b',
  temperature: 0.5,
  messages: [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ],
})
const result = response.choices[0]?.message?.content ?? ''
```

### Token Usage Tracking
```typescript
type TokenUsage = { promptTokens: number; completionTokens: number; totalTokens: number }

function addUsage(total: TokenUsage, usage?: OpenAI.CompletionUsage | null) {
  if (!usage) return
  total.promptTokens += usage.prompt_tokens ?? 0
  total.completionTokens += usage.completion_tokens ?? 0
  total.totalTokens += usage.total_tokens ?? 0
}
```
Both model calls (vision + reasoning) accumulate into a single `usage` object returned to the frontend. BAML integration must preserve this token tracking.

---

## 7. Key Constraints for BAML Integration

| Constraint | Detail |
|---|---|
| **LM Studio compatibility** | Custom `baseURL: 'http://localhost:1234/v1'` — BAML must support custom OpenAI-compatible endpoints |
| **Dummy API key** | `apiKey: 'lm-studio'` — not a real key |
| **maxRetries: 0** | No automatic retries — errors surface immediately for debugging |
| **Model name format** | `openai/gpt-oss-20b` — includes provider prefix (LM Studio convention) |
| **ESM modules** | Project uses `"type": "module"` with `tsx` runner |
| **TypeScript (bundler resolution)** | `tsconfig.json` uses TypeScript with `.ts` extension imports |
| **Token usage tracking** | Must preserve `promptTokens` / `completionTokens` / `totalTokens` tracking across both model calls |
| **No streaming** | Current implementation uses non-streaming completions |
| **Temperature 0.5** | Must be configurable per-call |

---

## 8. Integration Surface Summary

### WHAT GETS REPLACED:

| Current Code | BAML Replaces With |
|---|---|
| `extractJson()` — manual JSON cleanup (special tokens, fences, extraction) | BAML's structured output parser |
| `isValidWorkflow()` — minimal schema validation | BAML's schema validation (full type checking) |
| `JSON.parse(cleaned)` — raw JSON parsing | BAML returns typed object directly |
| TypeScript types embedded in prompt as text | BAML schema auto-generates output format instructions |
| "Output ONLY valid JSON" instruction in prompt | BAML enforces this |

### WHAT STAYS:

| Code | Reason |
|---|---|
| `interpretImage()` — vision model call | Out of scope, different model, different purpose |
| `loadContacts()` — loading contacts from JSON | Input data, not LLM output |
| `analyzeWorkflow()` — orchestration function | Stays but simplified (no extractJson/isValidWorkflow) |
| `addUsage()` / token tracking | Must be preserved, may need BAML equivalent |
| Business logic in system prompt (fuzzy matching, contact suggestions, OCR awareness) | Domain logic stays in prompt |
| `logger.ts` — logging infrastructure | Independent utility |
| `index.ts` — Fastify server | No changes needed |

### WHAT CHANGES:

| Code | Change |
|---|---|
| `buildWorkflow()` | Replace OpenAI client call with BAML function call; remove type-embedding from prompt |
| `analyzeWorkflow()` | Remove `extractJson()` + `isValidWorkflow()` + try/catch parse block; use BAML result directly |
| `package.json` | Add BAML dependency; potentially remove `openai` if BAML handles the client |
| New files | BAML schema files (`.baml`) defining `Workflow`, `Stage`, `Participant`, `Decision` types |

---

## 9. Dependencies

From `backend/package.json`:
```json
{
  "dependencies": {
    "@fastify/multipart": "^9.0.0",
    "fastify": "^5.2.0",
    "openai": "^6.33.0"
  },
  "devDependencies": {
    "@types/node": "^25.5.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0"
  }
}
```

The `openai` package (`^6.33.0`) is used directly for both model calls. If BAML provides its own OpenAI-compatible client, the `openai` dep might be retained only for the vision model call (since BAML only replaces the reasoning step).

---

## 10. Contacts Data (Reference)

9 contacts in `fixtures/contacts.json` with fields: `id` (UUID), `name`, `email`, `position`. Positions include: Development Manager, Senior Software Engineer, Enterprise Architect, Vice President of Engineering, Chief Technology Officer, Devops, Product Manager, Legal team.

These are embedded directly into the system prompt as JSON for the LLM to reference during matching. This pattern stays — BAML only changes how the LLM's output is captured and validated, not the input data.
