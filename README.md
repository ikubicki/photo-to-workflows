# Photo to Workflows

An application that takes an image of an approval workflow diagram, interprets it using AI vision, and builds a structured workflow object with matched contacts from the organization.

## What it does

1. User uploads a photo/screenshot of an approval workflow diagram
2. A vision model analyzes the image and extracts all stages, participants, and dependencies
3. A reasoning model (LLM agent) matches participants from the diagram to real contacts in the organization
4. The result is a structured `Workflow` JSON object — ready to be used in a real system

## Architecture

```
frontend/ (React + Vite, port 3000)  →  backend/ (Fastify + TypeScript, port 4000)
                                            ├── Vision model (qwen/qwen3-vl-8b)
                                            └── Reasoning model (openai/gpt-oss-20b)
```

Both models are served locally via **LM Studio** (OpenAI-compatible API at `http://localhost:1234/v1`).

## Branches

| Branch | Description |
|--------|-------------|
| `no-langchain` ⭐ | **Primary branch.** Removes the LangChain dependency and calls the OpenAI SDK directly. Merges the OCR and workflow interpretation into a single model call using only `qwen/qwen3-vl-8b`, reducing latency. |
| `main` | Original implementation using **LangChain** with OpenAI-compatible SDK. Includes a multi-step agent loop with tools (`get_contacts`, `find_contact_by_name`, `find_contact_by_position`), token usage tracking, and structured error logging. |
| `baml` | Experimental branch replacing manual JSON extraction (`extractJson` / `isValidWorkflow`) with **BAML** (Boundary AI Markup Language) for structured, type-safe model output. |

## Tech Stack

- **Frontend**: React 19, Vite 6, TypeScript
- **Backend**: Fastify 5, TypeScript, tsx
- **AI**: LM Studio (local inference), LangChain (main branch), BAML (baml branch)
- **Models**: `qwen/qwen3-vl-8b` (vision), `openai/gpt-oss-20b` (reasoning + tool calling)

## Getting Started

### Prerequisites

- Node.js 20+
- [LM Studio](https://lmstudio.ai/) running locally with the following models loaded:
  - `qwen/qwen3-vl-8b` (vision)
  - `openai/gpt-oss-20b` (reasoning + tool calling)

### Run backend

```bash
cd backend
npm install
npm run dev
```

### Run frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at `http://localhost:3000`, backend at `http://localhost:4000`.

## Environment Variables (backend)

| Variable | Default | Description |
|----------|---------|-------------|
| `LM_STUDIO_URL` | `http://localhost:1234/v1` | LM Studio API base URL |
| `PORT` | `4000` | Backend server port |

## Data Model

- **`Workflow`** → contains `Stage[]`
- **`Stage`** → contains `Participant[]`, optional `StageDependency[]`
- **`Participant`** → `name`, `id?` (only if matched to a contact), `role` (approver/reviewer/readonly), `decision`
- **`StageDependency`** → `parentStageId`, `condition` (decision/deadline/completion)
- **`Contact`** → `id`, `name`, `email`, `position`

Full type definitions: [`fixtures/types.ts`](fixtures/types.ts)
