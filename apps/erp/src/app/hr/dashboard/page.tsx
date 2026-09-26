import { db } from "@/db";
import { employees, employmentContracts } from "@/db/schema";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { DashboardCard, BarChart, DonutChart, AreaTrendChart, monthlyTrend, countBy, ChartItem } from "@/components/dashboard-charts";
import { LayoutDashboard } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

export default async function HrDashboardPage() {
  const t = await getTranslations("hr.dashboard");
  const [employeeRows, contractRows] = await Promise.all([
    db.select().from(employees),
    db.select().from(employmentContracts),
  ]);

  const backoffice = employeeRows.filter((e) => e.employee_category_code === "backoffice").length;
  const talent = employeeRows.filter((e) => e.employee_category_code === "talent").length;
  const freelance = employeeRows.filter((e) => e.employee_category_code === "freelance").length;

  // Status kontrak 3 kategori (selaras dengan halaman detail employee):
  // aktif (belum H-30), akan habis (<=30 hari lagi), sudah habis (end_date sudah lewat).
  // Kontrak tanpa end_date (mis. PKWTT) dianggap aktif -- tidak ada batas waktu.
  const now = Date.now();
  const in30Days = now + 30 * 24 * 60 * 60 * 1000;
  const contractCategory = (c: (typeof contractRows)[number]) => {
    if (!c.end_date) return "aktif" as const;
    const endTime = new Date(c.end_date).getTime();
    if (endTime < now) return "sudah_habis" as const;
    if (endTime <= in30Days) return "akan_habis" as const;
    return "aktif" as const;
  };
  const expiringSoon = contractRows.filter((c) => contractCategory(c) === "akan_habis").length;
  const sudahHabis = contractRows.filter((c) => contractCategory(c) === "sudah_habis").length;
  const aktifCount = contractRows.length - expiringSoon - sudahHabis;
  const contractStatusItems: ChartItem[] = [
    { label: t("statusActive"), value: aktifCount },
    { label: t("statusExpiringSoon"), value: expiringSoon },
    { label: t("statusExpired"), value: sudahHabis },
  ];

  const byCategory = countBy(employeeRows, (e) => e.employee_category_code);
  const byJobLevel = countBy(employeeRows, (e) => e.job_level_code);

  return (
    <div className="min-h-screen">
      <PageHeader
        icon={LayoutDashboard}
        color="bg-rose-500"
        eyebrow="Human Resources"
        title={t("title")}
        subtitle={t("subtitle")}
      >
        <Link href="/hr" className="text-xs text-brand-500 hover:underline">{t("employeeListLink")} &rarr;</Link>
      </PageHeader>

      <main className="px-8 py-8 space-y-6 max-w-7xl mx-auto">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label={t("statTotalEmployee")} value={employeeRows.length} color="navy" />
          <StatCard label={t("statBackoffice")} value={backoffice} color="indigo" />
          <StatCard label={t("statTalent")} value={talent} color="blue" />
          <StatCard label={t("statFreelance")} value={freelance} color="amber" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label={t("statExpiringSoon")} value={expiringSoon} color="amber" />
          <StatCard label={t("statExpired")} value={sudahHabis} color="red" />
        </div>

        <DashboardCard title={t("newEmployeeTrend")} subtitle={t("last6Months")}>
          <AreaTrendChart items={monthlyTrend(employeeRows.map((e) => e.created_at))} accent="pink" />
        </DashboardCard>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <DashboardCard title={t("contractStatus")} subtitle={t("contractStatusSubtitle")}>
            <DonutChart items={contractStatusItems} />
          </DashboardCard>
          <DashboardCard title={t("employeeByCategory")} subtitle={t("employeeByCategorySubtitle")}>
            <DonutChart items={byCategory} />
          </DashboardCard>
          <DashboardCard title={t("employeeByJobLevel")} subtitle={t("employeeByJobLevelSubtitle")}>
            <BarChart items={byJobLevel} />
          </DashboardCard>
        </div>
      </main>
    </div>
  );
}
