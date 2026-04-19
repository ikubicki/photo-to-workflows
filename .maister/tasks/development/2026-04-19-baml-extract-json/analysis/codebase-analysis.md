# Codebase Analysis Report

**Date**: 2026-04-19
**Task**: Replace extractJson() and isValidWorkflow() in backend/src/workflow.ts with BAML structured output parsing
**Description**: Migrate manual JSON extraction and validation to BAML's schema-aligned parsing for the reasoning model output in the approval workflow analyzer pipeline.
**Analyzer**: codebase-analyzer skill (2 Explore agents: File Discovery + Code Analysis, Migration Target)

---

## Summary

The backend uses a two-model pipeline: a vision model produces a text description of workflow diagrams, then a reasoning model generates a Workflow JSON object that is manually cleaned and validated by `extractJson()` and `isValidWorkflow()`. BAML replaces both functions plus the type-embedding and format instructions in the prompt, providing typed output directly from the LLM call. The migration is scoped to ~3 modified files + 4 new BAML schema files, with zero API contract changes.

---

## Files Identified

### Primary Files

**backend/src/workflow.ts** (197 lines)
- Main processing pipeline: `interpretImage()` → `buildWorkflow()` → `extractJson()` → `isValidWorkflow()`
- Contains both target functions for removal (`extractJson` lines 187–197, `isValidWorkflow` lines 178–183)
- `buildWorkflow()` (lines 105–147) embeds TypeScript types and contacts as strings in the system prompt — BAML replaces this with schema-driven prompt injection
- `analyzeWorkflow()` (lines 149–177) orchestrates the pipeline and contains the JSON.parse + fallback logic to remove

**fixtures/types.ts** (72 lines)
- Defines `Decision`, `Participant`, `StageDependency`, `Stage`, `Workflow`, `Contact` types
- These types must be mirrored as BAML schema definitions in `baml_src/types.baml`
- `Contact` type is used only internally for tool matching, not in BAML output schema

**backend/package.json** (18 lines)
- Add `@boundaryml/baml` dependency and `baml-generate` script
- Currently: fastify, openai, @fastify/multipart; devDeps: tsx, typescript

### Related Files

**backend/src/index.ts** (37 lines)
- Fastify server; calls `analyzeWorkflow()` and returns result directly
- Expects `{ workflow, usage }` (success) or `{ raw, usage }` (parse failure)
- The `raw` fallback path can be removed after BAML migration (BAML guarantees typed output or throws)

**backend/src/logger.ts** (18 lines)
- File-based logging utility (`log()`, `clearLog()`)
- No changes needed; logging calls in workflow.ts can be preserved

**frontend/src/App.tsx** (50+ lines)
- Displays `data.workflow ?? data.raw ?? data` with usage stats
- No API contract changes needed; `raw` fallback will simply never trigger

**backend/tsconfig.json** (15 lines)
- ES2022 target, ESNext module, bundler resolution, `allowImportingTsExtensions`, `noEmit`
- Compatible with BAML generated code; no changes needed

**.gitignore** (7 lines)
- Must add `baml_client/` entry (auto-generated BAML code should not be committed)

---

## Current Functionality

The workflow analysis pipeline processes an uploaded image through two LLM calls:

1. **Vision step** (`interpretImage()`): Sends image to `qwen/qwen3-vl-8b` with detailed OCR instructions. Returns plain text description of stages, participants, dependencies. **Not affected by migration.**

2. **Build step** (`buildWorkflow()`): Sends image description + contacts JSON + full TypeScript types text to `openai/gpt-oss-20b`. System prompt instructs the model to output "ONLY a valid JSON object matching the Workflow type". Returns raw LLM text response.

3. **Cleanup step** (`extractJson()`): Strips `<|...|>` special tokens via regex, removes markdown code fences, extracts substring from first `{` to last `}`.

4. **Validation step** (`isValidWorkflow()`): Checks parsed object has `stages` array. On failure, returns `{ raw, usage }` fallback.

### Key Components/Functions

