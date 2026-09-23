"use client";
import { useState } from "react";
import { RequisitionFields } from "./requisition-fields";
import { CandidatePicker } from "@/components/candidate-picker";

type RequisitionOption = {
  id: string;
  client_name: string;
  position_name: string;
  service_type_code: string | null;
  level_code: string | null;
  price_amount: number | null;
  ta_pic_name: string;
};

type CandidateOption = {
  id: string;
  candidate_no: string;
  candidate_name: string;
  wa_number: string | null;
  email: string | null;
  current_salary_amount: number | null;
  expected_salary_amount: number | null;
  candidate_source_code: string | null;
  position_name?: string | null;
};

/**
 * Menyatukan state Requisition & Candidate di form "Masukkan ke Pipeline" --
 * supaya CandidatePicker tahu posisi Requisition yang sedang terpilih dan bisa
 * menandai candidate dengan posisi yang cocok sebagai "Recommended".
 */
export function PipelineAddFields({
  requisitions,
  candidates,
  candidateCvUrls,
  picNames,
  currentPath,
}: {
  requisitions: RequisitionOption[];
  candidates: CandidateOption[];
  candidateCvUrls: Record<string, string | null>;
  picNames: string[];
  currentPath: string;
}) {
  const [selectedRequisition, setSelectedRequisition] = useState<RequisitionOption | undefined>(undefined);

  return (
    <>
      <RequisitionFields
        requisitions={requisitions}
        picNames={picNames}
        currentPath={currentPath}
        onRequisitionChange={setSelectedRequisition}
      />
      <CandidatePicker
        candidates={candidates}
        candidateCvUrls={candidateCvUrls}
        matchPositionName={selectedRequisition?.position_name}
      />
    </>
  );
}
