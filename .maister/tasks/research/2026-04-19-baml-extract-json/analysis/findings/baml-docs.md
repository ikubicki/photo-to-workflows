# BAML Documentation Research Findings

**Research question**: How to replace extractJson with BAML for structured LLM output handling?  
**Sources**: Official docs (docs.boundaryml.com), GitHub README, SAP blog post  
**Date**: 2026-04-19

---

## 1. What is BAML?

BAML (Basically a Made-up Language) is a domain-specific language for generating **structured outputs from LLMs**. It turns prompt engineering into "schema engineering" — you define types and schemas, and BAML handles prompt rendering, LLM calling, output parsing, JSON fixing, and type validation.

- **100% open-source** (Apache 2.0), written in Rust
- **Works with any LLM** — OpenAI, Anthropic, Gemini, Ollama, LM Studio, OpenRouter, vLLM, etc.
- **Language-agnostic** — generates native client code for Python, TypeScript, Ruby, Go, and more
- **Offline** — no network requests beyond the model calls you configure
- **8k+ GitHub stars**, active development (v0.221.0 as of April 2026)

> "BAML allows you to view and run prompts directly within your editor, similar to how Markdown Preview functions."  
> — Source: https://docs.boundaryml.com/

**Key insight**: You don't write your whole app in BAML — only the prompts. BAML compiles to native code you import and call.

---

## 2. How BAML Defines Structured Output Schemas

Schemas are defined using `class` and `enum` declarations in `.baml` files:

### Classes (structured objects)

```baml
class Person {
  name string
  age int
  contacts Contact[]
}

class Contact {
  type "email" | "phone"    // literal union type
  value string
}
```

**Note**: Properties have NO colon (`:`) — it's `name string`, not `name: string`.

### Enums

```baml
enum Decision {
  approved
  rejected
  change_requested @description("When changes are needed")
  pending
  completed
}
```

### Field Attributes

- `@alias("alternative_name")` — renames the field for the LLM while keeping original name in code
- `@description("context")` — adds context for the LLM about this field
- `?` suffix — makes field optional: `email string?`

### Supported Types

| Type | Syntax | Examples |
|------|--------|---------|
| Primitives | `string`, `int`, `float`, `bool`, `null` | |
| Literals | `"value"` | `"approved" \| "rejected"` |
| Optional | `Type?` | `int?`, `string?` |
| Array | `Type[]` | `string[]`, `Contact[]` |
| Map | `map<K, V>` | `map<string, int>` |
| Union | `Type1 \| Type2` | `string \| MyClass` |
| Type alias | `type X = ...` | `type Graph = map<string, string[]>` |
| Multimodal | `image`, `audio`, `pdf`, `video` | For vision models |

**Source**: https://docs.boundaryml.com/ref/baml/types, https://docs.boundaryml.com/ref/baml/class

---

## 3. How BAML Extracts/Parses Structured Data (SAP)

BAML uses **SAP (Schema-Aligned Parsing)** — a custom parsing algorithm that is schema-aware and error-correcting. Unlike `JSON.parse()`, SAP can recover from common LLM mistakes.

### What SAP fixes automatically:

- Unquoted strings
- Unescaped quotes and newlines in strings
- Missing commas, colons, brackets
- Trailing commas
- Comments in JSON
- Fractions instead of floats (e.g., `1/2` → `0.5`)
- Misnamed keys (fuzzy matching against schema)
- Superfluous keys in objects
- **"Yapping"** — strips preamble/postamble text around JSON
- Markdown code fences around JSON
- Partial objects (during streaming)
- LLM chain-of-thought before the actual answer
- Type coercions (e.g., `"Amazon"` string → `["Amazon"]` array when schema expects `string[]`)
- Picks best candidate when LLM produces multiple outputs

### SAP Performance (Berkeley Function Calling Leaderboard, n=1000):

| Model | Function Calling | SAP |
|-------|-----------------|-----|
| gpt-4o | 82.1% | **93%** |
| gpt-4o-mini | 51.8% | **92.4%** |
| claude-3-5-sonnet | 93.8% | **94.4%** |
| claude-3-haiku | 82.6% | **91.7%** |
| llama-3.1-7b | 60.9% | **76.8%** |

> "The key idea behind SAP is to assume that the model will make mistakes, and to build a parser that is robust enough to handle them."  
> — Source: https://www.boundaryml.com/blog/schema-aligned-parsing

**Key insight for our project**: SAP replaces the need for manual `extractJson()`, `looksLikeWorkflowJson()`, markdown fence stripping, and special token cleaning. BAML handles all of this automatically.

---

## 4. Installation & Setup (TypeScript)

### Step 1: Install VS Code Extension
```
boundary.baml-extension
```
Provides syntax highlighting, testing playground, and prompt previews.

### Step 2: Install npm package
```bash
npm install @boundaryml/baml
```

### Step 3: Initialize BAML in project
```bash
npx baml-cli init
```
Creates a `baml_src/` directory with starter BAML code including a `generator` block.

