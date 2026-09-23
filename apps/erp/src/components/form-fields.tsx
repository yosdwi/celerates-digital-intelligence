"use client";
import { useState } from "react";
import { formatThousands, stripThousands } from "@/lib/money-format";

/**
 * Field/SelectField generik dipakai di form "Tambah X Baru" & "Edit X" di
 * seluruh app (sebelumnya didefinisikan ulang nyaris identik di puluhan file).
 * Background selalu putih -- tanpa itu, field yang transparan bakal ikut
 * warna backdrop blur AddRecordModal (bg-white/85 backdrop-blur-2xl) dan
 * kelihatan abu-abu pudar. Untuk select tanpa opsi kosong, pakai prop
 * `includeEmptyOption` -- bukan bikin ulang komponennya.
 */
export function Field({
  label, name, type = "text", required, textarea, rows = 3, defaultValue, hint, placeholder, money, digitsOnly, suggestions,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  textarea?: boolean;
  rows?: number;
  defaultValue?: string;
  hint?: string;
  placeholder?: string;
  /** Nominal uang (Rupiah bulat) -- input digit-only, titik/koma diblokir supaya nggak ada yang salah ketik "1.000.000" jadi 1 atau kesalahan format lain. */
  money?: boolean;
  /** Angka saja, tanpa huruf/simbol -- dipakai buat nomor telepon dsb. */
  digitsOnly?: boolean;
  /** Nilai-nilai yang sudah pernah diinput sebelumnya, ditawarkan lewat <datalist> --
   *  tetap input teks bebas, jadi nilai baru yang belum ada di daftar tetap bisa diketik manual. */
  suggestions?: string[];
}) {
  const baseClass = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500";
  const listId = suggestions ? `${name}-suggestions` : undefined;
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label} {required && <span className="text-red-500">*</span>}</span>
      {textarea ? (
        <textarea name={name} rows={rows} defaultValue={defaultValue} placeholder={placeholder} className={baseClass} />
      ) : money ? (
        <MoneyInput name={name} required={required} defaultValue={defaultValue} placeholder={placeholder} className={baseClass} />
      ) : digitsOnly ? (
        <input
          name={name}
          type="text"
          inputMode="numeric"
          required={required}
          defaultValue={defaultValue}
          placeholder={placeholder}
          className={baseClass}
          onInput={(e) => { e.currentTarget.value = e.currentTarget.value.replace(/[^\d]/g, ""); }}
        />
      ) : (
        <input name={name} type={type} required={required} defaultValue={defaultValue} placeholder={placeholder} className={baseClass} list={listId} autoComplete="off" />
      )}
      {listId && (
        <datalist id={listId}>
          {suggestions!.map((s) => <option key={s} value={s} />)}
        </datalist>
      )}
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

/**
 * Input nominal Rupiah dengan titik pemisah ribuan saat mengetik (mis.
 * "1.000.000"). Value yang diformat cuma tampilan -- angka mentah tanpa
 * titik dikirim lewat hidden input `name` supaya parsing di server action
 * (`Number(formData.get(...))`) tetap benar.
 */
export function MoneyInput({
  name, required, defaultValue, placeholder, className,
}: { name: string; required?: boolean; defaultValue?: string; placeholder?: string; className: string }) {
  // Satu sumber kebenaran (`raw`) -- baik input yang tampil (diformat) maupun
  // hidden input yang benar-benar dikirim ke server sama-sama diturunkan
  // langsung dari state ini di setiap render. Sebelumnya hidden input di-set
  // manual lewat ref di luar React, dan nilainya bisa gagal ke-apply sebelum
  // form di-submit -- akibatnya field harga tampak terisi tapi terkirim kosong.
  const [raw, setRaw] = useState(() => stripThousands(defaultValue));

  return (
    <>
      <input
        type="text"
        inputMode="numeric"
        required={required}
        value={formatThousands(raw)}
        placeholder={placeholder}
        className={className}
        onChange={(e) => setRaw(stripThousands(e.target.value))}
      />
      <input type="hidden" name={name} value={raw} readOnly />
    </>
  );
}

export function SelectField({
  label, name, options, required, defaultValue, includeEmptyOption = true,
}: {
  label: string;
  name: string;
  options: readonly (readonly [string, string])[];
  required?: boolean;
  defaultValue?: string;
  includeEmptyOption?: boolean;
}) {
  const baseClass = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500";
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label} {required && <span className="text-red-500">*</span>}</span>
      <select name={name} required={required} defaultValue={defaultValue} className={baseClass}>
        {includeEmptyOption && <option value="">-</option>}
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

/** Varian ringkas (text-xs, padding lebih kecil) dipakai form inline di dalam kartu/baris tabel (mis. HR employee detail). */
export function CompactField({
  label, name, type = "text", required, defaultValue,
}: { label: string; name: string; type?: string; required?: boolean; defaultValue?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label} {required && <span className="text-red-500">*</span>}</span>
      <input name={name} type={type} required={required} defaultValue={defaultValue} className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs" />
    </label>
  );
}

export function CompactSelectField({
  label, name, options, required, defaultValue,
}: { label: string; name: string; options: readonly (readonly [string, string])[]; required?: boolean; defaultValue?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label} {required && <span className="text-red-500">*</span>}</span>
      <select name={name} required={required} defaultValue={defaultValue} className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs">
        <option value="">-</option>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}
