# Implementation Plan: Replace extractJson with BAML

## Overview
Total Steps: 22
Task Groups: 4
Expected Tests: 12–20 verification checks (no existing test framework — verification is manual/structural)

## Implementation Steps

### Task Group 1: BAML Setup & Configuration
**Dependencies:** None
**Estimated Steps:** 6

- [x] 1.0 Complete BAML setup and configuration
  - [x] 1.1 Verify BAML installation and generation work
    - After step 1.2, run `cd backend && npx baml-cli generate` — must succeed without errors
    - Verify `backend/baml_client/` directory is created with TypeScript ESM files
    - Verify generated `index.js` uses ESM exports (no `require()`)
    - Confirm `b.ExtractWorkflow` is exported as a typed async function
  - [x] 1.2 Install `@boundaryml/baml` and add `baml:generate` script
    - Run `cd backend && npm install @boundaryml/baml`
    - Add script to `backend/package.json`:
      ```json
      "baml:generate": "npx baml-cli generate"
      ```
    - Note the installed version — use it in `generators.baml` `version` field
  - [x] 1.3 Create `backend/baml_src/types.baml`
    - Define `Decision` enum: `approved`, `rejected`, `change_requested`, `pending`, `completed`
    - Define `Participant` class with `name string`, `id string?`, `role "approver" | "reviewer" | "readonly"`, `decision Decision?`
    - Define `StageDependency` class with `parentStageId string`, `condition "decision" | "deadline" | "completion"`, `decision Decision?`, `deadline string?`
    - Define `Stage` class with `name string`, `participants Participant[]`, `dependsOn StageDependency[]?`, `deadline string?`, `decision Decision?`, `metadata map<string, string>?`
    - Define `Workflow` class with `name string`, `stages Stage[]`, `metadata map<string, string>?`, `decision Decision?`
    - Add `@description` annotations per spec
    - Type mapping from `fixtures/types.ts`: `Date` → `string`, `Record<string,any>` → `map<string,string>`, `Decision | Decision[]` → `Decision?`
  - [x] 1.4 Create `backend/baml_src/clients.baml`
    - Define `client<llm> ReasoningModel` with provider `"openai-generic"`
    - Set `base_url env.LM_STUDIO_URL` — **NOTE (W-3)**: BAML `env.` syntax throws if var unset. Implementer must ensure `LM_STUDIO_URL` is set before running, OR use default value in code via `ClientRegistry` if zero-config is preferred. For now, document that `LM_STUDIO_URL=http://localhost:1234/v1` must be set.
    - Set `model "openai/gpt-oss-20b"`, `temperature 0.5`
    - No retry policy (matches current `maxRetries: 0`)
  - [x] 1.5 Create `backend/baml_src/functions.baml`
    - Define `function ExtractWorkflow(imageDescription: string, contacts: string, instructions: string) -> Workflow`
    - Set `client ReasoningModel`
    - Prompt template with `{{ _.role("system") }}`, `{{ instructions }}`, `Contacts list:\n{{ contacts }}`, `{{ ctx.output_format }}`, `{{ _.role("user") }}`, image description block
    - **NOTE (W-2)**: `instructions` param must NOT contain contacts — contacts are injected separately via `{{ contacts }}` in the template. The `buildInstructions()` function must NOT take `contactsJson` as parameter.
  - [x] 1.6 Create `backend/baml_src/generators.baml`
    - Set `output_type "typescript"`, `output_dir "../"` (outputs to `backend/baml_client/`), `module_format "esm"`
    - Set `version` to match installed `@boundaryml/baml` package version from step 1.2

**Acceptance Criteria:**
- `npm run baml:generate` succeeds in `backend/`
- `backend/baml_client/` contains generated TypeScript ESM files
- `b.ExtractWorkflow` function signature matches: `(imageDescription: string, contacts: string, instructions: string, options?) => Promise<Workflow>`
- All 4 `.baml` files exist in `backend/baml_src/`

---

### Task Group 2: Code Modification — workflow.ts
**Dependencies:** Group 1
**Estimated Steps:** 7

