"use client";
import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { updateBpjsStatus } from "../actions";
import { CompactField as Field, CompactSelectField as SelectField } from "@/components/form-fields";
import { useToast } from "@/components/toast-provider";

const STATUS_OPTIONS = [["terdaftar", "Terdaftar"], ["belum_terdaftar", "Belum Terdaftar"], ["tidak_terdaftar", "Tidak Terdaftar"]] as const;

type Bpjs = {
  id: string;
  scheme: string;
  company_no: string | null;
  status_code: string | null;
  due_month: string | null;
  deduction_start_month: string | null;
  registered_date: string | null;
  card_sent_date: string | null;
  active_month: string | null;
  sipp_active_date: string | null;
};

export function BpjsRow({ bpjs, employeeId }: { bpjs: Bpjs; employeeId: string }) {
  const t = useTranslations("hr.bpjs");
  const [isPending, startTransition] = useTransition();
  const { showToast } = useToast();
  const updateWithId = updateBpjsStatus.bind(null, bpjs.id, employeeId);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await updateWithId(fd);
        showToast(t("updateSuccess"));
      } catch {
        showToast(t("updateFailed"), "error");
      }
    });
  }

  const isKetenagakerjaan = bpjs.scheme === "ketenagakerjaan";

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-slate-200 p-4 space-y-3">
      <h3 className="text-sm font-semibold text-slate-700 capitalize">BPJS {bpjs.scheme}</h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Field label={t("companyNo")} name="company_no" defaultValue={bpjs.company_no ?? ""} />
        <SelectField label={t("status")} name="status_code" defaultValue={bpjs.status_code ?? ""} options={STATUS_OPTIONS} />
        <Field label={t("dueMonth")} name="due_month" type="date" defaultValue={bpjs.due_month ?? ""} />
        <Field label={t("deductionStartMonth")} name="deduction_start_month" type="date" defaultValue={bpjs.deduction_start_month ?? ""} />
        <Field label={t("registeredDate")} name="registered_date" type="date" defaultValue={bpjs.registered_date ?? ""} />
        <Field label={t("cardSentDate")} name="card_sent_date" type="date" defaultValue={bpjs.card_sent_date ?? ""} />
        {isKetenagakerjaan && (
          <>
            <Field label={t("activeMonth")} name="active_month" type="date" defaultValue={bpjs.active_month ?? ""} />
            <Field label={t("sippActiveDate")} name="sipp_active_date" type="date" defaultValue={bpjs.sipp_active_date ?? ""} />
          </>
        )}
      </div>
      <button type="submit" disabled={isPending} className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50">
        {isPending ? t("saving") : t("updateStatus")}
      </button>
    </form>
  );
}

