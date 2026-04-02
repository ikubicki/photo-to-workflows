# Project Conventions — Workflow Visual Analyzer

Project-specific coding patterns discovered from the codebase.

## Imports

- ESM modules (`"type": "module"` in package.json)
- Explicit `.ts` extensions in relative imports: `import { foo } from './bar.ts'`
- Type-only imports: `import type { Contact } from '../../fixtures/types.ts'`
- Relative `./` paths for local imports

## TypeScript

- `strict: true` in all tsconfig.json files
- `type` keyword for data models (not `interface`)
- String `enum` for closed value sets (e.g. `Decision`)
- Optional properties with `?` suffix
- Error type assertion: `(err as Error).message`

## Naming

- **Functions/variables**: camelCase — `interpretImage()`, `imageBase64`
- **Types/enums/components**: PascalCase — `Workflow`, `Decision`, `App`
- **Constants**: UPPER_SNAKE_CASE — `CONTACTS_PATH`, `LM_STUDIO_BASE_URL`
- **Files**: lowercase — `workflow.ts`, `logger.ts` (except React components: `App.tsx`)

## Error Handling

- Try-catch with both `message` and `stack` logged
- HTTP errors as JSON: `reply.status(400).send({ error: '...' })`
- `maxRetries: 0` on external API clients — fail fast

## Logging

- Prefixed sections: `[VISION]`, `[BUILD]`, `[RESULT]`, `[CLEANED]`, `[USAGE]`
- Dual output: stdout + `logs/agent.log`
- ISO timestamps
- `clearLog()` at start of each request

## Environment Variables

- Nullish coalescing with defaults: `process.env.PORT ?? 4000`
- Explicit type conversion: `Number(process.env.PORT ?? 4000)`

## File I/O (ESM)

- `dirname(fileURLToPath(import.meta.url))` for `__dirname` equivalent
- `resolve()` for path composition
- `readFile()` (promise-based) for async operations

## LLM Response Handling

- Strip special tokens, markdown fences before parsing
- Extract JSON via first `{` to last `}`
- Validate with type guard (`isValidWorkflow`)
- Fallback to raw response on parse failure
