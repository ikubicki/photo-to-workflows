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
- **Response**: JSON `Workflow` object

### Processing Pipeline

1. **Image interpretation** – The uploaded image is sent to `qwen/qwen3-vl-8b` (vision model) with detailed instructions:
   - Each rectangle/box = separate stage (never merge or skip)
   - Side-by-side stages = parallel (no dependency), sequential = vertical/connected
   - Read names character by character (OCR error awareness: 'ng'→'no', 'rn'→'m')
   - Output numbered stages with full dependency graph

2. **Agent loop** – The description is passed to `openai/gpt-oss-20b` (reasoning model) bound with LangChain tools. The agent:
   - Fetches the contacts count (`get_contacts_count`)
   - Fetches the full contacts list (`get_contacts`)
   - For each person in the diagram, searches by first name, last name, and spelling variations (`find_contact_by_name`)
   - If no contact matched: sets only `name` + `role` (no `id`)
   - For stages without assigned people, suggests 1–2 contacts based on position relevance (`find_contact_by_position`); for sign-off/final stages picks highest-ranking (CTO, VP)
   - Builds a `Workflow` JSON object using the types from `fixtures/types.ts`

3. **Response cleanup** – Strips LLM special tokens (`<|...|>`), markdown fences, and extracts JSON object before returning.

4. **Logging** – Full logging of all prompts, messages, tool calls, tool results, and final output (prefixed `[VISION]`, `[AGENT]`, `[TOOL]`, `[RESULT]`).

### LangChain Tools

| Tool | Description |
|---|---|
| `get_contacts` | Returns full contacts list (from `fixtures/contacts.json`) |
| `get_contacts_count` | Returns the total number of contacts |
| `find_contact_by_name` | Searches contacts by name (partial match) |
| `find_contact_by_position` | Searches contacts by position/role (partial match) |

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

## Contacts (`fixtures/contacts.json`)

9 contacts with `id`, `name`, `email`, `position`. Used by tools to match and suggest participants for workflow stages.

## Prerequisites

- Node.js 20+
- LM Studio running locally with loaded models:
  - `qwen/qwen3-vl-8b` (vision)
  - `openai/gpt-oss-20b` (reasoning + tool calling)