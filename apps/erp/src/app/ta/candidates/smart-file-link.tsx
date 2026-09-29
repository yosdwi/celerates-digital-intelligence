"use client";
import { useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { getDocumentSignedUrl } from "@/lib/document-actions";
import { extractStoragePathFromSignedUrl } from "@/lib/storage-url";

export function SmartFileLink({ value, label }: { value: string | null; label?: string }) {
  const t = useTranslations("ta.candidates.table");
  const resolvedLabel = label ?? t("viewCv");
  const [isPending, startTransition] = useTransition();

  if (!value) return <span className="text-xs text-slate-300">-</span>;

  // Link Supabase Storage yang udah pernah digenerate (token 1 jam) harus
  // diperlakukan seperti path internal -- bukan link eksternal permanen --
  // supaya digenerate ulang jadi fresh, bukan dipakai sampai expired.
  const isExternalLink = value.startsWith("http") && !extractStoragePathFromSignedUrl(value);

  if (isExternalLink) {
    return (
      <Link href={value} target="_blank" className="text-brand-600 underline text-xs">
        {label}
      </Link>
    );
  }

  function handleClick() {
    startTransition(async () => {
      const url = await getDocumentSignedUrl(value);
      if (url) window.open(url, "_blank");
    });
  }

  return (
    <button onClick={handleClick} disabled={isPending} className="text-brand-600 underline text-xs disabled:opacity-50">
      {isPending ? "..." : label}
    </button>
  );
}