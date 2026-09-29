"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Link2 } from "lucide-react";
import { linkTalent } from "@/app/pmo/readiness/actions";
import { Card } from "@/components/mobile/primitives";
import { buttonClass } from "@/components/mobile/styles";

export function LinkTalentForm({ employeeId }: { employeeId: string }) {
  const t = useTranslations("conform.account");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Card className="p-3.5">
      <form
        className="flex flex-col gap-3"
        data-link-talent
        onSubmit={(e) => {
          e.preventDefault();
          const email = String(new FormData(e.currentTarget).get("email") ?? "");
          setError(null);
          start(async () => {
            const result = await linkTalent(employeeId, email);
            if (!result.ok) return setError(result.error);
            router.refresh();
          });
        }}
      >
        <p className="text-sm">{t("notLinked")}</p>
        <label className="flex flex-col text-[13px] font-semibold">
          {t("email")}
          <input name="email" type="email" required maxLength={254} className="mt-1 w-full rounded-xl border border-[#d5dbe5] bg-j-surface px-3 py-2.5 text-[15px] font-normal outline-none focus:border-j-accent" />
        </label>
        {error && <p role="alert" className="text-sm font-semibold text-[#a8261c]">{error}</p>}
        <button type="submit" disabled={pending} data-action="link-talent" className={`${buttonClass.primary} disabled:opacity-50`}>
          <Link2 aria-hidden className="h-[18px] w-[18px]" /> {pending ? "…" : t("link")}
        </button>
      </form>
    </Card>
  );
}
