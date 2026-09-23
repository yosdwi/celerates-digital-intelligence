"use client";
import { useLocale } from "next-intl";
import { useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import { setLocale } from "@/lib/locale-actions";
import type { AppLocale } from "@/i18n/request";

const OPTIONS: { code: AppLocale; flag: string; label: string }[] = [
  { code: "id", flag: "🇮🇩", label: "Bahasa Indonesia" },
  { code: "en", flag: "🇬🇧", label: "English" },
];

export function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  if (pathname === "/login" || pathname.startsWith("/login/")) return null;

  function handleSelect(code: AppLocale) {
    if (code === locale) return;
    startTransition(async () => {
      await setLocale(code);
      router.refresh();
    });
  }

  return (
    <div className="fixed top-4 right-[116px] z-40 flex h-9 items-center gap-0.5 rounded-full bg-white/75 backdrop-blur-xl border border-white/70 px-1 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      {OPTIONS.map((opt) => (
        <button
          key={opt.code}
          onClick={() => handleSelect(opt.code)}
          disabled={isPending}
          title={opt.label}
          className={`flex h-7 w-7 items-center justify-center rounded-full text-sm transition-all duration-150 disabled:opacity-50 ${
            locale === opt.code ? "bg-violet-100 ring-1 ring-violet-300" : "hover:bg-slate-100"
          }`}
        >
          {opt.flag}
        </button>
      ))}
    </div>
  );
}
