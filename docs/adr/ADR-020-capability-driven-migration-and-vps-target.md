# ADR-020 — Capability-driven migration, role-based experience, and portable VPS target

**Status:** Accepted — 2026-10-04

## Context

Celerates now has three realities at the same time:

1. a broad ERP implementation covering cross-division workflows;
2. specialist/external systems such as Mekari Talenta and ConForm/PAMA that already operate parts of the business;
3. a Digital Intelligence layer that is valuable only when operational context is trusted and governed.

Treating the target as “move every feature into Celerates” would spend engineering effort rebuilding mature commodity functions and would create migration risk before the differentiating cross-division workflows are mature.

The product also needs to separate logical business ownership from user navigation. A Talent user should not need to understand whether Attendance belongs to People/HRIS, Timesheet to Project Operations, or Payslip to an external HR system.

Finally, earlier implementation records used Railway for a portable pilot. The target deployment decision has since moved to a provider-neutral Docker architecture on the approved VPS baseline.

## Decision

### 1. ERP is canonical per owned capability, not by blanket declaration

Celerates ERP is the **Digital Operational Core**. It becomes the source of truth for a capability after its workflow, data, controls and cut-over are validated.

An existing specialist system may remain authoritative for a deliberately retained capability.

### 2. Migration is decided capability by capability

Every overlapping capability must have one explicit direction:

- **retain** — keep the existing system as authority;
- **integrate** — keep it external and access it through a governed adapter/contract;
- **migrate** — move authority to Celerates after reconciliation and cut-over;
- **rebuild** — implement a Celerates-native capability when the business-specific need justifies it;
- **retire** — remove the legacy source/surface after replacement is proven.

There must be one write-owner per capability/datum at a given transition stage. Unbounded bidirectional synchronization is not an accepted default.

### 3. Mature divisional workflows before full HRIS replacement

The first product priority is the connected Celerates operating lifecycle: Commercial → TA/People → Talent/Assignment → Project/PMO → Timesheet/Evidence/BAST → Finance.

A full Mekari Talenta replacement is **not** an initial project objective. Mature commodity HR capabilities such as payroll, roster, leave policy/balance or payslip may remain in Talenta when that is the safer and more economical decision.

Celerates may still provide a coherent role-based entry experience over retained capabilities, including deep links or governed API adapters where useful.

### 4. Role-based experience is separate from domain architecture

Business capabilities are grouped logically (Commercial, People/HRIS, Project Operations, Finance, Corporate Services), but the side menu/workspace follows user jobs and mental models.

An architecture regrouping does not automatically require a wholesale sidebar redesign. Navigation changes require pilot/user evidence.

### 5. ConForm remains bounded only for the transition capabilities it still owns

ADR-019 remains valid for its security, contract and bounded-service rules while ConForm capabilities are still in use.

This ADR supersedes any interpretation of ADR-019 that makes ConForm a required permanent target platform. ConForm user-facing surfaces are transitional; the target is Celerates as the user-facing operational product. Individual ConForm capabilities may be migrated or retired only after parity/reconciliation/cut-over is proven.

### 6. Portable VPS is the production target

ADR-006 remains the historical portable-pilot record, but its Railway deployment choice is no longer the target production architecture.

The target baseline is:

```text
Cloudflare / Internet
        ↓
Hostinger VPS
        ↓
Docker runtime
├ Celerates ERP
├ Intelligence API / workers
├ PostgreSQL
├ private S3-compatible object storage
└ self-hosted observability
```

Initial planning uses the approved Hostinger KVM 4 class (4 vCPU, 16 GB RAM, 200 GB NVMe). Scale-up or component separation happens only from measured resource, retention, concurrency or reliability pressure.

Cost figures and subscription assumptions live in the management spreadsheet; this ADR records the topology decision only.

### 7. Intelligence remains downstream

Nothing in this ADR changes ADR-007–018 governance:

- deterministic facts stay deterministic;
- Intelligence does not receive arbitrary ERP database write access;
- model output is not transactional authority;
- sensitive-data disclosure rules still apply;
- reviewed/idempotent ERP actions and outcomes remain the closed-loop pattern.

## Consequences

Positive:

- engineering effort stays focused on differentiating Celerates workflows;
- HRIS replacement remains possible later without becoming a prerequisite for near-term value;
- users can get a coherent experience while providers differ behind it;
- one write-owner reduces reconciliation ambiguity;
- deployment and cost stay simple for the current scale;
- scaling decisions can be based on measured workload.

Trade-offs:

- coexistence requires explicit adapter contracts and ownership records;
- some users may temporarily cross between Celerates and a retained specialist surface;
- capability-by-capability migration is less visually simple than a big-bang vendor replacement, but substantially safer.

## Supersedes / qualifies

- **ADR-006:** supersedes only the Railway-as-target interpretation; portability and pilot safety decisions remain valid.
- **ADR-019:** qualifies ConForm as transitional where still needed; its bounded contract and security rules remain valid until each dependent capability is cut over.
- No other ADR is superseded.
