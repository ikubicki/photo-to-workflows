# AI Workflows – Approval Workflow Analyzer

## Overview

Application that takes an image of an approval workflow diagram, interprets it using AI vision, and builds a structured workflow object with matched contacts from the organization.

## Architecture

```
frontend/ (React + Vite, port 3000)  →  backend/ (Fastify + TypeScript, port 4000)
                                            ├── Vision model (qwen/qwen3-vl-8b)
                                            └── Reasoning model (openai/gpt-oss-20b)
                                                └── LangChain agent with tools
```

Both models are served locally via **LM Studio** (OpenAI-compatible API at `http://localhost:1234/v1`).

## Frontend (`frontend/`)

- **Stack**: React 19, Vite 6, TypeScript
- **Port**: 3000 (proxies `/api` → backend at 4000)
- Simple single-page app:
  1. User uploads an image of an approval workflow diagram
  2. Image is sent as `multipart/form-data` to `POST /api/analyze`
  3. Backend response (JSON) is displayed in a readonly `<textarea>`
  4. Total token usage (prompt, completion, total) displayed below the textarea

### Run

```bash
cd frontend && npm run dev
```

## Backend (`backend/`)

- **Stack**: Fastify 5, LangChain, TypeScript, tsx
- **Port**: 4000

### API

#### `POST /api/analyze`

- **Body**: `multipart/form-data` with field `image` (image file, max 10MB)
- **Response**: JSON object with `workflow` (Workflow object), `usage` (token counts), or `raw` + `usage` on parse failure

### Processing Pipeline (`src/workflow.ts`)

1. **Image interpretation** (`interpretImage()`) – The uploaded image is sent to `qwen/qwen3-vl-8b` (vision model, temp 0.1) with detailed instructions:
   - Each rectangle/box = separate stage (never merge or skip)
   - Side-by-side stages = parallel (no dependency), sequential = vertical/connected
   - Read names character by character (OCR error awareness: 'ng'→'no', 'rn'→'m')
   - Pay attention to arrows/connectors for dependencies and conditions
   - Output numbered stages with full dependency graph

2. **Agent loop** (`runAgentLoop()`) – The description is passed to `openai/gpt-oss-20b` (reasoning model, temp 0.5) bound with LangChain tools via `.bindTools(allTools, { tool_choice: 'auto' })`. Max 50 iterations. Both models use `maxRetries: 0` so connection errors surface immediately. The agent follows an optimized 4-step workflow:
   - **Step 1**: Fetches the full contacts list in one call (`get_contacts`)
   - **Step 2**: Compares ALL diagram participants against the contacts list at once using fuzzy/partial matching (accounting for OCR errors). Only falls back to `find_contact_by_name` with spelling variations for unmatched names
   - **Step 3**: For stages without assigned people, uses `find_contact_by_position` to suggest 1–2 contacts; for sign-off/final stages picks highest-ranking (CTO, VP)
   - **Step 4**: Outputs the Workflow JSON immediately — no unnecessary extra tool calls
   - If no contact matched: sets only `name` + `role` (no `id`)
   - System prompt includes the full `Workflow` TypeScript types inline for reference
   - System prompt explicitly forbids text-based tool invocations (e.g. `to=functions.find_contact_by_name?...`)

3. **Response validation** – When no tool calls are present, the agent checks if the response is valid Workflow JSON using `looksLikeWorkflowJson()` (parses and verifies `stages` array exists). If not valid, it nudges the model with a human message requesting proper JSON output and continues the loop.

4. **Response cleanup** (`extractJson()`) – Strips LLM special tokens (`<|...|>`), markdown fences, and extracts JSON object (first `{` to last `}`) before returning. Final validation with `isValidWorkflow()` checks the parsed JSON has a `stages` array.

5. **Logging** (`src/logger.ts`) – File-based logging to `logs/agent.log` with timestamps + stdout. `clearLog()` resets the log file on each new upload. Prefixed sections: `[VISION]`, `[AGENT]`, `[TOOL]`, `[RESULT]`, `[CLEANED]`.

### LangChain Tools (`src/tools.ts`)

| Tool | Description |
|---|---|
| `get_contacts` | Returns full contacts list (from `fixtures/contacts.json`) |
| `get_contacts_count` | Returns the total number of contacts |
| `find_contact_by_name` | Searches contacts by name (partial, case-insensitive match) |
| `find_contact_by_position` | Searches contacts by position/role (partial, case-insensitive match) |

All tools load contacts from `fixtures/contacts.json` via `loadContacts()`. Schemas defined with `zod`.

### Run

```bash
cd backend && npm run dev
```

### Environment

| Variable | Default | Description |
|---|---|---|
| `LM_STUDIO_URL` | `http://localhost:1234/v1` | LM Studio API base URL |
| `PORT` | `4000` | Backend server port |

## Data Model (`fixtures/types.ts`)

- `Workflow` → contains `Stage[]`
- `Stage` → contains `Participant[]`, optional `StageDependency[]`
- `Participant` → `name`, `id?` (optional, only if matched), `role` (approver/reviewer/readonly), `decision`
- `StageDependency` → `parentStageId`, `condition` (decision/deadline/completion)
- `Decision` → enum: approved, rejected, change_requested, pending, completed
- `Contact` → `id`, `name`, `email`, `position`

## Contacts (`fixtures/contacts.json`)

9 contacts with `id`, `name`, `email`, `position`. Used by tools to match and suggest participants for workflow stages.

## Prerequisites

- Node.js 20+
- LM Studio running locally with loaded models:
  - `qwen/qwen3-vl-8b` (vision)
  - `openai/gpt-oss-20b` (reasoning + tool calling)