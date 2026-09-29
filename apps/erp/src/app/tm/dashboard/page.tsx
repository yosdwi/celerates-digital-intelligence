import { db } from "@/db";
import { talentAssignments, extensionIncrementRequests } from "@/db/schema";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { DashboardCard, BarChart, DonutChart, ProgressRing, AreaTrendChart, monthlyTrend, countBy } from "@/components/dashboard-charts";
import { LayoutDashboard } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

export default async function TmDashboardPage() {
  const t = await getTranslations("tm.dashboard");
  const [assignmentRows, extensionRows] = await Promise.all([
    db.select().from(talentAssignments),
    db.select().from(extensionIncrementRequests),
  ]);

  const onProject = assignmentRows.filter((a) => a.status_code === "on_project").length;
  const idle = assignmentRows.filter((a) => a.status_code === "idle").length;
  const out = assignmentRows.filter((a) => a.status_code === "out").length;
  const pendingExtension = extensionRows.filter((e) => e.status_code === "pending").length;

  const onProjectRate = assignmentRows.length > 0 ? Math.round((onProject / assignmentRows.length) * 100) : 0;

  const byStatus = countBy(assignmentRows, (a) => a.status_code);
  const byTrack = countBy(assignmentRows, (a) => a.talent_track_code);

  return (
    <div className="min-h-screen">
      <PageHeader
        icon={LayoutDashboard}
        color="bg-sky-500"
        eyebrow="Talent Management"
        title="Dashboard"
        subtitle={t("subtitle")}
      >
        <Link href="/tm" className="text-xs text-brand-500 hover:underline">Talents Book &rarr;</Link>
        <Link href="/tm/extension-requests" className="text-xs text-brand-500 hover:underline">Extension Request &rarr;</Link>
      </PageHeader>

      <main className="px-8 py-8 space-y-6 max-w-7xl mx-auto">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label="Total Assignment" value={assignmentRows.length} color="navy" />
          <StatCard label="On Project" value={onProject} color="green" />
          <StatCard label="Idle" value={idle} color="amber" />
          <StatCard label="Out" value={out} color="red" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label="Extension Request Pending" value={pendingExtension} color="purple" />
        </div>

        <DashboardCard title={t("newAssignmentTrend")} subtitle={t("last6Months")}>
          <AreaTrendChart items={monthlyTrend(assignmentRows.map((a) => a.created_at))} accent="emerald" />
        </DashboardCard>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <DashboardCard title="On Project Rate" subtitle={t("onProjectRateSubtitle")}>
            <ProgressRing percent={onProjectRate} label={t("onProjectRateLabel", { onProject, total: assignmentRows.length })} />
          </DashboardCard>
          <DashboardCard title="Assignment by Status" subtitle={t("byStatusSubtitle")}>
            <BarChart items={byStatus} />
          </DashboardCard>
          <DashboardCard title="Assignment by Talent Track" subtitle={t("byTrackSubtitle")}>
            <DonutChart items={byTrack} />
          </DashboardCard>
        </div>
      </main>
    </div>
  );
}
