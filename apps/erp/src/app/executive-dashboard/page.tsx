import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import {
  leads, opportunities, requisitions, employees, talentAssignments,
  projectContracts, projectInvoices, financeDocumentHandoffs,
} from "@/db/schema";
import { desc } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { DashboardCard, DonutChart, BarChart, AreaTrendChart, monthlyTrend, countBy, prettify } from "@/components/dashboard-charts";
import { Pill, type PillVariant } from "@/components/pill";
import { getTranslations } from "next-intl/server";
import {
  Gauge, Megaphone, TrendingUp, Users, UserCog, Briefcase as BriefcaseIcon, FileSpreadsheet, Landmark, ArrowRight,
  Target, Wallet, FileCheck2, Briefcase,
} from "lucide-react";
import Link from "next/link";

const RECENT_REQ_VARIANT: Record<string, PillVariant> = {
  open: "info", in_progress: "warning", fulfilled: "success", closed: "neutral", cancelled: "critical",
};

export default async function ExecutiveDashboardPage() {
  const t = await getTranslations("executiveDashboard");
  const session = await getServerSession(authOptions);
  if (!session?.user || !(session.user as any).isOwner) {
    redirect("/");
  }

  const [leadRows, optyRows, allRequisitions, employeeRows, assignmentRows, contractRows, invoiceRows, handoffRows, recentRequisitions] = await Promise.all([
    db.select().from(leads),
    db.select().from(opportunities),
    db.select().from(requisitions),
    db.select().from(employees),
    db.select().from(talentAssignments),
    db.select().from(projectContracts),
    db.select().from(projectInvoices),
    db.select().from(financeDocumentHandoffs),
    db.select().from(requisitions).orderBy(desc(requisitions.opty_request_date)).limit(6),
  ]);

  const pipelineValue = optyRows.filter((o) => o.pipeline_stage_code === "on_going").reduce((s, o) => s + (o.price_amount ?? 0), 0);
  const contractValue = contractRows.reduce((s, c) => s + (c.total_value_amount ?? 0), 0);
  const totalHeadcount = allRequisitions.reduce((s, r) => s + (r.headcount_target ?? 0), 0);
  const trend = monthlyTrend(leadRows.map((l) => l.created_at));

  const quickModules = [
    { key: "marketing", label: "Marketing", icon: Megaphone, color: "bg-brand-500", href: "/marketing/dashboard" },
    { key: "sales", label: "Sales", icon: TrendingUp, color: "bg-blue-500", href: "/sales/dashboard" },
    { key: "ta", label: "Talent Acquisition", icon: Users, color: "bg-amber-500", href: "/ta/dashboard" },
    { key: "hr", label: "Human Resources", icon: UserCog, color: "bg-rose-500", href: "/hr/dashboard" },
    { key: "tm", label: "Talent Management", icon: BriefcaseIcon, color: "bg-sky-500", href: "/tm/dashboard" },
    { key: "pmo", label: "PMO", icon: FileSpreadsheet, color: "bg-violet-500", href: "/pmo/dashboard" },
    { key: "finance", label: "Finance", icon: Landmark, color: "bg-emerald-600", href: "/finance" },
  ];

  return (
    <div className="min-h-screen">
      <PageHeader
        icon={Gauge}
        color="bg-slate-800"
        eyebrow="Executive"
        title="Executive Dashboard"
        subtitle={t("subtitle")}
      />

      <main className="px-8 py-8 max-w-7xl mx-auto space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-5">
          <StatCard label={t("statTotalLeads")} value={leadRows.length} color="indigo" />
          <StatCard label={t("statPipelineValue")} value={`Rp ${pipelineValue.toLocaleString("id-ID")}`} color="blue" />
          <StatCard label={t("statTotalHeadcount")} value={totalHeadcount} color="pink" />
          <StatCard label={t("statContractValue")} value={`Rp ${contractValue.toLocaleString("id-ID")}`} color="orange" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          <div className="lg:col-span-3 rounded-2xl border border-white/70 bg-white/75 backdrop-blur-xl shadow-[0_1px_2px_rgba(15,23,42,0.04),0_16px_32px_-16px_rgba(15,23,42,0.12)] p-6">
            <div className="flex items-center justify-between mb-1">
              <div>
                <p className="text-sm font-semibold text-slate-800">{t("trendLeadsTitle")}</p>
                <p className="text-xs text-slate-400">{t("last6Months")} &middot; Marketing</p>
              </div>
              <p className="text-2xl font-extrabold text-slate-900 [font-variant-numeric:tabular-nums]">{leadRows.length}</p>
            </div>
            <div className="mt-3">
              <AreaTrendChart items={trend} accent="violet" />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-5 border-t border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0"><Target className="h-4 w-4" /></div>
                <div><p className="text-sm font-bold text-slate-900">{optyRows.filter((o) => o.pipeline_stage_code === "win").length}</p><p className="text-[11px] text-slate-400">{t("optyWin")}</p></div>
              </div>
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-rose-50 text-rose-700 flex items-center justify-center shrink-0"><Wallet className="h-4 w-4" /></div>
                <div><p className="text-sm font-bold text-slate-900">{invoiceRows.filter((i) => i.status_code === "overdue").length}</p><p className="text-[11px] text-slate-400">{t("invoiceOverdue")}</p></div>
              </div>
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center shrink-0"><FileCheck2 className="h-4 w-4" /></div>
                <div><p className="text-sm font-bold text-slate-900">{handoffRows.filter((h) => h.status_code === "notified").length}</p><p className="text-[11px] text-slate-400">{t("completeDocuments")}</p></div>
              </div>
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center shrink-0"><Briefcase className="h-4 w-4" /></div>
                <div><p className="text-sm font-bold text-slate-900">{assignmentRows.filter((a) => a.status_code === "on_project").length}</p><p className="text-[11px] text-slate-400">{t("onProject")}</p></div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-2 rounded-2xl border border-white/70 bg-white/75 backdrop-blur-xl shadow-[0_1px_2px_rgba(15,23,42,0.04),0_16px_32px_-16px_rgba(15,23,42,0.12)] p-6">
            <p className="text-sm font-semibold text-slate-800 mb-4">{t("analyticsPipeline")}</p>
            <DonutChart items={countBy(optyRows, (o) => o.pipeline_stage_code)} />
            <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>{t("totalEmployee")}</span>
              <span className="font-bold text-slate-900">{employeeRows.length}</span>
            </div>
          </div>
        </div>

        <div>
          <p className="text-sm font-semibold text-slate-800 mb-3">{t("moduleSummary")}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            <DashboardCard title={t("leadsBySource")} subtitle="Marketing">
              <BarChart items={countBy(leadRows, (l) => l.lead_source_code)} />
            </DashboardCard>
            <DashboardCard title={t("statusRequisition")} subtitle="Talent Acquisition">
              <BarChart items={countBy(allRequisitions, (r) => r.opty_status_code)} />
            </DashboardCard>
            <DashboardCard title={t("employeeCategory")} subtitle="Human Resources">
              <DonutChart items={countBy(employeeRows, (e) => e.employee_category_code)} />
            </DashboardCard>
            <DashboardCard title={t("statusTalentAssignment")} subtitle="Talent Management">
              <BarChart items={countBy(assignmentRows, (a) => a.status_code)} />
            </DashboardCard>
            <DashboardCard title={t("statusInvoice")} subtitle="PMO">
              <DonutChart items={countBy(invoiceRows, (i) => i.status_code)} />
            </DashboardCard>
            <DashboardCard title={t("financeHandoff")} subtitle="Finance">
              <BarChart items={countBy(handoffRows, (h) => h.status_code)} />
            </DashboardCard>
          </div>
        </div>

        <div className="rounded-2xl border border-white/70 bg-white/75 backdrop-blur-xl shadow-[0_1px_2px_rgba(15,23,42,0.04),0_16px_32px_-16px_rgba(15,23,42,0.12)] overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-800">{t("recentRequisitions")}</p>
            <Link href="/ta" className="text-xs font-medium text-violet-600 hover:text-violet-800 flex items-center gap-1">
              {t("viewAll")} <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 border-b border-violet-100 bg-violet-50">
                <th className="px-6 py-3">{t("position")}</th>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Headcount</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {recentRequisitions.length === 0 && (
                <tr><td colSpan={4} className="px-6 py-8 text-center text-slate-400">{t("noRequisitions")}</td></tr>
              )}
              {recentRequisitions.map((r) => (
                <tr key={r.id} className="border-b border-slate-50 last:border-0 hover:bg-violet-50/60 transition-colors">
                  <td className="px-6 py-3 font-medium text-slate-900">{r.position_name}</td>
                  <td className="px-4 py-3 text-slate-600">{r.client_name}</td>
                  <td className="px-4 py-3 text-slate-600">{r.headcount_target}</td>
                  <td className="px-4 py-3">
                    <Pill variant={RECENT_REQ_VARIANT[r.opty_status_code ?? ""] ?? "neutral"}>{prettify(r.opty_status_code)}</Pill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div>
          <p className="text-sm font-semibold text-slate-800 mb-3">{t("openModuleDashboard")}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {quickModules.map((mod) => {
              const Icon = mod.icon;
              return (
                <Link
                  key={mod.key}
                  href={mod.href}
                  className="group rounded-2xl border border-white/70 bg-white/75 backdrop-blur-xl p-4 flex items-center gap-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:shadow-[0_12px_24px_-12px_rgba(15,23,42,0.16)] hover:-translate-y-0.5 transition-all duration-200"
                >
                  <div className={`h-9 w-9 rounded-xl ${mod.color} flex items-center justify-center shrink-0`}>
                    <Icon className="h-4 w-4 text-white" />
                  </div>
                  <p className="text-sm font-semibold text-slate-800 flex-1">{mod.label}</p>
                  <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-slate-500 group-hover:translate-x-0.5 transition-all" />
                </Link>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}
