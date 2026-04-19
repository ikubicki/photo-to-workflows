# Synthesis: Replacing extractJson with BAML

**Research Question**: How to replace extractJson with BAML for structured LLM output handling in the workflow visual analyzer?  
**Date**: 2026-04-19  
**Sources**: 4 findings files (baml-docs, baml-typescript, codebase-current, baml-compatibility)

---

## 1. Executive Summary

BAML is a strong fit for replacing the manual `extractJson()` → `JSON.parse()` → `isValidWorkflow()` pipeline. All current TypeScript types map to BAML with minor adjustments. LM Studio is explicitly supported via the `openai-generic` provider with dedicated documentation. BAML's SAP parser handles every edge case that `extractJson()` currently addresses manually. The integration is scoped and low-risk — it replaces the output parsing layer without affecting the vision model step, prompt business logic, or server infrastructure.

---

## 2. Cross-Source Analysis

### 2.1 BAML Types ↔ Current TypeScript Types

Cross-referencing `fixtures/types.ts` (codebase-current) with BAML type system (baml-docs, baml-typescript):

| TypeScript Type | BAML Equivalent | Confidence | Notes |
|---|---|---|---|
| `Decision` enum (5 values) | `enum Decision { approved rejected ... }` | **High** | Direct 1:1 mapping |
| `Participant.role: 'approver' \| 'reviewer' \| 'readonly'` | `"approver" \| "reviewer" \| "readonly"` literal union | **High** | Supported since BAML v0.61.0 |
| `Participant.id?: string` | `id string?` | **High** | Direct mapping |
| `Participant.decision?: Decision` | `decision Decision?` | **High** | Direct mapping |
| `StageDependency.condition` (3-value string union) | `"decision" \| "deadline" \| "completion"` | **High** | Literal union |
| `StageDependency.deadline?: Date` | `deadline string?` | **Medium** | BAML has no `datetime` type — must use ISO 8601 string |
| `Stage.metadata?: Record<string, any>` | `metadata map<string, string>?` | **Medium** | BAML has no `any` type — downgraded to `string` values |
| `Workflow.decision?: Decision \| Decision[]` | `decision (Decision \| Decision[])?` | **Medium** | Union of scalar and array — BAML supports this syntax but parsing reliability with local models is untested |

**Validated**: All 8 types/fields from `fixtures/types.ts` have BAML equivalents. No blocking type incompatibilities.

**Adjustments needed**:
- `Date` → `string` (2 fields: `StageDependency.deadline`, `Stage.deadline`)
- `Record<string, any>` → `map<string, string>` (2 fields: `Stage.metadata`, `Workflow.metadata`)
- Neither adjustment affects current functionality since these fields are rarely populated by the LLM

### 2.2 BAML SAP Parser ↔ Current extractJson()

Cross-referencing `extractJson()` implementation (codebase-current) with BAML SAP parser capabilities (baml-docs):

| Current Manual Step | BAML SAP Handles? | Confidence |
|---|---|---|
| Strip `<\|...\|>` special tokens via regex | **Yes** — SAP strips "thought tokens" and LLM special tokens | **High** |
| Strip markdown ` ```json ``` ` fences | **Yes** — SAP strips markdown code fences | **High** |
| Extract first `{` to last `}` from mixed text | **Yes** — SAP handles "yapping" (preamble/postamble) | **High** |
| `JSON.parse()` with try/catch | **Yes** — SAP parses JSON with error correction | **High** |
| `isValidWorkflow()` — check `stages` array exists | **Yes** — BAML validates full schema, not just top-level | **High** |
| "Output ONLY valid JSON" prompt instruction | **Replaced** by `{{ ctx.output_format }}` auto-generated instructions | **High** |
| TypeScript types embedded in prompt text | **Replaced** by BAML schema → auto-generated format instructions | **High** |

**Additionally**, SAP fixes issues `extractJson()` does NOT handle:
- Trailing commas in JSON
- Unquoted strings
- Missing commas/brackets
- Type coercions (string → array when schema expects array)
- Misnamed keys (fuzzy key matching against schema)
- Multiple JSON candidates (picks best match)

