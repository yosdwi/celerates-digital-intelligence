import { getTranslations } from "next-intl/server";
import { db } from "@/db";
import { opportunities, salesOpportunityTrackers } from "@/db/schema";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { DashboardCard, BarChart, DonutChart, ProgressRing, AreaTrendChart, monthlyTrend, countBy } from "@/components/dashboard-charts";
import { LayoutDashboard } from "lucide-react";
import Link from "next/link";

export default async function SalesDashboardPage() {
  const t = await getTranslations("sales.dashboard");
  const [optyRows, trackerRows] = await Promise.all([
    db.select().from(opportunities),
    db.select().from(salesOpportunityTrackers),
  ]);

  const totalPq = optyRows.length;
  const totalTracker = trackerRows.length;
  const won = optyRows.filter((o) => o.pipeline_stage_code === "win").length;
  const pipelineValue = optyRows
    .filter((o) => o.pipeline_stage_code === "on_going")
    .reduce((sum, o) => sum + (o.price_amount ?? 0), 0);

  const winRate = totalPq > 0 ? Math.round((won / totalPq) * 100) : 0;

  const byStage = countBy(optyRows, (o) => o.pipeline_stage_code);
  const byTrackerStatus = countBy(trackerRows, (t) => t.opty_status_code);

  return (
    <div className="min-h-screen">
      <PageHeader
        icon={LayoutDashboard}
        color="bg-blue-500"
        eyebrow="Sales"
        title="Dashboard"
        subtitle={t("subtitle")}
      >
        <Link href="/sales/opportunity-tracker" className="text-xs text-brand-500 hover:underline">Opportunity Tracker &rarr;</Link>
        <Link href="/sales" className="text-xs text-brand-500 hover:underline">PQ Tracker &rarr;</Link>
      </PageHeader>

      <main className="px-8 py-8 space-y-6 max-w-7xl mx-auto">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label="Total Opportunity Tracker" value={totalTracker} color="navy" />
          <StatCard label="Total PQ Tracker" value={totalPq} color="indigo" />
          <StatCard label="Win" value={won} color="green" />
          <StatCard label={t("pipelineValue")} value={`Rp ${pipelineValue.toLocaleString("id-ID")}`} color="blue" />
        </div>

        <DashboardCard title={t("trendTitle")} subtitle={t("last6Months")}>
          <AreaTrendChart items={monthlyTrend(optyRows.map((o) => o.created_at))} accent="blue" />
        </DashboardCard>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <DashboardCard title="Win Rate" subtitle={t("winRateSubtitle")}>
            <ProgressRing percent={winRate} label={t("winRateLabel", { won, total: totalPq })} />
          </DashboardCard>
          <DashboardCard title="PQ Tracker by Pipeline Stage" subtitle={t("byStageSubtitle")}>
            <DonutChart items={byStage} />
          </DashboardCard>
          <DashboardCard title="Opportunity Tracker by Status" subtitle={t("byStatusSubtitle")}>
            <BarChart items={byTrackerStatus} />
          </DashboardCard>
        </div>
      </main>
    </div>
  );
}
