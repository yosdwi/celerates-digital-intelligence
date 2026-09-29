import { db } from "@/db";
import { requisitions, candidates, applications, onboardingRequests } from "@/db/schema";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { DashboardCard, BarChart, DonutChart, ProgressRing, AreaTrendChart, monthlyTrend, countBy } from "@/components/dashboard-charts";
import { LayoutDashboard } from "lucide-react";
import Link from "next/link";

export default async function TaDashboardPage() {
  const t = await getTranslations("ta.dashboard");
  const [requisitionRows, candidateRows, applicationRows, onboardingRows] = await Promise.all([
    db.select().from(requisitions),
    db.select().from(candidates),
    db.select().from(applications),
    db.select().from(onboardingRequests),
  ]);

  const totalHeadcount = requisitionRows.reduce((sum, r) => sum + (r.headcount_target ?? 0), 0);
  const rejectedOrWithdrawn = applicationRows.filter(
    (a) => a.hiring_status_code.startsWith("reject_") || a.hiring_status_code.startsWith("failed_") || a.hiring_status_code.startsWith("withdraw_")
  ).length;
  const activePipeline = applicationRows.length - rejectedOrWithdrawn;
  const activePipelineRate = applicationRows.length > 0 ? Math.round((activePipeline / applicationRows.length) * 100) : 0;

  const byPriority = countBy(requisitionRows, (r) => r.priority_code);
  const byHiringStatus = countBy(applicationRows, (a) => a.hiring_status_code);

  return (
    <div className="min-h-screen">
      <PageHeader
        icon={LayoutDashboard}
        color="bg-amber-500"
        eyebrow="Talent Acquisition"
        title="Dashboard"
        subtitle={t("subtitle")}
      >
        <Link href="/ta" className="text-xs text-brand-500 hover:underline">Requisition &rarr;</Link>
        <Link href="/ta/pipeline" className="text-xs text-brand-500 hover:underline">Hiring Pipeline &rarr;</Link>
      </PageHeader>

      <main className="px-8 py-8 space-y-6 max-w-7xl mx-auto">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label="Open Requisition" value={requisitionRows.length} color="navy" />
          <StatCard label="Total Headcount" value={totalHeadcount} color="amber" />
          <StatCard label="Total Candidate" value={candidateRows.length} color="indigo" />
          <StatCard label="Active Pipeline" value={activePipeline} color="green" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label={t("onboardingSubmitted")} value={onboardingRows.length} color="purple" />
        </div>

        <DashboardCard title={t("incomingApplicationsTrend")} subtitle={t("last6Months")}>
          <AreaTrendChart items={monthlyTrend(applicationRows.map((a) => a.created_at))} accent="orange" />
        </DashboardCard>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <DashboardCard title="Pipeline Health" subtitle={t("pipelineHealthSubtitle")}>
            <ProgressRing percent={activePipelineRate} label={t("activePipelineLabel", { active: activePipeline, total: applicationRows.length })} />
          </DashboardCard>
          <DashboardCard title="Hiring Pipeline by Status" subtitle={t("hiringPipelineByStatusSubtitle")}>
            <BarChart items={byHiringStatus} />
          </DashboardCard>
          <DashboardCard title="Requisition by Priority" subtitle={t("requisitionByPrioritySubtitle")}>
            <DonutChart items={byPriority} />
          </DashboardCard>
        </div>
      </main>
    </div>
  );
}
