import { getTranslations } from "next-intl/server";
import { db } from "@/db";
import { crmClients } from "@/db/schema";
import { desc } from "drizzle-orm";
import Link from "next/link";
import { Building2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { AddRecordModal } from "@/components/add-record-modal";
import { Field, SelectField } from "@/components/form-fields";
import { GridCard, pickAccent } from "@/components/grid-card";
import { Avatar } from "@/components/avatar";
import { Pill, type PillVariant } from "@/components/pill";
import { getAccountStatsMap } from "@/lib/crm";
import { createClient } from "./actions";

const STATUS_OPTIONS = [["prospect", "Prospect"], ["active", "Active"], ["dormant", "Dormant"]] as const;
const STATUS_VARIANT: Record<string, PillVariant> = { active: "success", prospect: "warning", dormant: "neutral" };

export default async function AccountsPage() {
  const t = await getTranslations("crm");
  const clients = await db.select().from(crmClients).orderBy(desc(crmClients.created_at));
  const statsMap = await getAccountStatsMap(clients.map((c) => c.name));

  const totalActiveOpportunity = clients.reduce((sum, c) => sum + (statsMap.get(c.name)?.activeOpportunityCount ?? 0), 0);
  const totalContractValue = clients.reduce((sum, c) => sum + (statsMap.get(c.name)?.monthlyContractValue ?? 0), 0);
  const needFollowUp = clients.filter((c) => c.status_code === "prospect").length;

  return (
    <div className="min-h-screen">
      <PageHeader icon={Building2} color="bg-blue-500" eyebrow="Sales & Marketing · CRM" title={t("accountListTitle")} subtitle={t("accountListSubtitle")} />

      <main className="px-8 py-8 space-y-8 max-w-7xl mx-auto">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label={t("statTotalAccount")} value={clients.length} color="slate" />
          <StatCard label={t("statActiveOpportunity")} value={totalActiveOpportunity} color="blue" />
          <StatCard label={t("statTotalContractValue")} value={`Rp ${totalContractValue.toLocaleString("id-ID")}`} color="green" />
          <StatCard label={t("statNeedFollowUp")} value={needFollowUp} color="red" />
        </div>

        <div className="flex justify-end">
          <AddRecordModal buttonLabel={t("addAccount")} title={t("addAccount")} action={createClient}>
            <Field label={t("fieldClientName")} name="name" required />
            <Field label={t("fieldIndustry")} name="industry" />
            <SelectField label={t("fieldStatus")} name="status_code" options={STATUS_OPTIONS} defaultValue="prospect" />
            <div className="sm:col-span-3">
              <Field label={t("fieldNotes")} name="notes" textarea />
            </div>
          </AddRecordModal>
        </div>

        {clients.length === 0 ? (
          <p className="text-center text-sm text-slate-400 py-16">{t("noAccountsYet")}</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {clients.map((client, i) => {
              const stats = statsMap.get(client.name);
              return (
                <GridCard key={client.id} accent={pickAccent(i)}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Avatar name={client.name} />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate">{client.name}</p>
                        <p className="text-xs text-slate-400 truncate">{client.industry ?? t("noIndustry")}</p>
                      </div>
                    </div>
                    <Pill variant={STATUS_VARIANT[client.status_code] ?? "neutral"}>{STATUS_OPTIONS.find(([v]) => v === client.status_code)?.[1] ?? client.status_code}</Pill>
                  </div>
                  <div className="mt-3 space-y-1.5 text-sm">
                    <div className="flex justify-between gap-2"><span className="text-slate-400">{t("activeOpportunityCol")}</span><span className="text-slate-700 text-right">{stats?.activeOpportunityCount ?? 0}</span></div>
                    <div className="flex justify-between gap-2"><span className="text-slate-400">{t("contractValueCol")}</span><span className="text-slate-700 text-right">{stats && stats.monthlyContractValue > 0 ? `Rp ${stats.monthlyContractValue.toLocaleString("id-ID")}/bln` : "-"}</span></div>
                  </div>
                  <div className="mt-auto pt-3 border-t border-slate-100 flex items-center gap-2">
                    <Link href={`/sales/accounts/${client.id}`} className="text-xs font-medium text-slate-600 hover:text-slate-900">{t("viewDetail")}</Link>
                  </div>
                </GridCard>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
