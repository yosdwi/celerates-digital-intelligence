"use client";
import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { StickyNote } from "lucide-react";
import { ProcessButton } from "./process-button";
import { ViewToggle, type TableView } from "@/components/view-toggle";
import { Pill } from "@/components/pill";
import { Avatar } from "@/components/avatar";
import { GridCard, type CardAccent } from "@/components/grid-card";

type ExtensionRequestRow = {
  id: string;
  employee_id: string;
  employee_no: string | null;
  candidate_name: string | null;
  propose_start_date: string | null;
  propose_end_date: string | null;
  proposed_position_name: string | null;
  proposed_employment_type_code: string | null;
  requester_name: string;
  approved_by_1_name: string | null;
  approved_by_2_name: string | null;
  approved_by_3_name: string | null;
  acknowledged_by_name: string | null;
  status_code: string;
  hr_status_code: string | null;
  employment_contract_id: string | null;
};

export function ExtensionRequestsTable({
  rows,
  specialNotesCountByRequest,
}: {
  rows: ExtensionRequestRow[];
  specialNotesCountByRequest: { requestId: string; total: number; open: number }[];
}) {
  const t = useTranslations("hr.extensionRequests.table");
  const [view, setView] = useState<TableView>("table");

  const notesMap = new Map(specialNotesCountByRequest.map((n) => [n.requestId, { total: n.total, open: n.open }]));
  const requestAccent = (r: ExtensionRequestRow): CardAccent => (r.hr_status_code === "processed" ? "emerald" : "amber");

  return (
    <div>
      <div className="px-6 py-3.5 border-b border-slate-100 bg-white/60 backdrop-blur-xl flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-400 ml-auto">{t("dataCount", { count: rows.length })}</span>
        <ViewToggle view={view} onChange={setView} />
      </div>

      {view === "table" && (
        <div className="overflow-auto max-h-[480px]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-20">
              <tr className="border-b border-violet-200 bg-violet-50 text-left text-xs font-semibold uppercase tracking-wide text-violet-700">
                <th className="px-4 py-3 sticky left-0 bg-violet-50 z-10 min-w-[170px]">{t("colAction")}</th>
                <th className="px-4 py-3 sticky left-[170px] bg-violet-50 z-10 min-w-[130px]">{t("colEmployeeNo")}</th>
                <th className="px-4 py-3 sticky left-[300px] bg-violet-50 z-10 min-w-[150px]">{t("colName")}</th>
                <th className="px-4 py-3 sticky left-[450px] bg-violet-50 z-10 min-w-[130px] border-r border-slate-200">{t("colPositionsPropose")}</th>
                <th className="px-4 py-3 min-w-[110px]">{t("colProposeStart")}</th>
                <th className="px-4 py-3 min-w-[110px]">{t("colProposeEnd")}</th>
                <th className="px-4 py-3 min-w-[110px]">{t("colEmployeeStatus")}</th>
                <th className="px-4 py-3 min-w-[130px]">{t("colRequester")}</th>
                <th className="px-4 py-3 min-w-[110px]">{t("colHrStatus")}</th>
                <th className="px-4 py-3 min-w-[150px]">{t("colSpecialNotes")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const notesCount = notesMap.get(r.id) ?? { total: 0, open: 0 };
                return (
                  <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-violet-50/60">
                    <td className="px-4 py-3 sticky left-0 bg-white z-0">
                      {r.hr_status_code === "processed" ? (
                        <Link href={`/hr/${r.employee_id}`} className="text-xs font-medium text-brand-600 hover:underline">
                          {t("viewContractHistory")} &rarr;
                        </Link>
                      ) : (
                        <ProcessButton requestId={r.id} />
                      )}
                    </td>
                    <td className="px-4 py-3 sticky left-[170px] bg-white z-0 font-mono text-xs text-slate-500">{r.employee_no ?? "-"}</td>
                    <td className="px-4 py-3 sticky left-[300px] bg-white z-0 font-medium text-slate-900">
                      <span className="flex items-center gap-2">
                        <Avatar name={r.candidate_name ?? "-"} size="sm" />
                        {r.candidate_name ?? "-"}
                      </span>
                    </td>
                    <td className="px-4 py-3 sticky left-[450px] bg-white z-0 text-slate-600 border-r border-slate-200">{r.proposed_position_name ?? "-"}</td>
                    <td className="px-4 py-3 text-slate-600">{r.propose_start_date ?? "-"}</td>
                    <td className="px-4 py-3 text-slate-600">{r.propose_end_date ?? "-"}</td>
                    <td className="px-4 py-3 text-slate-600">{r.proposed_employment_type_code ?? "-"}</td>
                    <td className="px-4 py-3 text-slate-600">{r.requester_name}</td>
                    <td className="px-4 py-3">
                      {r.hr_status_code === "processed" ? (
                        <Pill variant="success">{t("statusProcessed")}</Pill>
                      ) : (
                        <Pill variant="warning">{t("statusWaitingHr")}</Pill>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href="/tm/special-notes"
                        className={`inline-flex items-center gap-1.5 rounded-full whitespace-nowrap px-2.5 py-1 text-xs font-medium border ${
                          notesCount.open > 0
                            ? "bg-teal-50 text-teal-700 border-teal-200 hover:bg-teal-100"
                            : "text-slate-400 border-slate-200 hover:bg-violet-50/60"
                        }`}
                      >
                        <StickyNote className="h-3.5 w-3.5" />
                        {notesCount.total > 0 ? t("openOfTotal", { open: notesCount.open, total: notesCount.total }) : t("view")}
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr><td colSpan={10} className="px-6 py-10 text-center text-slate-400">{t("noApprovedRequests")}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {view === "grid" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
          {rows.map((r) => {
            const notesCount = notesMap.get(r.id) ?? { total: 0, open: 0 };
            return (
              <GridCard key={r.id} accent={requestAccent(r)}>
                <div className="flex items-center gap-2.5">
                  <Avatar name={r.candidate_name ?? "-"} />
                  <div className="min-w-0">
                    <div className="font-bold text-slate-900 truncate">{r.candidate_name ?? "-"}</div>
                    <div className="text-xs text-slate-400 font-mono">{r.employee_no ?? "-"}</div>
                  </div>
                </div>
                <div className="mt-3 space-y-1 text-xs text-slate-600">
                  <div><span className="text-slate-400">{t("colPositionsPropose")}:</span> {r.proposed_position_name ?? "-"}</div>
                  <div><span className="text-slate-400">{t("colProposeStart")}:</span> {r.propose_start_date ?? "-"}</div>
                  <div><span className="text-slate-400">{t("colProposeEnd")}:</span> {r.propose_end_date ?? "-"}</div>
                  <div><span className="text-slate-400">{t("colRequester")}:</span> {r.requester_name}</div>
                  <div>
                    <span className="text-slate-400">{t("colHrStatus")}:</span>{" "}
                    {r.hr_status_code === "processed" ? (
                      <Pill variant="success">{t("statusProcessed")}</Pill>
                    ) : (
                      <Pill variant="warning">{t("statusWaitingHr")}</Pill>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 items-center mt-auto pt-3 border-t border-slate-100 flex-wrap">
                  {r.hr_status_code === "processed" ? (
                    <Link href={`/hr/${r.employee_id}`} className="text-xs font-medium text-brand-600 hover:underline">
                      {t("viewContractHistory")} &rarr;
                    </Link>
                  ) : (
                    <ProcessButton requestId={r.id} />
                  )}
                  <Link
                    href="/tm/special-notes"
                    className={`inline-flex items-center gap-1.5 rounded-full whitespace-nowrap px-2.5 py-1 text-xs font-medium border ${
                      notesCount.open > 0
                        ? "bg-teal-50 text-teal-700 border-teal-200 hover:bg-teal-100"
                        : "text-slate-400 border-slate-200 hover:bg-violet-50/60"
                    }`}
                  >
                    <StickyNote className="h-3.5 w-3.5" />
                    {notesCount.total > 0 ? t("openOfTotal", { open: notesCount.open, total: notesCount.total }) : t("view")}
                  </Link>
                </div>
              </GridCard>
            );
          })}
          {rows.length === 0 && (
            <div className="col-span-full px-6 py-10 text-center text-slate-400">{t("noApprovedRequests")}</div>
          )}
        </div>
      )}
    </div>
  );
}
