// A signature review (doc 18 §17): the TTD request as a record. For a TM Extension/Increment step the record shows
// the request it approves — talent, proposed period and position, the approval journey — before the decision.
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { sql } from "@/db";
import { signatureReview } from "@/lib/review/queue";
import { sessionReviewActor } from "@/lib/review/session";
import { fmtDate, fmtMoney, fmtStamp } from "@/lib/pmo/mobile-format";
import { Card, FactRows, MobileScreen, StatusPill, StickyActions, type Tone } from "@/components/mobile/primitives";
import { AskAgentButton, DocumentCard, RecordHeader, Section } from "@/components/mobile/record";
import { SignatureDecision } from "@/components/mobile/review/decision";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STEP_TONE: Record<string, Tone> = { signed: "ok", pending: "accent", rejected: "danger", not_started: "muted" };
const STATUS_TONE: Record<string, Tone> = { pending: "accent", signed: "ok", rejected: "danger" };

export const dynamic = "force-dynamic";

export default async function SignatureReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const r = await signatureReview(sql, await sessionReviewActor(), id.toLowerCase());
  if (!r) notFound();
  const t = await getTranslations("mobile.review");
  const tm = await getTranslations("mobile");
  const locale = await getLocale();
  const e = r.extension;
  const stepLabel = (code: string | null) => (code ? t(`steps.${code}`) : null);

  return (
    <MobileScreen label={t("kinds.signature")} withActions={r.status === "pending"}>
      <RecordHeader
        back={{ href: "/review", label: tm("tabs.review") }}
        eyebrow={e ? t("extensionEyebrow") : t("kinds.signature")}
        title={e ? e.talent : r.title}
        subtitle={e ? [e.employee_no, e.opty_no].filter(Boolean).join(" · ") : r.requester ? t("requestedBy", { name: r.requester }) : null}
        pills={[
          ...(r.step ? [{ label: stepLabel(r.step)!, tone: "accent" as Tone }] : []),
          { label: t(`signatureStatus.${r.status}`), tone: STATUS_TONE[r.status] ?? "muted" },
        ]}
      />

      {e && (
        <Section id="proposal" title={t("extension.title")}>
          <FactRows
            rows={[
              { label: t("extension.period"), value: `${fmtDate(e.start, locale)} – ${fmtDate(e.end, locale)}` },
              { label: t("extension.currentPosition"), value: e.current_position ?? "—" },
              { label: t("extension.position"), value: e.position ?? "—" },
              { label: t("extension.grade"), value: e.grade ?? "—" },
              { label: t("extension.employment"), value: e.employment_type ?? "—" },
            ]}
          />
          {e.compensation ? (
            <FactRows
              label={t("extension.compensation")}
              rows={[
                { label: t("extension.increment"), value: e.compensation.increment_amount !== null ? fmtMoney(e.compensation.increment_amount) : e.compensation.increment_percent !== null ? `${e.compensation.increment_percent}%` : "—" },
                { label: t("extension.basicSalary"), value: fmtMoney(e.compensation.basic_salary) },
              ]}
            />
          ) : (
            <Card className="p-3.5 text-[0.8125rem] text-j-muted" data-compensation-withheld>
              {t("extension.compensationWithheld")}
            </Card>
          )}
        </Section>
      )}

      {e && (
        <Section id="journey" title={t("journey")}>
          <Card className="px-3.5 py-1">
            <ol className="divide-y divide-j-line-soft">
              {e.steps.map((s) => (
                <li key={s.code} className="flex items-center justify-between gap-3 py-2.5 text-sm" data-journey-step={s.code}>
                  <span className="min-w-0">
                    <span className="block font-semibold">{stepLabel(s.code)}</span>
                    <span className="block truncate text-xs text-j-muted">{s.name ?? "—"}</span>
                  </span>
                  <StatusPill tone={s.code === r.step && r.status === "pending" ? "warn" : STEP_TONE[s.status] ?? "muted"}>
                    {s.code === r.step && r.status === "pending" ? t("yourTurn") : t(`stepStatus.${s.status}`)}
                  </StatusPill>
                </li>
              ))}
            </ol>
          </Card>
        </Section>
      )}

      <Section id="request" title={t("request")}>
        <FactRows
          rows={[
            { label: t("document"), value: r.title },
            { label: t("requester"), value: r.requester ?? "—" },
            { label: t("requestedAt"), value: fmtStamp(r.created_at, locale) },
            ...(r.reject_reason ? [{ label: t("rejectReason"), value: r.reject_reason }] : []),
          ]}
        />
        {(r.notes || e?.notes) && <Card className="whitespace-pre-line p-3.5 text-sm">{r.notes ?? e?.notes}</Card>}
      </Section>

      {(r.document_url || r.attachments.length > 0) && (
        <Section id="documents" title={t("documents")}>
          <div className="flex flex-col gap-2">
            {r.document_url && <DocumentCard name={r.title} meta={t("mainDocument")} value={r.document_url} />}
            {r.attachments.map((a) => (
              <DocumentCard key={a.id} name={a.name} meta={t("attachment")} value={a.path} />
            ))}
          </div>
        </Section>
      )}

      {r.status === "pending" && (
        <StickyActions>
          <SignatureDecision id={r.id} hasSignature={r.has_signature} />
        </StickyActions>
      )}
      {r.status !== "pending" && (
        <StickyActions>
          <AskAgentButton label={t("askAgent")} />
        </StickyActions>
      )}
    </MobileScreen>
  );
}
