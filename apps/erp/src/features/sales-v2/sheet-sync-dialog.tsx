"use client";
// Google Sheet Sync as a dialog (contract §12), in place of leaving for /sales/opportunity-tracker/sheet-sync. Same
// V1 actions and components (connect, column mapping, pull/push); nothing new on the server. While integrations are
// off on the pilot the dialog says so instead of offering forms that would fail.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { RefreshCw } from "lucide-react";
import { Button, Callout, Dialog, DialogBody, FormField, Input } from "@crisp-ui-kit/crisp";
import { connectSheet } from "@/app/sales/opportunity-tracker/sheet-sync/actions";
import { MappingSection } from "@/app/sales/opportunity-tracker/sheet-sync/mapping-section";
import { SyncButtons } from "@/app/sales/opportunity-tracker/sheet-sync/sync-buttons";
import { TARGET_FIELDS } from "@/app/sales/opportunity-tracker/sheet-sync/target-fields";
import type { SheetSyncData } from "./data";

export function SheetSyncButton({ data }: { data: SheetSyncData }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" intent="ghost" onClick={() => setOpen(true)} data-testid="sales-v2-sheet-sync">
        <RefreshCw size={13} /> Sheet Sync
      </Button>
      <Dialog open={open} onOpenChange={setOpen} title="Google Sheet Sync" icon={<RefreshCw size={16} />} closeLabel="Tutup" width={640} data-sales-v2-dialog="sheet-sync">
        {open && <SheetSyncBody data={data} />}
      </Dialog>
    </>
  );
}

function SheetSyncBody({ data }: { data: SheetSyncData }) {
  const t = useTranslations("sales.sheetSync");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const c = data.connection;

  return (
    <DialogBody className="max-h-[calc(85dvh-8.5rem)] space-y-4 overflow-y-auto">
      {!data.enabled && (
        <Callout tone="warning" title="Belum aktif di pilot">
          Sinkronisasi Google Sheet dimatikan selama pilot. Data di bawah hanya untuk dilihat.
        </Callout>
      )}
      {c ? (
        <div className="rounded-md bg-emerald-50 px-3 py-2 text-[13px] text-emerald-900">
          {t("connectedTo")}: <Link href={c.url} target="_blank" rel="noopener" className="underline">{c.url}</Link>
          <span className="block text-[12px] text-emerald-700">Sheet: {c.sheetName}</span>
        </div>
      ) : (
        <p className="text-[13px] text-slate-600">Belum ada Google Sheet yang terhubung.</p>
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
            {error && <p className="text-[13px] text-red-600">{error}</p>}
            <div><Button type="submit" size="sm" intent="primary" loading={pending}>{c ? t("updateConnection") : t("connectButton")}</Button></div>
          </form>
          {c && (
            <section>
              <h3 className="mb-1 text-[13px] font-semibold text-slate-800">{t("mapColumns")}</h3>
              <p className="mb-3 text-[12px] text-slate-500">{t("mapColumnsDesc")}</p>
              <MappingSection targetFields={TARGET_FIELDS} savedMapping={c.mapping ?? {}} />
            </section>
          )}
          {c?.mapping && (
            <section>
              <h3 className="mb-2 text-[13px] font-semibold text-slate-800">{t("synchronization")}</h3>
              <SyncButtons />
            </section>
          )}
        </>
      )}
    </DialogBody>
  );
}
