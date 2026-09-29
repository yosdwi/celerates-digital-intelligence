"use client";
import { Printer } from "lucide-react";
import { useTranslations } from "next-intl";

export function PrintButton() {
  const t = useTranslations("school");
  return (
    <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg bg-fuchsia-600 px-4 py-2 text-sm font-medium text-white hover:bg-fuchsia-700">
      <Printer className="h-4 w-4" /> {t("printSavePdf")}
    </button>
  );
}
