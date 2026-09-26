"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { addContract } from "../actions";
import { CompactField as Field, CompactSelectField as SelectField } from "@/components/form-fields";

const EMPLOYMENT_TYPES = [["pkwt", "PKWT"], ["pkwtt", "PKWTT"]] as const;

type ContractOption = { id: string; contract_no: string };

export function AddContractForm({ employeeId, existingContracts }: { employeeId: string; existingContracts: ContractOption[] }) {
  const t = useTranslations("hr.addContract");
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const addWithId = addContract.bind(null, employeeId);

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-sm font-medium text-brand-600 hover:underline">
        + {t("addContractAddendum")}
      </button>
    );
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      await addWithId(fd);
      setOpen(false);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-brand-200 bg-brand-50 p-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
      <Field label={t("contractNo")} name="contract_no" required />
      <SelectField label={t("employmentType")} name="employment_type_code" options={EMPLOYMENT_TYPES} required />
      <Field label={t("startDate")} name="start_date" type="date" required />
      <Field label={t("endDate")} name="end_date" type="date" />
      <Field label={t("documentDate")} name="document_date" type="date" />
      <Field label={t("signedDate")} name="signed_date" type="date" />
      <Field label={t("permanentSkNo")} name="sk_no" />
      <Field label={t("skDate")} name="sk_date" type="date" />

      <label className="block sm:col-span-2">
        <span className="mb-1 block text-xs font-medium text-slate-600">{t("addendumOfContract")}</span>
        <select name="parent_contract_id" className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs">
          <option value="">{t("newParentContract")}</option>
          {existingContracts.map((c) => <option key={c.id} value={c.id}>{c.contract_no}</option>)}
        </select>
      </label>
      <Field label={t("addendumSeq")} name="addendum_seq" type="number" />

      <div className="sm:col-span-4 flex gap-2">
        <button type="submit" disabled={isPending} className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50">
          {isPending ? t("saving") : t("save")}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-4 py-2 text-xs text-slate-500 hover:bg-slate-100">
          {t("cancel")}
        </button>
      </div>
    </form>
  );
}