- **`extractJson(text)`**: Regex cleanup + substring extraction. Handles LLM special tokens, markdown fences, preamble/postamble. Does NOT handle malformed JSON, trailing commas, type mismatches.
- **`isValidWorkflow(obj)`**: Minimal shape check — only verifies `stages` array exists. No deep validation.
- **`buildWorkflow(imageDescription, contacts, workflowTypes, usage)`**: Constructs system prompt with embedded types and contacts. Calls reasoning model. Returns raw string.
- **`analyzeWorkflow(imageBase64, mimeType)`**: Pipeline orchestrator. Accumulates token usage via `addUsage()`.
- **`loadWorkflowTypes()`**: Reads `fixtures/types.ts` as a raw string for prompt embedding. Will be unnecessary after BAML migration.

### Data Flow

```
Image (base64) 
  → interpretImage() → text description
  → loadContacts() + loadWorkflowTypes()
  → buildWorkflow() → raw LLM string
  → extractJson() → cleaned JSON string
  → JSON.parse() → object
  → isValidWorkflow() → { workflow, usage } or { raw, usage }
```

After BAML:
```
Image (base64)
  → interpretImage() → text description  [unchanged]
  → loadContacts()
  → b.ExtractWorkflow() → typed Workflow object  [BAML handles prompt, parsing, validation]
  → { workflow, usage }
```

---

## Dependencies

### Imports (What This Depends On)

- **openai** (v6.33.0): `OpenAI` client for both LLM calls. Vision step will continue using it; reasoning step moves to BAML
- **fs/promises**: File reading for contacts + types
- **./logger.ts**: Logging utility
- **../../fixtures/types.ts**: `Contact` type import (used for typing, not runtime)
- **@boundaryml/baml** (new): Will provide generated `b.ExtractWorkflow()` function

### Consumers (What Depends On This)

- **backend/src/index.ts**: Imports `analyzeWorkflow()` — the only consumer. Returns result directly to Fastify response.
- **frontend/src/App.tsx**: Consumes the HTTP JSON response. Handles `workflow`, `raw`, and `usage` fields.

**Consumer Count**: 2 files (1 direct import, 1 HTTP consumer)
**Impact Scope**: Low — single entry point, no other backend modules import from workflow.ts

---

## Test Coverage

### Test Files

- None. No test files exist in the workspace.

### Coverage Assessment

- **Test count**: 0 tests
- **Gaps**: Entire pipeline is untested. No unit tests for `extractJson()`, `isValidWorkflow()`, or `analyzeWorkflow()`.
- **Risk**: Low impact on migration — no existing tests to break or update. Post-migration testing should be manual (upload image, verify JSON output).

---

## Coding Patterns

### Naming Conventions

- **Functions**: camelCase (`analyzeWorkflow`, `extractJson`, `buildWorkflow`)
- **Constants**: UPPER_SNAKE_CASE (`LM_STUDIO_BASE_URL`, `CONTACTS_PATH`)
- **Types**: PascalCase (`TokenUsage`, `Contact`, `Workflow`)
- **Files**: kebab-case (`workflow.ts`, `logger.ts`)

### Architecture Patterns

- **Style**: Functional — top-level functions, no classes
- **Module system**: ESM (`"type": "module"`) with tsx runtime
- **Imports**: `.ts` extensions used (`./logger.ts`, `../../fixtures/types.ts`)
- **Error handling**: Try/catch with logging, errors re-thrown or returned as `raw` fallback
- **Configuration**: Environment variables with defaults (`LM_STUDIO_URL`, `PORT`)
- **State**: Token usage accumulated via mutable `TokenUsage` object passed through functions

---

## Complexity Assessment

| Factor | Value | Level |
|--------|-------|-------|
| Files to modify | 3 (workflow.ts, package.json, .gitignore) | Low |
| Files to create | 4 (.baml schema files) + 1 auto-generated dir | Low |
| Dependencies | 3 current + 1 new (@boundaryml/baml) | Low |
| Consumers | 2 (index.ts + frontend HTTP) | Low |
| Test coverage | 0 tests | Low (no tests to break) |
| Code to remove | ~35 lines (extractJson + isValidWorkflow + parse/fallback block) | Low |
| Code to modify | ~40 lines (buildWorkflow → BAML call, analyzeWorkflow flow) | Low |

### Overall: Simple

Single-file primary change with clear removal targets and a well-scoped replacement. No cross-cutting concerns, no shared state complexity, no test migration needed. The BAML setup is new-from-zero which avoids any migration conflicts.

---

## Key Findings