- [x] 2.0 Complete workflow.ts modifications
  - [x] 2.1 Define verification checks before modifying code
    - After all modifications, `tsx backend/src/index.ts` must start without import/compile errors
    - `interpretImage()` function must be completely unchanged
    - `addUsage()`, `loadContacts()`, `log()`, `clearLog()` preserved unchanged
    - OpenAI SDK `client` instance preserved for vision model
    - `analyzeWorkflow()` export signature unchanged: `(imageBase64: string, mimeType: string) => Promise<{workflow, usage} | {raw, usage}>`
    - No changes to `backend/src/index.ts` or any frontend files
  - [x] 2.2 Add new imports to `workflow.ts`
    - Add: `import { b } from '../baml_client/index.js'`
    - Add: `import { Collector, BamlValidationError } from '@boundaryml/baml'`
    - Keep existing: `OpenAI`, `readFile`, `resolve`, `dirname`, `fileURLToPath`, `log`, `clearLog`, `Contact`
  - [x] 2.3 Remove dead code
    - Remove `TYPES_PATH` constant (line 10: `const TYPES_PATH = ...`)
    - Remove `loadWorkflowTypes()` function (lines 34–36)
    - Remove `extractJson()` function (lines 187–197)
    - Remove `isValidWorkflow()` function (lines 178–185)
    - Keep all other constants, functions, and imports
  - [x] 2.4 Create `buildInstructions()` function (replaces `buildWorkflow()`)
    - Extract business rules from current `buildWorkflow()` system prompt (~lines 93–131) into a new function: `function buildInstructions(): string`
    - **NOTE (W-2)**: Function takes NO parameters — contacts are passed separately to BAML function. Remove `contactsJson` from the instruction text — replace positional references like "contacts list above" with "the contacts list provided" (non-positional wording)
    - Include: contact matching rules, OCR fuzzy matching guidelines, role defaults ("approver"), decision defaults ("pending"), parallel stage rules, "output ONLY valid JSON" rule
    - Do NOT include: type definitions (BAML `{{ ctx.output_format }}` handles this), contacts JSON (BAML `{{ contacts }}` handles this)
  - [x] 2.5 Remove `buildWorkflow()` function entirely
    - Delete the entire `buildWorkflow()` function (lines 90–142)
    - This is replaced by `buildInstructions()` + BAML `b.ExtractWorkflow()`
  - [x] 2.6 Rewrite `analyzeWorkflow()` function
    - Keep Step 1: `interpretImage()` call — unchanged
    - Step 2: Call only `loadContacts()` — remove `loadWorkflowTypes()` from the `Promise.all`
    - Step 3: Create `Collector` instance: `const collector = new Collector()`
    - Build instructions: `const instructions = buildInstructions()`
    - Serialize contacts: `const contactsJson = JSON.stringify(contacts, null, 2)`
    - Call BAML: `const workflow = await b.ExtractWorkflow(imageDescription, contactsJson, instructions, { collector })`
    - Map token usage from Collector — **NOTE (W-5)**: use `?? 0` null guards:
      ```typescript
      usage.promptTokens += collector.last?.usage?.input_tokens ?? 0
      usage.completionTokens += collector.last?.usage?.output_tokens ?? 0
      usage.totalTokens += (collector.last?.usage?.input_tokens ?? 0) + (collector.last?.usage?.output_tokens ?? 0)
      ```
    - Log the result and usage
    - Return `{ workflow, usage }`
    - Remove the entire `extractJson()` / `JSON.parse()` / `isValidWorkflow()` block
  - [x] 2.7 Add `BamlValidationError` catch block
    - Wrap the BAML call (step 3 of `analyzeWorkflow`) in try/catch
    - Catch `BamlValidationError`: extract `e.raw_output`, log it, return `{ raw: e.raw_output, usage }`
    - Other errors: let them propagate (Fastify returns 500)

**Acceptance Criteria:**
- `tsx backend/src/index.ts` starts without errors (server listening on port 4000)
- No references to `extractJson`, `isValidWorkflow`, `loadWorkflowTypes`, or `TYPES_PATH` remain in codebase
- `buildWorkflow()` function is fully removed
- `analyzeWorkflow()` export signature unchanged
- `interpretImage()` function byte-identical to original
- Collector usage mapping uses `?? 0` null guards

---

### Task Group 3: Configuration & Gitignore
**Dependencies:** Group 1
**Estimated Steps:** 3

- [x] 3.0 Complete configuration updates
  - [x] 3.1 Verify configuration correctness
    - `.gitignore` contains `baml_client/` entry
    - `backend/package.json` contains `@boundaryml/baml` in dependencies
    - `backend/package.json` contains `baml:generate` script
    - `backend/baml_client/` directory exists (generated) but is git-ignored
  - [x] 3.2 Add `baml_client/` to root `.gitignore`
    - Append `baml_client/` to `/Users/irek/codebuilders/ai-workflows/.gitignore`
  - [x] 3.3 Verify environment variable documentation
    - `LM_STUDIO_URL` must be set for the reasoning model (BAML `env.LM_STUDIO_URL`)
    - Vision model still uses the TypeScript default: `process.env.LM_STUDIO_URL ?? 'http://localhost:1234/v1'`
    - If `.env.example` exists, add `LM_STUDIO_URL=http://localhost:1234/v1`. If not, note in commit message that `LM_STUDIO_URL` is now required for the reasoning model path.

