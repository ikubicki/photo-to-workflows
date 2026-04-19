# Research Brief: Replace extractJson with BAML

## Research Question

How to replace the `extractJson` function in `backend/src/workflow.ts` with BAML for structured LLM output handling?

## Research Type

Technical — investigating a specific library (BAML) for integration into existing codebase.

## Context

The current pipeline in `workflow.ts` uses a 2-step process:
1. Vision model (`qwen/qwen3-vl-8b`) interprets a workflow diagram image → text description
2. Reasoning model (`openai/gpt-oss-20b`) builds a Workflow JSON from the description + contacts

The reasoning model is prompted to output "ONLY a valid JSON object." Post-processing uses `extractJson()` which:
- Strips LLM special tokens (`<|...|>`)
- Strips markdown code fences
- Extracts JSON between first `{` and last `}`
- Then `isValidWorkflow()` checks `stages` array exists

This approach is fragile — it relies on string manipulation to extract JSON from free-text LLM output.

BAML is a domain-specific language for structured LLM output that could replace this approach with type-safe, validated structured output.

## Scope

### Included
- BAML library capabilities and TypeScript API
- How BAML handles structured output extraction from LLMs
- Integration with OpenAI-compatible APIs (LM Studio)
- Replacing both `extractJson()` and `isValidWorkflow()` with BAML validation
- Potential for replacing the buildWorkflow prompt engineering with BAML schemas

### Excluded
- Other structured output libraries (Instructor, Outlines, Zod-to-JSON-schema)
- Python BAML usage
- Changing the vision model step

### Constraints
- Must work with LM Studio at localhost:1234/v1 (OpenAI-compatible)
- Must work with TypeScript + ESM modules
- Must produce output matching the existing `Workflow` type from `fixtures/types.ts`
- Prototype project — pragmatic solutions preferred

## Success Criteria
1. Understanding of BAML's TypeScript API and capabilities
2. Clear assessment of whether BAML works with OpenAI-compatible endpoints (LM Studio)
3. Concrete integration approach for replacing extractJson + prompt engineering
4. Risk assessment and trade-offs vs current approach
