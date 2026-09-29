"use client";
import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { updateExtensionRequest, deleteExtensionRequestAttachment } from "../actions";
import type { JourneyStep } from "./approval-journey";
import type { SignerOption } from "@/lib/approval-journey";
import type { AttachmentWithUrl } from "@/lib/attachments";
import { MultiFileUpload } from "@/components/multi-file-upload";
import { Field, SelectField } from "@/components/form-fields";
import { useTranslations } from "next-intl";

const GRADE_LEVELS = [
  ["internship", "Internship"], ["entry_level", "Entry Level"], ["junior", "Junior"],
  ["middle", "Middle"], ["senior", "Senior"], ["lead", "Lead"], ["manager", "Manager"], ["vp", "VP"],
] as const;
const EMPLOYMENT_TYPES = [["pkwt", "PKWT"], ["pkwtt", "PKWTT"]] as const;

const STEP_FIELDS = [
  { field: "requester_user_id", code: "requester", label: "Requester" },
  { field: "approver_1_user_id", code: "approval_1", label: "Approval 1" },
  { field: "approver_2_user_id", code: "approval_2", label: "Approval 2" },
  { field: "approver_3_user_id", code: "approval_3", label: "Approval 3" },
  { field: "acknowledger_user_id", code: "acknowledge", label: "Acknowledge" },
] as const;

export type EditableExtensionRequest = {
  id: string;
  propose_start_date: string | null;
  propose_end_date: string | null;
  proposed_position_name: string | null;
  proposed_grade_level_code: string | null;
  proposed_employment_type_code: string | null;
  proposed_basic_salary_amount: number | null;
  proposed_transport_allowance_amount: number | null;
  proposed_project_allowance_amount: number | null;
  proposed_accommodation_allowance_amount: number | null;
  proposed_overtime_allowance_amount: number | null;
  proposed_increment_amount_deal: number | null;
  proposed_increment_percent_deal: number | null;
  notes: string | null;
  requester_user_id: string | null;
  approver_1_user_id: string | null;
  approver_2_user_id: string | null;
  approver_3_user_id: string | null;
  acknowledger_user_id: string | null;
  journeySteps: JourneyStep[];
  attachments: AttachmentWithUrl[];
};

export function EditExtensionRequestModal({
  request,
  userOptions,
}: {
  request: EditableExtensionRequest;
  userOptions: SignerOption[];
}) {
  const t = useTranslations("tm.extensionRequests.editModal");
  const te = useTranslations("tm.extensionRequests");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [blockedSteps, setBlockedSteps] = useState<string[]>([]);

  const stepStatusByCode = new Map(request.journeySteps.map((s) => [s.code, s.status]));

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      setError(null);
      const result = await updateExtensionRequest(request.id, fd);
      if (!result.ok) { setError(result.error); return; }
      setBlockedSteps(result.blockedSteps);
      if (result.blockedSteps.length === 0) setOpen(false);
    });
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-xs font-medium text-brand-600 hover:underline text-left">
        {tc("edit")}
      </button>
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
          <h2 className="text-lg font-semibold text-slate-900">{t("title")}</h2>
          <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="Propose Start Date" name="propose_start_date" type="date" defaultValue={request.propose_start_date ?? ""} />
            <Field label="Propose End Date" name="propose_end_date" type="date" defaultValue={request.propose_end_date ?? ""} />
            <Field label="Positions (Propose)" name="proposed_position_name" defaultValue={request.proposed_position_name ?? ""} />

            <SelectField label="Grade Level (Propose)" name="proposed_grade_level_code" options={GRADE_LEVELS} defaultValue={request.proposed_grade_level_code ?? ""} />
            <SelectField label={te("employmentStatusPropose")} name="proposed_employment_type_code" options={EMPLOYMENT_TYPES} defaultValue={request.proposed_employment_type_code ?? ""} />
            <Field label="Basic Salary (Propose)" name="proposed_basic_salary_amount" money defaultValue={request.proposed_basic_salary_amount?.toString() ?? ""} />

            <Field label="Transport Allowance (Propose)" name="proposed_transport_allowance_amount" money defaultValue={request.proposed_transport_allowance_amount?.toString() ?? ""} />
            <Field label="Project Allowance (Propose)" name="proposed_project_allowance_amount" money defaultValue={request.proposed_project_allowance_amount?.toString() ?? ""} />
            <Field label="Accommodation Allowance (Propose)" name="proposed_accommodation_allowance_amount" money defaultValue={request.proposed_accommodation_allowance_amount?.toString() ?? ""} />

            <Field label="Overtime Allowance (Propose)" name="proposed_overtime_allowance_amount" money defaultValue={request.proposed_overtime_allowance_amount?.toString() ?? ""} />
            <Field label="Increment Amount Deal (Propose)" name="proposed_increment_amount_deal" money defaultValue={request.proposed_increment_amount_deal?.toString() ?? ""} hint={te("incrementAmountHint")} />
            <Field label="Increment % Deal (Propose)" name="proposed_increment_percent_deal" type="number" defaultValue={request.proposed_increment_percent_deal?.toString() ?? ""} />
          </div>

          <div className="border-t border-slate-100 pt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-500 mb-1">{te("approvalJourneyTitle")}</p>
            <p className="text-xs text-slate-400 mb-3">{t("lockedStepHint")}</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {STEP_FIELDS.map((sf) => {
                const status = stepStatusByCode.get(sf.code);
                const locked = status === "signed";
                return (
                  <label key={sf.field} className="block">
                    <span className="mb-1 block text-sm font-medium text-slate-700">
                      {sf.label} {locked && <span className="text-[10px] text-green-600">{t("lockedBadge")}</span>}
                    </span>
                    <select
                      name={sf.field}
                      disabled={locked}
                      defaultValue={request[sf.field as keyof EditableExtensionRequest] as string ?? ""}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100 disabled:text-slate-400"
                    >
                      <option value="">{t("selectUserPlaceholder")}</option>
                      {userOptions.map((u) => (
                        <option key={u.id} value={u.id}>{u.full_name} ({u.email})</option>
                      ))}
                    </select>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="sm:col-span-3">
            <MultiFileUpload
              name="attachments"
              label={te("supportingDocuments")}
              existingFiles={request.attachments.map((a) => ({ id: a.id, file_name: a.file_name, url: a.url }))}
              onDeleteExisting={(id) => deleteExtensionRequestAttachment(id)}
            />
          </div>

          <div className="sm:col-span-3">
            <Field label="Notes" name="notes" defaultValue={request.notes ?? ""} textarea />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          {blockedSteps.length > 0 && (
            <p className="text-sm text-amber-600">
              {t("blockedStepsMessage", { steps: blockedSteps.join(", ") })}
            </p>
          )}

          <div className="flex gap-3 pt-2 border-t border-slate-100">
            <button type="submit" disabled={isPending} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
              {isPending ? tc("saving") : t("saveChanges")}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              {t("close")}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
