import { db } from "@/db";
import { sheetConnections } from "@/db/schema";
import { eq } from "drizzle-orm";
import { connectSheet } from "./actions";
import { TARGET_FIELDS } from "./target-fields";
import { SyncButtons } from "./sync-buttons";
import { MappingSection } from "./mapping-section";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { getTranslations } from "next-intl/server";

export default async function HRSheetSyncPage() {
  const t = await getTranslations("hr.sheetSync.page");
  const [connection] = await db.select().from(sheetConnections).where(eq(sheetConnections.division_key, "hr_employees"));
  const savedMapping = connection?.column_mapping ? JSON.parse(connection.column_mapping) : {};

  return (
    <div className="min-h-screen">
      <PageHeader
        icon={RefreshCw} color="bg-rose-500" eyebrow="Human Resources" title={t("title")}
        subtitle={t("subtitle")}
      >
        <Link href="/hr" className="text-sm font-medium text-rose-700 hover:underline">&larr; {t("backToEmployee")}</Link>
      </PageHeader>

      <main className="px-8 py-8 max-w-2xl mx-auto space-y-6">
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-slate-700">
            {connection ? t("sheetConnected") : t("connectSheet")}
          </h2>
          {connection && (
            <div className="mb-4 rounded-lg bg-green-50 border border-green-100 px-4 py-3 text-sm">
              <p className="text-green-800">{t("connectedTo")}: <Link href={connection.spreadsheet_url} target="_blank" className="underline">{connection.spreadsheet_url}</Link></p>
              <p className="text-xs text-green-600 mt-1">{t("sheetLabel")}: {connection.sheet_name}</p>
            </div>
          )}
          <form action={connectSheet} className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">{t("googleSheetLink")}</span>
              <input name="spreadsheet_url" required placeholder="https://docs.google.com/spreadsheets/d/..." defaultValue={connection?.spreadsheet_url ?? ""} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">{t("sheetTabName")}</span>
              <input name="sheet_name" defaultValue={connection?.sheet_name ?? "Sheet1"} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </label>
            <button type="submit" className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
              {connection ? t("updateConnection") : t("connect")}
            </button>
          </form>
        </section>

        {connection && (
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-2 text-sm font-semibold text-slate-700">{t("mapColumns")}</h2>
            <p className="text-xs text-slate-500 mb-4">{t("mapColumnsDescription")}</p>
            <MappingSection targetFields={TARGET_FIELDS} savedMapping={savedMapping} />
          </section>
        )}

        {connection && connection.column_mapping && (
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-2 text-sm font-semibold text-slate-700">{t("synchronization")}</h2>
            <SyncButtons />
          </section>
        )}
      </main>
    </div>
  );
}