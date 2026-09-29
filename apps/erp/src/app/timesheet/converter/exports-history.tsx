import { getTranslations } from "next-intl/server";
import type { AttachmentWithUrl } from "@/lib/attachments";

export type ExportHistoryRow = {
  id: string;
  talent_label: string;
  client_name: string | null;
  period_label: string;
  total_hours: number;
  total_md: number;
  generated_by_name: string;
  created_at: Date;
  attachments: AttachmentWithUrl[];
};

/** Setara tab "List Timesheet" di proyek timesheet-converter lama -- riwayat file .xlsx yang sudah pernah digenerate, dengan link download (signed URL Supabase Storage). */
export async function ExportsHistory({ data }: { data: ExportHistoryRow[] }) {
  const t = await getTranslations("timesheet");

  if (data.length === 0) {
    return <div className="px-6 py-10 text-center text-slate-400 text-sm">{t("noExportsYet")}</div>;
  }

  return (
    <div className="overflow-auto max-h-[420px]">
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 bg-brand-50 text-left text-xs font-semibold uppercase tracking-wide text-brand-700">
          <tr className="border-b border-slate-200">
            <th className="px-4 py-3 min-w-[130px]">{t("createdAt")}</th>
            <th className="px-4 py-3 min-w-[150px]">{t("talent")}</th>
            <th className="px-4 py-3 min-w-[150px]">{t("client")}</th>
            <th className="px-4 py-3 min-w-[110px]">{t("period")}</th>
            <th className="px-4 py-3 min-w-[90px]">{t("hours")}</th>
            <th className="px-4 py-3 min-w-[70px]">{t("md")}</th>
            <th className="px-4 py-3 min-w-[140px]">{t("createdBy")}</th>
            <th className="px-4 py-3 min-w-[110px]">{t("file")}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
              <td className="px-4 py-3 text-slate-500">{new Date(row.created_at).toLocaleString("id-ID")}</td>
              <td className="px-4 py-3 font-medium text-slate-900">{row.talent_label}</td>
              <td className="px-4 py-3 text-slate-600">{row.client_name ?? "-"}</td>
              <td className="px-4 py-3 text-slate-600">{row.period_label}</td>
              <td className="px-4 py-3 text-slate-600">{row.total_hours}</td>
              <td className="px-4 py-3 text-slate-600">{row.total_md.toFixed(2)}</td>
              <td className="px-4 py-3 text-slate-500">{row.generated_by_name}</td>
              <td className="px-4 py-3">
                {row.attachments[0]?.url ? (
                  <a href={row.attachments[0].url} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline font-medium">{t("download")}</a>
                ) : (
                  <span className="text-slate-300">-</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
