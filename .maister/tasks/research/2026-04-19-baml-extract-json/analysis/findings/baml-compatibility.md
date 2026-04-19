# BAML Compatibility with OpenAI-Compatible APIs & Local Models

## Research Question
Does BAML work with OpenAI-compatible endpoints like LM Studio?

**Answer: Yes.** BAML has explicit, documented support for LM Studio and other OpenAI-compatible APIs via the `openai-generic` provider.

---

## 1. How BAML Configures LLM Providers/Clients

BAML uses a DSL to declare LLM clients. Each client has a `provider`, `options`, and optional `retry_policy`.

**Source**: https://docs.boundaryml.com/docs/snippets/clients/overview

### Provider types

| Provider | Description |
|---|---|
| `openai` | Official OpenAI `/chat/completions` endpoint |
| `openai-generic` | **Any API using OpenAI's request/response format** (Groq, Ollama, LM Studio, vLLM, etc.) |
| `anthropic` | Anthropic `/v1/messages` |
| `google-ai` | Google AI `generateContent` |
| `vertex-ai` | Vertex AI |
| `azure-openai` | Azure OpenAI |
| `openai-responses` | OpenAI Responses API |
| `fallback` | Chain clients on failure |
| `round-robin` | Load balance across clients |

### Basic client definition syntax

```baml
client<llm> MyClient {
  provider "openai-generic"
  options {
    base_url "http://localhost:1234/v1"
    model "my-model-name"
    api_key env.MY_API_KEY   // optional for local models
    temperature 0.1
  }
}
```

### Shorthand syntax

For standard providers, BAML supports a shorthand:
```baml
function MakeHaiku(topic: string) -> string {
  client "openai/gpt-4o"
  prompt #"Write a haiku about {{ topic }}."#
}
```

For custom endpoints, you must use the full `client<llm>` block with `openai-generic`.

---

## 2. Custom Base URLs (localhost:1234/v1)

**Fully supported.** The `base_url` option is a first-class configuration option.

**Source**: https://docs.boundaryml.com/ref/llm-client-providers/lmstudio

### LM Studio specific configuration

BAML has a **dedicated documentation page for LM Studio**. The recommended configuration:

```baml
client<llm> MyClient {
  provider "openai-generic"
  options {
    base_url "http://localhost:1234/v1"
    model "TheBloke/phi-2-GGUF"
  }
}
```

