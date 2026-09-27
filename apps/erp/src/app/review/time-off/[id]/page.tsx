// A time-off review (doc 18 §17): the request as a record with its approval chain; the current approver decides.
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { sql } from "@/db";
import { daysBetween } from "@/lib/pmo/mobile-data";
import { timeOffReview } from "@/lib/review/queue";
import { sessionReviewActor } from "@/lib/review/session";
import { fmtDate, fmtStamp } from "@/lib/pmo/mobile-format";
import { Card, FactRows, MobileScreen, StatusPill, StickyActions, type Tone } from "@/components/mobile/primitives";
import { DocumentCard, RecordHeader, Section } from "@/components/mobile/record";
import { TimeOffDecision } from "@/components/mobile/review/decision";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TONE: Record<string, Tone> = { pending: "accent", approved: "ok", rejected: "danger", cancelled: "muted" };

export const dynamic = "force-dynamic";

export default async function TimeOffReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const r = await timeOffReview(sql, await sessionReviewActor(), id.toLowerCase());
  if (!r) notFound();
  const t = await getTranslations("mobile.review");
  const tm = await getTranslations("mobile");
  const locale = await getLocale();
  const days = daysBetween(r.start, r.end) + 1;

  return (
    <MobileScreen label={t("kinds.time_off")} withActions={r.my_turn}>
      <RecordHeader
        back={{ href: "/review", label: tm("tabs.review") }}
        eyebrow={t("timeOffEyebrow")}
        title={r.requester}
        subtitle={r.leave_type}
        pills={[{ label: r.my_turn ? t("yourTurn") : t(`timeOffStatus.${r.status}`), tone: r.my_turn ? "warn" : TONE[r.status] ?? "muted" }]}
      />
      <Section id="leave" title={t("timeOff.title")}>
        <FactRows
          rows={[
            { label: t("timeOff.dates"), value: `${fmtDate(r.start, locale)} – ${fmtDate(r.end, locale)}` },
            { label: t("timeOff.days"), value: t("timeOff.dayCount", { count: days }) },
            { label: t("timeOff.delegate"), value: r.delegate ?? "—" },
            { label: t("requestedAt"), value: fmtStamp(r.created_at, locale) },
          ]}
        />
        {r.reason && <Card className="whitespace-pre-line p-3.5 text-sm">{r.reason}</Card>}
      </Section>
      <Section id="journey" title={t("journey")}>
        <Card className="px-3.5 py-1">
          <ol className="divide-y divide-j-line-soft">
            {r.steps.map((s) => (
              <li key={s.order} className="flex items-center justify-between gap-3 py-2.5 text-sm" data-journey-step={s.order}>
                <span className="min-w-0">
                  <span className="block font-semibold">{t("timeOff.step", { order: s.order })}</span>
                  <span className="block truncate text-xs text-j-muted">{[s.name, s.notes].filter(Boolean).join(" · ")}</span>
                </span>
                <StatusPill tone={TONE[s.status] ?? "muted"}>{t(`timeOffStatus.${s.status}`)}</StatusPill>
              </li>
            ))}
          </ol>
        </Card>
      </Section>
      {r.attachments.length > 0 && (
        <Section id="documents" title={t("documents")}>
          <div className="flex flex-col gap-2">
            {r.attachments.map((a) => (
              <DocumentCard key={a.id} name={a.name} meta={t("attachment")} value={a.path} />
            ))}
          </div>
        </Section>
      )}
      {r.my_turn && (
        <StickyActions>
          <TimeOffDecision id={r.id} />
        </StickyActions>
      )}
    </MobileScreen>
  );
}
