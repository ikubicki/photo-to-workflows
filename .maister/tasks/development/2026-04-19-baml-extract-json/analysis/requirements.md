# Requirements: Replace extractJson with BAML

## Initial Description
Replace extractJson() and isValidWorkflow() in backend/src/workflow.ts with BAML structured output parsing. Install BAML, create .baml schema files mapping current Workflow types, configure LM Studio via openai-generic provider, and replace buildWorkflow() output handling with typed BAML function call.

## Q&A
- **Prompt location**: Business rules (contact matching, OCR guidelines, role defaults) stay as runtime parameter passed to BAML function — NOT hardcoded in .baml template. This allows changing rules without rebuilding BAML.
- **Error handling**: On BamlValidationError, return raw LLM text to frontend (preserving current { raw, usage } fallback behavior).
- **Token tracking**: Required. Use BAML Collector API for reasoning model, keep OpenAI SDK addUsage() for vision model. Both accumulate into same TokenUsage object.
- **Scope**: Only reasoning model (buildWorkflow) migrates. interpretImage() stays on OpenAI SDK.
- **LM Studio config**: Use BAML env syntax (env.LM_STUDIO_URL) in .baml client definition.
- **Types**: Keep both fixtures/types.ts and BAML-generated types. No import changes needed.

## Functional Requirements

1. **BAML Schema**: Create .baml files defining Workflow, Stage, Participant, Decision, StageDependency types matching fixtures/types.ts
2. **BAML Client**: Define openai-generic client pointing to env.LM_STUDIO_URL with model openai/gpt-oss-20b, temp 0.5
3. **BAML Function**: Define ExtractWorkflow function accepting imageDescription (string), contactsJson (string), and rules (string) parameters. Returns Workflow type. Prompt template uses {{ ctx.output_format }} for type instructions.
4. **BAML Generator**: Configure TypeScript ESM generator (baml_client/ output)
5. **buildWorkflow() Replacement**: Replace OpenAI SDK call with b.ExtractWorkflow(). Pass contacts JSON and business rules as runtime parameters. 
6. **analyzeWorkflow() Simplification**: Remove loadWorkflowTypes(), extractJson(), isValidWorkflow(), JSON.parse block. Replace with single BAML call + Collector for tokens.
7. **Token Usage**: Use BAML Collector to capture input_tokens/output_tokens from reasoning model. Map to existing promptTokens/completionTokens format.
8. **Error Fallback**: Catch BamlValidationError, extract raw LLM text, return { raw: rawText, usage }.
9. **Package Updates**: Add @boundaryml/baml dependency, add baml-generate script
10. **Gitignore**: Add baml_client/ entry

## Scope Boundaries
- **IN**: buildWorkflow(), analyzeWorkflow(), BAML schema files, package.json, .gitignore
- **OUT**: interpretImage() (stays OpenAI SDK), frontend (no changes), index.ts (no API changes), logger.ts, fixtures/types.ts

## Reusability Opportunities
- None identified — this is a targeted replacement of specific functions

## Technical Considerations
- ESM compatibility: BAML generator must output ESM-compatible code. Backend uses "type": "module".
- tsx runner: Backend uses tsx for development. Verify BAML generated client works with tsx.
- No tests exist — manual verification via frontend upload.
