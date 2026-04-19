# Research Report: Replacing extractJson with BAML

**Research Type**: Technical — Library evaluation + codebase integration analysis  
**Date**: 2026-04-19  
**Question**: How to replace extractJson with BAML for structured LLM output handling in the workflow visual analyzer?

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Research Objectives](#2-research-objectives)
3. [Methodology](#3-methodology)
4. [Findings](#4-findings)
5. [BAML Type Definitions](#5-baml-type-definitions)
6. [Integration Approach](#6-integration-approach)
7. [LM Studio Configuration](#7-lm-studio-configuration)
8. [Risk Assessment](#8-risk-assessment)
9. [Recommendation](#9-recommendation)
10. [Open Questions](#10-open-questions)
11. [Appendices](#11-appendices)

---

## 1. Executive Summary

BAML (Basically a Made-up Language) is a domain-specific language for extracting structured outputs from LLMs. It replaces manual JSON extraction, validation, and type coercion with a schema-driven approach: define types in `.baml` files, and BAML auto-generates prompt format instructions, calls the LLM, and parses the response into typed objects.

**Key findings**:
- BAML's SAP parser is a strict superset of the current `extractJson()` function — it handles every current edge case plus additional ones (malformed JSON, type coercions, fuzzy key matching)
- All current TypeScript types (`Workflow`, `Stage`, `Participant`, `Decision`, `StageDependency`) map to BAML with minor adjustments (`Date` → `string`, `Record<string, any>` → `map<string, string>`)
- LM Studio is officially supported via the `openai-generic` provider with a dedicated documentation page
- BAML does NOT depend on OpenAI's JSON mode or structured outputs API — it uses prompt injection + resilient parsing, which is ideal for local models
- Integration scope is minimal: ~3 files changed, ~50 lines modified, plus new `.baml` schema files
- The vision model step remains unchanged — only the reasoning model's output handling is affected

**Recommendation**: Proceed with BAML integration using a minimal approach. Confidence: **High (90%)**.

---

## 2. Research Objectives

### Primary Question
How to replace `extractJson()` with BAML for structured LLM output handling in the workflow visual analyzer?

### Sub-Questions
1. What does BAML replace in the current codebase? (scope)
2. Do the current TypeScript types map to BAML's type system? (compatibility)
3. Does BAML work with LM Studio's OpenAI-compatible API? (infrastructure)
4. What is the concrete integration approach? (implementation)
5. What are the risks and trade-offs? (assessment)

### Scope
- **Included**: `extractJson()`, `isValidWorkflow()`, `buildWorkflow()` output handling, BAML schema design, LM Studio configuration
- **Excluded**: Vision model migration, LangChain agent loop redesign, frontend changes, Fastify server changes

---

## 3. Methodology

### Research Type
Library evaluation + codebase integration analysis

### Data Sources
| Source | Files Analyzed | Key Content |
|---|---|---|
| BAML documentation (docs.boundaryml.com) | 15+ pages | Core concepts, SAP parser, TypeScript API |
| BAML npmjs package | 1 page | Installation, version, downloads |
| BAML GitHub repository | Issues search | LM Studio compatibility |
| Current codebase (`backend/src/workflow.ts`) | 1 file (~200 lines) | extractJson, isValidWorkflow, buildWorkflow |
| Current types (`fixtures/types.ts`) | 1 file (~60 lines) | Workflow, Stage, Participant, Decision |
| SAP blog post (boundaryml.com/blog) | 1 post | Parser benchmarks |

### Analysis Framework
Technical integration analysis: component mapping, type compatibility, configuration alignment, risk assessment.

---

## 4. Findings

### Finding 1: BAML's SAP Parser Replaces All Manual JSON Handling
**Category**: Core functionality  
**Confidence**: High  

BAML's Schema-Aligned Parsing (SAP) is a schema-aware, error-correcting parser that automatically handles:

| Edge Case | Current `extractJson()` | BAML SAP |
|---|---|---|
| LLM special tokens (`<\|im_end\|>`) | Regex strip | ✅ Automatic |
| Markdown code fences | Regex strip | ✅ Automatic |
| Preamble/postamble text | First `{` to last `}` extraction | ✅ "Yapping" removal |
| Malformed JSON (trailing commas, unquoted keys) | ❌ Not handled | ✅ Auto-corrected |
| Type mismatches (string → array) | ❌ Not handled | ✅ Type coercion |
| Fuzzy key matching | ❌ Not handled | ✅ Schema-aware |
| Multiple JSON candidates | ❌ Not handled | ✅ Picks best match |

**Benchmark data** (Berkeley Function Calling Leaderboard, n=1000):
- GPT-4o: Function Calling 82.1% → SAP **93.0%**
- GPT-4o-mini: Function Calling 51.8% → SAP **92.4%**
- Llama-3.1-7b: Function Calling 60.9% → SAP **76.8%**

SAP is significantly more reliable than function calling, especially for smaller models like those run locally via LM Studio.

**Evidence**: baml-docs.md §3, codebase-current.md §2–3

---

### Finding 2: Full Type System Compatibility
**Category**: Type mapping  
**Confidence**: High  

Every type in `fixtures/types.ts` has a BAML equivalent:

| TypeScript | BAML | Status |
|---|---|---|
| `enum Decision { APPROVED = 'approved', ... }` | `enum Decision { approved rejected ... }` | ✅ Direct |
| `role: 'approver' \| 'reviewer' \| 'readonly'` | `"approver" \| "reviewer" \| "readonly"` | ✅ Literal union (v0.61.0+) |
| `id?: string` | `id string?` | ✅ Direct |
| `decision?: Decision` | `decision Decision?` | ✅ Direct |
| `participants: Participant[]` | `participants Participant[]` | ✅ Direct |
| `dependsOn?: StageDependency[]` | `dependsOn StageDependency[]?` | ✅ Direct |
| `deadline?: Date` | `deadline string?` | ⚠️ No datetime — use ISO 8601 |
| `metadata?: Record<string, any>` | `metadata map<string, string>?` | ⚠️ No `any` — downgrade |
| `decision?: Decision \| Decision[]` | `decision (Decision \| Decision[])?` | ⚠️ Union — supported but complex |

**Minor adjustments needed**:
1. `Date` → `string` (BAML has no datetime type). Already rare in LLM output.
2. `Record<string, any>` → `map<string, string>`. The `metadata` field is optional and rarely populated.
3. `Decision | Decision[]` → supported via union syntax but may confuse smaller LLMs.

**Evidence**: baml-typescript.md §3, §8, codebase-current.md §5

---

### Finding 3: LM Studio First-Class Support
**Category**: Infrastructure compatibility  
**Confidence**: High (95%)  

BAML has a **dedicated LM Studio documentation page** with explicit configuration examples.

Configuration alignment:
```
Current:  baseURL: 'http://localhost:1234/v1'  →  BAML: base_url "http://localhost:1234/v1"  ✅
Current:  apiKey: 'lm-studio' (dummy)          →  BAML: api_key omitted (no auth header)   ✅
Current:  model: 'openai/gpt-oss-20b'          →  BAML: model "openai/gpt-oss-20b"         ✅
Current:  temperature: 0.5                     →  BAML: temperature 0.5                    ✅
Current:  maxRetries: 0                        →  BAML: no retry_policy (default = 0)      ✅
Current:  no response_format                   →  BAML: no JSON mode dependency             ✅ (ideal)
```

GitHub issues search for "LM Studio": only 1 result — a merged docs link fix PR. No open compatibility issues.

**Evidence**: baml-compatibility.md §1–3, §8

---

### Finding 4: ESM Module Support Available
**Category**: Build compatibility  
**Confidence**: Medium  

The project uses `"type": "module"` with `tsx` for development. BAML supports ESM via generator configuration:

```baml
generator target {
  output_type "typescript"
  output_dir "../"
  module_format "esm"   // required for this project
  version "0.221.0"
}
```

The `tsx` runner's interaction with BAML's generated code is not explicitly documented, posing a minor risk.

**Evidence**: baml-typescript.md §2, codebase-current.md §7

---

### Finding 5: Vision Model Can Be Preserved As-Is
**Category**: Scope control  
**Confidence**: High  

BAML supports vision models via its `image` type and `Image.from_base64()`, but migrating the vision step is unnecessary:
- `interpretImage()` returns a plain text description (no structured output needed)
- The vision model (`qwen/qwen3-vl-8b`) is a separate concern from JSON extraction
- Adding BAML to the vision step would couple two independent pipeline stages

**Evidence**: baml-compatibility.md §6, codebase-current.md §1

---

### Finding 6: Token Usage Tracking Uncertain
**Category**: Integration risk  
**Confidence**: Low  

The current code tracks `promptTokens`, `completionTokens`, `totalTokens` from OpenAI SDK responses and displays them in the frontend. BAML wraps the LLM call internally. The `Collector` mechanism is referenced in documentation (`with_options({ collector: ... })`) but its API for extracting token counts was not fully explored in the gathered findings.

**Evidence**: codebase-current.md §6, baml-typescript.md §7

---

## 5. BAML Type Definitions

The following BAML schema maps to the current `fixtures/types.ts`:

```baml
// ── Enums ──

enum Decision {
  approved
  rejected
  change_requested @description("When changes to the submission are needed")
  pending
  completed
}

// ── Classes ──

class Participant {
  name string @description("Display name of the participant")
  id string? @description("UUID of matched contact — omit if no match found")
  role "approver" | "reviewer" | "readonly" @description("Defaults to approver if unclear from diagram")
  decision Decision? @description("Participant's decision, defaults to pending")
}

class StageDependency {
  parentStageId string @description("ID/name of the parent stage this depends on")
  condition "decision" | "deadline" | "completion" @description("Type of dependency trigger")
  decision Decision? @description("Required when condition is decision")
  deadline string? @description("ISO 8601 date string, required when condition is deadline")
}

class Stage {
  name string @description("Name of the approval stage")
  participants Participant[] @description("People involved in this stage")
  dependsOn StageDependency[]? @description("Dependencies on other stages")
  deadline string? @description("ISO 8601 deadline for the stage")
  decision Decision? @description("Overall stage decision, defaults to pending")
  metadata map<string, string>? @description("Optional key-value metadata")
}

class Workflow {
  name string @description("Name of the approval workflow")
  stages Stage[] @description("Ordered list of workflow stages")
  metadata map<string, string>? @description("Optional key-value metadata")
  decision Decision? @description("Overall workflow decision, defaults to pending")
}
```

### Mapping Notes

| Original TypeScript | BAML Change | Reason |
|---|---|---|
| `Decision` enum with string values | Values without string assignments | BAML enums are string-valued by default |
| `deadline?: Date` | `deadline string?` | BAML has no `datetime` — use ISO 8601 |
| `metadata?: Record<string, any>` | `metadata map<string, string>?` | BAML has no `any` type |
| `decision?: Decision \| Decision[]` | `decision Decision?` | Simplified — the union adds parsing complexity with minimal benefit; can be restored later if needed |

---

## 6. Integration Approach

### What Changes

#### New Files

| File | Purpose |
|---|---|
| `backend/baml_src/clients.baml` | LM Studio client definitions (vision + reasoning models) |
| `backend/baml_src/types.baml` | Workflow, Stage, Participant, Decision type definitions |
| `backend/baml_src/functions.baml` | `ExtractWorkflow` function with prompt template |
| `backend/baml_src/generators.baml` | TypeScript ESM generator config |
| `backend/baml_client/` (auto-generated) | Generated TypeScript types + function stubs |

#### Modified Files

| File | Change |
|---|---|
| `backend/src/workflow.ts` | Replace `buildWorkflow()` internals with `b.ExtractWorkflow()` call; remove `extractJson()`, `isValidWorkflow()`, and manual JSON.parse block |
| `backend/package.json` | Add `@boundaryml/baml` dependency; add `baml-generate` script |
| `backend/.gitignore` | Add `baml_client/` (auto-generated) |

#### Unchanged Files

| File | Reason |
|---|---|
| `backend/src/index.ts` | Fastify server — no changes needed |
| `backend/src/logger.ts` | Logging — independent utility |
| `frontend/*` | Frontend — no API contract changes |
| `fixtures/contacts.json` | Input data — unchanged |
| `fixtures/types.ts` | Kept for reference; BAML generates its own types |

### BAML Function Definition

```baml
function ExtractWorkflow(imageDescription: string, contacts: string, instructions: string) -> Workflow {
  client ReasoningModel
  prompt #"
    {{ _.role("system") }}
    {{ instructions }}

    Contacts list:
    {{ contacts }}

    {{ ctx.output_format }}

    {{ _.role("user") }}
    Here is the workflow diagram description:
    {{ imageDescription }}
  "#
}
```

### Modified `analyzeWorkflow()` (conceptual)

```typescript
import { b } from "../baml_client";

export async function analyzeWorkflow(imageBase64: string, mimeType: string) {
  clearLog();
  const usage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

  // Step 1: Vision model (unchanged)
  const imageDescription = await interpretImage(imageBase64, mimeType, usage);

  // Step 2: Load contacts (unchanged)
  const contacts = await loadContacts();

  // Step 3: BAML structured extraction (NEW)
  const workflow = await b.ExtractWorkflow(
    imageDescription,
    JSON.stringify(contacts),
    buildSystemInstructions()  // business logic prompt without type/format instructions
  );

  // No extractJson, no JSON.parse, no isValidWorkflow — BAML guarantees typed result
  return { workflow, usage };
}
```

### Removed Code

```typescript
// DELETE: extractJson() — entire function (~15 lines)
// DELETE: isValidWorkflow() — entire function (~7 lines)
// DELETE: JSON.parse(cleaned) + try/catch block
// DELETE: TypeScript types embedded in prompt text
// DELETE: "Output ONLY valid JSON" instruction in prompt
```

---

## 7. LM Studio Configuration

```baml
// backend/baml_src/clients.baml

client<llm> ReasoningModel {
  provider "openai-generic"
  options {
    base_url "http://localhost:1234/v1"
    model "openai/gpt-oss-20b"
    temperature 0.5
  }
}

// Optional: Vision model (only if migrating vision step too)
client<llm> VisionModel {
  provider "openai-generic"
  options {
    base_url "http://localhost:1234/v1"
    model "qwen/qwen3-vl-8b"
    temperature 0.1
    media_url_handler {
      image "send_base64"
    }
  }
}
```

```baml
// backend/baml_src/generators.baml

generator target {
  output_type "typescript"
  output_dir "../"
  module_format "esm"
  version "0.221.0"
}
```

### Environment Variables

No BAML-specific environment variables required. The `base_url` is hardcoded in the `.baml` file (matching current behavior). For dynamic configuration, use `ClientRegistry` at runtime:

```typescript
import { ClientRegistry } from "@boundaryml/baml";

const cr = new ClientRegistry();
cr.addLlmClient("ReasoningModel", "openai-generic", {
  model: process.env.REASONING_MODEL || "openai/gpt-oss-20b",
  base_url: process.env.LM_STUDIO_URL || "http://localhost:1234/v1",
  temperature: 0.5,
});
cr.setPrimary("ReasoningModel");

const workflow = await b.ExtractWorkflow(description, contacts, instructions, {
  client_registry: cr,
});
```

---

## 8. Risk Assessment

### Risk 1: Token Usage Tracking Loss
**Severity**: Medium  
**Probability**: Medium  
**Impact**: Frontend token display breaks  
**Mitigation**: Investigate `Collector` API before implementation. Fallback: keep OpenAI SDK for the call and use BAML only for response parsing (not recommended but possible).  
**Status**: Needs investigation

### Risk 2: tsx + ESM + Generated Code Incompatibility
**Severity**: Medium  
**Probability**: Low  
**Impact**: Runtime import errors  
**Mitigation**: Test immediately after initial setup with `npx tsx src/index.ts`. If fails, try CommonJS output or adjust tsconfig.  
**Status**: Can be validated in 5 minutes

### Risk 3: SAP Parsing Reliability with Local Models
**Severity**: Low  
**Probability**: Low  
**Impact**: Parse failures on edge cases  
**Mitigation**: BAML's `BamlValidationError` provides `raw_output` for debugging. "Fixup" pattern can retry with the same model. SAP benchmarks show 76.8% success on Llama-3.1-7b (smallest tested), which is significantly better than function calling.  
**Status**: Acceptable risk

### Risk 4: Code Generation Build Step
**Severity**: Low  
**Probability**: Certain (by design)  
**Impact**: Must run `npx baml-cli generate` after `.baml` changes  
**Mitigation**: VS Code BAML extension auto-generates on save. Add `baml-generate` script to package.json.  
**Status**: Accepted trade-off

### Risk 5: Decision | Decision[] Union Ambiguity
**Severity**: Low  
**Probability**: Low  
**Impact**: Workflow.decision field may not parse correctly  
**Mitigation**: Simplified to `Decision?` in initial BAML schema. Can be restored to full union later if needed.  
**Status**: Mitigated by design

### Risk Matrix Summary

| Risk | Severity | Probability | Action |
|---|---|---|---|
| Token usage tracking | Medium | Medium | **Investigate before implementation** |
| tsx + ESM compatibility | Medium | Low | Test immediately at setup |
| SAP with local models | Low | Low | Accept (SAP is better than current) |
| Build step complexity | Low | Certain | Accept (standard tooling) |
| Union type ambiguity | Low | Low | Mitigated (simplified schema) |

---

## 9. Recommendation

### Verdict: Proceed with BAML Integration

**Confidence**: High (90%)

**Rationale**:
1. BAML's SAP parser is measurably better than the current `extractJson()` approach — handles more edge cases, provides type safety, and eliminates ~25 lines of fragile regex/parsing code
2. All current types map to BAML with only cosmetic adjustments (Date→string, any→string)
3. LM Studio is first-class supported with zero configuration conflicts
4. Integration scope is minimal and well-bounded — 3 modified files, 5 new files
5. The only significant risk (token usage tracking) can be investigated before committing to implementation

### Recommended Approach: Minimal Replacement

1. **Phase 1** (investigate): Verify BAML Collector API for token usage tracking
2. **Phase 2** (setup): Install BAML, create `.baml` schema files, generate client
3. **Phase 3** (integrate): Replace `buildWorkflow()` output handling with `b.ExtractWorkflow()`
4. **Phase 4** (validate): Test end-to-end with a real workflow image via LM Studio

### What NOT to Do (First Iteration)
- Do not migrate the vision model step to BAML
- Do not redesign the LangChain agent loop (if it exists on main branch)
- Do not add streaming support
- Do not add retry policies (match current maxRetries: 0 behavior)

---

## 10. Open Questions

| # | Question | Priority | Impact |
|---|---|---|---|
| 1 | How does BAML's `Collector` API expose token usage (prompt_tokens, completion_tokens)? | **High** | Determines if frontend token display can be preserved |
| 2 | Does `baml_client/` generated code work with `tsx` runtime and `"type": "module"`? | **Medium** | Determines if ESM config is sufficient or if additional setup is needed |
| 3 | Can BAML function parameters accept the contacts list as structured data (typed array) instead of serialized JSON string? | **Low** | Would improve type safety of input but not blocking |
| 4 | How does BAML handle the `LM_STUDIO_URL` environment variable for dynamic `base_url`? | **Low** | Can use `ClientRegistry` at runtime as fallback |
| 5 | What is the `@boundaryml/baml` package size and its impact on `node_modules`? | **Low** | Native addon (Rust/napi-rs) — may add platform-specific binary |

---

## 11. Appendices

### Appendix A: Source List

| # | Source | Type | URL/Path |
|---|---|---|---|
| 1 | BAML Documentation — Overview | External docs | docs.boundaryml.com |
| 2 | BAML Documentation — TypeScript Quickstart | External docs | docs.boundaryml.com/docs/get-started/quickstart/typescript |
| 3 | BAML Documentation — Types Reference | External docs | docs.boundaryml.com/docs/snippets/supported-types |
| 4 | BAML Documentation — Class Reference | External docs | docs.boundaryml.com/ref/baml/class |
| 5 | BAML Documentation — Enum Reference | External docs | docs.boundaryml.com/ref/baml/enum |
| 6 | BAML Documentation — Function Reference | External docs | docs.boundaryml.com/ref/baml/function |
| 7 | BAML Documentation — Generator Reference | External docs | docs.boundaryml.com/ref/baml/generator |
| 8 | BAML Documentation — Client LLM | External docs | docs.boundaryml.com/ref/baml/client-llm |
| 9 | BAML Documentation — LM Studio Provider | External docs | docs.boundaryml.com/ref/llm-client-providers/lmstudio |
| 10 | BAML Documentation — openai-generic Provider | External docs | docs.boundaryml.com/docs/snippets/clients/providers/openai-generic |
| 11 | BAML Documentation — Error Handling | External docs | docs.boundaryml.com/guide/baml-basics/error-handling |
| 12 | BAML Documentation — ClientRegistry | External docs | docs.boundaryml.com/ref/baml_client/client-registry |
| 13 | BAML Documentation — with_options | External docs | docs.boundaryml.com/ref/baml_client/with-options |
| 14 | BAML SAP Blog Post | Blog | boundaryml.com/blog/schema-aligned-parsing |
| 15 | @boundaryml/baml npm | Package registry | npmjs.com/package/@boundaryml/baml |
| 16 | BAML GitHub Issues | GitHub | github.com/BoundaryML/baml/issues |
| 17 | backend/src/workflow.ts | Codebase | Current extractJson/buildWorkflow implementation |
| 18 | fixtures/types.ts | Codebase | Current Workflow/Stage/Participant types |
| 19 | backend/package.json | Codebase | Current dependencies |

### Appendix B: Current vs BAML Code Comparison

**Current** (`backend/src/workflow.ts`):
```typescript
// 25+ lines of manual parsing
const result = response.choices[0]?.message?.content ?? '';
const cleaned = extractJson(result);    // strip tokens, fences, extract JSON
try {
  const parsed = JSON.parse(cleaned);   // can throw
  if (isValidWorkflow(parsed)) {        // checks stages array exists
    return { workflow: parsed, usage };
  }
  return { raw: result, usage };        // fallback
} catch {
  return { raw: result, usage };        // fallback
}
```

**With BAML**:
```typescript
// 1 line — typed, validated, error-corrected
const workflow = await b.ExtractWorkflow(imageDescription, contacts, instructions);
return { workflow, usage };
```

### Appendix C: BAML Installation Steps

```bash
cd backend

# 1. Install BAML
npm install @boundaryml/baml

# 2. Initialize BAML project
npx baml-cli init

# 3. Create .baml schema files (types.baml, clients.baml, functions.baml)
# ... (see Section 5–7 for content)

# 4. Generate TypeScript client
npx baml-cli generate

# 5. Add to package.json scripts
# "baml-generate": "baml-cli generate"
# "build": "npm run baml-generate && tsc --build"

# 6. Add to .gitignore
# baml_client/

# 7. Install VS Code extension
# Extension ID: boundary.baml-extension
```
