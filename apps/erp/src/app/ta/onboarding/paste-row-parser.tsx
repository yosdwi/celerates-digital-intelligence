"use client";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

/**
 * Field-field yang boleh diisi otomatis dari paste baris sheet. Sengaja cuma
 * field teks/tanggal/select biasa (uncontrolled, defaultValue) -- field yang
 * pakai state React terkontrol (mis. MoneyInput di Field money) atau picker
 * kompleks (Candidate/Requisition) nggak dimasukkan supaya nilai yang di-set
 * langsung lewat DOM nggak nyasar/ke-reset React.
 */
const FIELD_KEYS: { key: string; labelKey: string }[] = [
  { key: "start_date", labelKey: "startDate" },
  { key: "end_date", labelKey: "endDate" },
  { key: "employee_status_code", labelKey: "employeeStatus" },
  { key: "employment_type_code", labelKey: "employmentType" },
  { key: "nik", labelKey: "nik" },
  { key: "birth_place", labelKey: "birthPlace" },
  { key: "birth_date", labelKey: "birthDate" },
  { key: "id_card_address", labelKey: "idCardAddress" },
  { key: "current_address", labelKey: "currentAddress" },
  { key: "education_level_code", labelKey: "educationLevel" },
  { key: "institution_name", labelKey: "institutionName" },
  { key: "major", labelKey: "major" },
  { key: "gpa", labelKey: "gpa" },
  { key: "personal_email", labelKey: "personalEmail" },
  { key: "personal_phone", labelKey: "personalPhone" },
  { key: "npwp", labelKey: "npwp" },
  { key: "family_card_no", labelKey: "familyCardNo" },
  { key: "marital_status_code", labelKey: "maritalStatus" },
  { key: "dependent_count", labelKey: "dependentCount" },
  { key: "bank_account_no", labelKey: "bankAccountNo" },
  { key: "bank_name", labelKey: "bankName" },
  { key: "bank_account_holder_name", labelKey: "bankAccountHolderName" },
  { key: "bank_branch_name", labelKey: "bankBranchName" },
  { key: "bpjs_kesehatan_personal_no", labelKey: "bpjsKesehatanNo" },
  { key: "bpjs_ketenagakerjaan_personal_no", labelKey: "bpjsKetenagakerjaanNo" },
  { key: "emergency_contact_name", labelKey: "emergencyContactName" },
  { key: "emergency_contact_relationship", labelKey: "emergencyContactRelationship" },
  { key: "emergency_contact_phone", labelKey: "emergencyContactPhone" },
  { key: "available_start_date", labelKey: "availableStartDate" },
  { key: "mother_maiden_name", labelKey: "motherMaidenName" },
  { key: "blood_type_code", labelKey: "bloodType" },
  { key: "notes", labelKey: "notes" },
  { key: "company_email", labelKey: "companyEmail" },
  { key: "gender_code", labelKey: "gender" },
  { key: "religion_code", labelKey: "religion" },
  { key: "ptkp_code", labelKey: "ptkpCode" },
  { key: "employee_category_code", labelKey: "employeeCategory" },
  { key: "job_level_code", labelKey: "jobLevel" },
];
const SKIP = "__skip__";
const STORAGE_KEY = "ta_onboarding_paste_column_mapping_v1";

/**
 * Default mapping kolom ke-i = FIELD_OPTIONS ke-i (bukan "-- lewati --" semua) --
 * supaya begitu buka form, tiap kolom sudah keisi nama field yang masuk akal,
 * dan user tinggal GANTI/lewati kolom yang memang nggak perlu, bukan pilih
 * satu-satu dari kosong dulu.
 */
function defaultMapping(n: number): string[] {
  return Array.from({ length: n }, (_, i) => FIELD_KEYS[i]?.key ?? SKIP);
}

type ParsedRow = { key: string; label: string; value: string };