**Acceptance Criteria:**
- `git status` does NOT show `baml_client/` as untracked
- `npm run baml:generate` in `backend/` succeeds
- Running with `LM_STUDIO_URL=http://localhost:1234/v1` set works for both models

---

### Task Group 4: Integration Verification & Cleanup
**Dependencies:** Groups 1, 2, 3
**Estimated Steps:** 6

- [x] 4.0 Complete integration verification
  - [x] 4.1 Review all verification criteria from prior groups
    - Confirm all acceptance criteria from Groups 1–3 are met
    - No leftover dead code references
  - [x] 4.2 Static verification — server startup
    - Run `cd backend && LM_STUDIO_URL=http://localhost:1234/v1 npx tsx src/index.ts`
    - Server must start on port 4000 without import errors or warnings
    - No TypeScript compilation issues with `baml_client` imports
  - [x] 4.3 Static verification — code structure audit
    - `workflow.ts` imports: `b` from `baml_client`, `Collector` and `BamlValidationError` from `@boundaryml/baml`, plus preserved imports
    - `workflow.ts` exports: only `analyzeWorkflow` (same as before)
    - No remaining `extractJson`, `isValidWorkflow`, `loadWorkflowTypes`, `TYPES_PATH`, `buildWorkflow` references anywhere in `backend/src/`
    - `buildInstructions()` takes NO parameters (W-2 fix)
    - Token usage mapping has `?? 0` null guards (W-5 fix)
  - [x] 4.4 End-to-end verification (requires LM Studio running)
    - Start backend: `cd backend && npm run dev`
    - Start frontend: `cd frontend && npm run dev`
    - Upload a workflow diagram image via the UI
    - Verify response contains `workflow` object with `stages` array OR `raw` string with `usage`
    - Verify `usage` object shows non-zero `promptTokens`, `completionTokens`, `totalTokens`
    - Verify no console errors in frontend
  - [x] 4.5 Error path verification
    - If LM Studio returns garbled output, verify `BamlValidationError` is caught and `{ raw, usage }` is returned
    - If `LM_STUDIO_URL` is unset, verify BAML throws a clear error (not a silent failure)
  - [x] 4.6 Final cleanup check
    - No `console.log` debugging left behind
    - Log messages updated: `[BUILD]` prefix can become `[BAML]` or similar for the reasoning model step
    - `backend/baml_src/` committed to git (source files)
    - `backend/baml_client/` NOT committed (generated, gitignored)

**Acceptance Criteria:**
- Server starts cleanly with no errors
- End-to-end workflow produces valid `{ workflow, usage }` response (when LM Studio is available)
- Fallback `{ raw, usage }` path works for malformed LLM output
- No dead code, no debug artifacts
- API contract unchanged — frontend works without modifications

---

## Execution Order

1. **Group 1: BAML Setup & Configuration** (6 steps) — foundation, no dependencies
2. **Group 3: Configuration & Gitignore** (3 steps, depends on 1) — can run in parallel with Group 2 after Group 1
3. **Group 2: Code Modification — workflow.ts** (7 steps, depends on 1) — core changes
4. **Group 4: Integration Verification & Cleanup** (6 steps, depends on 1, 2, 3) — final validation

## Audit Warnings Addressed

| Warning | Resolution | Step |
|---|---|---|
| W-2: `buildInstructions()` param | Function takes NO parameters; contacts injected by BAML template separately | 2.4 |
| W-3: `env.LM_STUDIO_URL` no default | Document as required env var; vision model retains its `?? default`  | 1.4, 3.3 |
| W-5: Collector null values | `?? 0` guards on `input_tokens` and `output_tokens` | 2.6 |
| W-1, W-4: Line numbers off | Plan references code by function name, not line numbers | All |
| W-6: Script name | Use `baml:generate` (colon style, consistent with npm conventions) | 1.2 |

## Standards Compliance

Follow standards from `.maister/docs/standards/` (if present):
- `global/` — Always applicable
- Backend-specific conventions — TypeScript, ESM, Fastify patterns

## Notes

- **No Unit Tests**: This project has no test framework. "Test" steps are structural/runtime verification checks, not automated test files.
- **Run Incrementally**: Start server after each major group to catch import/runtime errors early.
- **BAML Version**: Use whatever `npm install @boundaryml/baml` resolves to — update `generators.baml` version field to match.
- **ESM Critical**: All imports from `baml_client` must use `.js` extension (ESM requirement with TypeScript).
- **Reuse First**: `interpretImage()`, `addUsage()`, `loadContacts()`, OpenAI `client`, logger — all preserved unchanged.
- **Mark Progress**: Check off steps as completed.
- **tsx Compatibility**: Verify `baml_client` generated code works under `tsx` runner (not just `tsc`).
