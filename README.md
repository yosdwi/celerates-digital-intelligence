# Celerates Digital Intelligence

Celerates Digital Intelligence is the architecture and implementation baseline for adding an intelligence layer on top of the existing Celerates ERP.

The goal is not to replace the ERP and not to build a generic chatbot. The ERP remains the **Digital Operational Core** and source of truth. The intelligence layer adds context, knowledge retrieval, reasoning, model routing, workflow orchestration, and business-facing intelligence applications.

## Canonical storyline

```text
Raw Sources
  -> Celerates Data Intake
  -> Celerates ERP (Digital Operational Core)
  -> Celerates Intelligence Layer
       - Context & Knowledge
       - Intelligence Core
       - Model Gateway
  -> Celerates Intelligence Applications
       - Pre-Sales
       - Exception Management
       - Human Services
       - Management Intelligence
  -> Human / controlled workflow action
  -> ERP status and outcome feedback
```

## Locked baseline decisions

- **Raw source intake:** Python Integration Core as the primary implementation; n8n is a supporting low-code automation/connector surface, not the home of critical business logic.
- **No Airbyte for the first implementation.** Add it only when database replication/CDC volume justifies it.
- **ERP:** keep the existing Celerates ERP as the canonical operational source of truth.
- **Intelligence data:** PostgreSQL + pgvector + PostgreSQL full-text search; object/document files in MinIO/S3-compatible storage.
- **Document parsing:** Docling baseline.
- **Intelligence API:** Python + FastAPI.
- **Stateful AI workflow:** LangGraph.
- **Model Gateway:** LiteLLM, with OpenAI / Anthropic / Gemini / open-source providers behind one abstraction.
- **Cache / short-lived state:** Redis where justified.
- **Observability and evaluation:** Langfuse baseline.
- **Applications are business capabilities, not separate chatbots.** Web workspace, copilot, in-app notification, WhatsApp, generated documents, and background automation are delivery surfaces.
- **Deterministic facts stay deterministic.** Metrics, deadlines, status, pricing/rate, availability, and business-rule checks must come from trusted systems/rules, not LLM generation.
- **Human review stays explicit** for business-critical outputs and external communication.
- **Closed loop:** approved actions and outcomes are written back to ERP.

## Start here for implementation

**GPT Astra / implementation agent:** read [`HANDOFF-ASTRA.md`](./HANDOFF-ASTRA.md) first, then all architecture and product documents under `docs/` before writing code.

## Primary deliverables

This repository is intended to produce two things that can be shown independently:

1. **Clean architecture diagrams and decision documents** explaining the Celerates Digital Intelligence concept.
2. **A functional showcase application** with production-shaped structure, full UI/UX, seeded demo data, and real integration boundaries so it can evolve into a working product rather than a static mockup.

## Visual reference

The public service pages at `bmsservices.id/en/services` are a **design and storytelling reference**, not a pixel-copy target. Preserve the qualities that make them effective: strong hierarchy, concise section copy, generous whitespace, clear cards, prominent use cases, process steps, technology visibility, measurable outcomes, and direct CTA/action language. Translate that visual language into a professional internal intelligence application.
