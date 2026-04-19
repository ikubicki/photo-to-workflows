# Gap Analysis: Replace extractJson/isValidWorkflow with BAML

## Summary
- **Risk Level**: Low
- **Estimated Effort**: Low
- **Detected Characteristics**: modifies_existing_code, creates_new_entities

## Task Characteristics
- Has reproducible defect: no
- Modifies existing code: yes
- Creates new entities: yes
- Involves data operations: no
- UI heavy: no

## Gaps Identified

### Missing Features (New entities needed)

1. **BAML schema files** (`backend/baml_src/`): Four `.baml` files need to be created from scratch:
   - `types.baml` — Workflow, Stage, Participant, Decision, StageDependency classes/enums
   - `clients.baml` — ReasoningModel client pointing to LM Studio
   - `functions.baml` — `ExtractWorkflow` function with prompt template
   - `generators.baml` — TypeScript ESM generator config
   - Research report provides ready-to-use definitions for all of these.

2. **BAML dependency & tooling**: `@boundaryml/baml` package + `baml-cli generate` script in `package.json`.

3. **`.gitignore` entry**: `baml_client/` directory (auto-generated, should not be committed).

### Code to Remove

| Function/Block | Location | Lines | Purpose replaced by |
|---|---|---|---|
| `extractJson()` | workflow.ts L187–197 | 11 lines | BAML SAP parser |
| `isValidWorkflow()` | workflow.ts L178–183 | 6 lines | BAML typed return |
| `loadWorkflowTypes()` | workflow.ts L38–40 | 3 lines | BAML schema handles type instructions |
| JSON.parse + fallback block | workflow.ts L167–177 | 11 lines | BAML returns typed object directly |
| `loadWorkflowTypes()` call | workflow.ts L157 | 1 line | No longer needed |
| Type-embedding in system prompt | workflow.ts L121–122 | ~2 lines | BAML `{{ ctx.output_format }}` |
| "Output ONLY valid JSON" instruction | workflow.ts L135 | 1 line | BAML format instructions |

**Total removal**: ~35 lines

### Code to Modify

1. **`buildWorkflow()` → BAML call** (workflow.ts L105–147): Replace OpenAI SDK chat completion with `b.ExtractWorkflow()`. The business-logic prompt (contact matching rules, role defaults) moves to the BAML function template. The function signature changes — no longer needs `workflowTypes` param, returns typed `Workflow` instead of `string`.

2. **`analyzeWorkflow()` orchestration** (workflow.ts L149–177): Simplify flow:
   - Remove `loadWorkflowTypes()` call
   - Replace `buildWorkflow()` + extractJson + JSON.parse + isValidWorkflow with single BAML call
   - Add Collector for token tracking from BAML call
   - Keep `addUsage()` for vision model (unchanged)

3. **Token usage accumulation**: New mapping needed — BAML Collector uses `input_tokens`/`output_tokens`, current code uses `promptTokens`/`completionTokens`. The `addUsage()` function needs a second path or the Collector values need mapping.

4. **Import changes**: Add `import { b } from '../baml_client'` and `import { Collector } from '@boundaryml/baml'`. Keep `OpenAI` import for vision model.

### Behavioral Changes Needed

1. **Error semantics**: Current code returns `{ raw: result, usage }` when parsing fails (lines 170–177). BAML either returns a typed `Workflow` or throws `BamlValidationError`. The `raw` fallback path becomes impossible — BAML's SAP is resilient enough that this is an improvement, but the error handling pattern changes from "graceful degradation" to "success or exception".

2. **Type source**: Currently `fixtures/types.ts` is the single source of truth for the Workflow type. After migration, BAML generates its own TypeScript types in `baml_client/`. The `fixtures/types.ts` types remain for the `Contact` type (used by vision/tools) but the Workflow-related types will have a BAML-generated duplicate. The API response will use BAML-generated types.

3. **System prompt structure**: Current prompt embeds full TypeScript types + contacts + format instructions in one monolithic string. BAML splits this into: structured prompt template (in `.baml` file) + `{{ ctx.output_format }}` (auto-generated format instructions) + runtime parameters (contacts, instructions).

## Data Flow Analysis

### Current Flow (LLM → API response → frontend)

```
buildWorkflow()
  → OpenAI SDK chat.completions.create() → response.choices[0].message.content (string)
  → extractJson() strips tokens/fences/extracts JSON substring (string)
  → JSON.parse() → untyped object
  → isValidWorkflow() checks stages array exists → boolean gate
  → Success: { workflow: parsed, usage }
  → Failure: { raw: result, usage }
→ Fastify returns JSON to frontend
→ Frontend: data.workflow ?? data.raw ?? data → displayed in textarea
→ Frontend: data.usage → token counts displayed
```

### After BAML Flow

```
b.ExtractWorkflow(imageDescription, contactsJson, instructions, { collector })
  → BAML injects format instructions into prompt
  → BAML calls LM Studio via openai-generic provider → raw LLM text
  → BAML SAP parser → typed Workflow object (or throws BamlValidationError)
  → collector.last.usage → { input_tokens, output_tokens }
→ Map collector usage to TokenUsage format
→ Combine with vision usage → { workflow, usage }
→ Fastify returns JSON to frontend (same shape)
→ Frontend unchanged
```

### Token Usage Flow (detailed)

**Vision model** (unchanged):
```
OpenAI SDK response.usage → addUsage(total, response.usage)
  prompt_tokens → total.promptTokens
  completion_tokens → total.completionTokens
  total_tokens → total.totalTokens
```

