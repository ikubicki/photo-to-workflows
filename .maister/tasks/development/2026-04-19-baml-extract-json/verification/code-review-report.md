# Code Review Report

**Date**: 2026-04-19
**Path**: backend/src/workflow.ts, backend/baml_src/*, .gitignore
**Scope**: all
**Status**: ⚠️ Issues Found

## Summary
- **Critical**: 1 issue
- **Warnings**: 3 issues
- **Info**: 3 issues

## Critical Issues

### C-1: BAML-generated enum values diverge from API contract — silent data change

**Location**: [backend/baml_src/types.baml](backend/baml_src/types.baml#L1-L7) + [backend/baml_client/types.ts](backend/baml_client/types.ts#L50-L57)

**Description**: The BAML `Decision` enum uses PascalCase values internally (`Approved = "Approved"`, `ChangeRequested = "ChangeRequested"`) while `fixtures/types.ts` uses lowercase (`approved`, `change_requested`). The `@alias` annotations in the `.baml` file tell SAP to parse lowercase strings from LLM output into the PascalCase enum — but once parsed, the **serialized output** to the frontend will use PascalCase values.

Before migration, the API returned:
```json
{ "decision": "approved", "stages": [{ "decision": "pending", ... }] }
```

After migration, BAML returns TypeScript objects with `Decision.Approved = "Approved"`, so `JSON.stringify()` produces:
```json
{ "decision": "Approved", "stages": [{ "decision": "Pending", ... }] }
```

**Risk**: This is a **silent breaking change** in the API contract. The frontend or any consumer comparing `decision === "approved"` will fail. Fastify's `return result` auto-serializes with `JSON.stringify`, so these PascalCase values go directly to the wire.

**Recommendation**: Either:
1. Add a post-processing step to map BAML enum values back to lowercase before returning, or
2. Change the `@alias` values to be the _primary_ enum names (i.e., use `approved` as the enum variant name instead of `Approved`) — though BAML may require PascalCase for enum variant names (verify BAML docs), or
3. Add a serialization transform in `analyzeWorkflow()` before returning:
   ```typescript
   return { workflow: JSON.parse(JSON.stringify(workflow).replace(/"(Approved|Rejected|ChangeRequested|Pending|Completed)"/g, (_, v) => `"${v.replace(/([A-Z])/g, '_$1').toLowerCase().slice(1)}"`)), usage }
   ```
   (ugly — option 1 or 2 preferred)

**Fixable**: true

---

## Warnings

### W-1: `env.LM_STUDIO_URL` breaks zero-config startup for reasoning model

**Location**: [backend/baml_src/clients.baml](backend/baml_src/clients.baml#L4)

**Description**: The BAML client uses `base_url env.LM_STUDIO_URL` which reads the environment variable at runtime and throws if unset. The vision model path retains the safe default: `process.env.LM_STUDIO_URL ?? 'http://localhost:1234/v1'`. This creates an asymmetry — the app starts fine for the vision step but crashes on the reasoning step if `LM_STUDIO_URL` is unset.

Previously this worked with zero config. Now `LM_STUDIO_URL` must be exported before running.

**Recommendation**: Either hardcode a fallback in `clients.baml` (`base_url "http://localhost:1234/v1"`) or use `ClientRegistry` at runtime with the `??` default, or at minimum document the now-required env var (e.g., in README or `.env.example`). The spec-audit flagged this as W-3 already — confirming it's still present in the implementation.

**Fixable**: true

---

### W-2: Collector constructor argument `"reasoning-model"` has no effect documented

**Location**: [backend/src/workflow.ts](backend/src/workflow.ts#L119)

**Description**: `new Collector("reasoning-model")` — the string argument serves as a tag/label for the Collector. The BAML docs show `new Collector()` without arguments in most examples. While not harmful, it's unclear what this label does or if `collector.last` is always populated correctly when a label is set.

Additionally, `collector.last` could be `undefined` if the BAML call throws before completing. The current code accesses `collector.last?.usage?.input_tokens` with optional chaining, so it handles `undefined` — but `bamlUsage` itself could be `undefined`, and then `bamlUsage?.usage?.input_tokens` works but is redundant with a second `?.`.

**Recommendation**: Minor — verify the Collector label behavior. The null safety is adequate.

**Fixable**: false (behavior question, not a bug)

---

### W-3: `addUsage()` function is now unused for reasoning model path

**Location**: [backend/src/workflow.ts](backend/src/workflow.ts#L23-L27)

**Description**: The `addUsage()` helper was designed to extract usage from OpenAI SDK responses (`OpenAI.CompletionUsage` type). After the migration, it's only used by `interpretImage()` for the vision model. The reasoning model now uses a completely separate pattern with `collector.last?.usage?.input_tokens`.

This isn't a bug, but the two usage accumulation patterns are inconsistent:
- Vision: `addUsage(usage, response.usage)` — delegated to helper
- Reasoning: inline `usage.promptTokens += bamlUsage?.usage?.input_tokens ?? 0` — manual

**Recommendation**: Not urgent, but a future refactor could unify the pattern. Acceptable for now since `addUsage()` is still used.

**Fixable**: false (design choice)

---

## Informational

### I-1: `Workflow.decision` type simplified from `Decision | Decision[]` to `Decision?`

**Location**: [backend/baml_src/types.baml](backend/baml_src/types.baml#L37) vs [fixtures/types.ts](fixtures/types.ts#L59)

**Description**: `fixtures/types.ts` defines `decision?: Decision | Decision[]` while BAML defines `decision Decision?`. This was an intentional spec decision (the union adds parsing complexity with local models) but narrows the type. If a workflow ever needs multiple decisions, the BAML schema would need updating.

**Fixable**: false (intentional design decision)

---

### I-2: `metadata` type narrowed from `Record<string, any>` to `map<string, string>`

**Location**: [backend/baml_src/types.baml](backend/baml_src/types.baml#L29) vs [fixtures/types.ts](fixtures/types.ts#L53)

**Description**: BAML has no `any` type, so `metadata` is narrowed to `map<string, string>`. Any numeric or boolean metadata values from the LLM would be coerced to strings. This is documented in the spec and is a known BAML limitation.

**Fixable**: false (BAML type system limitation)

---

### I-3: `fixtures/types.ts` types are now duplicated in BAML schema

**Location**: [fixtures/types.ts](fixtures/types.ts) and [backend/baml_src/types.baml](backend/baml_src/types.baml)

**Description**: The `Workflow`, `Stage`, `Participant`, `StageDependency`, and `Decision` types now exist in two places: the original `fixtures/types.ts` (still imported for `Contact`) and the BAML schema. Changes to the data model require updating both. The spec documents this as an intentional "keep both" decision.

**Recommendation**: Consider adding a comment in `fixtures/types.ts` noting that `Workflow`/`Stage`/`Participant` types have BAML equivalents in `backend/baml_src/types.baml` and must be kept in sync.

**Fixable**: true

---

## Metrics
- Files analyzed: 6
- Max function length: ~50 lines (`interpretImage`)
- Max nesting depth: 2 levels
- Potential vulnerabilities: 0
- Dead code references (extractJson, isValidWorkflow, etc.): 0 ✅

## Prioritized Recommendations

1. **[Critical] Fix enum serialization mismatch** — BAML generates `"Approved"` not `"approved"`. This silently breaks the API contract. Verify actual wire format and add a mapping layer if needed.
2. **[Warning] Document or fix `LM_STUDIO_URL` requirement** — Add `.env.example` or hardcode the default in `clients.baml` to maintain zero-config dev experience.
3. **[Info] Add cross-reference comment** between `fixtures/types.ts` and `baml_src/types.baml` to prevent drift.
