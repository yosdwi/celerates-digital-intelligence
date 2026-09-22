# Celerates Digital Intelligence — Architecture Diagrams

Mermaid (`.mmd`) files in this directory are the **canonical source of truth**. SVG files under `rendered/` are generated automatically for presentation, review, and reuse in slides or Figma.

## 01 — Master Architecture

![Master Architecture](./rendered/01-master-architecture.svg)

Source: [`01-master-architecture.mmd`](./01-master-architecture.mmd)

## 02 — Technology Architecture

![Technology Architecture](./rendered/02-technology-architecture.svg)

Source: [`02-technology-architecture.mmd`](./02-technology-architecture.mmd)

## 03 — Pre-Sales Intelligence E2E

![Pre-Sales E2E](./rendered/03-presales-e2e.svg)

Source: [`03-presales-e2e.mmd`](./03-presales-e2e.mmd)

## 04 — Exception Management

![Exception Management](./rendered/04-exception-management.svg)

Source: [`04-exception-management.mmd`](./04-exception-management.mmd)

## 05 — Human Services

![Human Services](./rendered/05-human-services.svg)

Source: [`05-human-services.mmd`](./05-human-services.mmd)

## 06 — Management Intelligence

![Management Intelligence](./rendered/06-management-intelligence.svg)

Source: [`06-management-intelligence.mmd`](./06-management-intelligence.mmd)

## 07 — Intelligence Layer Internal

![Intelligence Layer Internal](./rendered/07-intelligence-layer-internal.svg)

Source: [`07-intelligence-layer-internal.mmd`](./07-intelligence-layer-internal.mmd)

## 08 — POC Deployment

![POC Deployment](./rendered/08-poc-deployment.svg)

Source: [`08-poc-deployment.mmd`](./08-poc-deployment.mmd)

## 09 — P0 Runtime

![P0 Runtime](./rendered/09-p0-runtime.svg)

Source: [`09-p0-runtime.mmd`](./09-p0-runtime.mmd)

## 10 — P0 Review Lifecycle

![P0 Review Lifecycle](./rendered/10-p0-review-lifecycle.svg)

Source: [`10-p0-review-lifecycle.mmd`](./10-p0-review-lifecycle.mmd)

## 11 — Intelligence Runtime Components

This diagram explains the responsibility boundaries between **LangGraph, PostgreSQL, pgvector, PostgreSQL FTS, LiteLLM, model providers, and Langfuse**.

![Intelligence Runtime Components](./rendered/11-intelligence-runtime-components.svg)

Source: [`11-intelligence-runtime-components.mmd`](./11-intelligence-runtime-components.mmd)

Detailed explanation: [`../06-intelligence-stack-explained.md`](../06-intelligence-stack-explained.md)

## Workflow

```text
*.mmd (edit / review / Git diff)
   ↓
GitHub Actions — Render Mermaid diagrams
   ↓
rendered/*.svg
   ↓
GitHub docs / Slides / Figma / presentation
```

Do not edit generated SVG files manually. Change the `.mmd` source and let CI regenerate the presentation artifact.
