// Tinjau items owned by ConForm (doc 21 §7): Talent attendance corrections (PMO editor+) and draft reminder
// campaigns awaiting approval (PMO full). ConForm is read live; if it is unreachable Tinjau still shows ERP items.
import { divisionLevel } from "@/lib/module-access";
import { conform, conformConfigured, type CampaignSummary, type Correction } from "@/lib/conform/client";
import type { ReviewActor, ReviewItem } from "./queue";

export async function conformReviewItems(actor: ReviewActor): Promise<{ items: ReviewItem[]; unavailable: boolean }> {
  const level = divisionLevel(actor, "pmo");
  if (!conformConfigured() || (level !== "editor" && level !== "full")) return { items: [], unavailable: false };
  try {
    const [corrections, campaigns] = await Promise.all([
      conform.get<{ items: Correction[] }>("/attendance-corrections", { timeoutMs: 8000 }),
      level === "full" ? conform.get<{ items: CampaignSummary[] }>("/campaigns?limit=20", { timeoutMs: 8000 }) : Promise.resolve({ items: [] as CampaignSummary[] }),
    ]);
    const items: ReviewItem[] = [
      ...corrections.items.map((c) => ({
        key: `correction:${c.id}`,
        kind: "correction" as const,
        id: c.id,
        href: `/review/correction/${c.id}`,
        module: "pmo",
        title: c.name ?? c.employee_id,
        subtitle: c.resolution_type,
        requester: null,
        since: c.submitted_at ?? new Date().toISOString(),
        meta: { work_date: c.work_date, type: c.resolution_type, reviewable: c.reviewable ? 1 : 0, start: c.work_date },
      })),
      ...campaigns.items
        .filter((c) => c.state === "draft")
        .map((c) => ({
          key: `campaign:${c.id}`,
          kind: "campaign" as const,
          id: c.id,
          href: `/review/campaign/${c.id}`,
          module: "pmo",
          title: c.cycle.label,
          subtitle: null,
          requester: c.created_by.replace(/^celerates:/, "").replace(/ <.*>$/, ""),
          since: c.created_at,
          meta: { recipients: Object.values(c.counts).reduce((a, b) => a + b, 0) },
        })),
    ];
    return { items, unavailable: false };
  } catch {
    return { items: [], unavailable: true };
  }
}
