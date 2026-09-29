"use client";
import { useTranslations } from "next-intl";
import { AddRecordModal } from "@/components/add-record-modal";
import { Field, SelectField } from "@/components/form-fields";
import { createActivity } from "../actions";
import { useAccountModal } from "./account-modals-context";

const TYPE_OPTIONS = [["call", "Call"], ["email", "Email"], ["meeting", "Meeting"], ["note", "Note"]] as const;

export function AddActivityModal({
  clientId,
  contactOptions,
}: {
  clientId: string;
  contactOptions: { id: string; name: string }[];
}) {
  const t = useTranslations("crm");
  const { openModal, setOpenModal } = useAccountModal();

  return (
    <AddRecordModal
      buttonLabel={t("logActivity")}
      title={t("logActivityModalTitle")}
      action={(formData) => createActivity(clientId, formData)}
      open={openModal === "activity"}
      onOpenChange={(v) => setOpenModal(v ? "activity" : null)}
    >
      <SelectField label={t("activityType")} name="type_code" options={TYPE_OPTIONS} defaultValue="call" />
      <Field label={t("activityDate")} name="activity_date" type="date" required />
      <SelectField
        label={t("activityContact")}
        name="contact_id"
        options={contactOptions.map((c) => [c.id, c.name] as [string, string])}
      />
      <div className="sm:col-span-3">
        <Field label={t("activityTitle")} name="title" required />
      </div>
      <div className="sm:col-span-3">
        <Field label={t("activityDescription")} name="description" textarea />
      </div>
    </AddRecordModal>
  );
}
