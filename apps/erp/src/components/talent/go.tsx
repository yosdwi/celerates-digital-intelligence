"use client";
// Grant exchange on the Talent's device: one explicit sign-in call redeems the single-use grant for a normal session.
import { useEffect, useRef, useState } from "react";
import { signIn } from "next-auth/react";
import { useTranslations } from "next-intl";
import { Link2Off, Loader2, ShieldAlert } from "lucide-react";

export function LinkNotice({ title, body, kind }: { title: string; body: string; kind: "invalid" | "other-account" }) {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-j-bg px-6 font-sans text-j-ink" data-link-notice={kind}>
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#fde8e6] text-[#a8261c]">
          {kind === "invalid" ? <Link2Off aria-hidden className="h-7 w-7" /> : <ShieldAlert aria-hidden className="h-7 w-7" />}
        </span>
        <h1 className="text-xl font-extrabold">{title}</h1>
        <p className="text-sm text-j-muted">{body}</p>
      </div>
    </div>
  );
}

export function GoSignIn({ code, target }: { code: string; target: string }) {
  const t = useTranslations("talent.go");
  const started = useRef(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    signIn("talent-link", { code, redirect: false })
      .then((result) => {
        if (result?.ok && !result.error) window.location.replace(target);
        else setFailed(true);
      })
      .catch(() => setFailed(true));
  }, [code, target]);
  if (failed) return <LinkNotice title={t("invalidTitle")} body={t("invalidBody")} kind="invalid" />;
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-j-bg font-sans text-j-ink" data-go-signing-in>
      <p className="flex items-center gap-2 text-sm font-semibold text-j-muted">
        <Loader2 aria-hidden className="h-5 w-5 animate-spin" /> {t("opening")}
      </p>
    </div>
  );
}
