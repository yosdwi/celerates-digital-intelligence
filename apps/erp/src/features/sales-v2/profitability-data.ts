import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { profitabilityEntries } from "@/db/schema";
import { periodKey, type Period, type ProfitRow } from "./profitability-model";

/** A period's rows exactly as V1 reads them (margin highest first), each with its talent's other synced periods. */
export async function loadProfitability(p: Period): Promise<ProfitRow[]> {
  const t = profitabilityEntries;
  const rows = await db.select().from(t)
    .where(and(eq(t.period_year, p.year), eq(t.period_month, p.month)))
    .orderBy(desc(t.margin_amount));
  const history = rows.length
    ? await db.select({ id: t.talent_assignment_id, year: t.period_year, month: t.period_month, margin: t.margin_amount, pct: t.margin_percent })
      .from(t).where(inArray(t.talent_assignment_id, rows.map((r) => r.talent_assignment_id)))
      .orderBy(desc(t.period_year), desc(t.period_month))
    : [];
  return rows.map((r) => ({
    id: r.id,
    assignmentId: r.talent_assignment_id,
    talent: r.talent_name,
    client: r.client_name,
    role: r.role,
    price: r.price_amount,
    cogs: r.cogs_amount,
    margin: r.margin_amount,
    marginPct: r.margin_percent,
    syncedBy: r.generated_by_name,
    syncedAt: r.updated_at.toISOString(),
    trend: history
      .filter((h) => h.id === r.talent_assignment_id && !(h.year === p.year && h.month === p.month))
      .slice(0, 12)
      .map((h) => ({ period: periodKey(h), margin: h.margin, marginPct: h.pct })),
  }));
}
