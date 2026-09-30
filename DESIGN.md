# Celerates ERP — Product Design System

Status: **living source of truth for the Frontend Lab**  
Branch: `lab/frontend-mobile`  
Last updated: 2026-09-30

This file captures the visual and interaction rules we deliberately want to preserve while the Celerates ERP UI evolves. Update this file when a design decision changes so future implementation does not drift.

This is a presentation and interaction contract. It does **not** replace the ERP business, authorization, data, or architecture contracts in `AGENTS.md`, `docs/`, and the server guards.

## 1. Product feeling

Celerates should feel:

- **brilliantly simple** — obvious without training;
- **visual** — status, hierarchy, and actions can be understood at a glance;
- **easy to use** — the next step is clear and touch targets are comfortable;
- **clean** — generous whitespace, restrained information density, no dashboard clutter;
- **professional** — calm enterprise UI, not playful decoration and not a generic admin template.

The goal is not to show everything the ERP knows. The goal is to show the smallest amount of information needed for the user to understand and act correctly.

## 2. Core interaction principles

### 2.1 One screen, one main job

Every mobile screen needs a dominant purpose. Avoid combining KPI dashboard, table, filters, forms, alerts, and charts on one viewport.

Prefer:

`see status → open item → understand detail → act`

instead of:

`dashboard → many cards → table → modal → nested modal`.

### 2.2 Mobile is an action surface, not desktop ERP shrunk down

Desktop can keep dense operational tools where density is useful. Mobile uses native mobile patterns: launcher, search, card/list, detail, bottom sheet, sticky action.

Never make a wide desktop table the primary phone experience.

### 2.3 RBAC shapes the Home

There is no extra `Home → choose division → division Home` layer for normal users.

The signed-in user's authority directly shapes the Home:

- PMO user → PMO capabilities;
- HR user → HR capabilities;
- TA user → TA capabilities;
- TM user → TM capabilities;
- multi-role/Owner → accessible business modules, then the complete module directory when needed.

Authorization still belongs to the canonical server-side access rules. UI visibility is not an authorization boundary.

### 2.4 Home is a launcher, not a monitoring dashboard

The Home should answer: **“What can I do here?”**

Default anatomy:

1. personal greeting + identity;
2. small role/workspace context;
3. prominent role-aware search;
4. primary workspace capability launcher;
5. optional recent activity.

Do **not** make `Perlu perhatian`, KPI walls, charts, or exception queues the Home hero by default. Review/attention work belongs in its dedicated navigation surface unless a validated workflow proves otherwise.

### 2.5 Search follows the user's workspace

The search surface is visually consistent, but its scope and copy follow RBAC/context.

Examples:

- PMO: contract, invoice, project/talent document;
- HR: employee, attendance, employment record;
- TA: candidate, requisition, hiring pipeline.

Search should help users reach a record or capability quickly. It must not expose data outside their authority.

## 3. Mobile shell

The existing five-item mobile navigation remains the shared application shell:

**Beranda · Modul · Agent · Tinjau · Akun**

Do not create separate navigation systems for PMO, HR, TA, or TM. Roles change the content inside the shell, not the shell itself.

The shell should feel persistent and predictable. Module pages may change their local header or tabs, but the global navigation should not jump around.

## 4. Home pattern

### 4.1 Header

Use a compact personal header rather than a large Celerates brand title.

Recommended hierarchy:

- greeting, small and muted;
- full name, strong but not oversized;
- role/workspace, small supporting text;
- notification/account controls on the right.

Avoid redundant headings such as `Celerates ERP`, `PMO Dashboard`, and `Welcome back` stacked together.

### 4.2 Workspace launcher

For a user with one primary business workspace, expose that workspace's **capabilities directly** on Home.

PMO example:

- A.Contract
- Documents
- TM Invoice
- Readiness
- Overtime & Trip

Do not add a PMO tile that merely opens another PMO menu first.

For multi-role/Owner users, showing the accessible top-level business modules is acceptable; the full directory stays under **Modul**.

### 4.3 Launcher visual

A launcher should feel closer to a native app shortcut grid than a dashboard card grid.

