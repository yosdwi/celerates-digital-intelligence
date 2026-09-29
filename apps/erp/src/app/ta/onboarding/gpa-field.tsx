"use client";

/**
 * IPK butuh format desimal "0.00" (mis. "3.75") -- bukan digitsOnly (yang
 * bakal strip titiknya juga). Harus jadi Client Component sendiri (bukan
 * fungsi lokal di dalam Server Component) karena event handler (`onInput`)
 * nggak bisa dikirim sebagai prop ke elemen yang dirender dari Server Component.
 */
export function GpaField({ label, name, defaultValue }: { label: string; name: string; defaultValue?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      <input
        name={name}
        type="text"
        inputMode="decimal"
        defaultValue={defaultValue}
        placeholder="3.75"
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        onInput={(e) => {
          const cleaned = e.currentTarget.value.replace(/[^\d.]/g, "");
          const firstDot = cleaned.indexOf(".");
          e.currentTarget.value = firstDot === -1 ? cleaned : cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, "");
        }}
      />
    </label>
  );
}
