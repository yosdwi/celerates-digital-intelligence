# Pre-Sales Intelligence

## Purpose

Reduce the time spent understanding TOR/RFP material, searching prior work, checking capability, finding gaps, and preparing an initial solution package, while keeping the final decision with human Pre-Sales.

## Trigger

An opportunity exists in ERP and may include Sales notes, TOR/RFP, customer context, expected timeline, and other attachments.

## Evidence sources

### Live structured ERP context

- opportunity/customer;
- capability catalogue;
- talent/skill data;
- allocation/capacity;
- project/customer history;
- trusted pricing/rate source when available.

### Knowledge/retrieval context

- approved prior TOR/RFP;
- proposal/solution documents;
- project architecture/case study;
- delivery lessons;
- reusable capability descriptions;
- approved CV/skill evidence where permitted.

## Workflow

1. Opportunity created/selected.
2. Source documents registered and ingested.
3. Extract document structure and provenance.
4. Identify requirements, constraints, integration points, NFRs, scope/timeline signals.
5. Identify missing/ambiguous information.
6. Retrieve relevant prior experience and reusable assets.
7. Query ERP live capability/capacity context.
8. Assess fit, gaps, risk and assumptions.
9. Use Model Gateway to synthesize selected narrative/structured outputs.
10. Create Pre-Sales Intelligence Pack.
11. Human Pre-Sales reviews/edits.
12. If insufficient, create clarification items and return to Sales/customer.
13. If sufficient, approve solution/scope/BOQ/proposal draft for Sales discussion.
14. Record status/outcome back to ERP.
15. Approved artifacts become eligible curated knowledge for future work.

## Output contract

The core output is not “an AI answer”. It is a set of structured artifacts:

- Opportunity Brief
- Requirement Matrix
- Clarification List
- Relevant Experience
- Capability & Capacity Fit
- Risk & Assumption Register
- Solution Outline
- Scope Draft
- BOQ / Effort Draft
- Proposal Draft
- Next Actions

Each artifact should carry status, version, author/source, review state, and provenance where relevant.

## Safety / correctness rules

- Resource availability is from ERP/demo trusted data, not model invention.
- Rates/prices/margins are from trusted inputs only.
- Similar prior work must retain evidence/source links.
- Missing information should remain explicitly missing; do not hallucinate completion.
- Proposal/BOQ remains draft until human approval.