### Strengths
- Clean separation: vision step and build step are independent — only the build step is affected
- Single consumer of `analyzeWorkflow()` — no ripple effects
- ESM + tsx already compatible with BAML's `module_format "esm"` generator option
- All TypeScript types have direct BAML equivalents (minor adjustments: `Date→string`, `Record→map`)
- `extractJson()` is a pure function with no side effects — clean removal
- Research report provides complete BAML schema definitions ready to use

### Concerns
- **Token usage tracking**: Current pipeline tracks tokens via `addUsage()` from OpenAI SDK responses. BAML wraps the LLM call internally; extracting token counts requires the `Collector` API which is documented but not fully validated for this use case
- **`raw` fallback elimination**: Current API can return `{ raw, usage }` on parse failure. BAML either returns typed data or throws. The frontend handles both paths — the `raw` path becomes dead code but frontend won't break
- **tsx + BAML generated code**: The `tsx` runtime's interaction with BAML's auto-generated TypeScript is not explicitly documented. Risk is low (BAML generates standard TS/ESM) but untested in this exact configuration

### Opportunities
- BAML's SAP parser handles edge cases `extractJson()` cannot: malformed JSON, trailing commas, type coercion, fuzzy key matching
- SAP benchmarks show significant improvement over function calling for smaller local models (60.9% → 76.8% for Llama-3.1-7b)
- Removing manual type embedding in prompts reduces prompt token usage — BAML generates more concise format instructions
- Foundation for migrating the vision step to BAML later (supports `Image.from_base64()`)

---

## Impact Assessment

- **Primary changes**: `backend/src/workflow.ts` — remove `extractJson()`, `isValidWorkflow()`, refactor `buildWorkflow()` and `analyzeWorkflow()`
- **Related changes**: `backend/package.json` (add dependency), `.gitignore` (add `baml_client/`)
- **New files**: `backend/baml_src/` directory with `clients.baml`, `types.baml`, `functions.baml`, `generators.baml`
- **Test updates**: None (no existing tests)
- **API contract**: No breaking changes. Frontend continues to receive `{ workflow, usage }`. The `{ raw, usage }` fallback becomes unreachable but frontend code can remain as-is.

### Risk Level: Low

- Single-file primary change with clear boundaries
- No existing tests to break
- No API contract changes
- BAML has first-class LM Studio support with documented configuration
- Research confidence is high (90%) with all type mappings validated
- Only uncertainty: token usage tracking via Collector API (medium risk, workaround: keep OpenAI client for manual tracking if needed)

---

## Recommendations

### Implementation Strategy

1. **Set up BAML schema** (`baml_src/`): Define types, client config, function, and generator. Run `npx @boundaryml/baml generate` to produce `baml_client/`.

2. **Replace `buildWorkflow()` internals**: Change from manual OpenAI call with embedded types → `b.ExtractWorkflow()` call. Move business logic prompt (contact matching instructions, role defaults) to BAML function template. Remove type embedding and format instructions (BAML handles both).

3. **Remove dead code**: Delete `extractJson()`, `isValidWorkflow()`, `loadWorkflowTypes()`. Remove JSON.parse try/catch block and `raw` fallback path from `analyzeWorkflow()`.

4. **Resolve token tracking**: Investigate BAML Collector API for `promptTokens`/`completionTokens`. If insufficient, keep OpenAI client as a secondary tracker or accept the gap temporarily.

5. **Verify end-to-end**: Manual test — upload workflow image, verify structured JSON response in frontend. Check logs for BAML prompt injection format.

### Backward Compatibility

- No API changes — frontend works unchanged
- The `raw` fallback becomes dead code; can be cleaned up later or left as defensive code
- `fixtures/types.ts` kept for reference; not deleted

### Key Decision Point

Token usage tracking approach must be decided before implementation:
- **Option A**: Use BAML Collector API (cleaner, but less validated)
- **Option B**: Keep OpenAI client alongside BAML for manual token tracking (pragmatic, adds complexity)
- **Option C**: Accept temporarily missing usage data (simplest, may frustrate users)

---

## Next Steps

Proceed to gap analysis and specification. The codebase is well-understood, risks are identified, and the research report provides ready-to-use BAML schema definitions. The implementation is a straightforward replacement with no architectural complications.
