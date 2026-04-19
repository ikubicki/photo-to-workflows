# Clarifications

## Token Usage Tracking
**Decision**: Required — frontend must continue showing promptTokens/completionTokens/totalTokens.
BAML Collector API must be investigated and used to extract token counts from BAML calls. Vision model tokens (via OpenAI SDK) + reasoning model tokens (via BAML) need to be accumulated.

## Vision Model Scope
**Decision**: Only reasoning model (buildWorkflow) migrates to BAML. interpretImage() stays unchanged with OpenAI SDK.

## OpenAI SDK Retention
**Decision**: Keep `openai` package for the vision model call (interpretImage). BAML handles only the reasoning model.
