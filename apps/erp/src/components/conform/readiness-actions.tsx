"use client";
// Operational Readiness actions (doc 21 §7): canonical BAST via ConForm, canonical attendance CSV via ConForm,
// a Talent reminder campaign (approved in Tinjau), the PMO group summary, and the Owner's kill switch.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { BellRing, ChevronRight, FileDown, FileText, Megaphone, OctagonX, Users } from "lucide-react";
import type { BastJob } from "@/lib/conform/client";
import { bastJobStatus, createCampaign, generateBast, pmoSummaryPreview, sendPmoSummary, setKillSwitch } from "@/app/pmo/readiness/actions";
import { BottomSheet, Card, Row, RowList, StatusPill } from "@/components/mobile/primitives";
import { buttonClass } from "@/components/mobile/styles";

const field = "mt-1 w-full rounded-xl border border-[#d5dbe5] bg-j-surface px-3 py-2.5 text-[15px] font-normal text-j-ink outline-none focus:border-j-accent";
const label = "flex flex-col text-[13px] font-semibold";
const nonce = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}${Math.random()}`).replace(/[^A-Za-z0-9_-]/g, "");

type CampaignRow = { id: string; state: string; label: string; counts: Record<string, number> };

export function ReadinessActions(props: {
  year: number;
  month: number;
  cycleLabel: string;
  needs: number;
  canEdit: boolean;
  canFull: boolean;
  isOwner: boolean;
  killSwitch: boolean;
  campaigns: CampaignRow[];
}) {
  const t = useTranslations("conform");
  const router = useRouter();
  const [sheet, setSheet] = useState<"bast" | "csv" | "campaign" | "summary" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [job, setJob] = useState<BastJob | null>(null);
  const [summary, setSummary] = useState<{ text: string; groupConfigured: boolean } | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [force, setForce] = useState(false);

  useEffect(() => {
    if (!job || !["pending", "running"].includes(job.status)) return;
    const timer = window.setTimeout(async () => {
      const result = await bastJobStatus(job.id);
      if (result.ok) setJob(result.data);
      else setError(result.error);
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [job]);

  const open = (name: typeof sheet) => {
    setError(null);
    setSent(null);
    setSheet(name);
    if (name === "summary")
      start(async () => {
        const result = await pmoSummaryPreview(props.year, props.month);
        if (result.ok) setSummary(result.data);
        else setError(result.error);
      });
  };

  return (
    <section className="flex flex-col gap-2" data-record-section="actions">
      <h2 className="text-[15px] font-bold">{t("actions")}</h2>
      <RowList>
        {props.canFull && <Row onClick={() => open("bast")} leading={<FileText aria-hidden className="h-5 w-5 text-j-accent" />} title={t("bast.title")} subtitle={t("bast.subtitle")} />}
        {props.canEdit && <Row onClick={() => open("csv")} leading={<FileDown aria-hidden className="h-5 w-5 text-j-accent" />} title={t("csv.title")} subtitle={t("csv.subtitle")} />}
        {props.canEdit && <Row onClick={() => open("campaign")} leading={<BellRing aria-hidden className="h-5 w-5 text-j-accent" />} title={t("campaign.title")} subtitle={t("campaign.subtitle", { count: props.needs })} />}
        {props.canEdit && <Row onClick={() => open("summary")} leading={<Megaphone aria-hidden className="h-5 w-5 text-j-accent" />} title={t("summaryGroup.title")} subtitle={t("summaryGroup.subtitle")} />}
      </RowList>

      {props.campaigns.length > 0 && (
        <Card className="px-3.5 py-1" data-readiness-campaigns>
          <ul className="divide-y divide-j-line-soft">
            {props.campaigns.map((c) => (
              <li key={c.id}>
                <Link href={`/review/campaign/${c.id}`} className="flex min-h-[52px] items-center gap-3 py-2 text-sm">
                  <Users aria-hidden className="h-4 w-4 text-j-muted" />
                  <span className="flex-1">
                    <span className="block font-semibold">{c.label}</span>
                    <span className="block text-xs text-j-muted">{t("campaign.counts", { sent: c.counts.sent ?? 0, pending: c.counts.pending ?? 0 })}</span>
                  </span>
                  <StatusPill tone={c.state === "running" ? "ok" : c.state === "paused" ? "warn" : "accent"}>{t(`campaignState.${c.state}`)}</StatusPill>
                  <ChevronRight aria-hidden className="h-4 w-4 text-j-faint" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {props.isOwner && (
        <Card className="flex items-center gap-3 p-3.5" data-kill-switch={props.killSwitch ? "on" : "off"}>
          <OctagonX aria-hidden className={`h-5 w-5 ${props.killSwitch ? "text-[#b3261e]" : "text-j-muted"}`} />
          <span className="flex-1 text-sm">
            <span className="block font-bold">{t("kill.title")}</span>
            <span className="block text-xs text-j-muted">{props.killSwitch ? t("kill.on") : t("kill.off")}</span>
          </span>
          <button
            type="button"
            disabled={pending}
            onClick={() => start(async () => { const r = await setKillSwitch(!props.killSwitch); if (!r.ok) setError(r.error); router.refresh(); })}
            className={`h-10 rounded-xl px-3 text-[13px] font-bold ${props.killSwitch ? "border border-j-line text-j-accent" : "bg-[#b3261e] text-white"}`}
          >
            {props.killSwitch ? t("kill.resume") : t("kill.stop")}
          </button>
        </Card>
      )}
      {error && !sheet && <p role="alert" className="text-sm font-semibold text-[#a8261c]">{error}</p>}

      <BottomSheet open={sheet === "bast"} onClose={() => setSheet(null)} title={t("bast.title")}>
        {job ? (
          <div className="flex flex-col gap-3 pb-2" data-bast-job={job.status}>
            <p className="text-sm">{t(`bast.status.${job.status}`)}</p>
            {job.status === "succeeded" && (
              <a href={`/api/conform/bast/${job.id}`} className={buttonClass.primary} data-bast-download>
                <FileDown aria-hidden className="h-[18px] w-[18px]" /> {t("bast.download")}
              </a>
            )}
            {job.status === "failed" && <p className="text-sm text-[#a8261c]">{job.error_code}</p>}
          </div>
        ) : (
          <form
            className="flex flex-col gap-3 pb-2"
            onSubmit={(e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              setError(null);
              start(async () => {
                const result = await generateBast({
                  year: props.year,
                  month: props.month,
                  reportType: String(data.get("report_type")) as "developer" | "iotoperation",
                  mode: String(data.get("mode")) as "preview" | "final",
                  force,
                  reason: String(data.get("reason") ?? ""),
                });
                if (result.ok) setJob(result.data);
                else setError(result.error);
              });
            }}
          >
            <p className="text-xs text-j-muted">{t("bast.note", { month: `${props.month}/${props.year}` })}</p>
            <label className={label}>{t("team.label")}<select name="report_type" className={field}><option value="developer">{t("team.developer")}</option><option value="iotoperation">{t("team.iotoperation")}</option></select></label>
            <label className={label}>{t("bast.mode")}<select name="mode" className={field}><option value="preview">{t("bast.preview")}</option><option value="final">{t("bast.final")}</option></select></label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} /> {t("bast.force")}</label>
            {force && <label className={label}>{t("bast.reason")}<textarea name="reason" rows={2} required className={field} /></label>}
            {error && <p role="alert" className="text-sm font-semibold text-[#a8261c]">{error}</p>}
            <button type="submit" disabled={pending} data-action="bast-generate" className={`${buttonClass.primary} disabled:opacity-50`}>{pending ? "…" : t("bast.generate")}</button>
          </form>
        )}
      </BottomSheet>

      <BottomSheet open={sheet === "csv"} onClose={() => setSheet(null)} title={t("csv.title")}>
        <form method="post" action="/api/conform/exports/attendance" className="flex flex-col gap-3 pb-2" data-csv-form>
          <input type="hidden" name="year" value={props.year} />
          <input type="hidden" name="month" value={props.month} />
          <p className="text-xs text-j-muted">{t("csv.note", { cycle: props.cycleLabel })}</p>
          <label className={label}>{t("team.label")}<select name="report_type" className={field}><option value="developer">{t("team.developer")}</option><option value="shifting">{t("team.iotoperation")}</option></select></label>
          <button type="submit" data-action="csv-export" className={buttonClass.primary}><FileDown aria-hidden className="h-[18px] w-[18px]" /> {t("csv.download")}</button>
        </form>
      </BottomSheet>

      <BottomSheet open={sheet === "campaign"} onClose={() => setSheet(null)} title={t("campaign.title")}>
        <div className="flex flex-col gap-3 pb-2">
          <p className="text-sm">{t("campaign.explain", { count: props.needs, cycle: props.cycleLabel })}</p>
          <p className="text-xs text-j-muted">{t("campaign.rules")}</p>
          {error && <p role="alert" className="text-sm font-semibold text-[#a8261c]">{error}</p>}
          <button
            type="button"
            disabled={pending}
            data-action="campaign-create"
            onClick={() => start(async () => { const r = await createCampaign(props.year, props.month, nonce()); if (r.ok) router.push(`/review/campaign/${r.data.id}`); else setError(r.error); })}
            className={`${buttonClass.primary} disabled:opacity-50`}
          >
            {pending ? "…" : t("campaign.create")}
          </button>
        </div>
      </BottomSheet>

      <BottomSheet open={sheet === "summary"} onClose={() => setSheet(null)} title={t("summaryGroup.title")}>
        <div className="flex flex-col gap-3 pb-2">
          {summary ? <pre className="whitespace-pre-wrap rounded-xl bg-j-field p-3 font-jakarta text-[13px]" data-summary-preview>{summary.text}</pre> : <p className="text-sm text-j-muted">…</p>}
          {summary && !summary.groupConfigured && <p className="text-xs text-[#8a4b06]">{t("summaryGroup.noGroup")}</p>}
          {sent && <p role="status" className="text-sm font-semibold text-j-ok" data-summary-sent>{sent}</p>}
          {error && <p role="alert" className="text-sm font-semibold text-[#a8261c]">{error}</p>}
          <button
            type="button"
            disabled={pending || !summary?.groupConfigured}
            data-action="summary-send"
            onClick={() => start(async () => { const r = await sendPmoSummary(props.year, props.month, nonce()); if (r.ok) setSent(r.data.status === "duplicate" ? t("summaryGroup.duplicate") : t("summaryGroup.sent")); else setError(r.error); })}
            className={`${buttonClass.primary} disabled:opacity-50`}
          >
            {t("summaryGroup.send")}
          </button>
        </div>
      </BottomSheet>
    </section>
  );
}
