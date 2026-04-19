# Scope Clarifications

## Decision 1: Raw Fallback Strategy
**Choice**: Catch BamlValidationError → return { raw, usage }
**Rationale**: Preserve existing behavior — frontend shows raw LLM text on parse failure. Wrap BAML call in try/catch, on BamlValidationError extract raw text and return fallback shape.

## Decision 2: LM Studio URL Configuration
**Choice**: BAML env syntax (env.LM_STUDIO_URL)
**Rationale**: Native BAML approach. Define `base_url env.LM_STUDIO_URL` in .baml client file. Requires LM_STUDIO_URL env var to be set (with fallback default in code or .env).

## Decision 3: Type Definitions
**Choice**: Keep both
**Rationale**: fixtures/types.ts stays unchanged (Contact type still needed, Workflow types preserved for reference). BAML generates its own types in baml_client/. No import changes needed for Contact usage path.
