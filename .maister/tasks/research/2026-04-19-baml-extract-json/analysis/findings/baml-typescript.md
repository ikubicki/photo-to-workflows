# BAML TypeScript/Node.js API — Research Findings

**Research question:** How to replace `extractJson` with BAML for structured LLM output handling in TypeScript?

**Sources investigated:**
- https://docs.boundaryml.com/docs/get-started/quickstart/typescript
- https://docs.boundaryml.com/docs/snippets/supported-types
- https://docs.boundaryml.com/ref/baml/function
- https://docs.boundaryml.com/ref/baml/class
- https://docs.boundaryml.com/ref/baml/enum
- https://docs.boundaryml.com/ref/baml/generator
- https://docs.boundaryml.com/ref/baml/client-llm
- https://docs.boundaryml.com/ref/baml_client/client-registry
- https://docs.boundaryml.com/ref/baml_client/with-options
- https://www.npmjs.com/package/@boundaryml/baml

---

## 1. Installation & Setup

### npm package

```bash
npm install @boundaryml/baml
```

**Package:** `@boundaryml/baml` (v0.221.0, MIT, ~130k weekly downloads)
**Source:** https://www.npmjs.com/package/@boundaryml/baml

The package is a native addon built with napi-rs (Rust → Node.js). This means it ships platform-specific binaries.

### Initialize project

```bash
npx baml-cli init
```

Creates a `baml_src/` directory with starter BAML files and a generator configuration.

### Code generation

```bash
npx baml-cli generate
```

Generates `baml_client/` directory with auto-generated TypeScript code for calling BAML functions. Must be re-run whenever `.baml` files change. The VS Code BAML extension auto-generates on save.

**Recommended `package.json` setup:**
```json
{
  "scripts": {
    "baml-generate": "baml-cli generate",
    "build": "npm run baml-generate && tsc --build"
  }
}
```

**Source:** https://docs.boundaryml.com/docs/get-started/quickstart/typescript

---

## 2. Generator Configuration (for TypeScript)

Each `generator` block in BAML tells `baml-cli generate` how to generate code for a target language.

```baml
generator target {
  output_type "typescript"
  output_dir "../"       // relative to baml_src/
  version "0.221.0"      // should match installed @boundaryml/baml version
}
```

### ESM Module Compatibility

BAML supports ESM output. Add `module_format` to the generator:

```baml
generator target {
  output_type "typescript"
  output_dir "../"
  module_format "esm"    // default is "cjs" for CommonJS
  version "0.221.0"
}
```

**This is critical for the ai-workflows project** which uses `"type": "module"` in `package.json` and ES module imports (`import.meta.url`, etc.).

**Source:** https://docs.boundaryml.com/docs/get-started/quickstart/typescript (ESM section)

---

## 3. Defining Types in BAML

### Classes

BAML classes map directly to TypeScript interfaces/types. Properties have **no colon** between name and type.

```baml
class Foo {
  property1 string
  property2 int?          // optional
  property3 Bar[]         // array
  property4 MyEnum
}
```

Generated TypeScript equivalent (auto-generated in `baml_client/types`):
```typescript
interface Foo {
  property1: string
  property2: number | null
  property3: Bar[]
  property4: MyEnum
}
```

**Field attributes:**
- `@alias("name")` — renames the field in the LLM prompt (keeps original name in code)
- `@description("...")` — adds context to the field in the prompt

```baml
class MyClass {
  property1 string @alias("name") @description("The name of the object")
  age int? @description("The age of the object")
}
```

**Class attributes:**
- `@@dynamic` — allows adding fields at runtime via TypeBuilder

**Inheritance:** Not supported. BAML uses composition over inheritance (like Rust).

**Source:** https://docs.boundaryml.com/ref/baml/class

### Enums

```baml
enum Decision {
  approved
  rejected
  change_requested
  pending
  completed
}
```

Generates a TypeScript enum or string union type in `baml_client/types`.

**Value attributes:**
- `@alias("complete_summary")` — renames value in prompt
- `@description("Answer in 2 sentences")` — adds context
- `@skip` — excludes value from prompt and parsing
- `@@dynamic` — allows runtime modification via TypeBuilder

**Source:** https://docs.boundaryml.com/ref/baml/enum

### Supported Primitive Types

| BAML Type | TypeScript Equivalent |
|-----------|----------------------|
| `string` | `string` |
| `int` | `number` |
| `float` | `number` |
| `bool` | `boolean` |
| `null` | `null` |

