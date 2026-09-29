"use client";
import { useTranslations } from "next-intl";
import { SearchableSelect } from "@/components/searchable-select";

type CandidateOption = { id: string; candidate_no: string; candidate_name: string };
type RequisitionOption = { id: string; client_name: string; position_name: string };

export function EditPickers({
  candidates,
  requisitions,
  defaultCandidateId,
  defaultRequisitionId,
}: {
  candidates: CandidateOption[];
  requisitions: RequisitionOption[];
  defaultCandidateId: string;
  defaultRequisitionId: string;
}) {
  const t = useTranslations("ta.pipeline.editFields");
  return (
    <>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700">Requisition <span className="text-red-500">*</span></span>
        <select name="requisition_id" required defaultValue={defaultRequisitionId} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
          {requisitions.map((r) => <option key={r.id} value={r.id}>{r.client_name} - {r.position_name}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700">Candidate <span className="text-red-500">*</span></span>
        <SearchableSelect
          name="candidate_id"
          required
          defaultValue={defaultCandidateId}
          placeholder={t("searchCandidatePlaceholder")}
          options={candidates.map((c) => ({ value: c.id, label: c.candidate_name, sublabel: c.candidate_no }))}
        />
      </label>
    </>
  );
}