Key points:
- Uses `openai-generic` provider (not `openai`)
- `base_url` points to LM Studio's OpenAI-compatible endpoint
- `api_key` is **optional** — if not set or empty, the `Authorization` header is not sent (perfect for local models that don't require auth)
- Model name is passed as-is to the provider — BAML does not validate if it exists

**Source**: https://docs.boundaryml.com/ref/llm-client-providers/lmstudio

### openai-generic provider defaults

| Option | Default |
|---|---|
| `base_url` | `https://api.openai.com/v1` |
| `api_key` | `<none>` (no Authorization header sent if empty) |
| `supports_streaming` | `true` |

**Source**: https://docs.boundaryml.com/docs/snippets/clients/providers/openai-generic

---

## 3. OpenAI-Compatible API Support

**Fully supported.** The `openai-generic` provider is explicitly designed for this purpose.

**Source**: https://docs.boundaryml.com/docs/snippets/clients/providers/openai-generic

> "The `openai-generic` provider supports all APIs that use OpenAI's request and response formats, such as Groq, HuggingFace, Ollama, OpenRouter, and Together AI."

### Officially listed compatible providers

| Provider | Status |
|---|---|
| LM Studio | ✅ Listed in docs |
| Ollama | ✅ Listed + dedicated page |
| Groq | ✅ Listed |
| vLLM | ✅ Listed |
| OpenRouter | ✅ Listed |
| Together AI | ✅ Listed |
| HuggingFace | ✅ Listed |
| LiteLLM | ✅ Listed |
| Cerebras | ✅ Listed |

### Ollama example (similar pattern to LM Studio)

```baml
client<llm> MyClient {
  provider "openai-generic"
  options {
    base_url "http://localhost:11434/v1"
    model llama3
  }
}
```

**Source**: https://docs.boundaryml.com/ref/llm-client-providers/ollama

---

## 4. Handling Models Without Native JSON Mode / Structured Outputs

This is a **core strength** of BAML. BAML does NOT rely on OpenAI's JSON mode or structured outputs API features.

### How BAML works

1. **Prompt injection**: BAML injects output format instructions into the prompt via `{{ ctx.output_format }}`. This generates human-readable schema instructions telling the LLM what format to output.

2. **Flexible parsing**: BAML has its own parser that extracts structured data from LLM responses. The parser is described as "very forgiving, allowing for structured data parsing even in the presence of minor errors and thought tokens in the LLM response."

3. **No `response_format` dependency**: BAML constructs a standard `/chat/completions` request — it does NOT set `response_format: { type: "json_object" }`. This means it works with models that don't support JSON mode at all.

**Source**: https://docs.boundaryml.com/guide/baml-basics/prompting-with-baml

### ctx.output_format

When you include `{{ ctx.output_format }}` in your prompt, BAML injects the output schema as human-readable instructions. The LLM sees something like:

```
Answer in JSON using this schema:
{
  name: string,
  skills: string[],
  education: { school: string, degree: string }
}
```

This approach works with **any model** that can follow instructions — no special API features required.

**Confidence**: High (100%) — This is BAML's core design philosophy, documented extensively.

---

## 5. Fallback Parsing When Models Output Free Text

### BAML's forgiving parser

BAML's parser handles:
- LLM responses with markdown fences around JSON
- Thought tokens or preamble text before the JSON
- Minor structural errors in JSON
- Special tokens (`<|...|>`)

**Source**: https://docs.boundaryml.com/guide/baml-basics/error-handling

> "Our parser is very forgiving, allowing for structured data parsing even in the presence of minor errors and thought tokens in the LLM response."

### BamlValidationError

When parsing fails completely, BAML raises `BamlValidationError` with:
- `raw_output` — the raw LLM response text
- `prompt` — the original prompt sent
- `message` — parsing error message
- `detailed_message` — full error history (includes fallback attempts)

**Source**: https://docs.boundaryml.com/guide/baml-basics/error-handling

### LLM Fixup pattern

BAML documents a "fixup" pattern for when parsing fails:

```baml
function FixupFoo(errorMessage: string) -> MyClass {
  client GPT4o
  prompt #"
    Fix this malformed JSON. Preserve the same information.
    {{ ctx.output_format }}
    Original data and parse error:
    {{ errorMessage }}
  "#
}
```

```typescript
try {
  result = b.Foo(myData);
} catch (e: BamlValidationError) {
  result = b.FixupFoo(e.toString());
}
```

> "LLMs are good at reconstituting data, so it is often possible to use a less powerful model for your fixup function."

**Source**: https://docs.boundaryml.com/guide/baml-basics/error-handling

---

## 6. Vision / Multimodal Model Support

**BAML has built-in multimodal support** with `image`, `audio`, `pdf`, and `video` types.

**Source**: https://docs.boundaryml.com/docs/snippets/supported-types

### Image input in BAML

```baml
function DescribeImage(myImg: image) -> string {
  client GPT4Turbo
  prompt #"
    {{ _.role("user") }}
    Describe the image in four words:
    {{ myImg }}
  "#
}
```

### Calling with image from TypeScript

```typescript
import { Image } from '@boundaryml/baml';

// From URL
const res = await b.DescribeImage(
  Image.from_url("https://example.com/image.png")
);

// From base64
const res = await b.DescribeImage(
  Image.from_base64("image/png", base64String)
);
```

### media_url_handler configuration

BAML provides fine-grained control over how media is sent to providers:

```baml
client<llm> MyClient {
  provider openai
  options {
    media_url_handler {
      image "send_base64"   // send_base64 | send_url | send_url_add_mime_type
      audio "send_url"
      pdf "send_url_add_mime_type"
      video "send_url"
    }
  }
}
```

For local models (LM Studio), `send_base64` is likely the best option since local models can't fetch external URLs.

**Source**: https://docs.boundaryml.com/docs/snippets/clients/providers/openai (media_url_handler section)

### Relevance to our project

Our project uses a vision model (`qwen/qwen3-vl-8b`) for image interpretation. BAML can handle this:
- Define a function with `image` input type
- BAML sends the image as base64 to the model
- The vision model's text output is parsed by BAML's parser

---

## 7. Client Configuration Options (Retries, Timeouts, API Keys)

### Retry policies

```baml
retry_policy MyRetryPolicy {
  max_retries 3
  strategy {
    type exponential_backoff
    delay_ms 200
    multiplier 1.5
    max_delay_ms 10000
  }
}

client<llm> MyClient {
  provider "openai-generic"
  retry_policy MyRetryPolicy
  options {
    base_url "http://localhost:1234/v1"
    model "my-model"
  }
}
```

Strategies:
- `constant_delay` — fixed delay between retries (default 200ms)
- `exponential_backoff` — increasing delay with multiplier

**Source**: https://docs.boundaryml.com/ref/llm-client-strategies/retry-policy

### Fallback clients

```baml
client<llm> ResilientClient {
  provider fallback
  options {
    strategy [
      PrimaryClient
      BackupClient
      LastResortClient
    ]
  }
}
```

Supports nested fallbacks and per-fallback retry policies.

**Source**: https://docs.boundaryml.com/ref/llm-client-strategies/fallback

### API key handling

- `openai` provider: defaults to `env.OPENAI_API_KEY`
- `openai-generic` provider: defaults to `<none>` (no auth header)
- Can use any env variable: `api_key env.MY_CUSTOM_KEY`
- Empty/missing api_key → no `Authorization` header sent

### Custom headers

```baml
client<llm> MyClient {
  provider "openai-generic"
  options {
    base_url "http://localhost:1234/v1"
    model "my-model"
    headers {
      "X-Custom-Header" "value"
    }
  }
}
```

### Streaming control

```baml
client<llm> MyClient {
  provider "openai-generic"
  options {
    base_url "http://localhost:1234/v1"
    model "my-model"
    supports_streaming false  // disable if model doesn't support SSE
  }
}
```

### Abort / cancellation

BAML supports abort controllers for timeout/cancellation handling, raising `BamlAbortError`.

### Role configuration

```baml
options {
  allowed_roles ["system", "user", "assistant"]
  default_role "user"
}
```

### Finish reason handling

```baml
options {
  finish_reason_allow_list ["stop"]       // only accept "stop"
  // OR
  finish_reason_deny_list ["length"]      // reject truncated outputs
}
```

---

## 8. Known Issues with Local Models / Non-OpenAI Providers

### GitHub Issues

Searched GitHub issues for "LM Studio" — only **1 result** found:
- [#3073 "Lm studio documentation link"](https://github.com/BoundaryML/baml/pull/3073) — a merged PR fixing LM Studio docs link (Feb 2025). **No open issues.**

**Source**: https://github.com/BoundaryML/baml/issues?q=LM+Studio

### Potential concerns for local models

1. **Model quality**: Local models may produce less reliable JSON output than GPT-4. BAML's forgiving parser helps, but the fixup pattern may be needed more often.

2. **Streaming compatibility**: Some local model servers may not fully implement SSE streaming. Can be disabled with `supports_streaming false`.

3. **Vision model compatibility**: LM Studio's OpenAI-compatible endpoint must support the multimodal message format (image_url content type). LM Studio does support this for vision models.

4. **No JSON mode dependency**: This is actually a **benefit** — BAML doesn't need the model's `/chat/completions` endpoint to support `response_format`, which many local models don't.

5. **Finish reasons**: Local models may return non-standard finish reasons. Configure `finish_reason_allow_list` or `finish_reason_deny_list` if needed.

---

## Summary: Configuration for Our Project

Based on the findings, here's what the BAML client configuration would look like for our LM Studio setup:

```baml
// Vision model for image interpretation
client<llm> VisionModel {
  provider "openai-generic"
  options {
    base_url "http://localhost:1234/v1"
    model "qwen/qwen3-vl-8b"
    temperature 0.1
    media_url_handler {
      image "send_base64"
    }
  }
}

// Reasoning model for workflow building
client<llm> ReasoningModel {
  provider "openai-generic"
  options {
    base_url "http://localhost:1234/v1"
    model "openai/gpt-oss-20b"
    temperature 0.5
  }
}

// With retry support
retry_policy LocalRetry {
  max_retries 2
  strategy {
    type constant_delay
    delay_ms 1000
  }
}
```

**Confidence**: High (95%) — BAML explicitly lists LM Studio as a supported provider with dedicated documentation and a working configuration example. The `openai-generic` provider is specifically designed for this use case.

---

## Sources

| Source | URL | Key Finding |
|---|---|---|
| LM Studio provider docs | https://docs.boundaryml.com/ref/llm-client-providers/lmstudio | Explicit LM Studio support with `openai-generic` + `base_url` |
| openai-generic provider docs | https://docs.boundaryml.com/docs/snippets/clients/providers/openai-generic | Full OpenAI-compatible API support, no auth required |
| OpenAI provider docs | https://docs.boundaryml.com/docs/snippets/clients/providers/openai | `base_url`, `api_key`, `media_url_handler` options |
| Ollama provider docs | https://docs.boundaryml.com/ref/llm-client-providers/ollama | Local model pattern with `/v1` endpoint |
| Client overview | https://docs.boundaryml.com/docs/snippets/clients/overview | Provider list, client syntax |
| Error handling | https://docs.boundaryml.com/guide/baml-basics/error-handling | Forgiving parser, BamlValidationError, LLM fixup pattern |
| Retry policy | https://docs.boundaryml.com/ref/llm-client-strategies/retry-policy | constant_delay, exponential_backoff |
| Fallback strategy | https://docs.boundaryml.com/ref/llm-client-strategies/fallback | Client chaining on failure |
| Types reference | https://docs.boundaryml.com/docs/snippets/supported-types | image, audio, pdf multimodal types |
| Prompting guide | https://docs.boundaryml.com/guide/baml-basics/prompting-with-baml | `ctx.output_format` macro, parser behavior |
| GitHub issues | https://github.com/BoundaryML/baml/issues?q=LM+Studio | Only 1 closed PR (docs link fix), no open issues |
