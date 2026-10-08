# Frontend loading and navigation speed

Status: plan (2026-10-08), not built yet. From QA doc page 10: "login, masuk, pindah-pindah tab… harus ada definisi
loading atau optimasi arsitek di frontend agar pengalaman load / pindah tab smooth, cepat, dan indah."

This is not copied from one product. Attio and Jira don't publish their loading rules. The rules here come from
public sources: Next.js's own guidance for the App Router we run on, Atlassian's design system (the team behind
Jira), how Linear and Attio describe their architecture, and NN/g's response-time research. Each one is mapped to
what we have today.

## 1. What we have today (measured in code, 2026-10-08)

| Fact | Effect |
|---|---|
| 112 pages, **0 `loading.tsx` files** anywhere | Every page renders on the server for each user. Next.js prefetches such a page only up to its nearest `loading.tsx`, and we have none. So a click on a menu item shows nothing until the server has rendered the entire new page, and the screen looks frozen. This is the main reason switching tabs feels slow. |
| Pages `await` all their data before rendering anything (e.g. `sales/v2/opportunity-tracker/page.tsx`: all records + sheet sync) | The slowest query sets the time until anything shows. |
| Middleware asks `/api/session-check` (PostgreSQL) on every request, prefetches included (docs/security/02) | This is a deliberate security choice and stays. It adds a fixed cost per navigation, which we should measure, not remove. |
| `staleTimes` not set (Next 15 default: `dynamic: 0`) | Going back to a tab you just left fetches it again from the server. |
| No Web Vitals reporting | We can't say how slow it is, or for whom. |
| 35 `router.refresh()` after saves; Sales V2 already applies edits optimistically | Edits feel fast. Navigation is the weak spot. |

## 2. What the references say

- **Response-time limits (NN/g, Miller 1968 / Nielsen 1993):**
  - Up to 0.1 s feels instant.
  - Up to 1 s, the user notices but keeps their flow.
  - Past 10 s, attention is lost.

  So a click must show some response within about 100 ms, and content should arrive within about 1 s.
- **Next.js (the framework we run):**
  - `loading.js` gives an *instant loading state*. "The Fallback UI is prefetched, making navigation immediate."
    Shared layouts (sidebar, header) stay interactive while the page loads, and navigation can be interrupted.
  - **Caveat:** "If the layout accesses uncached or runtime data… navigation blocks until the layout finishes."
    Our root layout reads `headers()` and the actor. This matters only on a full page load, since client navigations
    keep the root layout, but it must stay that way: no runtime data in the module layouts below it.
  - `useLinkStatus` (Next 15.3+, we have 15.5) shows a small pending hint on the link that was clicked. The docs call
    it "a quick patch". The real fix is `loading.js` plus prefetching.
  - `staleTimes.dynamic` keeps a page in the client cache for N seconds, so Back or returning to a tab is instant.
    It is marked experimental.
  - Suspense streaming: show the page's frame first, then stream in each slow part.
- **Atlassian Design (Jira):**
  - Skeletons reserve the content's space in its real shape, so the page doesn't jump when data arrives. Remove them
    as soon as content is ready.
  - No shimmer for very short loads.
  - Spinners are for short blocking actions (save, submit, sign in); skeletons are for fetched content (lists,
    boards, dashboards).
- **Linear:** keeps the user's data in the browser (IndexedDB) and syncs it in the background, so most clicks need no
  network at all. **Attio** describes the same goal: native-app feel, local storage, real-time sync, and virtualized
  lists. Both took years of engineering. For us this is a direction, not a next step (see §4, phase 4).

## 3. Rules for Celerates (the "definition")

1. **Every click answers within 100 ms.** Navigation shows the module's skeleton (from `loading.tsx`). A button
   shows its own pending state (Crisp `Button` loading or disabled with "Menyimpan…").
2. **Skeletons have the page's real shape:** title, summary cards, toolbar, then rows, cards or columns. When data
   arrives nothing jumps. Plain blocks only, no shimmer; Crisp tokens for color.
3. **Spinners only for blocking actions:** sign in, OTP, save, upload, sync. Never for a page.
4. **Nothing flashes.** A hint that would show for under about 150 ms is delayed (CSS `animation-delay`), as Next.js
   recommends for `useLinkStatus`.
5. **The page's frame comes first; slow parts stream in.** The title and toolbar render immediately. A slow side
   query (sheet-sync status, KPIs) gets its own `<Suspense>` and doesn't hold back the list.
6. **Edits stay optimistic** (as in Sales V2): show the change, save in the background, and undo with a message if
   the save fails.
7. **Login flow:**
   - Sign in, OTP and passkey show a button spinner.
   - After success, the redirect lands on a page whose `loading.tsx` shows at once.
   - No blank white screen at any step.
8. **Measure, then optimise.** Every change in §4 is checked against the numbers from phase 0.

## 4. Steps

| Phase | What | Size | Notes |
|---|---|---|---|
| 0. Measure | `useReportWebVitals` → log LCP, INP and navigation timing per route to our own endpoint. Add server timing for `loadOpportunityWorkspace` and the other loaders and for `/api/session-check`. | small | This gives the baseline; without it, "faster" can't be shown. |
| 1. Instant feedback | `loading.tsx` per module segment (`/sales`, `/sales/v2/*`, `/marketing`, `/ta`, `/pmo`, `/hr`, `/tm`, `/finance`, home) with a skeleton in that module's shape (shared `PageSkeleton` variants: board, table, form, dashboard). Pending hint on sidebar links with `useLinkStatus`, delayed by 120 ms. | medium | This is the biggest gain per line of code: clicks answer at once and prefetching becomes possible. |
| 2. Faster return | `experimental.staleTimes.dynamic: 30`. Saves already call `router.refresh()` / `revalidatePath`, so your own changes still show at once. | one line | Experimental flag: ship with phase 0 numbers, and keep it only if nothing looks stale. |
| 3. Streaming | Split slow page parts into `<Suspense>`. Sales V2 first: records as the frame, sheet sync and KPIs streamed. Load heavy dialogs (full forms, PDF and sheet tools) with `next/dynamic`. | medium | Do it per page, driven by phase 0 numbers. |
| 4. Later, only if needed | A client data cache per module, kept across tabs (e.g. records in memory or IndexedDB with background refresh). This is Linear and Attio's direction. Row virtualization for lists over about 1000 rows. | large | A product decision; not before phases 0–3 are measured. |

## 5. Sources

- Next.js — [loading.js](https://nextjs.org/docs/app/api-reference/file-conventions/loading), [useLinkStatus](https://nextjs.org/docs/app/api-reference/functions/use-link-status), [staleTimes](https://nextjs.org/docs/app/api-reference/config/next-config-js/staleTimes)
- Atlassian Design — [Skeleton usage](https://atlassian.design/components/skeleton/usage)
- NN/g — [Response Time Limits](https://www.nngroup.com/articles/response-times-3-important-limits/)
- Linear — [How's Linear so fast?](https://performance.dev/how-is-linear-so-fast-a-technical-breakdown), [reverse-engineered sync engine](https://github.com/wzhudev/reverse-linear-sync-engine)
- Attio — [Engineering blog](https://attio.com/engineering/blog), [Where's the technical challenge in CRM anyway?](https://attio.com/engineering/blog/where-s-the-technical-challenge-in-crm-anyway-)
