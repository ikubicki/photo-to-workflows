# Roadmap — Workflow Visual Analyzer

## Current State: Prototype

Working end-to-end pipeline: upload image → AI vision interpretation → structured Workflow JSON with matched contacts.

## Completed

- [x] React frontend with image upload and result display
- [x] Fastify backend with multipart file handling
- [x] Vision model integration (qwen/qwen3-vl-8b) for diagram interpretation
- [x] Reasoning model integration (openai/gpt-oss-20b) for workflow building
- [x] Contact fuzzy matching in prompt
- [x] Token usage tracking and display
- [x] File-based logging
- [x] Migration from LangChain to direct OpenAI SDK

## Next Steps (Potential)

- [ ] Add test coverage (unit + integration)
- [ ] Add linting (ESLint / Biome)
- [ ] Environment variable management (.env files)
- [ ] Improved error display in frontend
- [ ] Support for multiple image formats / sizes
- [ ] Workflow result editing UI
- [ ] Persistent storage for analyzed workflows
