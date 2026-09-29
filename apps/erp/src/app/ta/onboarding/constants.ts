export const ONBOARDING_DOC_FIELDS = [
  { key: "offering_letter", label: "Offering Letter" },
  { key: "ktp", label: "KTP" },
  { key: "bpjs_kesehatan", label: "BPJS Kesehatan" },
  { key: "bpjs_ketenagakerjaan", label: "BPJS Ketenagakerjaan" },
  { key: "npwp", label: "NPWP" },
  { key: "kk", label: "Kartu Keluarga" },
  { key: "diploma", label: "Ijazah" },
  { key: "certification", label: "Sertifikasi" },
  { key: "formal_photo", label: "Foto Formal" },
] as const;

export function onboardingDocSource(fieldKey: string): string {
  return `onboarding_${fieldKey}`;
}

export const OFFERING_LETTER_SIGNATURE_SOURCE = "onboarding_offering_letter";
export const OFFERING_LETTER_SIGNATURE_STEP = "offering_letter_approval";
