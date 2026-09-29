"use client";
import { useEffect, useState, useTransition } from "react";
import { Plus, ChevronDown, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { TaskCard, type Task } from "./task-card";
import { TaskModal } from "./task-modal";
import { moveTask } from "./actions";

const COLUMNS = [
  { key: "backlog", label: "Backlog" },
  { key: "todo", label: "To Do" },
  { key: "in_progress", label: "In Progress" },
  { key: "in_review", label: "In Review" },
  { key: "done", label: "Done" },
] as const;

export function KanbanBoard({ tasks, assigneeNames }: { tasks: Task[]; assigneeNames: string[] }) {
  const t = useTranslations("tasks");
  const [items, setItems] = useState(tasks);
  useEffect(() => setItems(tasks), [tasks]);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [modalState, setModalState] = useState<{ open: boolean; task: Task | null; defaultStatus: string; defaultParentId: string | null }>({
    open: false, task: null, defaultStatus: "todo", defaultParentId: null,
  });
  const [, startTransition] = useTransition();

  const groups = items.filter((t) => !t.parent_id);
  const parentOptions = groups.map((g) => ({ id: g.id, title: g.title, task_no: g.task_no }));

  function openCreate(statusCode: string, parentId: string | null) {
    setModalState({ open: true, task: null, defaultStatus: statusCode, defaultParentId: parentId });
  }
  function openCreateGroup() {
    setModalState({ open: true, task: null, defaultStatus: "todo", defaultParentId: null });
  }
  function openEdit(task: Task) {
    setModalState({ open: true, task, defaultStatus: task.status_code, defaultParentId: task.parent_id });
  }
  function closeModal() {
    setModalState((s) => ({ ...s, open: false }));
  }
  function toggleGroup(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function handleDragStart(e: React.DragEvent, taskId: string) {
    e.dataTransfer.setData("text/plain", taskId);
  }

  function handleDrop(e: React.DragEvent, statusCode: string, groupId: string) {
    e.preventDefault();
    setDragOverKey(null);
    const taskId = e.dataTransfer.getData("text/plain");
    if (!taskId || taskId === groupId) return;

    setItems((prev) => prev.map((t) => (t.id === taskId ? { ...t, status_code: statusCode, parent_id: groupId } : t)));
    startTransition(async () => {
      await moveTask(taskId, statusCode, groupId);
    });
  }

  return (
    <>
      <div className="flex justify-end">
        <button onClick={openCreateGroup} className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-br from-violet-600 to-violet-500 px-3.5 py-2 text-xs font-semibold text-white shadow-[0_6px_16px_-6px_rgba(124,58,237,0.5)] hover:shadow-[0_8px_20px_-6px_rgba(124,58,237,0.6)] active:scale-95 transition-all">
          <Plus className="h-3.5 w-3.5" /> {t("addGroupOrTask")}
        </button>
      </div>

      <div className="space-y-4 mt-3">
        {groups.map((group) => {
          const children = items.filter((t) => t.parent_id === group.id);
          const isCollapsed = collapsed.has(group.id);
          return (
            <div key={group.id} className="rounded-2xl border border-white/70 bg-white/78 backdrop-blur-xl shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_28px_-14px_rgba(15,23,42,0.10)]">
              <button
                onClick={() => toggleGroup(group.id)}
                className="flex w-full items-center gap-2 px-4 py-3 text-left"
              >
                {isCollapsed ? <ChevronRight className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                <span className="text-[10px] font-mono text-slate-400">{group.task_no}</span>
                <span className="text-sm font-semibold text-slate-900">{group.title}</span>
                <span className="text-xs text-slate-400">({children.length})</span>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); openEdit(group); }}
                  className="ml-auto text-xs font-medium text-violet-600 hover:text-violet-800 transition-colors"
                >
                  {t("editGroup")}
                </span>
              </button>

              {!isCollapsed && (
                <div className="overflow-x-auto px-4 pb-4">
                  <div className="flex gap-4 min-w-max">
                    {COLUMNS.map((col) => {
                      const key = `${group.id}:${col.key}`;
                      const colTasks = children.filter((t) => t.status_code === col.key);
                      return (
                        <div
                          key={key}
                          onDragOver={(e) => { e.preventDefault(); setDragOverKey(key); }}
                          onDragLeave={() => setDragOverKey((c) => (c === key ? null : c))}
                          onDrop={(e) => handleDrop(e, col.key, group.id)}
                          className={`w-64 shrink-0 rounded-xl p-3 transition-colors ${dragOverKey === key ? "bg-violet-50 ring-2 ring-violet-200" : "bg-slate-50/70"}`}
                        >
                          <div className="flex items-center justify-between px-1 mb-3">
                            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                              {col.label} <span className="text-slate-400 font-normal">({colTasks.length})</span>
                            </h3>
                            <button onClick={() => openCreate(col.key, group.id)} className="text-slate-400 hover:text-violet-600 transition-colors" title={t("addTaskTitle")}>
                              <Plus className="h-4 w-4" />
                            </button>
                          </div>
                          <div className="space-y-2 min-h-[40px]">
                            {colTasks.map((task) => (
                              <TaskCard key={task.id} task={task} onDragStart={handleDragStart} onClick={() => openEdit(task)} />
                            ))}
                            {colTasks.length === 0 && (
                              <p className="text-xs text-slate-300 text-center py-6">{t("empty")}</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {groups.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-10">{t("noTasksYet")}</p>
        )}
      </div>

      <TaskModal
        open={modalState.open}
        onClose={closeModal}
        task={modalState.task}
        defaultStatus={modalState.defaultStatus}
        defaultParentId={modalState.defaultParentId}
        assigneeNames={assigneeNames}
        parentOptions={parentOptions}
      />
    </>
  );
}