### Composite Types

| BAML Type | TypeScript Equivalent | Notes |
|-----------|-----------------------|-------|
| `Type?` | `Type \| null` | Optional |
| `Type[]` | `Type[]` | Array |
| `Type1 \| Type2` | `Type1 \| Type2` | Union (order matters!) |
| `map<string, Type>` | `Record<string, Type>` | Map |
| `"a" \| "b"` | `"a" \| "b"` | Literal types (v0.61.0+) |

### Type Aliases (v0.71.0+)

```baml
type Graph = map<string, string[]>
type JsonValue = int | string | bool | float | JsonObject | JsonArray
type JsonObject = map<string, JsonValue>
type JsonArray = JsonValue[]
```

### Unsupported Types

- `any/json` — not supported ("defeats the purpose of type system"). Use `string` + manual `JSON.parse`, or dynamic types.
- `datetime` — use `string`
- `duration` — use `string` with ISO8601 format
- `Set`, `Tuple` — not yet supported

**Source:** https://docs.boundaryml.com/docs/snippets/supported-types

---

## 4. BAML Functions

Functions define the contract between application and AI models, with type-safe interfaces.

```baml
function FunctionName(param: Type) -> ReturnType {
  client ModelName
  prompt #"
    Template content
    {{ ctx.output_format }}
  "#
}
```

**Key elements:**
- Function names **must start with a capital letter**
- `client` — specifies which LLM to use
- `prompt` — Jinja-style template with `#"..."#` block strings
- `{{ ctx.output_format }}` — auto-generates format instructions from return type
- `{{ _.role("user") }}` — sets message role

### Complex types example

```baml
class Person {
  name string
  age int
  contacts Contact[]
}

class Contact {
  type "email" | "phone"
  value string
}

function ParsePerson(data: string) -> Person {
  client "openai/gpt-5"
  prompt #"
    {{ ctx.output_format }}

    {{ _.role('user') }}
    {{ data }}
  "#
}
```

### Error Handling (built-in)

BAML automatically handles:
- **JSON parsing errors** — auto-corrected
- **Type mismatches** — detected and reported
- **Network and rate limit errors** — propagated to the caller

This is the **core advantage over manual `extractJson`**: BAML's parser is resilient to malformed LLM output and handles edge cases (trailing commas, missing quotes, special tokens, markdown fences, etc.) that the current `extractJson` function handles manually.

**Source:** https://docs.boundaryml.com/ref/baml/function

---

## 5. Calling BAML Functions from TypeScript

### Basic usage (async)

```typescript
import { b } from "./baml_client"
import type { Resume } from "./baml_client/types"

async function Example(raw_resume: string): Promise<Resume> {
  // BAML's internal parser guarantees ExtractResume
  // to always return a Resume type
  const response = await b.ExtractResume(raw_resume);
  return response;
}
```

### Streaming

```typescript
async function ExampleStream(raw_resume: string): Promise<Resume> {
  const stream = b.stream.ExtractResume(raw_resume);
  for await (const msg of stream) {
    console.log(msg) // This will be a Partial<Resume> type
  }

  // This is guaranteed to be a Resume type.
  return await stream.getFinalResponse();
}
```

**Source:** https://docs.boundaryml.com/docs/get-started/quickstart/typescript

---

## 6. LLM Client Configuration

### Shorthand (inline)

```baml
function MakeHaiku(topic: string) -> string {
  client "openai/gpt-4o"
  prompt #"
    Write a haiku about {{ topic }}.
  "#
}
```

### Named client (with custom options)

```baml
client<llm> MyClient {
  provider "openai"
  options {
    model "gpt-5"
    // api_key defaults to env.OPENAI_API_KEY
  }
}
```

### For LM Studio (openai-generic provider)

LM Studio is explicitly listed as compatible with `openai-generic` provider:

```baml
client<llm> LMStudio {
  provider "openai-generic"
  options {
    model "openai/gpt-oss-20b"
    base_url "http://localhost:1234/v1"
    api_key "lm-studio"
  }
}
```

**Supported providers:** `openai`, `anthropic`, `aws-bedrock`, `google-ai`, `vertex-ai`, `azure-openai`, `openai-generic` (for LM Studio, Ollama, vLLM, etc.), `openai-responses`, plus `fallback` and `round-robin` for composition.

