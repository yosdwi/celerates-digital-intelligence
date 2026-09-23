"use client";
import { Paperclip, MessageSquare } from "lucide-react";
import { Avatar } from "@/components/avatar";

export type Task = {
  id: string;
  task_no: string;
  title: string;
  description: string | null;
  status_code: string;
  priority_code: string;
  assignee_name: string | null;
  start_date: string | null;
  due_date: string | null;
  parent_id: string | null;
  tags: string[] | null;
  created_by_name: string | null;
  attachmentCount?: number;
  commentCount?: number;
};

const PRIORITY_STYLES: Record<string, string> = {
  low: "bg-slate-100 text-slate-600",
  medium: "bg-blue-50 text-blue-700",
  high: "bg-amber-50 text-amber-700",
  urgent: "bg-red-50 text-red-700",
};
const PRIORITY_LABELS: Record<string, string> = { low: "Low", medium: "Medium", high: "High", urgent: "Urgent" };

/** Garis aksen kiri kartu, warnanya ikut prioritas -- makin genting makin mencolok. */
const PRIORITY_ACCENT: Record<string, string> = {
  low: "linear-gradient(180deg,#94a3b8,#cbd5e1)",
  medium: "linear-gradient(180deg,#2563eb,#60a5fa)",
  high: "linear-gradient(180deg,#ea580c,#fb923c)",
  urgent: "linear-gradient(180deg,#be123c,#fb7185)",
};

const TAG_PALETTE = [
  "bg-violet-50 text-violet-700", "bg-blue-50 text-blue-700", "bg-pink-50 text-pink-700",
  "bg-orange-50 text-orange-700", "bg-emerald-50 text-emerald-700", "bg-amber-50 text-amber-700",
];
function tagStyle(tag: string): string {
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) >>> 0;
  return TAG_PALETTE[h % TAG_PALETTE.length];
}

export function TaskCard({
  task,
  onDragStart,
  onClick,
}: {
  task: Task;
  onDragStart: (e: React.DragEvent, taskId: string) => void;
  onClick: () => void;
}) {
  const isOverdue = task.due_date && task.status_code !== "done" && new Date(task.due_date) < new Date(new Date().toDateString());

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, task.id)}
      onClick={onClick}
      className="relative cursor-pointer overflow-hidden rounded-xl border border-white/70 bg-white/85 backdrop-blur-xl pl-4 pr-3 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_16px_-10px_rgba(15,23,42,0.12)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_1px_2px_rgba(15,23,42,0.06),0_14px_24px_-10px_rgba(15,23,42,0.18)] active:cursor-grabbing"
    >
      <span className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundImage: PRIORITY_ACCENT[task.priority_code] ?? PRIORITY_ACCENT.medium }} />

      <div className="flex items-start justify-between gap-2">
        <span className="text-[10px] font-mono text-slate-400">{task.task_no}</span>
        <span className={`rounded-full whitespace-nowrap px-2 py-0.5 text-[10px] font-medium ${PRIORITY_STYLES[task.priority_code] ?? PRIORITY_STYLES.medium}`}>
          {PRIORITY_LABELS[task.priority_code] ?? task.priority_code}
        </span>
      </div>

      <p className="text-sm font-semibold text-slate-900 mt-1.5 line-clamp-2">{task.title}</p>
      {task.description && (
        <p className="text-xs text-slate-400 mt-1 line-clamp-2">{task.description}</p>
      )}

      {task.tags && task.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2.5">
          {task.tags.map((tag) => (
            <span key={tag} className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${tagStyle(tag)}`}>{tag}</span>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between mt-3">
        <div className="flex items-center gap-3">
          {task.due_date && (
            <span className={`text-[11px] ${isOverdue ? "text-red-600 font-medium" : "text-slate-400"}`}>
              {isOverdue ? "Overdue: " : ""}{task.due_date}
            </span>
          )}
          {!!task.attachmentCount && (
            <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
              <Paperclip className="h-3 w-3" />{task.attachmentCount}
            </span>
          )}
          {!!task.commentCount && (
            <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
              <MessageSquare className="h-3 w-3" />{task.commentCount}
            </span>
          )}
        </div>
        {task.assignee_name && (
          <div title={task.assignee_name} className="shrink-0">
            <Avatar name={task.assignee_name} size="sm" />
          </div>
        )}
      </div>
    </div>
  );
}