export function PasteRowParser() {
  const t = useTranslations("ta.onboarding.pasteParser");
  const tf = useTranslations("ta.onboarding.fields");
  const FIELD_OPTIONS = FIELD_KEYS.map((f) => ({ key: f.key, label: tf(f.labelKey) }));
  const FIELD_LABEL_BY_KEY = new Map(FIELD_OPTIONS.map((f) => [f.key, f.label]));
  const containerRef = useRef<HTMLDivElement>(null);
  const [mapping, setMapping] = useState<string[]>([]);
  const [editingMapping, setEditingMapping] = useState(false);
  const [pastedText, setPastedText] = useState("");
  const [preview, setPreview] = useState<ParsedRow[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as string[];
        if (Array.isArray(saved) && saved.length > 0) {
          setMapping(saved);
          return;
        }
      }
    } catch {
      // localStorage nggak tersedia/rusak -- fallback ke mapping kosong, minta user atur ulang.
    }
    setMapping(defaultMapping(10));
    setEditingMapping(true);
  }, []);

  function handleColumnCountChange(nRaw: string) {
    const n = Math.max(1, Math.min(100, Number(nRaw) || 1));
    setMapping((prev) => Array.from({ length: n }, (_, i) => prev[i] ?? FIELD_OPTIONS[i]?.key ?? SKIP));
  }

  function handleMappingChange(index: number, key: string) {
    setMapping((prev) => prev.map((v, i) => (i === index ? key : v)));
  }

  function handleSaveMapping() {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(mapping));
    setEditingMapping(false);
    setMessage(t("mappingSaved"));
  }

  function handleParse() {
    setMessage(null);
    setPreview(null);
    if (!pastedText.trim()) {
      setMessage(t("pasteFirst"));
      return;
    }
    if (mapping.length === 0 || mapping.every((k) => k === SKIP)) {
      setMessage(t("setMappingFirst"));
      return;
    }
    const rawColumns = pastedText.split("\t");
    const rows: ParsedRow[] = [];
    mapping.forEach((key, i) => {
      if (!key || key === SKIP) return;
      rows.push({ key, label: FIELD_LABEL_BY_KEY.get(key) ?? key, value: (rawColumns[i] ?? "").trim() });
    });
    setPreview(rows);
  }

  function handleFillForm() {
    if (!preview) return;
    const form = containerRef.current?.closest("form");
    if (!form) {
      setMessage(t("formNotFound"));
      return;
    }
    let filled = 0;
    for (const { key, value } of preview) {
      if (!value) continue;
      const el = form.elements.namedItem(key);
      if (el && !(el instanceof RadioNodeList) && "value" in el) {
        (el as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value = value;
        filled++;
      }
    }
    setMessage(t("fieldsFilled", { count: filled }));
  }

  return (
    <div ref={containerRef} className="space-y-4 text-sm">
      <p className="text-xs text-slate-500">
        {t("instructions")}
      </p>

      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-700">{t("columnMapping", { count: mapping.length })}</span>
        <button
          type="button"
          onClick={() => setEditingMapping((v) => !v)}
          className="text-xs font-medium text-brand-600 hover:underline"
        >
          {editingMapping ? t("hide") : t("changeMapping")}
        </button>
      </div>

      {editingMapping && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-3">
          <label className="flex items-center gap-2 text-xs text-slate-600">
            {t("columnCountInSheet")}
            <input
              type="number"
              min={1}
              max={100}
              value={mapping.length}
              onChange={(e) => handleColumnCountChange(e.target.value)}
              className="w-20 rounded border border-slate-300 bg-white px-2 py-1 text-xs"
            />
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto">
            {mapping.map((value, i) => (
              <label key={i} className="flex items-center gap-2 text-xs">
                <span className="w-16 shrink-0 text-slate-500">{t("columnLabel", { index: i + 1 })}</span>
                <select
                  value={value}
                  onChange={(e) => handleMappingChange(i, e.target.value)}
                  className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                >
                  <option value={SKIP}>{t("skipOption")}</option>
                  {FIELD_OPTIONS.map((f) => (
                    <option key={f.key} value={f.key}>{f.label}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <button
            type="button"
            onClick={handleSaveMapping}
            className="rounded bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
          >
            {t("saveMapping")}
          </button>
        </div>
      )}

      <div className="rounded-lg border border-violet-200 bg-violet-50/60 p-3 space-y-2">
        <textarea
          value={pastedText}
          onChange={(e) => setPastedText(e.target.value)}
          rows={3}
          placeholder={t("pasteTextareaPlaceholder")}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-mono"
        />
        <button
          type="button"
          onClick={handleParse}
          className="rounded-lg border border-violet-200 bg-violet-100 px-3 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-200 transition-colors"
        >
          {t("parse")}
        </button>
      </div>

      {message && <p className="text-xs text-amber-700">{message}</p>}

      {preview && preview.length > 0 && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 space-y-2">
          <p className="text-xs font-medium text-emerald-800">{t("previewResult")}</p>
          <div className="max-h-56 overflow-y-auto space-y-1">
            {preview.map(({ key, label, value }) => (
              <div key={key} className="grid grid-cols-3 gap-2 text-xs">
                <span className="text-slate-500 col-span-1">{label}</span>
                <span className="col-span-2 text-slate-800 break-words">{value || <em className="text-slate-400">{t("empty")}</em>}</span>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={handleFillForm}
            className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
          >
            {t("fillForm")}
          </button>
        </div>
      )}
    </div>
  );
}
