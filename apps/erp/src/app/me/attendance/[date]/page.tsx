// One requirement as a full-screen record (doc 19 §6): the recorded punches, status, and the "Lengkapi" sheet.
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ChevronLeft } from "lucide-react";
import { ConformError } from "@/lib/conform/client";
import { conformRequirements, cycleLabelFor } from "@/lib/conform/pmo";
import { fmtDate } from "@/lib/pmo/mobile-format";
import { requireTalentActor } from "@/lib/talent/actor";
import { Card, FactRows, StatusPill } from "@/components/mobile/primitives";
import { CorrectionSheet } from "@/components/talent/talent";

export const dynamic = "force-dynamic";
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function TalentRequirementPage({ params, searchParams }: { params: Promise<{ date: string }>; searchParams: Promise<{ year?: string; month?: string }> }) {
  const { date } = await params;
  if (!DATE.test(date)) notFound();
  const actor = await requireTalentActor();
  const t = await getTranslations("talent");
  const locale = await getLocale();
  const sp = await searchParams;
  const cycle = Number(sp.year) && Number(sp.month) ? { year: Number(sp.year), month: Number(sp.month) } : cycleLabelFor(date);
  let requirement = null;
  let unavailable = false;
  try {
    const data = await conformRequirements(actor.link.conform_employee_id, cycle.year, cycle.month);
    requirement = data.requirements.find((r) => r.work_date === date) ?? null;
  } catch (error) {
    if (!(error instanceof ConformError)) throw error;
    unavailable = true;
  }
  const back = (
    <Link href="/me" className="-ml-2 flex h-11 items-center gap-0.5 self-start px-2 text-base font-semibold text-j-accent">
      <ChevronLeft aria-hidden className="h-[22px] w-[22px]" strokeWidth={2.2} /> {t("title")}
    </Link>
  );
  if (!requirement)
    return (
      <div className="min-h-[100dvh] bg-j-bg font-jakarta text-j-ink">
        <div className="mx-auto flex max-w-xl flex-col gap-4 px-5 pt-[max(16px,env(safe-area-inset-top))]">
          {back}
          <Card className="p-4 text-sm text-j-muted" data-requirement-gone>{unavailable ? t("unavailable") : t("nothingForDate")}</Card>
        </div>
      </div>
    );
  const c = requirement.correction;
  const rejected = requirement.state === "needs_action" && c?.status === "rejected";
  return (
    <div className="min-h-[100dvh] bg-j-bg font-jakarta text-j-ink" data-talent-requirement={date}>
      <div className="mx-auto flex max-w-xl flex-col gap-4 px-5 pb-[calc(120px+env(safe-area-inset-bottom))] pt-[max(16px,env(safe-area-inset-top))]">
        <header className="flex flex-col gap-1.5">
          {back}
          <span className="text-xs font-bold uppercase tracking-[0.4px] text-j-muted">{t("attendance")}</span>
          <h1 className="text-[26px] font-extrabold leading-tight tracking-[-0.5px]">{fmtDate(date, locale)}</h1>
          <p className="text-[15px] font-semibold text-j-muted">{t(`gap.${requirement.gap}`)}</p>
          <div className="mt-1 flex gap-1.5">
            <StatusPill tone={requirement.state === "needs_action" ? (rejected ? "danger" : "warn") : "accent"}>
              {requirement.state === "needs_action" ? (rejected ? t("rejected") : t("needs")) : t("waiting")}
            </StatusPill>
          </div>
        </header>
        <section className="flex flex-col gap-2" data-record-section="recorded">
          <h2 className="text-[15px] font-bold">{t("recorded")}</h2>
          <FactRows
            rows={[
              { label: t("fix.checkIn"), value: requirement.raw_check_in ?? t("missing") },
              { label: t("fix.checkOut"), value: requirement.raw_check_out ?? t("missing") },
            ]}
          />
        </section>
        {c && (
          <section className="flex flex-col gap-2" data-record-section="submission">
            <h2 className="text-[15px] font-bold">{t("yourSubmission")}</h2>
            <FactRows
              rows={[
                { label: t("submissionStatus"), value: t(`correctionStatus.${c.status ?? "pending"}`) },
                ...(c.proposed_check_in ? [{ label: t("fix.checkIn"), value: c.proposed_check_in }] : []),
                ...(c.proposed_check_out ? [{ label: t("fix.checkOut"), value: c.proposed_check_out }] : []),
                ...(c.absence_type ? [{ label: t("fix.what"), value: t(`fix.actions.${c.absence_type}`) }] : []),
              ]}
            />
            {c.rejection_reason && <Card className="border-[#f3c7c2] p-3.5 text-sm" data-rejection-reason>{t("rejectionReason", { reason: c.rejection_reason })}</Card>}
          </section>
        )}
        {requirement.state === "waiting_review" && <Card className="p-3.5 text-sm text-j-muted">{t("waitingBody")}</Card>}
      </div>
      {requirement.state === "needs_action" && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-j-line bg-j-surface/95 px-5 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3 backdrop-blur">
          <div className="mx-auto flex max-w-xl">
            <CorrectionSheet requirement={requirement} />
          </div>
        </div>
      )}
    </div>
  );
}