**Reasoning model** (new):
```
Collector.last.usage → map to addUsage format
  input_tokens → total.promptTokens
  output_tokens → total.completionTokens
  (input_tokens + output_tokens) → total.totalTokens
```

BAML Collector API (confirmed from docs):
- `collector.last.usage.input_tokens` — prompt/input tokens (nullable int)
- `collector.last.usage.output_tokens` — completion/output tokens (nullable int)
- Aggregated across retries automatically
- Available since BAML v0.79.0

**Token tracking risk: RESOLVED** — Collector API provides all needed data. Field mapping is straightforward.

## Existing Feature Analysis

### Change Type: Modificative
The core pipeline behavior changes — same input (image), same output shape (`{ workflow, usage }`), but internal parsing mechanism is completely replaced.

### Compatibility Requirements: Moderate
- API response shape: `{ workflow, usage }` must remain identical
- Frontend: zero changes needed
- Backend consumer (`index.ts`): zero changes needed
- The `raw` fallback field disappears from successful responses — but frontend already handles both `data.workflow` and `data.raw` with `??` operator, so this is safe

### User Journey Impact
Not applicable — no UI changes. The frontend textarea displays the same JSON output. Token usage display continues to work.

## New Capability Analysis

### Integration Points
- BAML generated client (`baml_client/`) imported into `workflow.ts`
- BAML CLI integrated into build toolchain (`package.json` scripts)
- No new routes, no new API endpoints, no frontend changes

### Patterns to Follow
- Research report provides complete BAML schema definitions (Section 5)
- Research report provides LM Studio client config (Section 7)
- Research report provides modified `analyzeWorkflow()` conceptual code (Section 6)

### Architectural Impact: Low
- New directory: `backend/baml_src/` (4 schema files)
- Auto-generated directory: `backend/baml_client/` (gitignored)
- No changes to project structure, build system, or deployment

## Issues Requiring Decisions

### Critical (Must Decide Before Proceeding)

None — research resolved all blocking questions. Token tracking confirmed viable via Collector API.

### Important (Should Decide)

1. **`raw` fallback removal strategy**
   - **Issue**: Current API can return `{ raw, usage }` on parse failure. BAML eliminates this path — it returns typed data or throws. The frontend handles both `data.workflow` and `data.raw` already. Should we:
   - **Options**:
     - A) Catch `BamlValidationError`, extract `raw_output` from it, return `{ raw, usage }` (preserves current graceful degradation)
     - B) Let BAML errors propagate as 500 errors (simplifies code, BAML SAP is reliable enough)
   - **Default**: B — let errors propagate
   - **Rationale**: BAML's SAP parser handles far more edge cases than `extractJson()`. Parse failures will be extremely rare. Keeping the `raw` fallback adds complexity for a path that effectively never triggers. The frontend already handles error responses.

2. **LM_STUDIO_URL environment variable handling**
   - **Issue**: Currently `LM_STUDIO_URL` env var configures the OpenAI SDK base URL. BAML's `.baml` files use static `base_url`. Should we:
   - **Options**:
     - A) Use BAML's `ClientRegistry` at runtime to read env var (matches current behavior exactly)
     - B) Use BAML's `env.LM_STUDIO_URL` syntax in `.baml` file (simpler, BAML-native)
     - C) Hardcode `http://localhost:1234/v1` in `.baml` file (simplest, dev-only app)
   - **Default**: B — BAML env var syntax
   - **Rationale**: BAML supports `env.VAR_NAME` in `.baml` files for environment variables. This is the most idiomatic approach and preserves the current env-var-based configuration without runtime code.

3. **Dual type definitions**
   - **Issue**: After migration, `Workflow`, `Stage`, `Participant` etc. exist in both `fixtures/types.ts` AND `baml_client/` (auto-generated). This creates type duplication.
   - **Options**:
     - A) Keep both — `fixtures/types.ts` remains the "documentation" source, BAML types are runtime. `Contact` type stays in fixtures (not in BAML schema).
     - B) Remove Workflow-related types from `fixtures/types.ts`, keep only `Contact`.
   - **Default**: A — keep both for now
   - **Rationale**: Minimal change principle. `fixtures/types.ts` is referenced in `claude.md` project docs and possibly elsewhere. Removing types is a separate cleanup task. The BAML types will be used at runtime; the fixtures types become reference documentation.

## Recommendations

1. Use BAML's `env.LM_STUDIO_URL` syntax with a fallback default in the `.baml` client config for environment variable handling
2. Let BAML errors propagate — don't replicate the `raw` fallback pattern
3. Keep `fixtures/types.ts` unchanged — only `Contact` is used at runtime; other types become documentation
4. Add `baml-cli generate` as a `postinstall` or explicit `generate` script in `package.json`
5. Test `tsx` + BAML generated code compatibility immediately after initial setup

## Risk Assessment

| Risk | Severity | Probability | Mitigation |
|---|---|---|---|
| Token tracking loss | Medium | **Low** (Collector API confirmed) | Map `input_tokens`/`output_tokens` to existing `TokenUsage` shape |
| tsx + ESM + generated code | Medium | Low | Test immediately after `baml-cli generate` |
| SAP parsing with local model | Low | Low | SAP benchmarks show improvement over current approach |
| Build step complexity | Low | Certain | Add `baml-cli generate` script; VS Code extension auto-generates on save |

- **Complexity Risk**: Low — single-file primary change, clear removal targets
- **Integration Risk**: Low — single consumer, no API contract changes
- **Regression Risk**: Low — no existing tests to break; manual E2E test sufficient
