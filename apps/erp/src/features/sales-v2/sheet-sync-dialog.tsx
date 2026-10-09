"use client";
// Google Sheet Sync as a dialog (contract §12), in place of leaving for the V1 sheet-sync page. Same V1 actions and
// components (connect, column mapping, pull/push) per page: Opportunity Tracker and PQ Tracker each keep their own. Sync runs
// on the company Google account an Owner connected (QA 2026-10-09); until then the dialog says who must do what.
import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { RefreshCw } from "lucide-react";
import { Button, Callout, Dialog, DialogBody, FormField, Input, Select, Tooltip } from "@crisp-ui-kit/crisp";
import * as ot from "@/app/sales/opportunity-tracker/sheet-sync/actions";
import { MappingSection as OtMapping } from "@/app/sales/opportunity-tracker/sheet-sync/mapping-section";
import { SyncButtons as OtSync } from "@/app/sales/opportunity-tracker/sheet-sync/sync-buttons";
import { TARGET_FIELDS as OT_FIELDS } from "@/app/sales/opportunity-tracker/sheet-sync/target-fields";
import * as pq from "@/app/sales/sheet-sync/actions";
import { MappingSection as PqMapping } from "@/app/sales/sheet-sync/mapping-section";
import { SyncButtons as PqSync } from "@/app/sales/sheet-sync/sync-buttons";
import { TARGET_FIELDS as PQ_FIELDS } from "@/app/sales/sheet-sync/target-fields";
import type { TargetField } from "@/components/column-mapping-form";
import type { SheetSyncData } from "./data";
import { availableSheets, disconnectGoogleAccount, sheetTabs } from "./sheet-actions";

/** One page's V1 sheet-sync pieces. */
type Parts = {
  connectSheet: (fd: FormData) => Promise<unknown>;
  MappingSection: (p: { targetFields: TargetField[]; savedMapping: Record<string, string> }) => React.ReactNode;
  SyncButtons: () => React.ReactNode;
  targetFields: TargetField[];
};
export const OT_SHEET_SYNC: Parts = { connectSheet: ot.connectSheet, MappingSection: OtMapping, SyncButtons: OtSync, targetFields: OT_FIELDS };
export const PQ_SHEET_SYNC: Parts = { connectSheet: pq.connectSheet, MappingSection: PqMapping, SyncButtons: PqSync, targetFields: PQ_FIELDS };

/** Where Google's consent page sent the Owner back to (`?sheet=`), as a message. */
const OUTCOME: Record<string, { tone: "success" | "warning"; text: string }> = {
  connected: { tone: "success", text: "Akun Google terhubung. Pilih Google Sheet di bawah." },
  "wrong-account": { tone: "warning", text: "Akun yang dipilih di Google bukan akun yang ditentukan. Ulangi dan pilih akun yang benar." },
  scopes: { tone: "warning", text: "Izin Google Sheets / Drive tidak dicentang semua. Ulangi dan setujui semua izin." },
  cancelled: { tone: "warning", text: "Menghubungkan akun Google dibatalkan." },
  state: { tone: "warning", text: "Sesi menghubungkan akun kedaluwarsa. Ulangi." },
  failed: { tone: "warning", text: "Google tidak memberi akses. Ulangi; kalau tetap gagal, cek OAuth client di server." },
};

export function SheetSyncButton({ data, parts }: { data: SheetSyncData; parts: Parts }) {
  const outcome = useSearchParams().get("sheet");
  const [open, setOpen] = useState(!!outcome && outcome in OUTCOME);
  return (
    <>
      {/* An icon with its name on hover keeps the toolbar on one line on a laptop (QA 2026-10-08). */}
      <Tooltip content="Google Sheet Sync">
        <Button size="sm" intent="ghost" onClick={() => setOpen(true)} aria-label="Google Sheet Sync" data-testid="sales-v2-sheet-sync">
          <RefreshCw size={14} />
        </Button>
      </Tooltip>
      <Dialog open={open} onOpenChange={setOpen} title="Google Sheet Sync" icon={<RefreshCw size={16} />} closeLabel="Tutup" width={640} data-sales-v2-dialog="sheet-sync">
        {open && <SheetSyncBody data={data} parts={parts} outcome={outcome ? OUTCOME[outcome] : undefined} />}
      </Dialog>
    </>
  );
}

