# Tech Stack — Workflow Visual Analyzer

## Frontend

| Technology | Version | Purpose |
|---|---|---|
| React | 19 | UI framework |
| Vite | 6 | Build tool & dev server |
| TypeScript | 5.6 | Type safety |

- Dev server on port 3000, proxies `/api` → backend at port 4000
- Single-page app: image upload form + JSON result display + token usage

## Backend

| Technology | Version | Purpose |
|---|---|---|
| Fastify | 5 | HTTP server |
| @fastify/multipart | 9 | File upload handling |
| OpenAI SDK | 6.33 | LM Studio API client |
| TypeScript | 5.6 | Type safety |
| tsx | 4.19 | TypeScript execution (dev) |

- Runs on port 4000
- Single endpoint: `POST /api/analyze` (multipart/form-data)

## AI Models (via LM Studio)

| Model | Role | Temperature |
|---|---|---|
| qwen/qwen3-vl-8b | Vision — diagram interpretation | 0.1 |
| openai/gpt-oss-20b | Reasoning — workflow JSON building | 0.5 |

- Both served locally via LM Studio at `http://localhost:1234/v1` (OpenAI-compatible API)
- `maxRetries: 0` — connection errors surface immediately

## Shared

- `fixtures/types.ts` — shared TypeScript types (Workflow, Stage, Participant, Contact, Decision)
- `fixtures/contacts.json` — organization contacts (9 entries)

## Not Currently Used

- No database
- No testing framework
- No linter
- No CI/CD
