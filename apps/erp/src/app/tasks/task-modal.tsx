"use client";
import { useEffect, useState, useTransition } from "react";
import { X, Trash2, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { createTask, updateTask, deleteTask, getTaskAttachments, getTaskComments, addTaskComment, deleteTaskComment, deleteTaskAttachment } from "./actions";
import { PicSelect } from "@/components/pic-select";
import { Avatar } from "@/components/avatar";
import type { Task } from "./task-card";
import { Field, SelectField as SelectFieldBase } from "@/components/form-fields";
import { MultiFileUpload, type ExistingAttachment } from "@/components/multi-file-upload";

function SelectField(props: React.ComponentProps<typeof SelectFieldBase>) {
  return <SelectFieldBase {...props} includeEmptyOption={false} />;
}

const PRIORITIES = [["low", "Low"], ["medium", "Medium"], ["high", "High"], ["urgent", "Urgent"]] as const;

type Comment = { id: string; author_name: string; body: string; created_at: Date };

export function TaskModal({
  open,
  onClose,
  task,
  defaultStatus,
  defaultParentId,
  assigneeNames,
  parentOptions,
}: {
  open: boolean;
  onClose: () => void;
  task: Task | null;
  defaultStatus: string;
  defaultParentId?: string | null;
  assigneeNames: string[];
  parentOptions: { id: string; title: string; task_no: string }[];
}) {
  const t = useTranslations("tasks");
  const tc = useTranslations("common");
  const [isPending, startTransition] = useTransition();
  const [existingAttachments, setExistingAttachments] = useState<ExistingAttachment[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentDraft, setCommentDraft] = useState("");
  const [isCommentPending, startCommentTransition] = useTransition();

  useEffect(() => {
    if (!open || !task) {
      setExistingAttachments([]);
      setComments([]);
      return;
    }
    getTaskAttachments(task.id).then((rows) => setExistingAttachments(rows.map((r) => ({ id: r.id, file_name: r.file_name, url: r.url, kind: r.kind }))));
    getTaskComments(task.id).then((rows) => setComments(rows as Comment[]));
  }, [open, task]);

  if (!open) return null;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      if (task) {
        await updateTask(task.id, fd);
      } else {
        fd.set("status_code", defaultStatus);
        await createTask(fd);
      }
      onClose();
    });
  }

  function handleDelete() {
    if (!task) return;
    if (!confirm(t("confirmDeleteTask", { taskNo: task.task_no }))) return;
    startTransition(async () => {
      await deleteTask(task.id);
      onClose();
    });
  }

  function handleDeleteExistingAttachment(id: string) {
    startTransition(async () => { await deleteTaskAttachment(id); });
  }

  function handleAddComment() {
    if (!task || !commentDraft.trim()) return;
    const body = commentDraft.trim();
    setCommentDraft("");
    startCommentTransition(async () => {
      await addTaskComment(task.id, body);
      const rows = await getTaskComments(task.id);
      setComments(rows as Comment[]);
    });
  }

  function handleDeleteComment(id: string) {
    startCommentTransition(async () => {
      await deleteTaskComment(id);
      setComments((prev) => prev.filter((c) => c.id !== id));
    });
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-[2px] flex items-center justify-center p-4 [animation:overlay-in_0.2s_ease]" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white/90 backdrop-blur-2xl border border-white/70 rounded-2xl shadow-[0_1px_2px_rgba(15,23,42,0.05),0_40px_70px_-20px_rgba(9,20,35,0.45)] w-full max-w-lg max-h-[85vh] overflow-y-auto [animation:modal-in_0.25s_cubic-bezier(0.2,0.9,0.25,1)]"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white/90 backdrop-blur-2xl z-10">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{task ? t("editTaskTitle") : t("addTaskModalTitle")}</h2>
            {task && <p className="text-xs font-mono text-slate-400">{task.task_no}</p>}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <Field label={t("titleField")} name="title" defaultValue={task?.title} required />
          <Field label={t("descriptionField")} name="description" defaultValue={task?.description ?? ""} textarea />
          <Field
            label={t("tagsField")}
            name="tags"
            defaultValue={task?.tags?.join(", ") ?? ""}
            placeholder={t("tagsPlaceholder")}
          />

          <div className="grid grid-cols-2 gap-4">
            <SelectField label="Priority" name="priority_code" defaultValue={task?.priority_code ?? "medium"} options={PRIORITIES} />
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">{t("parentField")}</span>
              <select
                name="parent_id"
                defaultValue={task?.parent_id ?? defaultParentId ?? ""}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm transition-colors focus:border-violet-400 focus:outline-none"
              >
                <option value="">{t("noParentOption")}</option>
                {parentOptions.filter((p) => p.id !== task?.id).map((p) => (
                  <option key={p.id} value={p.id}>{p.task_no} — {p.title}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label={t("startDate")} name="start_date" type="date" defaultValue={task?.start_date ?? ""} />
            <Field label={t("dueDate")} name="due_date" type="date" defaultValue={task?.due_date ?? ""} />
          </div>

          <PicSelect name="assignee_name" label="Assignee" options={assigneeNames} defaultValue={task?.assignee_name ?? ""} currentPath="/tasks" />

          <MultiFileUpload
            name="attachments"
            label="Lampiran"
            existingFiles={existingAttachments}
            onDeleteExisting={handleDeleteExistingAttachment}
          />

          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
            <div>
              {task && (
                <button type="button" onClick={handleDelete} disabled={isPending} className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600 hover:underline disabled:opacity-50">
                  <Trash2 className="h-3.5 w-3.5" /> {t("deleteTask")}
                </button>
              )}
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={onClose} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
                {tc("cancel")}
              </button>
              <button type="submit" disabled={isPending} className="rounded-xl bg-gradient-to-br from-violet-600 to-violet-500 px-4 py-2 text-sm font-medium text-white shadow-[0_8px_18px_-6px_rgba(124,58,237,0.5)] hover:shadow-[0_10px_22px_-6px_rgba(124,58,237,0.6)] active:scale-95 disabled:opacity-50 transition-all">
                {isPending ? tc("saving") : tc("save")}
              </button>
            </div>
          </div>
        </form>

        {task && (
          <div className="px-6 pb-6 pt-2 border-t border-slate-100">
            <p className="text-sm font-semibold text-slate-700 mb-3">{t("comments", { count: comments.length })}</p>
            <div className="space-y-3 max-h-56 overflow-y-auto pr-1">
              {comments.length === 0 && <p className="text-xs text-slate-400">{t("noComments")}</p>}
              {comments.map((c) => (
                <div key={c.id} className="flex items-start gap-2.5 group">
                  <Avatar name={c.author_name} size="sm" />
                  <div className="min-w-0 flex-1 rounded-xl bg-slate-50 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-slate-800">{c.author_name}</p>
                      <button onClick={() => handleDeleteComment(c.id)} className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-opacity">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                    <p className="text-xs text-slate-600 mt-0.5 whitespace-pre-line">{c.body}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 mt-3">
              <input
                value={commentDraft}
                onChange={(e) => setCommentDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAddComment(); } }}
                placeholder={t("writeComment")}
                className="flex-1 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
              />
              <button
                onClick={handleAddComment}
                disabled={isCommentPending || !commentDraft.trim()}
                className="rounded-xl bg-violet-600 p-2.5 text-white hover:bg-violet-700 disabled:opacity-40 transition-colors"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
