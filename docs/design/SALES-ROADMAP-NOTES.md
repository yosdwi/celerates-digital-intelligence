# Sales roadmap notes

Status: notes (2026-10-08), from the QA round after doc page 11. These are ideas the Product Owner wants to keep, not
committed work. Each one is defined before it is built (problem, cause, options, recommendation, decision).

| # | Idea | Decision 2026-10-08 |
|---|---|---|
| 1 | Deal 360: one page follows a deal from Opportunity to margin | Built: the panel's ↗ opens the full record page (`/sales/v2/opportunity-tracker/<id>`, Crisp RecordPage) with tabs Perjalanan and Aktivitas; the panel shows a one-line journey |
| 2 + 6 | Email in the ERP (log, read, send, templates), like Attio or Frappe | Built (7db1b94): IMAP sync of INBOX and Sent every 2 minutes into crm_emails (only mail matching an Account), BCC to log, threads in the Account panel and the Opportunity page's Email tab, compose and reply over SMTP, templates with variables. One mailbox, celeratesapps@celerates.co.id, for the pilot; no visibility rules yet; personal mailboxes after the pilot |
| 3 | AI fills forms from a pasted email or RFQ | Built (5e04c72): New Opportunity → "Isi dari email / RFQ klien (AI)"; the Agent model proposes fields, ERP keeps only valid V1 codes and marks them for review |
| 4 | Margin check before Proposal Sent | Later; notes below |
| 5 | Pipeline insight | Later; notes below |

## 4. Margin check before Proposal Sent (later)

**Problem:** Sales sets a price before anyone knows the margin. The margin only shows up in Profitability after the
talent is placed, which is too late to change the deal. The pilot seed already has thin and negative margins.

**What exists:**
- The COGS Calculator (`src/lib/cogs-calculator.ts`, `calculateCogs`), which Profitability already uses.
- Each tracker already stores price, price period, level and headcount.

**Idea:**
- In the Opportunity panel, show an estimated margin. It uses the tracker's price (converted to a monthly figure),
  a typical salary for the position and level, and the default COGS rates.
- When the stage moves to Proposal Sent with an estimate under a threshold (for example 15%), show a warning. It asks
  for confirmation; it does not block the move.

**Open questions:**
- Where does the typical salary come from? Options: the TM Database Salary page, or the median of current talent
  assignments with the same position and level.
- Who sets the threshold?
- Should the warning need a manager's approval?

## 5. Pipeline insight (later)

All of this uses data that already exists. It needs no new tables.

- **Stalled deals:**
  - A "Perlu ditindaklanjuti" list for each Sales PIC: deals with no stage change or communication for N days.
  - The Kanban cards already turn the hours badge red when a deal is overdue.
- **Weighted forecast:**
  - Each stage gets a weight: CV Submission 10%, Solutioning 25%, Proposal Sent 50%, Need Action 40%, Win 100%.
  - The forecast multiplies `estimated_deal_amount` by that weight and totals it per month and per PIC.
- **Win and drop analysis:**
  - Group `dropped_reason`, and conversion rates between stages, per service type and per client.
  - From stage changes (`record_field_changes`, migration 0014): how long deals spend in each stage.
- **Weekly summary:**
  - The existing Agent ("Tanya Agent") writes a short summary for each PIC and for the manager: new deals, deals won
    and dropped, stalled deals, biggest open deals.
  - Shown in the ERP first. Email later, through #2.
