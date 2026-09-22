# Exception Management

## Purpose

Move from generic reminders to contextual exception handling: detect conditions that need attention, understand business impact, route to the right owner, escalate when necessary, and track until resolution.

## Initial exception types

- timesheet incomplete;
- BAST/billing milestone overdue;
- contract approaching expiry;
- approval stuck;
- opportunity/project state stuck;
- later: other rule/anomaly-driven operational risks.

## Architecture rule

The existence of an exception should normally be **deterministic**. AI enriches context and prepares communication/action; it should not invent the underlying fact.

Example:

`BAST pending for 12 days` comes from ERP + rule.

AI may explain:

- customer/project context;
- affected invoice value;
- prior follow-up;
- likely operational impact;
- concise suggested next action.

## Workflow

1. Read current ERP state/event.
2. Rule/anomaly check.
3. Create/update exception if condition is met.
4. Calculate deterministic age/urgency/impact inputs where possible.
5. Intelligence Core enriches context.
6. Assign/resolve owner.
7. Choose normal reminder vs escalation route.
8. Human approval before client/external communication where required.
9. Send via in-app / WhatsApp / email / other configured surface.
10. Track action history and ERP state.
11. Automatically close when resolution condition is satisfied.

## Primary UI output — Exception Action Brief

Each brief answers:

- What is the exception?
- What trusted facts triggered it?
- Why does it matter?
- Who owns it?
- What is blocking it?
- What should happen next?
- When does it escalate?
- What happened previously?

## Example

```text
BAST overdue — Project ABC
Age: 12 days
Potential invoice value: Rp370M
Owner: PMO A
Current blocker: client approval
Impact: invoice cannot be issued
Suggested next action: follow up client PIC today
Escalation: PMO Manager if unresolved in 2 days
```
