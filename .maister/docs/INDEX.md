# Documentation Index

**IMPORTANT**: Read this file at the beginning of any development task to understand available documentation and standards.

## Quick Reference

### Project Documentation
Project-level documentation covering vision, goals, architecture, and technology choices.

### Technical Standards
Coding standards, conventions, and best practices organized by domain (global, frontend, backend, testing).

---

## Project Documentation

Located in `.maister/docs/project/`

### Vision (`project/vision.md`)
Purpose, problem statement, solution approach, target users, project goals, and non-goals.

### Roadmap (`project/roadmap.md`)
Current state (prototype), completed milestones, and potential next steps.

### Tech Stack (`project/tech-stack.md`)
Frontend (React 19, Vite 6), backend (Fastify 5, OpenAI SDK 6.33), AI models (qwen3-vl-8b, gpt-oss-20b via LM Studio), shared fixtures.

### Architecture (`project/architecture.md`)
System diagram, 2-step AI pipeline (vision → reasoning), key files, data flow, and design decisions.

---

## Technical Standards

### Global Standards

Located in `.maister/docs/standards/global/`

#### Coding Style (`standards/global/coding-style.md`)
Naming consistency, automatic formatting, descriptive names, focused functions, uniform indentation, no dead code, no unnecessary backward compatibility, DRY principle.

#### Commenting (`standards/global/commenting.md`)
Let code speak through structure and naming, comment sparingly, no change comments or changelogs in code.

#### Development Conventions (`standards/global/conventions.md`)
Predictable structure, up-to-date documentation, clean version control, environment variables, minimal dependencies, consistent reviews, testing standards, feature flags, changelog updates.

#### Error Handling (`standards/global/error-handling.md`)
Clear user messages, fail fast, typed exceptions, centralized handling, graceful degradation, retry with backoff, resource cleanup.

#### Minimal Implementation (`standards/global/minimal-implementation.md`)
Build what you need, clear purpose for every method, delete exploration artifacts, no future stubs, no speculative abstractions, review before commit, unused code is debt.

#### Validation (`standards/global/validation.md`)
Server-side always, client-side for feedback, validate early, specific errors, allowlists over blocklists, type and format checks, input sanitization, business rules, consistent enforcement.

#### Project Conventions (`standards/global/project-conventions.md`)
Project-specific patterns: ESM imports with `.ts` extensions, strict TypeScript, naming conventions (camelCase/PascalCase/UPPER_SNAKE_CASE), error handling, logging prefixes, env var defaults, LLM response cleanup.

---

### Frontend Standards

Located in `.maister/docs/standards/frontend/`

#### Accessibility (`standards/frontend/accessibility.md`)
Semantic HTML, keyboard navigation, color contrast, alt text and labels, screen reader testing, ARIA when needed, heading structure, focus management.

#### Components (`standards/frontend/components.md`)
Single responsibility, reusability, composability, clear interface, encapsulation, consistent naming, local state, minimal props, documentation.

#### CSS (`standards/frontend/css.md`)
Consistent methodology, work with the framework, design tokens, minimize custom CSS, production optimization.

#### Responsive Design (`standards/frontend/responsive.md`)
Mobile-first, standard breakpoints, fluid layouts, relative units, cross-device testing, touch-friendly, mobile performance, readable typography, content priority.

---

### Backend Standards

Located in `.maister/docs/standards/backend/`

#### API Design (`standards/backend/api.md`)
RESTful principles, consistent naming, versioning, plural nouns, limited nesting, query parameters, proper status codes, rate limit headers.

#### Database Migrations (`standards/backend/migrations.md`)
Reversible migrations, small and focused changes, zero-downtime awareness, separate schema and data, careful indexing, descriptive names, version control.

#### Models (`standards/backend/models.md`)
Clear naming, timestamps, database constraints, appropriate types, index foreign keys, multi-layer validation, clear relationships, practical normalization.

#### Database Queries (`standards/backend/queries.md`)
Parameterized queries, avoid N+1, select only needed columns, index strategic columns, transactions, query timeouts, cache expensive queries.

---

### Testing Standards

Located in `.maister/docs/standards/testing/`

#### Test Writing (`standards/testing/test-writing.md`)
Test behavior not implementation, clear names, mock external dependencies, fast execution, risk-based testing, balance coverage and velocity, critical path focus, appropriate depth.

---

## How to Use This Documentation

1. **Start Here**: Always read this INDEX.md first to understand what documentation exists
2. **Project Context**: Read relevant project documentation before starting work
3. **Standards**: Reference appropriate standards when writing code
4. **Keep Updated**: Update documentation when making significant changes
5. **Customize**: Adapt all documentation to your project's specific needs

## Updating Documentation

- Project documentation should be updated when goals, tech stack, or architecture changes
- Technical standards should be updated when team conventions evolve
- Always update INDEX.md when adding, removing, or significantly changing documentation
