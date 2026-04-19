# Implementation Verification Report

**Date**: 2026-04-19
**Task**: Replace extractJson with BAML

## Summary

| Check | Status |
|---|---|
| Completeness | PASS - 22/22 steps |
| Code review | PASS WITH FIX - 1 critical (Decision enum serialization) fixed |
| Pragmatic review | NOTED - BAML overhead acknowledged, user decision |
| Reality check | PASS WITH FIX - 1 critical (Collector field names) fixed |

## Issues Found & Resolved

### Critical (Fixed)

1. **Decision enum serialization** (code review)
   - BAML generated `Decision.Approved = "Approved"` instead of lowercase `"approved"`
   - **Fix**: Replaced enum with type alias `type Decision = "approved" | "rejected" | ...`
   - **Status**: RESOLVED — generated types now match fixtures/types.ts

2. **Collector API field names** (reality check)
   - Code used `input_tokens`/`output_tokens` (snake_case), BAML API uses `inputTokens`/`outputTokens` (camelCase)
   - **Fix**: Updated field names in workflow.ts
   - **Status**: RESOLVED

### Warnings (Noted)

1. **claude.md outdated** — still references extractJson, LangChain. Update recommended.
2. **env.LM_STUDIO_URL no default** — BAML throws if unset, unlike OpenAI SDK which has ?? fallback.
3. **Dual type definitions** — fixtures/types.ts + baml_src/types.baml. Minor drift (Decision|Decision[] → Decision?, Date → string). User decided to keep both.
4. **Two LLM calling patterns** — OpenAI SDK for vision, BAML for reasoning. Acceptable.

### Info (Noted)

1. Log messages in Step 3 lack [BAML] prefix (cosmetic)
2. E2E verification deferred (requires LM Studio)
