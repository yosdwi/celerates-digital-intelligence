"use client";
// Mobile record grammar (doc 18 §16): module header → list → full-screen record (header, grouped fact sections,
// documents as cards, related records) → contextual action (sticky or sheet) → contextual Agent.
import Link from "next/link";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, ChevronLeft, ExternalLink, FileText, Link2, Sparkles } from "lucide-react";
import { getDocumentSignedUrl } from "@/lib/document-actions";
import { extractStoragePathFromSignedUrl } from "@/lib/storage-url";
import { useMobileData } from "./data";
import { openAgent } from "./events";
import { ModuleGlyph, ModuleLandingSheet, useModuleLabel, useOpenModules } from "./modules";
import { buttonClass, Card, StatusPill, type Tone } from "./primitives";

/** Module chip (opens the module's landing sheet), page title, and the module's mobile-native siblings. */
export function ModuleHeader({ moduleKey, title, siblings }: { moduleKey: string; title: string; siblings?: { href: string; label: string; active?: boolean }[] }) {
  const modules = useOpenModules();
  const label = useModuleLabel();
  const { signals } = useMobileData();
  const [open, setOpen] = useState(false);
  const mod = modules.find((m) => m.key === moduleKey) ?? null;
  return (
    <header className="flex flex-col gap-3" data-module-header={moduleKey}>
      {mod && (
        <button type="button" onClick={() => setOpen(true)} className="flex min-h-11 items-center gap-2 self-start rounded-full border border-j-line bg-j-surface py-1 pl-1 pr-3 text-sm font-bold">
          <ModuleGlyph module={mod} size="sm" />
          {label(mod.config.label)}
          <ChevronDown aria-hidden className="h-4 w-4 text-j-muted" />
        </button>
      )}
      <h1 className="text-[1.75rem] font-extrabold leading-tight tracking-[-0.6px]">{title}</h1>
      {siblings && siblings.length > 1 && (
        <nav aria-label={label(mod?.config.label ?? "")} className="-mx-5 flex gap-2 overflow-x-auto px-5 [scrollbar-width:none]">
          {siblings.map((s) => (
            <Link key={s.href} href={s.href} aria-current={s.active ? "page" : undefined} className={`flex h-9 shrink-0 items-center rounded-xl px-3 text-[0.8125rem] ${s.active ? "bg-j-accent-soft font-bold text-j-accent-strong" : "font-semibold text-j-muted"}`}>
              {s.label}
            </Link>
          ))}
        </nav>
      )}
      {open && <ModuleLandingSheet module={mod} signals={signals ?? []} onClose={() => setOpen(false)} />}
    </header>
  );
}

export function RecordHeader({
  back,
  eyebrow,
  title,
  subtitle,
  pills,
}: {
  back: { href: string; label: string };
  eyebrow: string;
  title: string;
  subtitle?: string | null;
  pills?: { label: string; tone: Tone }[];
}) {
  return (
    <header className="flex flex-col gap-1.5" data-record-header>
      <Link href={back.href} className="-ml-2 flex h-11 items-center gap-0.5 self-start px-2 text-base font-semibold text-j-accent">
        <ChevronLeft aria-hidden className="h-[22px] w-[22px]" strokeWidth={2.2} />
        {back.label}
      </Link>
      <span className="text-xs font-bold uppercase tracking-[0.4px] text-j-muted">{eyebrow}</span>
      <h1 className="text-[1.625rem] font-extrabold leading-tight tracking-[-0.5px]">{title}</h1>
      {subtitle && <p className="text-[0.9375rem] font-semibold text-j-muted">{subtitle}</p>}
      {pills && pills.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1.5">
          {pills.map((p) => (
            <StatusPill key={p.label} tone={p.tone}>
              {p.label}
            </StatusPill>
          ))}
        </div>
      )}
    </header>
  );
}

export function Section({ title, action, children, id }: { title: string; action?: React.ReactNode; children: React.ReactNode; id?: string }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2" data-record-section={id}>
      <div className="flex items-center justify-between">
        <h2 id={id} className="text-[0.9375rem] font-bold">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function ProgressMeter({ value, from, to, label }: { value: number; from: string; to: string; label: string }) {
  return (
    <Card className="flex flex-col gap-2.5 p-3.5">
      <div className="flex justify-between text-[0.8125rem]">
        <span className="font-bold">{label}</span>
        <span className="text-j-muted">{value}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded bg-j-line-soft" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className={`h-2 rounded ${value >= 90 ? "bg-j-warn-dot" : "bg-j-accent"}`} style={{ width: `${value}%` }} />
      </div>
      <div className="flex justify-between text-xs text-j-muted">
        <span>{from}</span>
        <span>{to}</span>
      </div>
    </Card>
  );
}

/** A document as a card (not a URL in a table cell). Internal files open through the authorized document route. */
export function DocumentCard({ name, meta, value, pill }: { name: string; meta?: string | null; value: string | null; pill?: { label: string; tone: Tone } | null }) {
  const t = useTranslations("mobile.record");
  const [pending, start] = useTransition();
  const external = Boolean(value && value.startsWith("http") && !extractStoragePathFromSignedUrl(value));
  const open = () => {
    if (!value) return;
    if (external) {
      window.open(value, "_blank", "noopener");
      return;
    }
    start(async () => {
      const url = await getDocumentSignedUrl(value);
      if (url) window.open(url, "_blank", "noopener");
    });
  };
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-j-line bg-j-surface p-3 shadow-j-card" data-document-card>
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] ${external ? "bg-j-accent-soft text-j-accent" : "bg-[#fdebe8] text-[#b3261e]"}`}>
        {external ? <Link2 aria-hidden className="h-5 w-5" /> : <FileText aria-hidden className="h-5 w-5" />}
      </span>
      <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
        <span className="max-w-full truncate text-sm font-semibold">{name}</span>
        {meta && <span className="max-w-full truncate text-xs text-j-muted">{meta}</span>}
        {pill && <StatusPill tone={pill.tone}>{pill.label}</StatusPill>}
      </span>
      {value ? (
        <button type="button" onClick={open} disabled={pending} className="flex h-11 shrink-0 items-center gap-1 rounded-xl px-2.5 text-[0.8125rem] font-bold text-j-accent disabled:opacity-50">
          {pending ? "…" : t("open")}
          <ExternalLink aria-hidden className="h-3.5 w-3.5" />
        </button>
      ) : (
        <span className="shrink-0 text-xs text-j-muted">{t("noFile")}</span>
      )}
    </div>
  );
}

/** Contextual Agent entry: the Agent opens on this page, so ERP resolves "ini" to this record (doc 18 §16). */
export function AskAgentButton({ label, variant = "secondary" }: { label: string; variant?: "primary" | "secondary" }) {
  return (
    <button type="button" onClick={openAgent} data-ask-agent className={buttonClass[variant]}>
      <Sparkles aria-hidden className="h-[18px] w-[18px]" />
      {label}
    </button>
  );
}
