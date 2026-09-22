# Management Intelligence

## Purpose

Management should not have to inspect every dashboard to discover what matters. Deterministic metrics and operational exceptions are summarized into concise, evidence-backed action briefs with drill-down.

## Input domains

- Sales & pipeline;
- Talent & capacity;
- Project / timesheet / BAST;
- Revenue / invoice / cash;
- exception/action state.

## Architecture rule

Business metrics are calculated deterministically. The model explains context, relationships, implications, and options; it does not invent or recalculate authoritative metrics from prose.

## Primary artifact — Executive Action Brief

Each brief answers:

1. **What happened?**
2. **Why does it matter?**
3. **Who owns it?**
4. **What action/decision needs attention?**

Example:

```text
What happened
5 BAST items are pending >10 days.

Why it matters
Rp1.2B invoice value is potentially delayed.

Owner
PMO / Finance.

Action
Review Project A and Project C today; both require client escalation.
```

## UX

Default page should be an action-oriented brief/feed, not an empty chatbot.

Support:

- concise management summary;
- deterministic KPI strip;
- priority action list;
- drill-down into underlying records/evidence;
- contextual copilot for follow-up questions;
- scenario intelligence later, after baseline operational intelligence is reliable.