**Source:** https://docs.boundaryml.com/ref/baml/client-llm

### Vision models with image input

```baml
function DescribeImage(myImg: image) -> string {
  client GPT4Turbo
  prompt #"
    {{ _.role("user")}}
    Describe the image in four words:
    {{ myImg }}
  "#
}
```

Calling from TypeScript:
```typescript
import { Image } from "@boundaryml/baml"
import { b } from "./baml_client"

// From base64
const res = await b.DescribeImage(
  Image.from_base64("image/png", imageBase64)
)
```

**Source:** https://docs.boundaryml.com/docs/snippets/supported-types (multimodal section)

---

## 7. Runtime Client Override (ClientRegistry)

### Quick override (per-call)

```typescript
result = await b.ExtractResume("...", { client: "GPT4" })
```

### Full ClientRegistry

```typescript
import { ClientRegistry } from "@boundaryml/baml"

const cr = new ClientRegistry()
cr.addLlmClient("MyClient", "openai-generic", {
  model: "openai/gpt-oss-20b",
  base_url: "http://localhost:1234/v1",
  api_key: "lm-studio",
})
cr.setPrimary("MyClient")

const res = await b.ExtractResume("...", { client_registry: cr })
```

**Note:** `ClientRegistry` is imported from `@boundaryml/baml`, not from `baml_client`.

### with_options (v0.79.0+)

Creates a configured client with default options for all calls:

```typescript
import { b } from "./baml_client"

const my_b = b.with_options({ client: "openai/gpt-5-mini" })
const result = await my_b.ExtractResume("...")

// Or with full options
const cr = new ClientRegistry()
cr.setPrimary("openai/gpt-5-mini")
const my_b2 = b.with_options({ client_registry: cr, env: { BAML_LOG: "DEBUG" } })
```

**with_options parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `client` | `string` | Client name (shorthand for `cr.setPrimary()`) |
| `collector` | `Collector` | For tracking function calls and usage metrics |
| `client_registry` | `ClientRegistry` | Full registry for managing LLM clients |
| `type_builder` | `TypeBuilder` | Custom type builder for runtime types |
| `env` | `Dict/Object` | Environment variables |
| `tags` | `Dict/Object` | Arbitrary metadata per-call |

**Source:** https://docs.boundaryml.com/ref/baml_client/client-registry, https://docs.boundaryml.com/ref/baml_client/with-options

---

## 8. Mapping Project Types to BAML

The current project's `fixtures/types.ts` types can be directly represented in BAML:

### Current TypeScript → BAML mapping

```baml
enum Decision {
  approved @alias("approved")
  rejected @alias("rejected")
  change_requested @alias("change_requested")
  pending @alias("pending")
  completed @alias("completed")
}

class Participant {
  name string
  id string?                        // optional — omitted if no match found
  role "approver" | "reviewer" | "readonly"
  decision Decision?
}

class StageDependency {
  parentStageId string
  condition "decision" | "deadline" | "completion"
  decision Decision?               // required if condition is 'decision'
  // deadline Date not supported — use string?
  deadline string?
}

class Stage {
  name string
  participants Participant[]
  dependsOn StageDependency[]?
  deadline string?                 // Date not supported — use string
  decision Decision?
  metadata map<string, string>?    // map<string, any> not supported
}

class Workflow {
  name string
  stages Stage[]
  metadata map<string, string>?
  decision Decision?               // union Decision | Decision[] needs consideration
}
```

**Key mapping challenges:**
1. **`Date` type** — BAML has no `datetime`. Must use `string` (ISO 8601).
2. **`Record<string, any>`** — BAML has no `any`. Must use `map<string, string>` or a more specific type.
3. **`Decision | Decision[]`** — union of scalar and array. BAML supports `Decision | Decision[]` syntax.
4. **String literal union for `role`** — BAML supports `"approver" | "reviewer" | "readonly"` (literal types, v0.61.0+).

---

## 9. What BAML Replaces in Current Code

### Currently (manual approach in `workflow.ts`)

1. LLM call via OpenAI SDK → raw string response
2. `extractJson()` — manual cleanup:
   - Strip `<|...|>` special tokens
   - Strip markdown fences
   - Find first `{` to last `}`
3. `JSON.parse()` — can throw
4. `isValidWorkflow()` — checks `stages` array exists
5. Fallback: return `{ raw: result }` if parsing fails

### With BAML

