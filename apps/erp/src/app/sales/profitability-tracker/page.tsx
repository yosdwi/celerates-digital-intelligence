import { getTranslations } from "next-intl/server";
import { db } from "@/db";
import { profitabilityEntries } from "@/db/schema";
import { and, eq, desc } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { DashboardCard, BarChart, type ChartItem } from "@/components/dashboard-charts";
import { ProfitabilityTable } from "./profitability-table";
import { LineChart } from "lucide-react";

function amountToJuta(v: number): number {
  return Math.round((v / 1_000_000) * 10) / 10;
}

function topByGroup(rows: { key: string; value: number }[], limit = 8): ChartItem[] {
  const totals = new Map<string, number>();
  for (const r of rows) totals.set(r.key, (totals.get(r.key) ?? 0) + r.value);
  return Array.from(totals.entries())
    .map(([label, value]) => ({ label, value: amountToJuta(value) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

export default async function ProfitabilityTrackerPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const t = await getTranslations("sales.profitabilityTracker");
  const MONTH_NAMES_ID = t.raw("months") as string[];
  const params = await searchParams;
  const now = new Date();
  const year = Number(params.year) || now.getFullYear();
  const month = Number(params.month) || now.getMonth() + 1;

  const rows = await db
    .select()
    .from(profitabilityEntries)
    .where(and(eq(profitabilityEntries.period_year, year), eq(profitabilityEntries.period_month, month)))
    .orderBy(desc(profitabilityEntries.margin_amount));

  const totalPrice = rows.reduce((sum, r) => sum + r.price_amount, 0);
  const totalCogs = rows.reduce((sum, r) => sum + r.cogs_amount, 0);
  const totalMargin = rows.reduce((sum, r) => sum + r.margin_amount, 0);
  const avgMarginPercent = totalPrice ? (totalMargin / totalPrice) * 100 : 0;

  const marginByClient = topByGroup(rows.map((r) => ({ key: r.client_name, value: r.margin_amount })));
  const marginByRole = topByGroup(rows.map((r) => ({ key: r.role ?? "Lainnya", value: r.margin_amount })));

  const monthOptions = MONTH_NAMES_ID.map((label, idx) => ({ value: idx + 1, label }));
  const yearOptions = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i);

  return (
    <div className="min-h-screen">
      <PageHeader
        icon={LineChart}
        color="bg-blue-500"
        eyebrow="Sales x TM x PMO"
        title="Profitability Tracker"
        subtitle={t("subtitle")}
      >
        <form method="GET" className="flex items-center gap-2">
          <select name="month" defaultValue={month} className="rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-sm transition-colors focus:border-violet-400 focus:outline-none">
            {monthOptions.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          <select name="year" defaultValue={year} className="rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-sm transition-colors focus:border-violet-400 focus:outline-none">
            {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <button type="submit" className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-900">{t("show")}</button>
        </form>
      </PageHeader>

      <main className="px-8 py-8 space-y-6 max-w-7xl mx-auto">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label={`Total Price (${MONTH_NAMES_ID[month - 1]} ${year})`} value={`Rp ${totalPrice.toLocaleString("id-ID")}`} color="navy" />
          <StatCard label="Total COGS" value={`Rp ${totalCogs.toLocaleString("id-ID")}`} color="amber" />
          <StatCard label="Total Margin" value={`Rp ${totalMargin.toLocaleString("id-ID")}`} color={totalMargin < 0 ? "red" : "green"} />
          <StatCard label={t("avgMarginPercent")} value={`${avgMarginPercent.toFixed(1)}%`} color="blue" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <DashboardCard title="Margin per Client" subtitle={t("inMillionsTop", { n: 8, group: t("client") })}>
            <BarChart items={marginByClient} />
          </DashboardCard>
          <DashboardCard title="Margin per Role" subtitle={t("inMillionsTop", { n: 8, group: t("role") })}>
            <BarChart items={marginByRole} />
          </DashboardCard>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <ProfitabilityTable
            data={rows.map((r) => ({
              id: r.id,
              talent_name: r.talent_name,
              client_name: r.client_name,
              role: r.role,
              price_amount: r.price_amount,
              cogs_amount: r.cogs_amount,
              margin_amount: r.margin_amount,
              margin_percent: r.margin_percent,
              generated_by_name: r.generated_by_name,
            }))}
            year={year}
            month={month}
          />
        </div>
      </main>
    </div>
  );
}
