"use client";
// Google Sheet Sync as a dialog (contract §12), in place of leaving for the V1 sheet-sync page. Same V1 actions and
// components (connect, column mapping, pull/push) per page: Opportunity Tracker and PQ Tracker each keep their own. While integrations are
// off on the pilot the dialog says so instead of offering forms that would fail.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { RefreshCw } from "lucide-react";
import { Button, Callout, Dialog, DialogBody, FormField, Input } from "@crisp-ui-kit/crisp";
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

/** One page's V1 sheet-sync pieces. */
type Parts = {
  connectSheet: (fd: FormData) => Promise<unknown>;
  MappingSection: (p: { targetFields: TargetField[]; savedMapping: Record<string, string> }) => React.ReactNode;
  SyncButtons: () => React.ReactNode;
  targetFields: TargetField[];
};
export const OT_SHEET_SYNC: Parts = { connectSheet: ot.connectSheet, MappingSection: OtMapping, SyncButtons: OtSync, targetFields: OT_FIELDS };
export const PQ_SHEET_SYNC: Parts = { connectSheet: pq.connectSheet, MappingSection: PqMapping, SyncButtons: PqSync, targetFields: PQ_FIELDS };

export function SheetSyncButton({ data, parts }: { data: SheetSyncData; parts: Parts }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {/* Label from xl up; below that the icon (with its name as tooltip) keeps the toolbar on one line. */}
      <Button size="sm" intent="ghost" onClick={() => setOpen(true)} aria-label="Sheet Sync" title="Google Sheet Sync" data-testid="sales-v2-sheet-sync">
        <RefreshCw size={13} /> <span className="hidden xl:inline">Sheet Sync</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen} title="Google Sheet Sync" icon={<RefreshCw size={16} />} closeLabel="Tutup" width={640} data-sales-v2-dialog="sheet-sync">
        {open && <SheetSyncBody data={data} parts={parts} />}
      </Dialog>
    </>
  );
}

function SheetSyncBody({ data, parts: { connectSheet, MappingSection, SyncButtons, targetFields } }: { data: SheetSyncData; parts: Parts }) {
  const t = useTranslations("sales.sheetSync");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const c = data.connection;

  return (
    <DialogBody className="max-h-[calc(85dvh-8.5rem)] space-y-4 overflow-y-auto">
      {!data.enabled && (
        <Callout tone="warning" title="Belum dikonfigurasi">
          Service account Google belum dipasang di server, jadi sinkronisasi belum bisa jalan. Data di bawah hanya untuk dilihat.
        </Callout>
      )}
      {data.shareWith && (
        <p className="rounded-md bg-slate-50 px-3 py-2 text-[0.75rem] text-slate-700">
          Bagikan Google Sheet ke <b className="select-all font-mono text-slate-900">{data.shareWith}</b> sebagai <b>Editor</b>, lalu tempel link-nya di bawah.
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
            <FormField label={t("sheetLinkLabel")} required>
              <Input name="spreadsheet_url" required placeholder="https://docs.google.com/spreadsheets/d/..." defaultValue={c?.url ?? ""} />
            </FormField>
            <FormField label={t("sheetTabNameLabel")}>
              <Input name="sheet_name" defaultValue={c?.sheetName ?? "Sheet1"} />
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
