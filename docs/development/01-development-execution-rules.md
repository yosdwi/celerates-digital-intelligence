# Development Execution Rules

**Status:** Mandatory repository-wide development rule  
**Effective:** 2026-10-05  
**Owner:** Tech Lead  
**Applies to:** ERP, Intelligence, infrastructure, migrations, integration code, and implementation-affecting documentation

## 1. Core rule

From this point forward:

> **CI is a verifier, not the primary debugger.**

Development must be executed in **logical batches** with a fast inner validation loop. Expensive full CI, browser, and Compose verification are reserved for coherent checkpoints rather than every small edit.

The objective is faster feedback **without lowering test quality**.

## 2. Mandatory development flow

```text
Define one logical outcome + exit condition
        ↓
Inspect current code + nearby tests/contracts
        ↓
Implement the coherent batch
        ↓
FAST GATE
targeted tests + relevant type/schema/static checks
        ↓
Fix deterministic failures in targeted scope
        ↓
Commit coherent batch
        ↓
INTEGRATION GATE
adjacent components / service boundary
        ↓
FULL GATE
checkpoint / PR readiness / high-risk boundary
        ↓
Report exact result + remaining blocker + next action
```

Do not replace this flow with repeated full-CI runs after every file edit.

## 3. Logical batch rule

A logical batch is one reviewable result, for example:

- add passkey authentication end-to-end;
- harden Opportunity → Requisition/PQ handoff;
- enforce Sales viewer/editor/full access consistently;
- fix a migration together with schema and affected tests;
- fix one storage or Compose boundary.

A batch may touch several files.

Required:

- group implementation, tests, schema/migration, and directly related docs for the same outcome;
- keep the batch small enough to reason about;
- prefer one coherent commit, or a small number of purpose-driven commits;
- when tooling supports an atomic multi-file commit, use it.

Avoid the default pattern:

```text
file A → commit → full CI → wait
file B → commit → full CI → wait
test   → commit → full CI → wait
docs   → commit → full CI → wait
```

unless each change is intentionally an independent release/review unit.

## 4. Fast Gate — inner loop

Run the smallest meaningful checks before expensive verification.

Typical Fast Gate checks:

### ERP

- targeted unit/security/access/business-rule test;
- ERP typecheck;
- affected schema/migration validation;
- focused server-action or contract test.

### Intelligence

- targeted Python test;
- relevant lint/static check;
- focused adapter/workflow test.

### UI

- relevant typecheck/build where needed;
- targeted route/component/browser test for the changed journey;
- do not install/run the entire browser suite after every small UI edit.

### Infrastructure

- config validation;
- focused service/container startup for the changed boundary;
- full stack only when the change actually crosses service boundaries.

Reuse existing repository scripts where available instead of creating parallel ad-hoc checks.

## 5. Integration Gate

Run this once the logical batch is coherent.

Examples:

- ERP action + migration + downstream record;
- login route + session + profile/security management;
- API + worker + storage;
- provider adapter + domain contract;
- UI route + server action + authorization.

Integration verification happens **per logical batch**, not per edited file.

## 6. Full Gate

The Full Gate is the expensive stage.

Examples:

- complete ERP pilot journey;
- full build + browser journey;
- Docker Compose stack;
- cross-service P0 verification;
- full security/HTTP regression.

Run it when one of these applies:

1. Fast and Integration gates are green and the batch is at a checkpoint;
2. PR is approaching review/merge readiness;
3. auth/session/security behaviour changed;
4. authorization/RBAC changed;
5. migration/deployment topology changed;
6. cross-service data consistency changed;
7. Tech Lead explicitly requests a full regression checkpoint.

Do not use Full Gate as the default debugger for every edit.

## 7. Deterministic failure rule

When CI fails:

1. read the exact failing step and relevant log;
2. classify the failure;
3. inspect nearby tests/contracts that may depend on the same changed behaviour;
4. batch the related fixes;
5. run targeted checks;
6. only then return to the expensive gate.

Failure classifications:

