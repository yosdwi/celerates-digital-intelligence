"use client";
// Jernih primitives (doc 18 §14): the reusable building blocks for mobile module landings, lists,
// record detail and contextual actions. Visual source: the locked Iteration 1 · Jernih screens.
import Link from "next/link";
import { useEffect, useId, useRef } from "react";
import { ChevronRight, X } from "lucide-react";

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

/** A full-screen mobile surface: Jernih ground, safe-area top inset, room for the tab bar. */
export function MobileScreen({ children, className, label }: { children: React.ReactNode; className?: string; label?: string }) {
  return (
    <div
      aria-label={label}
      className={cx("min-h-[100dvh] bg-j-bg font-jakarta text-j-ink", "px-5 pb-[calc(104px+env(safe-area-inset-bottom))] pt-[max(20px,env(safe-area-inset-top))]", className)}
    >
      <div className="mx-auto flex max-w-xl flex-col gap-4">{children}</div>
    </div>
  );
}

export function ScreenTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <header className="flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[28px] font-extrabold leading-tight tracking-[-0.6px]">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-j-muted">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

export function SectionHeader({ title, action, id }: { title: string; action?: React.ReactNode; id?: string }) {
  return (
    <div className="flex items-center justify-between">
      <h2 id={id} className="text-base font-bold">
        {title}
      </h2>
      {action}
    </div>
  );
}

export function GroupLabel({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-1 text-xs font-bold uppercase tracking-[0.6px] text-j-muted">{children}</h2>;
}

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cx("rounded-j-card border border-j-line bg-j-surface shadow-j-card", className)}>{children}</div>;
}

type Tone = "ok" | "warn" | "accent" | "muted" | "danger";
const TONES: Record<Tone, string> = {
  ok: "bg-j-ok-soft text-j-ok",
  warn: "bg-[#fff1dc] text-[#8a4b06]",
  accent: "bg-j-accent-soft text-j-accent-strong",
  muted: "bg-j-line-soft text-j-muted",
  danger: "bg-[#fde8e6] text-[#a8261c]",
};
export function StatusPill({ tone = "muted", children }: { tone?: Tone; children: React.ReactNode }) {
  return <span className={cx("inline-flex shrink-0 items-center whitespace-nowrap rounded-lg px-2 py-[3px] text-[11px] font-bold", TONES[tone])}>{children}</span>;
}

/** A list row card: identifier, title, facts, status. Used for operational lists (never shrunken tables). */
export function ListCard({
  href,
  eyebrow,
  title,
  facts,
  status,
  onClick,
}: {
  href?: string;
  eyebrow?: string;
  title: string;
  facts?: React.ReactNode;
  status?: React.ReactNode;
  onClick?: () => void;
}) {
  const body = (
    <>
      <span className="flex items-center justify-between gap-2">
        {eyebrow && <span className="truncate text-xs font-bold tracking-[0.2px] text-j-muted">{eyebrow}</span>}
        {status}
      </span>
      <span className="text-base font-bold">{title}</span>
      {facts && <span className="flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-j-muted">{facts}</span>}
    </>
  );
  const cls = "flex w-full flex-col gap-2 rounded-j-card border border-j-line bg-j-surface p-3.5 text-left text-j-ink shadow-j-card";
  if (href)
    return (
      <Link href={href} className={cls}>
        {body}
      </Link>
    );
  return (
    <button type="button" onClick={onClick} className={cls}>
      {body}
    </button>
  );
}

/** A grouped row list inside one card (settings/directory style). */
export function RowList({ children, label }: { children: React.ReactNode; label?: string }) {
  return (
    <Card className="px-3.5">
      <ul aria-label={label} className="divide-y divide-j-line-soft">
        {children}
      </ul>
    </Card>
  );
}

export function Row({
  leading,
  title,
  subtitle,
  trailing,
  href,
  onClick,
  chevron = true,
}: {
  leading?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  trailing?: React.ReactNode;
  href?: string;
  onClick?: () => void;
  chevron?: boolean;
}) {
  const inner = (
    <>
      {leading}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[15px] font-bold">{title}</span>
        {subtitle && <span className="truncate text-xs text-j-muted">{subtitle}</span>}
      </span>
      {trailing}
      {chevron && (href || onClick) && <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-j-faint" />}
    </>
  );
  const cls = "flex min-h-[60px] w-full items-center gap-3 py-2.5 text-left text-j-ink";
  return (
    <li>
      {href ? (
        <Link href={href} className={cls}>
          {inner}
        </Link>
      ) : onClick ? (
        <button type="button" onClick={onClick} className={cls}>
          {inner}
        </button>
      ) : (
        <div className={cls}>{inner}</div>
      )}
    </li>
  );
}

/** Label/value rows for record facts (ERP facts first, doc 18 §12). */
export function FactRows({ rows, label }: { rows: { label: string; value: React.ReactNode }[]; label?: string }) {
  return (
    <Card className="px-3.5 py-1">
      <dl aria-label={label} className="divide-y divide-j-line-soft">
        {rows.map((r) => (
          <div key={r.label} className="flex items-baseline justify-between gap-4 py-2.5 text-sm">
            <dt className="text-j-muted">{r.label}</dt>
            <dd className="text-right font-semibold">{r.value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

/** Bottom action bar for a record's allowed actions. Sits above the tab bar's safe area. */
export function StickyActions({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 flex gap-2.5 border-t border-j-line bg-j-surface px-5 pb-[calc(14px+env(safe-area-inset-bottom))] pt-3 font-jakarta md:hidden">
      {children}
    </div>
  );
}

/** Modal bottom sheet: contextual actions, filters, module landing. Escape and the scrim close it. */
export function BottomSheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 font-jakarta text-j-ink">
      <button type="button" aria-label="Tutup" tabIndex={-1} onClick={onClose} className="absolute inset-0 h-full w-full bg-[rgba(14,23,38,0.4)]" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-bottom-sheet
        className="absolute inset-x-0 bottom-0 flex max-h-[88dvh] flex-col rounded-t-[26px] bg-j-surface shadow-j-sheet outline-none md:left-1/2 md:max-w-lg md:-translate-x-1/2"
      >
        <div className="mx-auto mt-2.5 h-[5px] w-10 shrink-0 rounded-full bg-[#d5dbe5]" aria-hidden />
        <div className="flex shrink-0 items-center justify-between gap-3 px-5 pb-2 pt-3">
          <h2 id={titleId} className="text-[19px] font-extrabold">
            {title}
          </h2>
          <button type="button" onClick={onClose} aria-label="Tutup" className="flex h-11 w-11 items-center justify-center rounded-full text-j-muted hover:bg-j-line-soft">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4">{children}</div>
        {footer && <div className="flex shrink-0 gap-2.5 border-t border-j-line px-5 pb-[calc(14px+env(safe-area-inset-bottom))] pt-3">{footer}</div>}
      </div>
    </div>
  );
}

export const buttonClass = {
  primary: "flex h-[50px] flex-1 items-center justify-center gap-2 rounded-[14px] bg-j-accent px-4 text-[15px] font-bold text-white",
  secondary: "flex h-[50px] flex-1 items-center justify-center gap-2 rounded-[14px] border-[1.5px] border-[#c9d4f2] bg-j-surface px-4 text-[15px] font-bold text-j-accent",
};
