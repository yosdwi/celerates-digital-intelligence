"use client";
import { useState, useTransition } from "react";
import { createPic } from "@/lib/pic-actions";

export function PicSelect({
  name,
  label,
  options,
  defaultValue,
  required,
  currentPath,
}: {
  name: string;
  label: string;
  options: string[];
  defaultValue?: string;
  required?: boolean;
  currentPath: string;
}) {
  // Requisition/candidate ta_pic_name bisa berisi nama yang belum ada di tabel
  // referensi `pics` (mis. hasil import sheet) -- kalau defaultValue itu nggak
  // ada di options, <select value={selected}> nggak nemu <option> yang cocok
  // dan browser diam-diam jatuh ke opsi kosong, padahal `selected` state-nya
  // sendiri udah benar. Suntikkan dulu ke localOptions biar selalu ke-render.
  const [localOptions, setLocalOptions] = useState(() =>
    defaultValue && !options.includes(defaultValue) ? [...options, defaultValue] : options
  );
  const [mode, setMode] = useState<"select" | "new">("select");
  const [selected, setSelected] = useState(defaultValue ?? "");
  const [, startTransition] = useTransition();

  function handleSelectChange(e: React.ChangeEvent<HTMLSelectElement>) {
    if (e.target.value === "__new__") {
      setMode("new");
    } else {
      setSelected(e.target.value);
    }
  }

  function handleConfirmNew(value: string) {
    const trimmed = value.trim();
    if (!trimmed) { setMode("select"); return; }
    startTransition(async () => {
      const savedName = await createPic(trimmed, currentPath);
      // Only switch back to the <select> once the new option is actually in
      // localOptions -- flipping mode earlier left `selected` pointing at a
      // value with no matching <option>, so the browser silently falls back
      // to the blank option and the new PIC never actually gets submitted.
      setLocalOptions((prev) => (prev.includes(savedName) ? prev : [...prev, savedName]));
      setSelected(savedName);
      setMode("select");
    });
  }

  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label} {required && <span className="text-red-500">*</span>}</span>
      {mode === "select" ? (
        <select
          name={name}
          required={required}
          value={selected}
          onChange={handleSelectChange}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        >
          <option value="">- pilih -</option>
          {localOptions.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
          <option value="__new__">+ Tambah PIC Baru</option>
        </select>
      ) : (
        <input
          name={name}
          autoFocus
          required={required}
          placeholder="Nama PIC baru, lalu tekan Enter"
          defaultValue=""
          className="w-full rounded-lg border border-brand-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
          onBlur={(e) => handleConfirmNew(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") { e.preventDefault(); setMode("select"); }
            if (e.key === "Enter") {
              e.preventDefault();
              handleConfirmNew(e.currentTarget.value);
            }
          }}
        />
      )}
    </label>
  );
}