# Specification Audit: Replace extractJson with BAML

**Spec**: `implementation/spec.md`  
**Auditor**: spec-auditor  
**Date**: 2026-04-19  
**Verdict**: ⚠️ **PASS WITH CONCERNS**

## Summary

| Severity | Count |
|---|---|
| Critical | 0 |
| Warning | 6 |
| Info | 5 |

The spec is well-structured, scoped correctly, and technically sound in its high-level approach. However, it contains **systematic line number errors** in the middle of the file that could mislead an implementer, a **design inconsistency** in `buildInstructions()` signature vs BAML template, and an **undocumented behavioral change** around env var defaults.

No critical issues — none of these block implementation if the implementer reads carefully.

---

## Findings

### W-1: Line numbers for `buildWorkflow()` are wrong by ~15 lines

**Severity**: Warning  
**Category**: Incorrect

**Spec Reference**: "Reusable Components" section — `buildWorkflow()` system prompt business rules (lines 109–135), `buildWorkflow()` function (lines 105–147)

**Evidence**:
- [workflow.ts](backend/src/workflow.ts#L90): `async function buildWorkflow(...)` starts at **line 90**, not 105
- [workflow.ts](backend/src/workflow.ts#L142): function closing `}` is at **line 142**, not 147
- Business rules start at ~line 93 (systemPrompt), not 109

**Impact**: An implementer told "extract lines 109–135" would copy the wrong section. The offset is consistent (~15 lines shifted), suggesting the spec was written against a different file version or line counting was wrong.

**Recommendation**: Reference by content/function name, not line numbers. If line numbers are kept, re-verify them.

---

### W-2: `buildInstructions(contactsJson: string)` — parameter and template inconsistency

**Severity**: Warning  
**Category**: Ambiguous

**Spec Reference**: "Modify: `buildWorkflow()` → returns business rules string" section

**Evidence**:
- The spec defines `buildInstructions(contactsJson: string): string`
- The BAML function template passes contacts separately: `{{ contacts }}`
- The BAML call is: `b.ExtractWorkflow(imageDescription, contactsJson, instructions, { collector })`

The BAML template structure is:
```
{{ instructions }}       ← business rules (from buildInstructions)
Contacts list:
{{ contacts }}           ← contacts JSON (passed separately)
{{ ctx.output_format }}  ← auto-generated
```

**Problem 1**: `buildInstructions(contactsJson)` takes contacts as a parameter, but contacts are already injected by the template via `{{ contacts }}`. If the function embeds contacts in the instructions, they'll appear twice in the final prompt.

**Problem 2**: The current prompt says *"the contacts list above"* (because contacts precede the rules in the current code). In the BAML template, `{{ instructions }}` comes BEFORE `{{ contacts }}`, so the reference should be *"the contacts list below"*.

**Recommendation**: Remove `contactsJson` parameter from `buildInstructions()`. Adjust wording in extracted rules to refer to "the contacts list" without positional language, or swap template order.

---

### W-3: `env.LM_STUDIO_URL` breaks zero-config default

**Severity**: Warning  
**Category**: Incomplete

**Spec Reference**: "Environment Variables" section, `clients.baml`

**Evidence**:
- Currently in [workflow.ts](backend/src/workflow.ts#L12): `const LM_STUDIO_BASE_URL = process.env.LM_STUDIO_URL ?? 'http://localhost:1234/v1'` — works without env var
- BAML `env.LM_STUDIO_URL` reads the env var at runtime — throws if unset
- Spec acknowledges this: *"If not set, BAML will throw an error"*

**Impact**: Currently the app works with zero configuration. After this change, the reasoning model will crash without `LM_STUDIO_URL` set, while the vision model still works fine. This is a behavioral regression not explicitly called out as a breaking change.

**Recommendation**: Either (a) hardcode the URL in `clients.baml` to preserve zero-config, (b) use `ClientRegistry` at runtime for dynamic config with default, or (c) explicitly document this as a required setup change and update `.env.example`.

---

### W-4: Multiple line numbers off by 1–5 lines in "Remove entirely" table

**Severity**: Warning  
**Category**: Incorrect

**Spec Reference**: "Remove entirely" table

| Spec Claim | Actual | Offset |
|---|---|---|
| `TokenUsage` type (line 22) | Line 20 | -2 |
| `addUsage()` (lines 23–28) | Lines 22–27 | -1 |
| `loadContacts()` (lines 30–33) | Lines 29–32 | -1 |
| `loadWorkflowTypes()` (lines 38–40) | Lines 34–36 | -4 |
| `interpretImage()` (lines 41–90) | Lines 38–88 | -3 |
| `analyzeWorkflow()` (lines 149–177) | Lines 144–176 | -5 |
| `loadWorkflowTypes()` call (line 157) | Line 153 | -4 |

**Evidence**: Line-by-line read of [workflow.ts](backend/src/workflow.ts#L1) confirms all offsets.

**Correct line numbers** (end-of-file references are accurate):
- `isValidWorkflow()` (lines 178–185) ✅
- `extractJson()` (lines 187–197) ✅

**Impact**: Medium. An implementer may locate code by function name rather than line number, but wrong line refs erode trust in the spec.

---

### W-5: Collector usage values can be null — spec doesn't handle

**Severity**: Warning  
**Category**: Incomplete

**Spec Reference**: "Token Usage Tracking" section

**Evidence**: The BAML `Usage` class defines ([Collector docs](https://docs.boundaryml.com/ref/baml_client/collector)):
```
input_tokens  | int | null
output_tokens | int | null
```

The spec says:
```
collector.last.usage.input_tokens → usage.promptTokens += ...
collector.last.usage.output_tokens → usage.completionTokens += ...
```

No null handling shown. The existing `addUsage()` uses `?? 0` for null safety:
```typescript
total.promptTokens += usage.prompt_tokens ?? 0
```

**Recommendation**: Add `?? 0` to the collector usage mapping, or note that the implementer should apply null coalescing.

---

### W-6: `baml:generate` script name inconsistency

**Severity**: Warning  
**Category**: Ambiguous

**Spec Reference**: "Package Changes" section

**Evidence**: The spec defines the script as:
```json
"baml:generate": "npx @boundaryml/baml-cli generate"
```

But the BAML quickstart ([TS docs](https://docs.boundaryml.com/docs/get-started/quickstart/typescript)) shows:
```json
"baml-generate": "baml-cli generate"
```

Two differences:
1. Script name: `baml:generate` (spec) vs `baml-generate` (docs/research)
2. Command: `npx @boundaryml/baml-cli generate` (spec) vs `baml-cli generate` (docs)

The research report's Appendix C uses `baml-cli generate` (without npx). With `@boundaryml/baml` installed locally, `npx baml-cli generate` or just `baml-cli generate` should both work, but the inconsistency could confuse.

**Recommendation**: Pick one form and use it consistently. `npx baml-cli generate` is safest for local dev.

---

### I-1: Generator version discrepancy between spec and research

**Severity**: Info

**Evidence**:
- Spec: `version "0.85.0"`, dependency `"@boundaryml/baml": "^0.85.0"`
- Research report: `version "0.221.0"`

The spec notes *"The exact BAML version should be determined at install time"*, which is correct.

---

### I-2: `Workflow.decision` type simplified from union to scalar

**Severity**: Info

**Evidence**:
- [types.ts](fixtures/types.ts#L57): `decision?: Decision | Decision[]`
- BAML spec: `decision Decision?`

Documented in spec's "Type mapping notes" as intentional simplification. Research report confirms this is low risk.

---

### I-3: `metadata` type narrowed

**Severity**: Info

**Evidence**:
- [types.ts](fixtures/types.ts#L53): `metadata?: Record<string, any>`
- BAML spec: `metadata map<string, string>?`

BAML has no `any` type. Documented in spec. Low impact since metadata is rarely populated.

---

### I-4: TypeScript import paths for Collector/BamlValidationError unverified

**Severity**: Info

**Spec Reference**: "New imports" section
```typescript
import { Collector, BamlValidationError } from '@boundaryml/baml'
```

**Evidence**: BAML docs show Python imports: `from baml_py import Collector` and `from baml_py.errors import BamlValidationError`. TypeScript import examples for these symbols are not shown in official docs. The import from `@boundaryml/baml` is plausible but unverified — may need to be from `@boundaryml/baml/errors` or `baml_client`.

**Impact**: Low. The implementer will discover the correct import during development.

---

### I-5: No `.env.example` update mentioned

**Severity**: Info

**Evidence**: If `LM_STUDIO_URL` becomes required (per W-3), the project should document it. No `.env.example` file currently exists, but standards mention env var documentation (`.maister/docs/standards/global/conventions.md`).

---

## Verified Correct

The following spec claims were verified against source code and BAML documentation:

| Claim | Evidence |
|---|---|
| BAML type fields match `fixtures/types.ts` (all fields, optionality, enums) | Field-by-field comparison ✅ |
| `extractJson()` at lines 187–197 | [workflow.ts](backend/src/workflow.ts#L187) ✅ |
| `isValidWorkflow()` at lines 178–185 | [workflow.ts](backend/src/workflow.ts#L178) ✅ |
| `TYPES_PATH` at line 10 | [workflow.ts](backend/src/workflow.ts#L10) ✅ |
| Vision model stays on OpenAI SDK | Scope boundaries section ✅ |
| `BamlValidationError` has `raw_output` property | [BAML error docs](https://docs.boundaryml.com/guide/baml-basics/error-handling) ✅ |
| Collector `last.usage.input_tokens` / `output_tokens` API | [BAML Collector docs](https://docs.boundaryml.com/ref/baml_client/collector) ✅ |
| `openai-generic` provider works with LM Studio | Research + [BAML LM Studio docs](https://docs.boundaryml.com/ref/llm-client-providers/lmstudio) ✅ |
| ESM generator config (`module_format "esm"`) | [BAML TS quickstart](https://docs.boundaryml.com/docs/get-started/quickstart/typescript) ✅ |
| All scope decisions from `scope-clarifications.md` reflected | 3/3 decisions present in spec ✅ |
| Preserved code list (interpretImage, addUsage, loadContacts, etc.) | Correct — all still needed ✅ |
| Frontend not affected (API contract unchanged) | Correct — same `{ workflow, usage }` / `{ raw, usage }` shape ✅ |
| `baml_client/` gitignored | Spec mentions root `.gitignore` update ✅ |

---

## Spec Quality Assessment

| Dimension | Rating | Notes |
|---|---|---|
| Completeness | Good | Covers all changed files, preserved code, new components |
| Clarity | Good | Data flow diagram, code samples, side-by-side tables |
| Accuracy — types | Excellent | All BAML types verified correct against fixtures/types.ts |
| Accuracy — line numbers | Poor | 10 of 14 line references are wrong by 1–15 lines |
| Ambiguity | Fair | `buildInstructions` parameter + template ordering unclear |
| Scope control | Excellent | Clear IN/OUT boundaries, no scope creep |
| Over-engineering | None detected | Minimal approach, reasonable abstractions |

---

## Recommendations for Implementer

1. **Ignore line numbers** in the spec. Locate code by function name / content.
2. **Remove `contactsJson` parameter** from `buildInstructions()`. Contacts are injected by the BAML template. Adjust "contacts list above" language to be positionally neutral.
3. **Handle `env.LM_STUDIO_URL` default**: either hardcode URL in `clients.baml` or use `ClientRegistry` for runtime config with the `?? 'http://localhost:1234/v1'` default.
4. **Add null coalescing** (`?? 0`) when mapping Collector's `usage.input_tokens` / `usage.output_tokens` to `TokenUsage`.
5. **Verify TypeScript imports** for `Collector` and `BamlValidationError` during development — exact paths not confirmed in BAML TS docs.
