# ERP independent audit — 2026-09-23

Issue: [#3](https://github.com/yosdwi/celerates-digital-intelligence/issues/3). Branch: `audit/erp-production-readiness`. Repository baseline: `cffcf1a`.

**Disposition: retain and harden the existing ERP. The snapshot compiles, but is not ready for a broadly accessible, real-data pilot.** Complete the P0 gates in [04](04-production-readiness-audit.md) before reviewer access. This commit completes the independent audit and proposed implementation backlog; it does not claim a Railway ERP deployment, real-user acceptance, or completed second-reviewer reconciliation.

## Deliverables

| File | Decision it supports |
| --- | --- |
| [01 — Business capabilities](01-as-is-business-capability-map.md) | What actually exists and which journeys reviewers should exercise |
| [02 — Technical architecture](02-as-is-technical-architecture.md) | Preserve the monolith; make its boundaries explicit |
| [03 — Data and source of truth](03-data-model-and-source-of-truth-audit.md) | Identity, ownership, reconciliation and Sheets cut-over |
| [04 — Production readiness](04-production-readiness-audit.md) | Finding register, priorities and release gates |
| [05 — User/BA feedback](05-user-feedback-and-requirement-loop.md) | Extend the existing tracker into a traceable requirement loop |
| [06 — Railway target](06-railway-production-like-target.md) | Topology, release procedure, recovery and cost assumptions |
| [07 — Integration contract](07-erp-to-intelligence-contract.md) | Controlled READ / EVENT / ACTION boundary |
| [08 — Implementation plan](08-prioritized-implementation-plan.md) | Assignable work, dependencies, acceptance and reconciliation |

## Input integrity and evidence convention

The expected `references/erp/celerates-erp-main.zip` binary was absent from the checked-out branch. The user-supplied ZIP was materialized separately and verified against the handoff hash:

```text
SHA-256 7c022ed3dd7759fb3317cbd9eebde882050f13a45b865ccc75e37b87f04ddee7
Size    1,770,780 bytes
Entries 542 ZIP entries; 420 regular extracted files
Root    celerates-erp-main/
```

No archive paths escaped extraction and no symlinks were accepted. The archive is audit evidence, not the canonical ERP Git history. Its upstream commit is unknown. `ERP:src/...:line (function)` in these documents refers to that immutable extracted root, **not** this Intelligence repository. [snapshot-manifest.json](evidence/snapshot-manifest.json) records every file hash; [table-inventory.json](evidence/table-inventory.json) records all 60 tables. The archive itself and its source code have not been republished in this commit.

**F = observed fact**, from source or a named probe. **I = inference**, including possible impact not demonstrated against a live system. **R = recommendation/proposed target**, not implemented behavior. Capability labels such as “apparently usable” mean a complete-looking code path, not business UAT certification. Effort estimates are engineering person-days with uncertainty, not delivery promises.

## Method and actual verification

Read the handoff, Issue #3 and its empty comment thread, AGENTS, README, docs 01–08, all five ADRs, all four workflow documents, architecture README and all twelve canonical Mermaid diagrams. The meeting alignment is a summary of the available first approximately 30 minutes; unprovided meeting discussion is unknown. Reviewed the independent ZIP rather than treating the Intelligence P0 as evidence about ERP.

Inventory: 87 App Router pages, 2 route handlers, 60 `pgTable` definitions, 10 separate `sheet-sync/actions.ts` implementations. Reviewed auth/guards, storage, every Sheets implementation, core handoffs, approvals, reminders, schema, feedback, and deployment inputs. This is a risk-focused source audit, not an assertion that every UI branch or SQL statement has been executed.

| Check | Result and limit |
| --- | --- |
| Dependency install | `npm ci --ignore-scripts --no-audit --no-fund` succeeded in a disposable copy. Install scripts deliberately disabled. Node 24.19.0 / npm 11.9.0. Snapshot has no declared Node engine. |
| Type check | `npx --no-install tsc --noEmit --incremental false` exit 0. [Log](evidence/typecheck.log). |
| Declared production build | `npm run build` exit 1: missing script. [Log](evidence/package-build.log). |
| Framework build | Direct `node node_modules/next/dist/bin/next build` exit 0, Next 15.5.22, with placeholder credentials and unreachable local database URL. [Log](evidence/direct-build.log). Dynamic routes were not business-smoke-tested. |
| Runtime smoke | Direct `next start`: `/login` and `/api/auth/providers` 200; cron with bearer secret and no session 307 to login. `/api/health` also redirected; no health handler exists. [Results](evidence/runtime-smoke.json). |
| Isolated original-function probes | Eight observations confirmed, including a positive viewer-denial control. [Script](evidence/probe-snapshot.cjs), [results](evidence/function-probes.json). Dependencies mocked; no real database/storage/mail and no authenticated HTTP exploit. |
| Proposed contract envelopes | Sixteen positive/negative checks pass; [results](evidence/contract-check.json), [reproduction](contracts/README.md). This validates a proposal, not an implemented API. |
| Dependency advisories | Production dependency audit reported six affected package entries: one critical, three high, two moderate. Exposure must be assessed per advisory; see F20. [Raw report](evidence/dependency-audit.json). |
| Limited credential pattern scan | No matches for the scanned private-key/AWS/GitHub/Google-key/JWT patterns. Not a comprehensive secret clearance or a scan of upstream history. [Inventory](evidence/inventory-summary.json). |

No production database dump, actual Sheets rows, Google consent configuration, Supabase bucket policies, provider delivery logs, Railway account configuration, backups, load measurements, or named BA sign-off were supplied for this audit. Their absence from the ZIP is not proof they do not exist elsewhere. No email, WhatsApp, Sheets push, deployment, schema migration or production mutation was performed.

## Reproduce the safe probes

Verify the ZIP hash, extract it safely, and copy the root to a disposable directory. Install its lockfile there; do not copy real environment secrets. Run:

```bash
node docs/erp-audit/evidence/probe-snapshot.cjs /absolute/extracted/celerates-erp-main /absolute/runtime/node_modules/typescript
```

The script imports transpiled original functions with an explicit mock allowlist; it blocks unknown imports and never loads the real database/storage/email modules. A passing observation describes current behavior, including defects. These are audit probes, not the future ERP regression suite.

## Reconciliation boundary

The handoff and docs/08 provide preliminary observations, not a separate detailed ChatGPT finding register. [08](08-prioritized-implementation-plan.md) reconciles all those available claims and records corrections. Actual second-reviewer agreement and stakeholder business decisions remain visibly pending. No architecture decision has been superseded and no broad ERP code change has been made.