### Step 4: Generate client code
```bash
npx baml-cli generate
```
Generates `baml_client/` directory with TypeScript types and function stubs.

### Recommended package.json setup:
```json
{
  "scripts": {
    "baml-generate": "baml-cli generate",
    "build": "npm run baml-generate && tsc --build"
  }
}
```

The VS Code extension auto-runs `baml-cli generate` on save.

**Source**: https://docs.boundaryml.com/docs/get-started/quickstart/typescript

---

## 5. BAML File Syntax (.baml files)

### Function Definition

```baml
function ExtractWorkflow(description: string) -> Workflow {
  client "openai/gpt-4o"
  prompt #"
    Extract the approval workflow from this description.
    
    {{ ctx.output_format }}     // Auto-generates format instructions from return type

    {{ _.role('user') }}        // Sets message role
    {{ description }}
  "#
}
```

### Function anatomy:
1. **Name** — must start with capital letter: `ExtractWorkflow`
2. **Parameters** — typed: `(description: string)`
3. **Return type** — any BAML type: `-> Workflow`
4. **Client** — LLM to use: `client "openai/gpt-4o"` or a named client
5. **Prompt** — Jinja template in block string `#"..."#`

### Special prompt variables:
- `{{ ctx.output_format }}` — auto-generates schema instructions for the LLM based on return type
- `{{ ctx.client }}` — current client/model name
- `{{ _.role('user') }}` / `{{ _.role('system') }}` — set message roles

### LLM Client Definition

```baml
client<llm> LMStudio {
  provider "openai-generic"
  options {
    model "qwen/qwen3-vl-8b"
    base_url "http://localhost:1234/v1"
    api_key ""
  }
}
```

Supported providers include: `openai`, `anthropic`, `google-ai`, `vertex-ai`, `aws-bedrock`, `azure-openai`, `openai-generic` (for LM Studio, Ollama, vLLM, etc.)

**Shorthand syntax** (no named client needed):
```baml
client "openai/gpt-4o"
```

### Generator Block

```baml
generator target {
  output_type "typescript"
  output_dir "../"
  default_client_mode "sync"  // or "async"
  version "0.221.0"
}
```

For ESM compatibility:
```baml
generator typescript {
  module_format "esm"   // default is "cjs"
}
```

**Source**: https://docs.boundaryml.com/ref/baml/function, https://docs.boundaryml.com/ref/baml/generator

---

## 6. Code Generation Workflow (baml_client)

### Flow:
```
baml_src/*.baml  →  baml-cli generate  →  baml_client/  →  import in your app
```

The `baml_client` directory contains:
- **Type definitions** — TypeScript interfaces/types matching your BAML classes
- **Function stubs** — `b.FunctionName()` for each BAML function
- **Streaming stubs** — `b.stream.FunctionName()` for streaming
- **Partial types** — `partial_types` module with nullable fields for streaming

### Usage in TypeScript:

```typescript
import { b } from "./baml_client"
import type { Workflow } from "./baml_client/types"

// Sync call — guaranteed to return Workflow type
const workflow = await b.ExtractWorkflow(description);

// Streaming call
const stream = b.stream.ExtractWorkflow(description);
for await (const partial of stream) {
  console.log(partial); // Partial<Workflow> with nullable fields
}
const final = await stream.getFinalResponse(); // Full Workflow type
```

### Key properties:
- **Type-safe** — return types are guaranteed, autocomplete works
- `baml_client` is auto-generated, should be gitignored (or committed with merge driver)
- All declarations in `baml_src/` are globally accessible across files
- `baml_src/` can contain subdirectories

**Source**: https://docs.boundaryml.com/guide/introduction/baml_src, https://docs.boundaryml.com/guide/introduction/baml_client

---

## 7. Validation and Error Recovery

### Automatic error handling:
- **JSON parsing errors** — automatically corrected by SAP
- **Type mismatches** — detected and coerced when possible
- **Network/rate limit errors** — propagated to caller
- **Malformed output** — SAP finds the "least cost edit" to make output match schema

### No manual JSON extraction needed:
BAML replaces all of these manual steps from the current codebase:
1. `extractJson()` — stripping markdown fences, special tokens → **SAP does this automatically**
2. `looksLikeWorkflowJson()` — validation → **BAML guarantees return type**
3. Manual JSON.parse + error nudging → **SAP parser handles it**
4. `isValidWorkflow()` — post-parse validation → **type-safe return value**

### Error propagation:
If SAP cannot parse the output into the expected type, a runtime error is thrown that can be caught:

```typescript
try {
  const result = await b.ExtractWorkflow(description);
} catch (error) {
  // Handle parse failure
}
```

**Source**: https://docs.boundaryml.com/ref/baml/function (Error Handling section)

---

## 8. Key Features

### Retry Logic

