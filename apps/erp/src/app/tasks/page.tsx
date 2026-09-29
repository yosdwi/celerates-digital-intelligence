import { db } from "@/db";
import { kanbanTasks } from "@/db/schema";
import { asc } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { TasksViewTabs } from "./tasks-view-tabs";
import { KanbanSquare } from "lucide-react";
import { getPicNames } from "@/lib/reference-data";
import { getTaskAttachmentCounts, getTaskCommentCounts } from "./actions";

export default async function TasksPage() {
  const t = await getTranslations("tasks");
  const [taskRows, assigneeNames] = await Promise.all([
    db.select().from(kanbanTasks).orderBy(asc(kanbanTasks.position)),
    getPicNames(),
  ]);

  const taskIds = taskRows.map((t) => t.id);
  const [attachmentCounts, commentCounts] = await Promise.all([
    getTaskAttachmentCounts(taskIds),
    getTaskCommentCounts(taskIds),
  ]);
  const tasks = taskRows.map((t) => ({ ...t, attachmentCount: attachmentCounts[t.id] ?? 0, commentCount: commentCounts[t.id] ?? 0 }));

  const total = tasks.length;
  const done = tasks.filter((t) => t.status_code === "done").length;
  const inProgress = tasks.filter((t) => t.status_code === "in_progress" || t.status_code === "in_review").length;
  const today = new Date(new Date().toDateString());
  const overdue = tasks.filter((t) => t.status_code !== "done" && t.due_date && new Date(t.due_date) < today).length;

  return (
    <div className="min-h-screen">
      <PageHeader
        icon={KanbanSquare}
        color="bg-cyan-600"
        eyebrow="Task Board"
        title="Kanban Board"
        subtitle={t("pageSubtitle")}
      />

      <main className="px-8 py-8 space-y-6 max-w-[1600px] mx-auto">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label="Total Task" value={total} color="navy" />
          <StatCard label="On Going" value={inProgress} color="blue" />
          <StatCard label="Overdue" value={overdue} color="red" />
          <StatCard label="Done" value={done} color="green" />
        </div>

        <TasksViewTabs tasks={tasks} assigneeNames={assigneeNames} />
      </main>
    </div>
  );
}