1. Define types in `.baml` files
2. Define function with prompt in `.baml`
3. Call `b.AnalyzeWorkflow(...)` — returns typed `Workflow` object directly
4. BAML handles all parsing, validation, and error correction internally
5. No `extractJson`, no `isValidWorkflow`, no try/catch for JSON.parse

**BAML's parser handles automatically:**
- Stripping markdown fences
- Fixing malformed JSON (trailing commas, unquoted keys)
- Type coercion (string "5" → int 5)
- Extraction from mixed text/JSON responses

---

## 10. Project-Specific Architecture Considerations

### Two-step pipeline challenge

The current project has a 2-step pipeline:
1. **Vision model** (`qwen/qwen3-vl-8b`) → unstructured text description
2. **Reasoning model** (`openai/gpt-oss-20b`) → structured Workflow JSON

BAML can handle **both steps** with separate functions:

```baml
// Step 1: Vision interpretation
function InterpretWorkflowDiagram(img: image) -> string {
  client LMStudioVision
  prompt #"
    {{ _.role("system") }}
    [system prompt about reading diagrams]
    {{ _.role("user") }}
    [instructions]
    {{ img }}
  "#
}

// Step 2: Structured extraction
function BuildWorkflow(description: string, contacts: string) -> Workflow {
  client LMStudioReasoning
  prompt #"
    {{ _.role("system") }}
    [system prompt with contacts and rules]
    {{ ctx.output_format }}
    {{ _.role("user") }}
    {{ description }}
  "#
}
```

### LM Studio configuration

Both models use LM Studio served at `http://localhost:1234/v1`. Configure as:

```baml
client<llm> LMStudioVision {
  provider "openai-generic"
  options {
    model "qwen/qwen3-vl-8b"
    base_url "http://localhost:1234/v1"
    api_key "lm-studio"
    temperature 0.1
  }
}

client<llm> LMStudioReasoning {
  provider "openai-generic"
  options {
    model "openai/gpt-oss-20b"
    base_url "http://localhost:1234/v1"
    api_key "lm-studio"
    temperature 0.5
  }
}
```

### Token usage tracking

BAML's `Collector` can track usage:
```typescript
import { Collector } from "@boundaryml/baml"
const collector = new Collector("workflow-analysis")
const my_b = b.with_options({ collector })
const result = await my_b.BuildWorkflow(description, contactsJson)
console.log(collector.last.usage) // { prompt_tokens, completion_tokens, total_tokens }
```

---

## 11. Open Questions / Gaps

1. **`maxRetries: 0` equivalent** — The current project sets `maxRetries: 0` on the OpenAI client. BAML has `retry_policy` on clients but unclear if zero retries is default.
2. **Tool calling** — The original project used LangChain tool calling (get_contacts, find_contact_by_name, etc.). BAML functions don't support tool calling natively — tools must be handled separately or contacts passed inline.
3. **Dynamic contacts injection** — Contacts list changes per-call. BAML supports passing data as function parameters (e.g., `contacts: string` with JSON), but not as dynamic system prompt parts without being in the function signature.
4. **`any` type** — `metadata: Record<string, any>` cannot be directly represented. Closest is `map<string, string>` or using dynamic types.
5. **Bundle size** — The `@boundaryml/baml` package is a native addon (napi-rs/Rust). This is fine for a backend but won't work in browser environments.
6. **Error propagation** — BAML auto-corrects JSON parsing errors. Need to verify behavior when the LLM produces fundamentally wrong structure (e.g., no `stages` field at all) — does BAML throw or return partial?

---

## Summary

BAML is a strong fit for replacing the manual `extractJson` + `isValidWorkflow` pattern. Key benefits:
- **Type-safe output** guaranteed by BAML's parser (handles malformed JSON, special tokens, markdown fences)
- **Code generation** produces TypeScript types matching BAML schemas
- **ESM support** available via `module_format "esm"` in generator config
- **LM Studio support** via `openai-generic` provider
- **Vision support** via `image` type for the vision model step

Main integration points:
1. Create `baml_src/` directory with type definitions and functions
2. Generate `baml_client/` with `npx baml-cli generate`
3. Replace `buildWorkflow()` + `extractJson()` + `isValidWorkflow()` with a single `b.BuildWorkflow()` call
4. Use `ClientRegistry` or `with_options` for runtime client configuration
5. Use `Collector` for token usage tracking
