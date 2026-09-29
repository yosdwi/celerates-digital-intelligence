"use client";
import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { getDocumentSignedUrl } from "@/lib/document-actions";
export function DocumentButton({ path, label }: { path: string | null; label: string }) {
  const t = useTranslations("ta.onboarding.documentButton");
  const [isPending, startTransition] = useTransition();
  if (!path) return <span className="text-xs text-slate-300">-</span>;
  function handleClick() {
    startTransition(async () => {
      const url = await getDocumentSignedUrl(path);
      if (url) window.open(url, "_blank");
    });
  }
  return (
    <button onClick={handleClick} disabled={isPending} className="text-brand-600 underline text-xs disabled:opacity-50">
      {isPending ? t("loading") : label}
    </button>
  );
}