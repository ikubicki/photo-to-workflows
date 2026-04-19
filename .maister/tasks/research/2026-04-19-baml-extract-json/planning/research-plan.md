# Research Plan: Replace extractJson with BAML

## Research Overview

**Research Question**: How to replace `extractJson()` with BAML for structured LLM output handling in the workflow visual analyzer?

**Research Type**: Technical — external library investigation + codebase integration analysis

**Scope**:
- BAML library capabilities and TypeScript/Node.js API
- Structured output extraction from LLMs via BAML
- Compatibility with OpenAI-compatible endpoints (LM Studio at localhost:1234)
- Integration path for replacing `extractJson()` + `isValidWorkflow()` + prompt engineering
- Mapping BAML schemas to existing `Workflow` types from `fixtures/types.ts`

**Boundaries**:
- Exclude other structured output libraries (Instructor, Outlines, Zod-to-JSON-schema)
- Exclude Python BAML usage — TypeScript only
- Do NOT change the vision model step (`interpretImage`)
- Focus on the reasoning model step (`buildWorkflow`) and its post-processing

---

## Methodology

**Primary Approach**: External library documentation analysis + codebase mapping

1. Study BAML's official docs to understand its DSL, TypeScript codegen, and runtime behavior
2. Investigate BAML's TypeScript API — how to define types, call LLMs, and retrieve structured output
3. Analyze the current `extractJson` + `buildWorkflow` implementation to identify exact replacement points
4. Assess BAML's compatibility with OpenAI-compatible APIs (custom base URLs, local models)

**Fallback Strategies**:
- If BAML docs are insufficient → examine BAML GitHub repo source code and examples
- If OpenAI-compatible support is unclear → check BAML provider/client configuration options
- If TypeScript API is underdocumented → look at BAML's generated client code and test files

**Analysis Framework**:
- **Capability mapping**: What BAML provides vs what the current code does manually
- **Integration surface**: Which functions/files need to change
- **Compatibility check**: Does BAML work with LM Studio's OpenAI-compatible API?
- **Type alignment**: Can BAML schemas express the existing `Workflow`/`Stage`/`Participant` types?
- **Trade-off analysis**: BAML approach vs current string manipulation approach

---

## Research Phases

### Phase 1: Broad Discovery
- Read BAML official documentation (getting started, core concepts)
- Understand BAML's DSL for defining structured output types
- Identify BAML's TypeScript/Node.js package and installation
- Check BAML's supported LLM providers and custom endpoint configuration

### Phase 2: Targeted Reading
- Deep-read BAML TypeScript API: type definitions, client generation, function calls
- Study how BAML handles JSON extraction, validation, and error recovery
- Read BAML examples for complex nested types (enums, optional fields, arrays)
- Examine how BAML configures custom OpenAI-compatible base URLs

### Phase 3: Deep Dive — Codebase Integration
- Map current `extractJson()` + `isValidWorkflow()` to BAML equivalents
- Map `Workflow`, `Stage`, `Participant`, `Decision` types to BAML schema language
- Identify changes needed in `buildWorkflow()` — prompt, model call, response handling
- Assess impact on `analyzeWorkflow()` pipeline flow
- Check ESM module compatibility and build tooling (tsx, TypeScript bundler resolution)

### Phase 4: Verification
- Verify BAML works with custom `baseURL` (not just official OpenAI/Anthropic endpoints)
- Verify BAML handles the specific models used (openai/gpt-oss-20b via LM Studio)
- Identify potential blockers: model compatibility, token format, streaming, retries
- Assess risk of BAML adding complexity vs removing it

---

## Gathering Strategy

### Instances: 4

| # | Category ID | Focus Area | Tools | Output Prefix |
|---|------------|------------|-------|---------------|
| 1 | baml-docs | Official BAML documentation — core concepts, DSL syntax, getting started guides, architecture overview | WebFetch, WebSearch | baml-docs |
| 2 | baml-typescript | BAML TypeScript/Node.js API — package installation, client generation, type definitions, function calling, runtime behavior | WebFetch, WebSearch, GitHub | baml-typescript |
| 3 | codebase-current | Current extractJson implementation — workflow.ts analysis, types.ts mapping, buildWorkflow prompt, pipeline flow, dependencies | Read, Grep, Glob | codebase-current |
| 4 | baml-compatibility | BAML compatibility with OpenAI-compatible APIs — custom base URLs, LM Studio support, local model support, provider configuration | WebFetch, WebSearch, GitHub | baml-compatibility |

### Rationale

This research is primarily about an external library (BAML), so 3 of 4 gatherers focus on external documentation. The split is:
- **baml-docs** covers the foundational understanding of what BAML is and how it works
- **baml-typescript** focuses specifically on the TypeScript API since the project is TypeScript-only
- **codebase-current** analyzes what exactly needs to be replaced and the constraints of the existing code
- **baml-compatibility** addresses the critical risk factor — whether BAML works with LM Studio's OpenAI-compatible endpoint, which is a potential blocker

---

## Success Criteria

1. **BAML capabilities understood**: Clear picture of BAML's DSL, TypeScript codegen, and runtime structured output extraction
2. **OpenAI-compatible endpoint support assessed**: Definitive answer on whether BAML works with `http://localhost:1234/v1` (LM Studio)
3. **Integration approach defined**: Concrete steps for replacing `extractJson()` + `isValidWorkflow()` + `buildWorkflow()` prompt with BAML
4. **Type mapping validated**: Confirmation that BAML can express `Workflow`, `Stage`, `Participant`, `StageDependency`, and `Decision` types
5. **Risk assessment complete**: Known trade-offs, blockers, and migration effort estimated
6. **Sub-questions answered**:
   - Does BAML require a compilation/codegen step? How does that fit with `tsx watch`?
   - Does BAML handle retries/fallback when JSON extraction fails?
   - Can BAML schemas import or reference existing TypeScript types, or must types be duplicated?
   - What is BAML's approach to optional fields and union types?

---

## Expected Outputs

1. **Research report** (`outputs/research-report.md`): Comprehensive findings with evidence
2. **Integration approach** (`outputs/integration-approach.md`): Step-by-step migration plan from extractJson to BAML
3. **Risk assessment**: Blockers, trade-offs, and recommendation (go/no-go) included in report
4. **BAML schema draft** (if feasible): Example `.baml` file mapping the Workflow types
