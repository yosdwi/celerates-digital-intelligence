"use client";
import { useTranslations } from "next-intl";
import { AddRecordModal } from "@/components/add-record-modal";
import { Field } from "@/components/form-fields";
import { createContact } from "../actions";
import { useAccountModal } from "./account-modals-context";

export function AddContactModal({ clientId }: { clientId: string }) {
  const t = useTranslations("crm");
  const { openModal, setOpenModal } = useAccountModal();

  return (
    <AddRecordModal
      buttonLabel={t("addContact")}
      title={t("addContactModalTitle")}
      action={(formData) => createContact(clientId, formData)}
      open={openModal === "contact"}
      onOpenChange={(v) => setOpenModal(v ? "contact" : null)}
    >
      <Field label={t("contactName")} name="name" required />
      <Field label={t("contactRole")} name="role_title" />
      <Field label={t("contactEmail")} name="email" type="email" />
      <Field label={t("contactPhone")} name="phone" />
      <label className="flex items-center gap-2 pt-6">
        <input type="checkbox" name="is_primary" value="true" className="rounded border-slate-300" />
        <span className="text-sm font-medium text-slate-700">{t("contactPrimary")}</span>
      </label>
    </AddRecordModal>
  );
}
