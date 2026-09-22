# ADR-003 — LiteLLM as the Model Gateway Baseline

**Status:** Accepted

## Context

Celerates should not hard-code business workflows directly to one model provider. Pre-Sales, Human Service, extraction, and management reasoning may need different quality/cost/latency characteristics.

## Decision

Use LiteLLM as the baseline Model Gateway abstraction for OpenAI, Anthropic, Gemini, and open-source/local providers.

Business workflows refer to logical model roles/aliases instead of provider-specific names where practical.

## Responsibilities

- centralized provider configuration;
- routing/model selection;
- retry/fallback;
- cost/usage visibility;
- request metadata/tracing integration;
- future policy-based routing.

## Consequence

Provider changes should not require rewriting application contracts or workflow logic.
