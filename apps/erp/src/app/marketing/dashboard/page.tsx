import { db } from "@/db";
import { leads } from "@/db/schema";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { DashboardCard, BarChart, DonutChart, ProgressRing, AreaTrendChart, monthlyTrend, countBy } from "@/components/dashboard-charts";
import { LayoutDashboard } from "lucide-react";
import Link from "next/link";

export default async function MarketingDashboardPage() {
  const t = await getTranslations("marketing");
  const rows = await db.select().from(leads);

  const total = rows.length;
  const qualified = rows.filter((r) => r.is_qualified === true).length;
  const disqualified = rows.filter((r) => r.is_qualified === false).length;
  const conversionRate = total > 0 ? Math.round((qualified / total) * 100) : 0;

  const bySource = countBy(rows, (r) => r.lead_source_code);
  const byServiceType = countBy(rows, (r) => r.service_type_code);

  return (
    <div className="min-h-screen">
      <PageHeader
        icon={LayoutDashboard}
        color="bg-brand-500"
        eyebrow="Marketing"
        title="Dashboard"
        subtitle={t("dashboardSubtitle")}
      >
        <Link href="/marketing" className="text-xs text-brand-500 hover:underline">{t("viewLeadsList")} &rarr;</Link>
      </PageHeader>

      <main className="px-8 py-8 space-y-6 max-w-7xl mx-auto">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label="Total Leads" value={total} color="navy" />
          <StatCard label="Qualified" value={qualified} color="green" />
          <StatCard label="Disqualified" value={disqualified} color="red" />
          <StatCard label="Conversion Rate" value={`${conversionRate}%`} color="indigo" />
        </div>

        <DashboardCard title={t("incomingLeadsTrend")} subtitle={t("last6Months")}>
          <AreaTrendChart items={monthlyTrend(rows.map((r) => r.created_at))} accent="violet" />
        </DashboardCard>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <DashboardCard title="Conversion Rate" subtitle={t("conversionRateSubtitle")}>
            <ProgressRing percent={conversionRate} label={t("qualifiedOfTotal", { qualified, total })} />
          </DashboardCard>
          <DashboardCard title="Leads by Source" subtitle={t("leadsBySourceSubtitle")}>
            <BarChart items={bySource} />
          </DashboardCard>
          <DashboardCard title="Leads by Service Type" subtitle={t("leadsByServiceTypeSubtitle")}>
            <DonutChart items={byServiceType} />
          </DashboardCard>
        </div>
      </main>
    </div>
  );
}