- **product/code defect** — implementation is wrong;
- **stale test/fixture** — intended behaviour changed but test data/assertion still models the old state;
- **infrastructure/tooling defect** — Compose, registry, storage, runner, workflow, or toolchain issue;
- **environment/config defect** — required runtime configuration is absent/inconsistent;
- **external/transient issue** — only after evidence shows it is actually transient.

Do not weaken a correct security/business assertion merely to make CI green.

Do not rerun a deterministic failure repeatedly without a change that addresses its root cause.

## 8. Avoid the one-failure-at-a-time trap

A long suite often reveals failures sequentially.

Avoid:

```text
full CI → failure A
fix A
full CI → failure B
fix B
full CI → failure C
```

Instead, after failure A:

- inspect the entire affected journey;
- search for stale fixtures/expectations tied to the same contract;
- fix all obvious related issues in one batch;
- use targeted verification first;
- run Full Gate only when the area is coherent.

## 9. CI trigger and queue hygiene

CI configuration must minimize duplicate expensive work.

Required principles:

- cancel superseded runs on the same development branch;
- avoid running the same expensive suite twice for the same revision through both push and pull-request triggers unless justified;
- prefer fast checks during feature-branch iteration;
- reserve full cross-service verification for checkpoints/PR validation;
- do not create a new commit only to “see what CI says” when logs already show a deterministic root cause.

If CI configuration itself creates duplicated or unnecessary work, fixing the feedback loop is part of the development task.

## 10. Commit discipline

Commit messages describe the logical result, not a filename.

Good examples:

- `erp: harden Sales handoff idempotency`
- `auth: add WebAuthn passkey login and recovery controls`
- `ci: split fast pilot checks from full verification`

Avoid:

- `update actions.ts`
- `fix test`
- `change file`
- many tiny commits created only because files were edited sequentially.

## 11. Branch and PR discipline

- work on a feature/fix branch from the approved integration baseline;
- keep unrelated work out of the branch;
- Draft PR is allowed while implementation is active;
- do not mark a PR review-ready only because CI is green;
- the intended business/user outcome and exit condition must also be clear.

Before review readiness, summarize:

- what changed;
- what was verified;
- migration/config required;
- known blocker/follow-up;
- real-user validation still pending.

## 12. Status reporting rule

Do not report only:

> “CI is still running.”

Use:

```text
Implemented:
- exact completed changes

Verified:
- Fast Gate
- Integration Gate

Current blocker:
- exact failing contract/service/environment

Next action:
- exact bounded fix
```

This prevents long-running CI from hiding actual implementation progress.

## 13. Pilot-specific rule

During a user pilot:

- do not broadly redesign from assumptions;
- fix real P0/P1 blockers first;
- preserve working behaviour outside the critical path;
- add targeted regression coverage for pilot-critical bugs;
- use real-user evidence for P2/UX improvements;
- do not make Intelligence a blocker for an operational ERP pilot unless explicitly required.

For the current Sales pilot, `docs/23-sales-pilot-wave-1.md` is the execution baseline.

## 14. High-risk exception

The Tech Lead may require immediate broader verification for:

- authentication/session;
- authorization/RBAC;
- sensitive-data handling;
- destructive/irreversible migrations;
- payment/payroll/compensation;
- production deployment/rollback;
- cross-service consistency.

Even then, targeted checks should be used first where possible. Full verification complements the Fast Gate; it does not replace it.

## 15. Definition of done for a development batch

A batch is complete when:

- the logical outcome is implemented;
- relevant targeted tests pass;
- type/schema/static checks for the changed area pass;
- required integration checks pass;
- Full Gate has run when risk/checkpoint requires it;
- docs/ADR are updated when behaviour/architecture changed;
- external or real-user validation items are explicitly recorded;
- no deterministic failure is being ignored or hidden.

## 16. Short version

```text
THINK IN BATCHES
↓
FAST CHECK FIRST
↓
FIX ROOT CAUSE
↓
COMMIT COHERENTLY
↓
FULL CI AT CHECKPOINTS
↓
CI VERIFIES — IT DOES NOT DEBUG FOR US
```
