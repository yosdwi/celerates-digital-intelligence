"use client";
// "Kirim pengingat" (doc 22 R6.2): PMO sends one Talent a personal WhatsApp message with a fresh Celerates link.
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { MessageCircle, Send } from "lucide-react";
import { sendTalentMessage } from "@/app/pmo/readiness/actions";
import { BottomSheet } from "@/components/mobile/primitives";
import { buttonClass } from "@/components/mobile/styles";

const nonce = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}${Math.random()}`).replace(/[^A-Za-z0-9_-]/g, "");

export function TalentMessageButton({ employeeId, name, year, month, needs, missingTasks }: { employeeId: string; name: string; year: number; month: number; needs: number; missingTasks: number }) {
  const t = useTranslations("conform.direct");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <button type="button" onClick={() => { setOpen(true); setError(null); setSent(null); }} data-action="talent-message" className={buttonClass.secondary}>
        <MessageCircle aria-hidden className="h-[18px] w-[18px]" /> {t("button")}
      </button>
      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title={t("title")}
        footer={
          sent ? (
            <button type="button" onClick={() => setOpen(false)} className={buttonClass.primary}>{t("close")}</button>
          ) : (
            <>
              <button type="button" onClick={() => setOpen(false)} className={buttonClass.secondary}>{t("cancel")}</button>
              <button
                type="button"
                disabled={pending}
                data-action="talent-message-confirm"
                onClick={() =>
                  start(async () => {
                    setError(null);
                    const result = await sendTalentMessage(employeeId, year, month, nonce());
                    if (!result.ok) return setError(result.error);
                    setSent(result.data.status === "unknown" ? t("unknown") : t("sent"));
                  })
                }
                className={`${buttonClass.primary} disabled:opacity-50`}
              >
                <Send aria-hidden className="h-[18px] w-[18px]" /> {pending ? "…" : t("send")}
              </button>
            </>
          )
        }
      >
        <div className="flex flex-col gap-2 pb-1 text-sm">
          <p>{t("body", { name })}</p>
          <p className="text-j-muted">{needs + missingTasks > 0 ? t("open", { needs, tasks: missingTasks }) : t("clear")}</p>
          <p className="text-xs text-j-muted">{t("rules")}</p>
          {sent && <p role="status" className="font-semibold text-j-ok" data-talent-message-sent>{sent}</p>}
          {error && <p role="alert" className="font-semibold text-[#a8261c]">{error}</p>}
        </div>
      </BottomSheet>
    </>
  );
}