**Validated**: Complete functional coverage. SAP is a strict superset of `extractJson()` capabilities.

### 2.3 LM Studio Configuration Alignment

Cross-referencing current OpenAI SDK config (codebase-current) with BAML provider options (baml-compatibility):

| Current Config | BAML Config | Match? |
|---|---|---|
| `baseURL: 'http://localhost:1234/v1'` | `base_url "http://localhost:1234/v1"` | **Exact** |
| `apiKey: 'lm-studio'` (dummy) | `api_key "lm-studio"` or omitted entirely | **Compatible** — BAML sends no auth header if key is empty |
| `model: 'openai/gpt-oss-20b'` | `model "openai/gpt-oss-20b"` | **Exact** — passed as-is |
| `temperature: 0.5` | `temperature 0.5` in client options | **Exact** |
| `maxRetries: 0` | No retry_policy block (defaults to 0 retries) | **Compatible** |
| No `response_format` (plain text output) | BAML does NOT use `response_format` — uses prompt injection + SAP | **Ideal** — no dependency on JSON mode |

**Validated**: Zero configuration conflicts. LM Studio has a dedicated BAML documentation page.

### 2.4 ESM Module Compatibility

Cross-referencing project config (codebase-current: `"type": "module"`, `tsx` runner) with BAML generator (baml-typescript):

| Requirement | BAML Support | Confidence |
|---|---|---|
| `"type": "module"` in package.json | `module_format "esm"` in generator block | **High** |
| `tsx` dev runner | Should work — BAML generates standard TS/JS | **Medium** — not explicitly tested in findings |
| `tsconfig.json` bundler resolution | Compatible with generated code | **Medium** |

**Note**: The `module_format "esm"` option is documented but its interaction with `tsx` specifically is not validated in findings.

---

## 3. Patterns and Themes

### Pattern 1: Complete Functional Replacement
**Prevalence**: Across all sources  
**Assessment**: Mature, well-documented  

BAML replaces every step of the current JSON extraction pipeline:
- `extractJson()` → SAP parser (automatic)
- `isValidWorkflow()` → schema validation (automatic)
- `JSON.parse()` → typed return value (automatic)
- Type definitions in prompt → `{{ ctx.output_format }}` (automatic)

### Pattern 2: Minimal Integration Surface
**Prevalence**: Confirmed by codebase-current + baml-typescript  
**Assessment**: Low risk  

The change boundary is small and well-defined:
- **Replaced**: `buildWorkflow()` internals, `extractJson()`, `isValidWorkflow()`
- **Unchanged**: `interpretImage()`, `loadContacts()`, server code, logging, frontend
- **New files**: `.baml` schema + client definitions, generated `baml_client/`

### Pattern 3: Two-Model Pipeline Preserved
**Prevalence**: Confirmed by architecture analysis  
**Assessment**: Clean separation  

BAML replaces only the reasoning model's output handling (Step 3). The vision model (Step 1) operates independently. Two integration strategies exist:
1. **Minimal**: Only replace reasoning model output parsing (recommended)
2. **Full**: Also wrap vision model in BAML function with `image` type (possible but unnecessary)

### Pattern 4: Prompt Business Logic Stays
**Prevalence**: Confirmed by codebase-current and baml-docs  
**Assessment**: Critical constraint  

The prompt's domain logic (fuzzy name matching, OCR error handling, contact suggestions, position-based assignment) is NOT affected by BAML. Only the output format instructions change — from manual "Output ONLY valid JSON matching Workflow type" to BAML's `{{ ctx.output_format }}`.

---

## 4. Key Insights

### Insight 1: SAP is a Strict Superset of extractJson()
**Supporting Evidence**: SAP benchmark data (76-94% vs 51-93% for function calling), documented edge case handling  
**Implications**: Not only does BAML replace current functionality, it handles cases the current code can't (malformed JSON, type coercions, fuzzy key matching)  
**Confidence**: **High**

### Insight 2: No JSON Mode Dependency is a Feature
**Supporting Evidence**: BAML uses prompt injection + SAP instead of `response_format`  
**Implications**: Perfect for LM Studio, which may not fully support JSON mode. The current code also doesn't use JSON mode, so this is alignment > improvement  
**Confidence**: **High**