function SheetSyncBody({ data, parts: { connectSheet, MappingSection, SyncButtons, targetFields }, outcome }: { data: SheetSyncData; parts: Parts; outcome?: { tone: "success" | "warning"; text: string } }) {
  const t = useTranslations("sales.sheetSync");
  const router = useRouter();
  const path = usePathname();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const c = data.connection;
  const [url, setUrl] = useState(c?.url ?? "");
  const [tab, setTab] = useState(c?.sheetName ?? "Sheet1");
  const [sheets, setSheets] = useState<{ id: string; name: string; url: string }[] | null>(null);
  const [tabs, setTabs] = useState<string[] | null>(null);
  const connectHref = `/api/google/sheets/connect?back=${encodeURIComponent(path)}`;

  const loadTabs = (u: string) => start(async () => {
    const r = await sheetTabs(u);
    if (!r.ok) { setTabs(null); return setError(r.error); }
    setError(null);
    setTabs(r.value);
    if (!r.value.includes(tab)) setTab(r.value[0] ?? "Sheet1");
  });

  return (
    <DialogBody className="space-y-4">
      {outcome && <Callout tone={outcome.tone}>{outcome.text}</Callout>}
      {!data.enabled && (
        <Callout tone="warning" title="Akun Google belum terhubung">
          {data.connectAs
            ? <>Hubungkan akun <b>{data.connectAs}</b> sekali; setelah itu Sales editor bisa sync tanpa login Google.</>
            : "Minta Owner menghubungkan akun Google perusahaan di dialog ini. Data di bawah hanya untuk dilihat."}
        </Callout>
      )}
      {data.connectAs && (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" intent={data.enabled ? "ghost" : "primary"} onClick={() => { window.location.href = connectHref; }}>
            {data.enabled ? "Hubungkan ulang akun Google" : `Hubungkan ${data.connectAs}`}
          </Button>
          {data.enabled && (
            <Button size="sm" intent="ghost" loading={pending} onClick={() => start(async () => { await disconnectGoogleAccount(); router.refresh(); })}>
              Putuskan
            </Button>
          )}
        </div>
      )}
      {data.shareWith && (
        <p className="rounded-md bg-slate-50 px-3 py-2 text-[0.75rem] text-slate-700">
          Terhubung sebagai <b className="select-all font-mono text-slate-900">{data.shareWith}</b>. Google Sheet harus dibagikan ke akun ini sebagai <b>Editor</b>.
        </p>
      )}
      {c ? (
        <div className="rounded-md bg-emerald-50 px-3 py-2 text-[0.8125rem] text-emerald-900">
          {t("connectedTo")}: <Link href={c.url} target="_blank" rel="noopener" className="underline">{c.url}</Link>
          <span className="block text-[0.75rem] text-emerald-700">Sheet: {c.sheetName}</span>
        </div>
      ) : (
        <p className="text-[0.8125rem] text-slate-600">Belum ada Google Sheet yang terhubung.</p>
      )}

      {data.enabled && (
        <>
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              start(async () => {
                setError(null);
                try { await connectSheet(fd); router.refresh(); } catch (err) { setError((err as Error)?.message || "Gagal menyimpan"); }
              });
            }}
          >
            <FormField label="Google Sheet" description={sheets ? `${sheets.length} sheet yang bisa dibuka akun ini` : "Pilih dari daftar, atau tempel link-nya."}>
              {sheets ? (
                <Select
                  searchable
                  value={sheets.find((x) => x.url === url || url.includes(x.id))?.id ?? ""}
                  onValueChange={(id) => { const x = sheets.find((s) => s.id === id); if (x) { setUrl(x.url); loadTabs(x.url); } }}
                  placeholder="Pilih Google Sheet"
                  options={sheets.map((x) => ({ value: x.id, label: x.name }))}
                />
              ) : (
                <Button size="sm" intent="ghost" loading={pending} onClick={() => start(async () => {
                  const r = await availableSheets();
                  if (r.ok) { setError(null); setSheets(r.value); } else setError(r.error);
                })}>
                  Tampilkan daftar Google Sheet
                </Button>
              )}
            </FormField>
            <FormField label={t("sheetLinkLabel")} required>
              <Input name="spreadsheet_url" required placeholder="https://docs.google.com/spreadsheets/d/..." value={url} onChange={(e) => setUrl(e.target.value)} onBlur={() => url && !tabs && loadTabs(url)} />
            </FormField>
            <FormField label={t("sheetTabNameLabel")}>
              {tabs ? (
                <Select name="sheet_name" value={tab} onValueChange={setTab} options={tabs.map((x) => ({ value: x, label: x }))} />
              ) : (
                <Input name="sheet_name" value={tab} onChange={(e) => setTab(e.target.value)} />
              )}
            </FormField>
            {error && <p className="text-[0.8125rem] text-red-600">{error}</p>}
            <div><Button type="submit" size="sm" intent="primary" loading={pending}>{c ? t("updateConnection") : t("connectButton")}</Button></div>
          </form>
          {c && (
            <section>
              <h3 className="mb-1 text-[0.8125rem] font-semibold text-slate-800">{t("mapColumns")}</h3>
              <p className="mb-3 text-[0.75rem] text-slate-500">{t("mapColumnsDesc")}</p>
              <MappingSection targetFields={targetFields} savedMapping={c.mapping ?? {}} />
            </section>
          )}
          {c?.mapping && (
            <section>
              <h3 className="mb-2 text-[0.8125rem] font-semibold text-slate-800">{t("synchronization")}</h3>
              <SyncButtons />
            </section>
          )}
        </>
      )}
    </DialogBody>
  );
}
