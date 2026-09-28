// A Talent attendance correction as a Tinjau record (doc 19 §7). The decision is taken here by a PMO editor and
// applied by ConForm, which re-validates the correction and the raw attendance first.
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ConformError } from "@/lib/conform/client";
import { canPmo, conformCorrection, pmoActor } from "@/lib/conform/pmo";
import { fmtDate, fmtStamp } from "@/lib/pmo/mobile-format";
import { Card, FactRows, MobileScreen, StickyActions } from "@/components/mobile/primitives";
import { RecordHeader, Section } from "@/components/mobile/record";
import { CorrectionDecision } from "@/components/conform/review";

export const dynamic = "force-dynamic";

export default async function CorrectionReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const actor = await pmoActor("viewer").catch(() => notFound());
  const t = await getTranslations("mobile.review");
  const tc = await getTranslations("conform");
  const tm = await getTranslations("mobile");
  const locale = await getLocale();
  let c;
  try {
    c = await conformCorrection(id.toLowerCase());
  } catch (error) {
    if (error instanceof ConformError && error.status === 404) notFound();
    throw error;
  }
  const pending = c.status === "pending";
  const decide = pending && c.reviewable && canPmo(actor.level, "editor");
  return (
    <MobileScreen label={t("kinds.correction")} withActions={decide}>
      <RecordHeader
        back={{ href: "/review", label: tm("tabs.review") }}
        eyebrow={t("correctionEyebrow")}
        title={c.name ?? c.employee_id}
        subtitle={[c.nrp, c.role].filter(Boolean).join(" · ")}
        pills={[
          { label: t(`correctionType.${c.resolution_type}`), tone: "accent" },
          { label: pending ? (c.reviewable ? t("yourTurn") : tc(`reviewability.${c.reviewability_reason ?? "unknown"}`)) : tc(`correctionStatus.${c.status}`), tone: pending ? (c.reviewable ? "warn" : "danger") : c.status === "approved" ? "ok" : "muted" },
        ]}
      />
      <Section id="day" title={tc("correction.day")}>
        <FactRows
          rows={[
            { label: tc("correction.date"), value: fmtDate(c.work_date, locale) },
            { label: tc("correction.recordedIn"), value: c.raw_check_in ?? "—" },
            { label: tc("correction.recordedOut"), value: c.raw_check_out ?? "—" },
            ...(c.proposed_check_in ? [{ label: tc("correction.proposedIn"), value: c.proposed_check_in }] : []),
            ...(c.proposed_check_out ? [{ label: tc("correction.proposedOut"), value: c.proposed_check_out }] : []),
            ...(c.absence_type ? [{ label: tc("correction.absence"), value: c.absence_type }] : []),
            ...(c.submitted_at ? [{ label: t("requestedAt"), value: fmtStamp(c.submitted_at, locale) }] : []),
            ...(c.reviewed_by ? [{ label: tc("correction.reviewedBy"), value: c.reviewed_by }] : []),
          ]}
        />
      </Section>
      {pending && (
        <Section id="evidence" title={tc("correction.evidence")}>
          <Card className="overflow-hidden p-2" data-correction-evidence>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/conform/corrections/${c.id}/evidence`} alt={tc("correction.evidence")} className="max-h-[420px] w-full rounded-xl object-contain" />
          </Card>
          {c.evidence?.caption && <Card className="p-3.5 text-sm">{c.evidence.caption}</Card>}
        </Section>
      )}
      {decide && (
        <StickyActions>
          <CorrectionDecision id={c.id} />
        </StickyActions>
      )}
    </MobileScreen>
  );
}
