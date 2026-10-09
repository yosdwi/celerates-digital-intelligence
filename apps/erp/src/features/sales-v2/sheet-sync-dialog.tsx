"use client";
// Google Sheet Sync as a dialog (contract §12). Connecting a sheet uses V1's action per page; importing is the Sales V2
// flow (QA 2026-10-09): columns matched automatically, value mapping, a preview with a status per row, then one import;
// pushing changes only mapped cells. Sync runs on the company Google account an Owner connected.
import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { RefreshCw } from "lucide-react";
import { Button, Callout, Dialog, DialogBody, FormField, Input, Select, Tooltip } from "@crisp-ui-kit/crisp";
import * as ot from "@/app/sales/opportunity-tracker/sheet-sync/actions";
import * as pq from "@/app/sales/sheet-sync/actions";
import { SheetImport, SheetPush } from "./sheet-import-panel";
import type { SheetKind } from "./sheet-import";
import type { SheetSyncData } from "./data";
import { availableSheets, disconnectGoogleAccount, sheetTabs } from "./sheet-actions";

/** One page's sheet: which tracker, and V1's action that saves the connection. */
type Parts = { kind: SheetKind; connectSheet: (fd: FormData) => Promise<unknown> };
export const OT_SHEET_SYNC: Parts = { kind: "ot", connectSheet: ot.connectSheet };
export const PQ_SHEET_SYNC: Parts = { kind: "pq", connectSheet: pq.connectSheet };

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
      <Dialog open={open} onOpenChange={setOpen} title="Google Sheet Sync" icon={<RefreshCw size={16} />} closeLabel="Tutup" width={920} data-sales-v2-dialog="sheet-sync">
        {open && <SheetSyncBody data={data} parts={parts} outcome={outcome ? OUTCOME[outcome] : undefined} />}
      </Dialog>
    </>
  );
}

function SheetSyncBody({ data, parts: { kind, connectSheet }, outcome }: { data: SheetSyncData; parts: Parts; outcome?: { tone: "success" | "warning"; text: string } }) {
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
          {c && <SheetImport key={`${c.url}|${c.sheetName}`} kind={kind} />}
          {c && data.canPush && <SheetPush key={`push|${c.url}|${c.sheetName}`} kind={kind} />}
        </>
      )}
    </DialogBody>
  );
}