```baml
retry_policy RetryTwice {
  max_retries 3
  strategy {
    type constant_delay
    delay_ms 200
  }
}

// Or exponential backoff:
retry_policy ExponentialRetry {
  max_retries 5
  strategy {
    type exponential_backoff
    delay_ms 200
    multiplier 1.5
    max_delay_ms 10000
  }
}

// Attach to client:
client<llm> MyClient {
  provider openai
  retry_policy RetryTwice
  options {
    model "gpt-4o"
  }
}
```

Retries are for **network errors**, not for parse failures (SAP handles those without retries).

**Source**: https://docs.boundaryml.com/ref/llm-client-strategies/retry-policy

### Fallback & Round-Robin

```baml
client<llm> MyFallback {
  provider fallback
  options {
    strategy [GPT4, Claude3, Llama]
  }
}

client<llm> MyLoadBalancer {
  provider round-robin
  options {
    strategy [GPT4Instance1, GPT4Instance2]
  }
}
```

### Streaming Support

- **Fully type-safe streaming** with `Partial<T>` types
- Numbers only stream when complete (no partial `12` → `129.95`)
- Semantic streaming attributes:
  - `@stream.done` — field/class only appears when fully complete
  - `@stream.not_null` — object only streams when this field has a value
  - `@stream.with_state` — adds `{ value: T, state: "incomplete" | "complete" }` wrapper
- AbortController support for cancellation

### Multimodal Support (relevant for our vision model)

```baml
function InterpretDiagram(img: image) -> WorkflowDescription {
  client LMStudioVision
  prompt #"
    {{ _.role('user') }}
    Analyze this approval workflow diagram:
    {{ img }}
    {{ ctx.output_format }}
  "#
}
```

Called from TypeScript:
```typescript
import { Image } from "@boundaryml/baml"

const result = await b.InterpretDiagram(
  Image.from_base64("image/png", base64Data)
)
```

### IDE Integration
- **VS Code extension** with syntax highlighting, prompt preview, and testing playground
- **JetBrains** support
- Run tests directly in IDE — no need to set up full environment
- See the complete rendered prompt before sending

### Dynamic Types
Classes can be marked `@@dynamic` to add fields at runtime — useful when schema depends on runtime data.

**Source**: https://docs.boundaryml.com/guide/baml-basics/streaming, https://docs.boundaryml.com/guide/baml-basics/multi-modal

---

## 9. Relevance to Our Project (ai-workflows)

### Current approach (LangChain + manual parsing):
1. Vision model interprets image → text description
2. Agent loop with tools calls reasoning model
3. Model outputs JSON string
4. Manual `extractJson()` strips markdown fences, special tokens (`<|...|>`)
5. `JSON.parse()` + `isValidWorkflow()` validation
6. Retry nudging if output isn't valid JSON

### BAML replacement approach:
1. **Define Workflow schema in `.baml`** — classes for Stage, Participant, StageDependency, etc.
2. **Define BAML functions** — `InterpretDiagram(img: image) -> WorkflowDescription` and `BuildWorkflow(description: string, contacts: Contact[]) -> Workflow`
3. **SAP handles all parsing** — no extractJson, no markdown stripping, no validation code
4. **Type-safe results** — `b.BuildWorkflow()` returns guaranteed `Workflow` type
5. **Built-in retry** — retry_policy replaces manual retry logic

### LM Studio Compatibility

BAML supports LM Studio via `openai-generic` provider:

```baml
client<llm> LMStudioVision {
  provider "openai-generic"
  options {
    model "qwen/qwen3-vl-8b"
    base_url env.LM_STUDIO_URL  // or "http://localhost:1234/v1"
    api_key ""
  }
}

client<llm> LMStudioReasoning {
  provider "openai-generic"
  options {
    model "openai/gpt-oss-20b"
    base_url env.LM_STUDIO_URL
    api_key ""
  }
}
```

### What BAML eliminates from current codebase:
- `extractJson()` function in workflow.ts
- `looksLikeWorkflowJson()` validation
- `isValidWorkflow()` validation
- Manual markdown fence stripping
- Special token cleaning (`<|...|>`)
- JSON.parse error handling
- "Nudge" messages to the model for proper JSON
- Manual Workflow type inline in system prompt → `{{ ctx.output_format }}` auto-generates it

### What BAML does NOT replace:
- **LangChain tools** — BAML functions are for structured LLM output, not tool-calling agent loops. The agent loop with `find_contact_by_name`, `get_contacts` etc. would need a different approach (either keep LangChain for the agent part, or restructure as chained BAML functions)
- **Custom logging** — would need separate implementation

---

## 10. Quick Reference: Project Setup Steps

```bash
# 1. Install
cd backend
npm install @boundaryml/baml

# 2. Initialize
npx baml-cli init
# Creates baml_src/ with generator block

# 3. Write .baml files in baml_src/
# (define classes, functions, clients)

# 4. Generate client
npx baml-cli generate
# Creates baml_client/ with TypeScript types

# 5. Import and use
# import { b } from "./baml_client"
```

**Source**: https://docs.boundaryml.com/docs/get-started/quickstart/typescript
