"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, ArrowDown, Trash2 } from "lucide-react";
import { toggleLeaveTypeActive, deleteLeaveType, removeApprovalStep, moveApprovalStep } from "./actions";

export function LeaveTypeToggle({ id, isActive }: { id: string; isActive: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => startTransition(async () => { await toggleLeaveTypeActive(id, !isActive); router.refresh(); })}
      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400"}`}
    >
      {isActive ? "Aktif" : "Nonaktif"}
    </button>
  );
}

export function DeleteLeaveTypeButton({ id }: { id: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => { if (confirm("Hapus jenis Time Off ini?")) startTransition(async () => { await deleteLeaveType(id); router.refresh(); }); }}
      className="text-slate-400 hover:text-rose-600 disabled:opacity-50"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}

export function ApprovalStepControls({ id, isFirst, isLast }: { id: string; isFirst: boolean; isLast: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function move(direction: "up" | "down") {
    startTransition(async () => { await moveApprovalStep(id, direction); router.refresh(); });
  }
  function remove() {
    if (!confirm("Hapus approver ini dari chain?")) return;
    startTransition(async () => { await removeApprovalStep(id); router.refresh(); });
  }

  return (
    <div className="flex items-center gap-1">
      <button type="button" disabled={isPending || isFirst} onClick={() => move("up")} className="rounded p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30">
        <ArrowUp className="h-3.5 w-3.5" />
      </button>
      <button type="button" disabled={isPending || isLast} onClick={() => move("down")} className="rounded p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30">
        <ArrowDown className="h-3.5 w-3.5" />
      </button>
      <button type="button" disabled={isPending} onClick={remove} className="rounded p-1 text-slate-400 hover:text-rose-600 disabled:opacity-30">
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
