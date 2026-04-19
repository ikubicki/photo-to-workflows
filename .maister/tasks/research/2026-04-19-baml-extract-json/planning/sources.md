# Research Sources

## Codebase Sources

### Key Files
- `backend/src/workflow.ts` — Main pipeline: `interpretImage()`, `buildWorkflow()`, `analyzeWorkflow()`, `extractJson()`, `isValidWorkflow()`
- `fixtures/types.ts` — TypeScript types: `Workflow`, `Stage`, `Participant`, `StageDependency`, `Decision`, `Contact`
- `fixtures/contacts.json` — Contact data used by the workflow builder
- `backend/src/index.ts` — Fastify server setup, `/api/analyze` endpoint
- `backend/src/logger.ts` — Logging utility

### Configuration
- `backend/package.json` — Current dependencies: `openai@^6.33.0`, `fastify@^5.2.0`, `tsx@^4.19.0`
- `backend/tsconfig.json` — TypeScript config: `module: ESNext`, `moduleResolution: bundler`, `noEmit: true`
- `claude.md` — Project documentation and architecture overview

### Patterns to Analyze
- `extractJson()` implementation: regex-based token stripping, markdown fence removal, first-`{`-to-last-`}` extraction
- `isValidWorkflow()` implementation: checks `stages` array exists
- `buildWorkflow()` system prompt: inline TypeScript types, contact list, matching instructions
- OpenAI SDK usage: `client.chat.completions.create()` with `baseURL`, `model`, `temperature`

## External Sources — BAML Documentation

### Official Documentation
- BAML official website and docs: https://docs.boundaryml.com/
- BAML getting started guide: https://docs.boundaryml.com/guide/installation
- BAML concepts (functions, clients, types): https://docs.boundaryml.com/guide/

### TypeScript/Node.js Specific
- BAML TypeScript client generation: https://docs.boundaryml.com/guide/languages/typescript
- BAML npm package: https://www.npmjs.com/package/@boundaryml/baml
- BAML TypeScript runtime API and usage examples

### BAML DSL & Type System
- BAML type definitions (class, enum, union, optional): https://docs.boundaryml.com/ref/baml/type-system
- BAML function definitions: https://docs.boundaryml.com/ref/baml/function
- BAML client configuration (providers, base URLs): https://docs.boundaryml.com/ref/baml/client

### Provider Compatibility
- BAML OpenAI provider configuration: https://docs.boundaryml.com/ref/baml/client/providers/openai
- BAML custom endpoint / base_url support
- BAML fallback and retry configuration

## External Sources — GitHub

### BAML Repository
- GitHub repo: https://github.com/BoundaryML/baml
- TypeScript examples in repo: `typescript/` or `integ-tests/typescript/`
- Example `.baml` files with complex types
- Issues related to OpenAI-compatible endpoints or custom base URLs

## External Sources — Package Registry

### npm
- `@boundaryml/baml` — BAML TypeScript package, version, dependencies, compatibility
- Check for ESM support and Node.js version requirements
