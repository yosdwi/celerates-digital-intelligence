# Product UI/UX Specification

## Design intent

The web output must be good enough to show directly to Celerates stakeholders, not only to developers. It should communicate a product that is calm, credible, operational, and useful.

Primary public reference: `https://bmsservices.id/en/services` and its AI & Automation / ERP / workflow service pages.

The reference is for **visual language and storytelling rhythm**, not for copying layout, text, assets, branding, or code.

## Qualities to borrow from the reference

- very clear title/subtitle hierarchy;
- short, concrete copy instead of architecture jargon;
- generous whitespace and strong section separation;
- rounded cards with clear purpose;
- visible metrics/status summaries;
- use-case cards that explain practical outcomes;
- step-by-step process sections;
- technology badges/logos/chips as supporting credibility;
- prominent actions/CTAs;
- responsive presentation from desktop to mobile;
- business benefit appears before implementation detail.

## Avoid

- generic “AI command center” dark neon aesthetic;
- robot/brain illustrations as the main product identity;
- excessive gradients/glassmorphism;
- empty chat screen as home;
- dashboards full of metrics with no action hierarchy;
- long AI-generated prose where a structured artifact/table is better;
- fake actions in the main demo flow.

## Product identity

Use Celerates branding where existing brand assets/tokens are available. Until then, use a restrained professional neutral palette with one strong accent and avoid locking in a fake brand system. Build tokens so colors/typography can be replaced centrally.

## Information architecture

### Public / overview

`/`

Recommended narrative:

1. Hero: **Celerates Digital Intelligence** — operational data becomes actionable intelligence without replacing the ERP.
2. Architecture strip: Raw Sources -> Celerates ERP -> Intelligence Layer -> Intelligence Applications.
3. “What changes” — from fragmented information and manual follow-up to contextual work products and closed-loop action.
4. Four applications: Pre-Sales, Exception Management, Human Services, Management Intelligence.
5. How the Intelligence Layer works: Context & Knowledge, Intelligence Core, Model Gateway.
6. Technology foundation.
7. Flagship demo CTA: Open Pre-Sales Workspace.

### Authenticated/application shell

Primary navigation:

- Overview
- Pre-Sales
- Exceptions
- Human Service
- Management
- Sources & Integrations
- System

Top bar:

- workspace title/breadcrumb;
- contextual search/copilot entry;
- notifications;
- environment/demo status;
- user menu.

## Overview page

Should answer in under 10 seconds:

- What needs attention?
- What recently changed?
- What intelligence work is running?
- What needs my approval?

Suggested content:

- compact KPI/status strip;
- “Needs your attention” queue;
- recent intelligence runs;
- data/source health;
- application cards with operational counts;
- latest Executive Action Brief preview.

## Pre-Sales workspace

### List view

Display opportunities with:

- customer;
- opportunity;
- owner;
- stage;
- completeness;
- analysis state;
- open clarification count;
- risk signal;
- updated time.

### Opportunity detail

Use a strong workbench layout:

- header: opportunity identity, stage, owner, status and actions;
- compact summary strip;
- left/main content: artifact tabs/cards;
- right contextual panel: sources, workflow timeline, optional copilot;
- sticky review/action bar when needed.

Artifact navigation:

- Brief
- Requirements
- Clarifications
- Relevant Experience
- Capability Fit
- Risks & Assumptions
- Solution
- Scope
- BOQ / Effort
- Proposal
- Next Actions

Structured content must be editable/reviewable. Show source/provenance where evidence matters.

## Exception Action Center

Do not make this only a notification list.

Each exception card/row should expose:

- exception type;
- business object/project/customer;
- age/deadline;
- impact;
- owner;
- current blocker/context;
- recommended next action;
- escalation state;
- action history.

Detail view should make “why this matters” obvious while keeping facts separate from AI explanation.

## Human Service

Use an inbox/case pattern, not a generic chatbot page.

- incoming need/question;
- requester identity/context;
- intent/category;
- relevant policy/ERP evidence;
- direct-answer vs human-route decision;
- suggested PIC;
- draft response;
- human response/action;
- resolution state.

A conversational assistant can be one surface, but the operational case remains visible.

## Management Intelligence

Default home is the **Executive Action Brief**, not an empty chat box.

Each brief answers:

- What happened?
- Why does it matter?
- Who owns it?
- What decision/action is needed?

Then allow drill-down into deterministic metrics and underlying records. A copilot may answer follow-up questions against the same evidence.

## Sources & Integrations

Show:

- source name/type;
- connector type (Python/n8n/manual/API);
- latest sync/ingestion;
- health;
- records/files processed;
- validation/rejection count;
- provenance/audit link.

This page makes the intelligence product credible because stakeholders can see where context originates.

## System page

Show implementation boundaries without overwhelming business users:

- ERP adapter status;
- PostgreSQL/pgvector status;
- object storage status;
- model gateway providers and logical aliases;
- Langfuse configured/not configured;
- n8n configured/not configured;
- demo mode banner;
- links to architecture diagrams/docs.

## Responsive behaviour

- desktop: persistent navigation and split workbench where useful;
- tablet: collapsible navigation, single primary panel plus drawer;
- mobile: bottom/compact navigation, artifacts as stacked cards/tabs, review actions accessible without horizontal overflow;
- never hide critical approval/action controls behind hover-only behaviour.
