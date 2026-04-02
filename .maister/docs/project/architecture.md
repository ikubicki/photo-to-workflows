# Architecture — Workflow Visual Analyzer

## Overview

```
┌─────────────────┐       POST /api/analyze       ┌─────────────────────┐
│   Frontend       │  ─────── multipart/form ────► │   Backend            │
│   React + Vite   │  ◄─────── JSON response ───── │   Fastify + OpenAI   │
│   :3000          │                                │   :4000              │
└─────────────────┘                                └──────────┬──────────┘
                                                              │
                                                   ┌──────────▼──────────┐
                                                   │   LM Studio          │
                                                   │   :1234/v1           │
                                                   │                      │
                                                   │  ┌────────────────┐  │
                                                   │  │ qwen3-vl-8b    │  │
                                                   │  │ (vision)       │  │
                                                   │  └────────────────┘  │
                                                   │  ┌────────────────┐  │
                                                   │  │ gpt-oss-20b    │  │
                                                   │  │ (reasoning)    │  │
                                                   │  └────────────────┘  │
                                                   └─────────────────────┘
```

## Processing Pipeline

The backend runs a 2-step pipeline in `src/workflow.ts`:

### Step 1: Vision — `interpretImage()`
- Sends the uploaded image (base64) to `qwen/qwen3-vl-8b`
- System prompt instructs: extract all stages, participants, roles, dependencies, conditions
- OCR-aware: character-by-character name reading, common error patterns
- Output: structured text description of the workflow diagram

### Step 2: Reasoning — `buildWorkflow()`
- Sends the vision description + full contacts list to `openai/gpt-oss-20b`
- System prompt includes: contacts JSON, TypeScript Workflow types, fuzzy matching rules
- Model produces a Workflow JSON object with matched participant IDs
- Post-processing: `extractJson()` strips LLM artifacts, `isValidWorkflow()` validates structure

## Key Files

| File | Responsibility |
|---|---|
| `backend/src/index.ts` | Fastify server, `/api/analyze` endpoint, error handling |
| `backend/src/workflow.ts` | 2-step AI pipeline (vision → reasoning), token tracking |
| `backend/src/logger.ts` | File-based logging to `logs/agent.log` |
| `frontend/src/App.tsx` | Image upload UI, result display, token usage |
| `fixtures/types.ts` | Shared TypeScript types |
| `fixtures/contacts.json` | Organization contacts data |

## Data Flow

1. User uploads image via frontend
2. Frontend sends `multipart/form-data` to `POST /api/analyze`
3. Backend reads image → base64 encodes it
4. Vision model interprets the image → text description
5. Contacts loaded from `fixtures/contacts.json`
6. Reasoning model builds Workflow JSON from description + contacts
7. Response cleaned (`extractJson`) and validated (`isValidWorkflow`)
8. Returns `{ workflow, usage }` or `{ raw, usage }` on parse failure

## Design Decisions

- **Direct OpenAI SDK** over LangChain — simpler, fewer dependencies, contacts provided inline in prompt instead of via tool calls
- **Local models via LM Studio** — no external API dependency, full control
- **maxRetries: 0** — fail fast, surface connection errors immediately
- **Shared types in fixtures/** — both frontend types reference and backend import from same source