### Insight 3: Code Generation Adds Build Step
**Supporting Evidence**: `baml-cli generate` required after .baml file changes  
**Implications**: Adds complexity to build pipeline. VS Code extension auto-generates on save, but CI/CD needs explicit step  
**Confidence**: **High** — this is a known trade-off, not a risk

### Insight 4: Token Usage Tracking Needs Investigation
**Supporting Evidence**: Current code tracks `promptTokens`, `completionTokens`, `totalTokens` via OpenAI SDK response. BAML findings mention `Collector` for tracking but details are sparse  
**Implications**: If BAML doesn't expose token usage, `addUsage()` pattern breaks. May need `Collector` API or raw response access  
**Confidence**: **Low** — this is the biggest gap in the findings

---

## 5. Gaps and Uncertainties

### Gap 1: Token Usage Tracking (Critical)
**Status**: Unresolved  
**Detail**: Current code accumulates `prompt_tokens` + `completion_tokens` from OpenAI SDK response objects. BAML wraps the API call internally. The `Collector` mechanism is mentioned in baml-typescript findings (`with_options({ collector: ... })`) but its exact API for extracting token counts is not documented in the gathered findings.  
**Risk**: If BAML doesn't expose usage data, the frontend's token display breaks.  
**Mitigation**: Investigate `Collector` API before implementation; fallback to keeping OpenAI SDK for the reasoning call and using BAML only for parsing.

### Gap 2: LangChain Agent Loop Integration
**Status**: Partially addressed  
**Detail**: The project description (`claude.md`) mentions a LangChain agent loop with tool calling (`runAgentLoop()`), but the codebase analysis found a simpler `buildWorkflow()` function. This may be due to analyzing the `baml` branch where the agent loop was already simplified, or it may be an alternate implementation path. If the agent loop exists, BAML's role would be limited to parsing the final output only.  
**Risk**: Low — BAML replaces output parsing regardless of whether it's from a single call or an agent loop's final response.

### Gap 3: tsx + ESM + Generated Code Interaction
**Status**: Untested  
**Detail**: The project uses `tsx` to run TypeScript directly. BAML generates TypeScript code in `baml_client/`. The interaction between `tsx`'s transform pipeline and BAML's generated ESM code is not validated.  
**Risk**: Medium — could cause import resolution issues at runtime.  
**Mitigation**: Test with `npx tsx src/index.ts` after initial setup.

### Gap 4: Decision | Decision[] Union Parsing
**Status**: Theoretically supported, untested with local models  
**Detail**: `Workflow.decision` is typed as `Decision | Decision[]` — a union of scalar and array. BAML supports this syntax, but SAP's handling of this ambiguity with smaller local models is unknown.  
**Risk**: Low — this field is rarely populated in practice (default is `pending`).

---

## 6. Contradictions

### No Major Contradictions Found
All sources are consistent. The only tension is between:
- **claude.md** describing a LangChain agent loop with tools
- **codebase-current.md** analyzing a simpler `buildWorkflow()` with direct OpenAI SDK call

This is likely a branch difference (analyzing the `baml` branch code), not a contradiction. Both scenarios support BAML integration at the output parsing layer.

---

## 7. Conclusions

### Primary Conclusion
BAML is a well-matched replacement for the current `extractJson()` + `isValidWorkflow()` pipeline. The type system maps cleanly, LM Studio is first-class supported, and SAP handles all current and additional edge cases. **Confidence: High (90%)**.

### Secondary Conclusions
1. The integration is scoped to ~3 files and ~50 lines of code changes, plus new `.baml` schema files. **Confidence: High**.
2. Token usage tracking is the only significant technical risk. **Confidence: Medium** — needs investigation before implementation.
3. ESM compatibility via `module_format "esm"` should work but needs runtime validation. **Confidence: Medium**.
4. The vision model step should NOT be migrated to BAML in the first iteration — it adds complexity without benefit. **Confidence: High**.

### Recommendation
**Proceed with BAML integration** using a minimal approach: replace only the reasoning model's output parsing. Keep the vision model on OpenAI SDK. Investigate token usage tracking via `Collector` API before full implementation.
