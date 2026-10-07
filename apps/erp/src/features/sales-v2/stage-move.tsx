"use client";
// Kanban moves (contract §12): an ordinary move saves at once and offers Undo; a move to Win or Dropped asks first,
// because those close the opportunity. Dropped takes the (optional, as in V1) Dropped Reason; Win offers Convert when
// the record is ready for it. Both use the existing V1 actions.
import { useTransition } from "react";
import { Button, Dialog, DialogBody, DialogFooter, FormField, Textarea } from "@crisp-ui-kit/crisp";
import { updateOpportunityTracker, updateOptyStatus } from "@/app/sales/opportunity-tracker/actions";
import { isRedirect } from "./forms";
import { STAGE_LABEL, canConvert, editValues, type Opportunity } from "./model";

export const CONFIRM_STAGES = new Set(["win", "dropped"]);
export type PendingMove = { record: Opportunity; to: string };

export function StageMoveDialog({
  move, returnTo, onCancel, onMoved, onError,
}: {
  move: PendingMove | null;
  returnTo: string;
  onCancel: () => void;
  /** Called after the server saved the move; `convert` when the user chose "Pindahkan & Convert". */
  onMoved: (move: PendingMove, convert: boolean) => void;
  onError: (message: string) => void;
}) {
  const [pending, start] = useTransition();
  const record = move?.record;
  const to = move?.to ?? "";
  const label = STAGE_LABEL[to] ?? to;

  function save(reason: string | null, convert: boolean) {
    if (!move || !record) return;
    start(async () => {
      try {
        if (to === "dropped" && reason != null && reason.trim() !== (record.droppedReason ?? "")) {
          // Status and reason together: the V1 edit action with every other field as it is now.
          const fd = new FormData();
          for (const [k, v] of Object.entries({ ...editValues(record), opty_status_code: "dropped", dropped_reason: reason.trim(), return_to: returnTo })) fd.set(k, v);
          await updateOpportunityTracker(record.id, fd).catch((err) => { if (!isRedirect(err)) throw err; });
        } else {
          await updateOptyStatus(record.id, to);
        }
        onMoved(move, convert);
      } catch (err) {
        onError((err as Error)?.message || "Gagal memindahkan");
      }
    });
  }

  return (
    <Dialog
      open={!!move}
      onOpenChange={(o) => !o && !pending && onCancel()}
      title={`Pindahkan ke ${label}?`}
      width={460}
      data-sales-v2-dialog="move"
    >
      {record && (
        <form onSubmit={(e) => { e.preventDefault(); save(String(new FormData(e.currentTarget).get("dropped_reason") ?? ""), false); }}>
          <DialogBody>
            <p className="text-[13px] text-slate-700">
              <b className="text-slate-900">{record.client}</b> <span className="font-mono text-[12px] text-slate-500">{record.optyNo}</span> akan dipindah dari {STAGE_LABEL[record.status] ?? record.status} ke <b>{label}</b>.
            </p>
            {to === "dropped" && (
              <FormField label="Dropped Reason" description="Opsional, sama seperti di form Edit." className="mt-3">
                <Textarea name="dropped_reason" rows={3} defaultValue={record.droppedReason ?? ""} autoFocus />
              </FormField>
            )}
          </DialogBody>
          <DialogFooter>
            <Button type="button" size="sm" intent="neutral" onClick={onCancel} disabled={pending}>Batal</Button>
            {to === "win" && canConvert(record) && (
              <Button type="button" size="sm" intent="neutral" disabled={pending} onClick={() => save(null, true)}>Pindahkan &amp; Convert</Button>
            )}
            <Button type="submit" size="sm" intent={to === "dropped" ? "danger" : "primary"} loading={pending}>Pindahkan</Button>
          </DialogFooter>
        </form>
      )}
    </Dialog>
  );
}
