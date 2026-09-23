"use client";
import { useState } from "react";
import { KanbanBoard } from "./kanban-board";
import { TimelineView } from "./timeline-view";
import type { Task } from "./task-card";

const TABS = [
  { key: "board", label: "Board" },
  { key: "timeline", label: "Timeline" },
] as const;

export function TasksViewTabs({ tasks, assigneeNames }: { tasks: Task[]; assigneeNames: string[] }) {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("board");

  return (
    <div>
      <div className="flex gap-1 border-b border-slate-200 mb-4">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.key ? "border-brand-600 text-brand-600" : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "board" ? <KanbanBoard tasks={tasks} assigneeNames={assigneeNames} /> : <TimelineView tasks={tasks} />}
    </div>
  );
}
