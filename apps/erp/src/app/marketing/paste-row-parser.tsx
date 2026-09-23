"use client";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

/**
 * Field-field yang boleh diisi otomatis dari paste baris sheet. Sengaja cuma
 * field teks/tanggal/select/number biasa (uncontrolled, defaultValue) --
 * field yang pakai state React terkontrol (mis. MoneyInput di Field money
 * buat price_amount) atau picker kompleks (PicSelect buat sales_pic_name)
 * nggak dimasukkan supaya nilai yang di-set langsung lewat DOM nggak
 * nyasar/ke-reset React. Lihat versi aslinya di
 * src/app/ta/onboarding/paste-row-parser.tsx.
 */
const FIELD_KEYS = [
  "client_name", "contact_name", "contact_email", "contact_phone", "company_size", "industry_code",
  "service_type_code", "lead_source_code", "category_code", "project_name", "price_period_code",
  "position_name", "headcount_target", "level_code", "estimated_duration_months", "is_qualified",
  "disqualify_reason", "notes",
] as const;
const SKIP = "__skip__";
const STORAGE_KEY = "marketing_leads_paste_column_mapping_v1";

/**
 * Default mapping kolom ke-i = FIELD_OPTIONS ke-i (bukan "-- lewati --" semua) --
 * supaya begitu buka form, tiap kolom sudah keisi nama field yang masuk akal,
 * dan user tinggal GANTI/lewati kolom yang memang nggak perlu, bukan pilih
 * satu-satu dari kosong dulu.
 */
function defaultMapping(n: number): string[] {
  return Array.from({ length: n }, (_, i) => FIELD_KEYS[i] ?? SKIP);
}

type ParsedRow = { key: string; label: string; value: string };

export function PasteRowParser() {
  const t = useTranslations("marketing");
  const FIELD_OPTIONS: { key: string; label: string }[] = [
    { key: "client_name", label: t("clientName") },
    { key: "contact_name", label: t("contactName") },
    { key: "contact_email", label: "Email" },
    { key: "contact_phone", label: "Phone" },
    { key: "company_size", label: "Company Size" },
    { key: "industry_code", label: "Industry" },
    { key: "service_type_code", label: "Service Type" },
    { key: "lead_source_code", label: t("leadSource") },
    { key: "category_code", label: t("category") },
    { key: "project_name", label: t("projectName") },
    { key: "price_period_code", label: t("pricePeriod") },
    { key: "position_name", label: t("positionName") },
    { key: "headcount_target", label: "Headcount Target" },
    { key: "level_code", label: "Level" },
    { key: "estimated_duration_months", label: t("estimatedDuration") },
    { key: "is_qualified", label: t("qualificationStatus") },
    { key: "disqualify_reason", label: t("disqualifyReason") },
    { key: "notes", label: t("notes") },
  ];
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
      setMessage(t("pasteRowFirst"));
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
      setMessage(t("leadFormNotFound"));
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
    setMessage(t("fieldsFilledMessage", { count: filled }));
  }

  return (
    <div ref={containerRef} className="space-y-4 text-sm">
      <p className="text-xs text-slate-500">
        {t("pasteRowInstructions")}
      </p>

      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-700">{t("columnMappingOrder", { count: mapping.length })}</span>
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
                <span className="w-16 shrink-0 text-slate-500">{t("column")} {i + 1}</span>
                <select
                  value={value}
                  onChange={(e) => handleMappingChange(i, e.target.value)}
                  className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                >
                  <option value={SKIP}>-- {t("skip")} --</option>
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
          placeholder={t("pasteRowPlaceholder")}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-mono"
        />
        <button
          type="button"
          onClick={handleParse}
          className="rounded-lg border border-violet-200 bg-violet-100 px-3 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-200 transition-colors"
        >
          Parse
        </button>
      </div>

      {message && <p className="text-xs text-amber-700">{message}</p>}

      {preview && preview.length > 0 && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 space-y-2">
          <p className="text-xs font-medium text-emerald-800">{t("parsePreviewTitle")}</p>
          <div className="max-h-56 overflow-y-auto space-y-1">
            {preview.map(({ key, label, value }) => (
              <div key={key} className="grid grid-cols-3 gap-2 text-xs">
                <span className="text-slate-500 col-span-1">{label}</span>
                <span className="col-span-2 text-slate-800 break-words">{value || <em className="text-slate-400">({t("empty")})</em>}</span>
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