- icon first;
- concise label;
- soft module tint;
- generous breathing room;
- direct tap target;
- no unnecessary KPI badges.

Use **3 columns** by default when capability names are medium/long. Four columns are acceptable only for very short labels and sufficient touch width.

Prefer canonical information architecture, but shorten display copy when needed (`Talent Document Tracker` → `Documents`) without changing the underlying route/entity.

### 4.4 Recent activity

Recent activity is secondary. Show at most a few useful items. If there is nothing useful, an empty state is better than invented content.

## 5. Module and record pattern

After Home:

`Home → capability/list → detail → action`

List screens:

- compact search;
- a small number of meaningful tabs/filters;
- cards/rows, not shrunken desktop tables;
- identifier + title + 1–3 facts + status;
- sorting/filtering can live in a bottom sheet.

Detail screens:

- facts first;
- related records/documents after the facts;
- actions only when allowed;
- sticky primary action on mobile when it materially helps;
- Agent may be opened contextually, but it is not the visual hero.

Forms:

- progressive disclosure;
- short forms inline/bottom sheet;
- long workflows split into understandable steps;
- validation must be visible next to the problem.

## 6. Visual language

Continue the existing **Jernih** foundation unless this file is explicitly updated.

### 6.1 Surface

- quiet light background;
- white primary surfaces;
- subtle borders;
- restrained shadow;
- rounded corners used consistently, not decoratively.

### 6.2 Typography

Use Plus Jakarta Sans and clear hierarchy.

- strong headings, not giant headings;
- body copy concise;
- secondary text muted but still accessible;
- avoid uppercase labels except small category/eyebrow use.

### 6.3 Color

Color communicates meaning or module identity.

- blue/accent: active or primary navigation/action;
- green: complete/success;
- amber/orange: waiting/needs follow-up;
- red: error/overdue/needs correction;
- gray: inactive/secondary/unknown.

Do not turn every card into a different saturated color. Prefer soft tinted icon grounds and calm surfaces.

### 6.4 Touch and spacing

- primary touch targets: at least ~44 px;
- leave space between unrelated actions;
- avoid dense rows of tiny controls;
- respect safe-area insets;
- a phone screen should remain understandable at 390 px width.

## 7. What we intentionally avoid

- desktop ERP pages merely made narrower;
- giant brand/title blocks;
- dashboard-first mobile navigation;
- chart walls on operational Home;
- tables as the first mobile representation;
- badges on every icon;
- repeating the same status in several visual forms;
- nested navigation that makes users choose the same role/division twice;
- UI-only authorization assumptions;
- invented metrics or content solely to make a screen look busy.

## 8. Reference hierarchy

When references disagree, use this order for visual/product implementation:

1. current explicit product decision in this `DESIGN.md`;
2. existing implemented Jernih tokens/components;
3. `docs/18-mobile-pwa-shell-directions.md` for mobile architecture and implementation history;
4. external product screenshots only as inspiration, never as assets or exact copies.

Business rules, data contracts, security, and authorization continue to follow their canonical implementation/docs even when a visual reference differs.

## 9. Frontend Lab workflow

`lab/frontend-mobile` is the safe branch for visual exploration.

A UI experiment should:

1. reuse real routes/RBAC/data where practical;
2. avoid schema or business-flow changes unless separately approved;
3. preserve desktop behaviour unless the task explicitly includes desktop;
4. be viewed at phone width before being treated as a pattern;
5. update this file when a new visual rule is intentionally locked.

## 10. Decision log

### 2026-09-30 — Role-shaped Home

Locked for the Frontend Lab:

- keep the existing five-item mobile bottom navigation;
- greeting, identity, role context, and search remain at the top of Home;
- a single-role user's Home exposes that role's capabilities directly;
- PMO is the first reference workspace;
- PMO Home starts with A.Contract, Documents, TM Invoice, Readiness, and Overtime & Trip;
- Home is launcher-first, not `Perlu perhatian`-first;
- attention/review remains available in its dedicated shell destination;
- visual direction: simple, visual, easy, clean, professional.
