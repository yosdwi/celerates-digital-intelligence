// A reminder campaign as a Tinjau record (doc 21 §8): the audience snapshot with eligibility, the message, the
// sending policy and the delivery progress. Approval (PMO full) is where Celerates issues the personal links.
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { sql } from "@/db";
import { ConformError } from "@/lib/conform/client";
import { canPmo, conformCampaign, pmoActor } from "@/lib/conform/pmo";
import { fmtStamp } from "@/lib/pmo/mobile-format";
import { activeLinksForEmployees } from "@/lib/talent/identity";
import { Card, FactRows, MobileScreen, StatusPill, StickyActions, type Tone } from "@/components/mobile/primitives";
import { RecordHeader, Section } from "@/components/mobile/record";
import { CampaignControls } from "@/components/conform/review";

export const dynamic = "force-dynamic";
const STATE_TONE: Record<string, Tone> = { sent: "ok", pending: "accent", failed_retryable: "warn", failed_final: "danger", unknown: "danger" };

export default async function CampaignReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const actor = await pmoActor("viewer").catch(() => notFound());
  const t = await getTranslations("conform");
  const tm = await getTranslations("mobile");
  const locale = await getLocale();
  let campaign;
  try {
    campaign = await conformCampaign(id.toLowerCase());
  } catch (error) {
    if (error instanceof ConformError && error.status === 404) notFound();
    throw error;
  }
  const links = await activeLinksForEmployees(sql, campaign.recipients.map((r) => r.employee_id));
  const eligible = campaign.recipients.filter((r) => r.eligibility === "eligible");
  const willSend = eligible.filter((r) => links.has(r.employee_id)).length;
  const hasActions = campaign.state === "draft" ? canPmo(actor.level, "full") : ["running", "paused"].includes(campaign.state) && canPmo(actor.level, "editor");
  return (
    <MobileScreen label={t("campaign.title")} withActions={hasActions}>
      <RecordHeader
        back={{ href: "/review", label: tm("tabs.review") }}
        eyebrow={t("campaign.eyebrow")}
        title={campaign.cycle.label}
        subtitle={t("campaign.createdBy", { name: campaign.created_by.replace(/^celerates:/, "").replace(/ <.*>$/, "") })}
        pills={[{ label: t(`campaignState.${campaign.state}`), tone: campaign.state === "running" ? "ok" : campaign.state === "draft" ? "warn" : "muted" }, ...(campaign.pause_reason ? [{ label: t(`pauseReason.${campaign.pause_reason}`), tone: "danger" as Tone }] : [])]}
      />
      <Section id="audience" title={t("campaign.audience")}>
        {campaign.recipients.length === 0 ? (
          <Card className="p-3.5 text-sm text-j-muted" data-campaign-empty>{t("campaign.empty")}</Card>
        ) : (
          <Card className="px-3.5 py-1">
            <ul className="divide-y divide-j-line-soft">
              {campaign.recipients.map((r) => {
                const linked = links.has(r.employee_id);
                const state = campaign.state === "draft" ? (r.eligibility !== "eligible" ? "not_bound" : linked ? "will_send" : "no_account") : r.state;
                return (
                  <li key={r.id} className="flex items-center justify-between gap-3 py-2.5 text-sm" data-recipient={r.employee_id} data-recipient-state={state}>
                    <span className="min-w-0">
                      <span className="block font-semibold">{r.name}</span>
                      <span className="block truncate text-xs text-j-muted">{r.nrp} · {t("daysNeed", { count: r.actionable_days })}{r.missing_tasks ? ` · ${t("tasksMissing", { count: r.missing_tasks })}` : ""}</span>
                    </span>
                    <StatusPill tone={STATE_TONE[state] ?? (state === "will_send" ? "accent" : "muted")}>{t(`recipient.${state}`)}</StatusPill>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </Section>
      <Section id="message" title={t("campaign.message")}>
        <pre className="whitespace-pre-wrap rounded-j-card border border-j-line bg-j-surface p-3.5 font-sans text-[0.8125rem]" data-campaign-message>{campaign.message_preview}</pre>
      </Section>
      <Section id="policy" title={t("campaign.policy")}>
        <FactRows
          rows={[
            { label: t("campaign.window"), value: `${String(campaign.policy.window_start_hour).padStart(2, "0")}.00–${String(campaign.policy.window_end_hour).padStart(2, "0")}.00 WIB` },
            { label: t("campaign.batch"), value: t("campaign.batchValue", { size: campaign.policy.batch_size, minutes: Math.round(campaign.policy.cooldown_seconds / 60) }) },
            { label: t("campaign.retry"), value: String(campaign.policy.max_attempts) },
            { label: t("campaign.willSend"), value: String(campaign.state === "draft" ? willSend : campaign.counts.sent ?? 0) },
            ...(campaign.approved_by ? [{ label: t("campaign.approvedBy"), value: campaign.approved_by.replace(/^celerates:/, "") }] : []),
            ...(campaign.approved_at ? [{ label: t("campaign.approvedAt"), value: fmtStamp(campaign.approved_at, locale) }] : []),
          ]}
        />
      </Section>
      {hasActions && (
        <StickyActions>
          <CampaignControls id={campaign.id} state={campaign.state} canFull={canPmo(actor.level, "full")} willSend={willSend} />
        </StickyActions>
      )}
    </MobileScreen>
  );
}
