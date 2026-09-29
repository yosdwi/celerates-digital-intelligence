"use client";
import { useState, useTransition } from "react";
import { Plus, Trash2, Pencil, ChevronDown, ChevronRight, Video, FileText, Type, ListChecks, X, Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { MultiFileUpload } from "@/components/multi-file-upload";
import { VIDEO_MAX_SIZE_BYTES } from "@/lib/upload-limits";
import {
  updateCourse, publishCourse, deleteCourse, createModule, updateModule, deleteModule,
  createLesson, updateLesson, deleteLesson, deleteLessonAttachment, addQuizQuestion, deleteQuizQuestion,
} from "../actions";
import { COURSE_CATEGORIES, CONTENT_TYPES, CONTENT_TYPE_LABELS } from "../constants";

type QuizOption = { id: string; option_text: string; is_correct: boolean };
type QuizQuestion = { id: string; question_text: string; options: QuizOption[] };
type Quiz = { id: string; passing_score_percent: number; questions: QuizQuestion[] };
type Lesson = {
  id: string; title: string; content_type_code: string; video_url: string | null; text_content: string | null;
  quiz: Quiz | null; documents: { id: string; file_name: string; url: string | null }[];
  videoFiles: { id: string; file_name: string; url: string | null }[];
};
type ModuleWithLessons = { id: string; title: string; lessons: Lesson[] };
type Course = {
  id: string; title: string; description: string | null; category: string | null; status_code: string;
  passing_score_percent: number; estimated_duration_minutes: number | null;
};

const inputClass = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-fuchsia-500 focus:outline-none focus:ring-1 focus:ring-fuchsia-500";
const CONTENT_ICONS: Record<string, any> = { video: Video, document: FileText, text: Type, quiz: ListChecks };

export function CourseBuilder({ course, modules, coverImageUrl }: { course: Course; modules: ModuleWithLessons[]; coverImageUrl: string | null }) {
  const t = useTranslations("school");
  const tc = useTranslations("common");
  const [editingMeta, setEditingMeta] = useState(false);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">{t("courseInfo")}</h2>
          <div className="flex items-center gap-2">
            <select
              value={course.status_code}
              onChange={(e) => startTransition(() => publishCourse(course.id, e.target.value))}
              disabled={isPending}
              className="text-xs rounded-lg border border-slate-300 px-2 py-1.5"
            >
              <option value="draft">{t("statusDraft")}</option>
              <option value="published">{t("statusPublished")}</option>
              <option value="archived">{t("statusArchived")}</option>
            </select>
            <button onClick={() => setEditingMeta((v) => !v)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
              <Pencil className="h-4 w-4" />
            </button>
            <button
              onClick={() => { if (confirm(t("confirmDeleteCourse"))) startTransition(() => deleteCourse(course.id)); }}
              className="rounded-lg p-1.5 text-red-500 hover:bg-red-50"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        {editingMeta ? (
          <form
            action={(fd) => startTransition(async () => { await updateCourse(course.id, fd); setEditingMeta(false); })}
            className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4"
          >
            <div className="sm:col-span-3">
              <label className="mb-1 block text-sm font-medium text-slate-700">{t("courseTitle")}</label>
              <input name="title" defaultValue={course.title} required className={inputClass} />
            </div>
            <div className="sm:col-span-3">
              <label className="mb-1 block text-sm font-medium text-slate-700">{t("courseCoverPhotoNoOpt")}</label>
              {coverImageUrl && (
                <img src={coverImageUrl} alt={t("courseCoverAlt")} className="mb-2 h-32 w-full max-w-xs rounded-lg object-cover border border-slate-200" />
              )}
              <input name="cover_image" type="file" accept="image/*" className={inputClass} />
            </div>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">{t("category")}</span>
              <select name="category" defaultValue={course.category ?? ""} className={inputClass}>
                <option value="">-</option>
                {COURSE_CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">{t("passingScoreQuiz")}</span>
              <input name="passing_score_percent" type="number" defaultValue={course.passing_score_percent} className={inputClass} />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">{t("estimatedDuration")}</span>
              <input name="estimated_duration_minutes" type="number" defaultValue={course.estimated_duration_minutes ?? ""} className={inputClass} />
            </label>
            <input type="hidden" name="status_code" value={course.status_code} />
            <div className="sm:col-span-3">
              <label className="mb-1 block text-sm font-medium text-slate-700">{t("description")}</label>
              <textarea name="description" rows={3} defaultValue={course.description ?? ""} className={inputClass} />
            </div>
            <div className="sm:col-span-3 flex gap-2">
              <button type="submit" disabled={isPending} className="inline-flex items-center gap-1.5 rounded-lg bg-fuchsia-600 px-4 py-2 text-sm font-medium text-white hover:bg-fuchsia-700">
                <Save className="h-4 w-4" /> {tc("save")}
              </button>
              <button type="button" onClick={() => setEditingMeta(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600">{tc("cancel")}</button>
            </div>
          </form>
        ) : (
          <p className="mt-2 text-sm text-slate-500">{course.description || t("noDescriptionYet")}</p>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">{t("syllabusModuleLesson")}</h2>
        <div className="space-y-3">
          {modules.map((m) => (
            <ModuleBlock key={m.id} courseId={course.id} module={m} />
          ))}
        </div>
        <AddModuleForm courseId={course.id} />
      </div>
    </div>
  );
}

function AddModuleForm({ courseId }: { courseId: string }) {
  const t = useTranslations("school");
  const [title, setTitle] = useState("");
  const [isPending, startTransition] = useTransition();
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (!title.trim()) return; startTransition(async () => { await createModule(courseId, title); setTitle(""); }); }}
      className="mt-4 flex gap-2"
    >
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("newModuleTitlePlaceholder")} className={inputClass} />
      <button type="submit" disabled={isPending} className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900">
        <Plus className="h-4 w-4" /> {t("addModule")}
      </button>
    </form>
  );
}

function ModuleBlock({ courseId, module: m }: { courseId: string; module: ModuleWithLessons }) {
  const t = useTranslations("school");
  const [expanded, setExpanded] = useState(true);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(m.title);
  const [showAddLesson, setShowAddLesson] = useState(false);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="rounded-lg border border-slate-200">
      <div className="flex items-center gap-2 px-4 py-3 bg-slate-50 rounded-t-lg">
        <button onClick={() => setExpanded((v) => !v)} className="text-slate-500">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        {editing ? (
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => { if (title.trim() && title !== m.title) startTransition(() => updateModule(m.id, courseId, title)); setEditing(false); }}
            autoFocus
            className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
          />
        ) : (
          <span className="flex-1 text-sm font-medium text-slate-800">{m.title}</span>
        )}
        <span className="text-xs text-slate-400">{t("lessonCount", { count: m.lessons.length })}</span>
        <button onClick={() => setEditing(true)} className="rounded p-1 text-slate-400 hover:bg-slate-200"><Pencil className="h-3.5 w-3.5" /></button>
        <button
          onClick={() => { if (confirm(t("confirmDeleteModule"))) startTransition(() => deleteModule(m.id, courseId)); }}
          className="rounded p-1 text-red-400 hover:bg-red-100"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {expanded && (
        <div className="p-4 space-y-2">
          {m.lessons.map((l) => <LessonRow key={l.id} courseId={courseId} lesson={l} />)}

          {showAddLesson ? (
            <LessonEditor moduleId={m.id} courseId={courseId} onClose={() => setShowAddLesson(false)} />
          ) : (
            <button onClick={() => setShowAddLesson(true)} className="inline-flex items-center gap-1.5 text-sm text-fuchsia-700 hover:underline mt-2">
              <Plus className="h-3.5 w-3.5" /> {t("addLesson")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function LessonRow({ courseId, lesson }: { courseId: string; lesson: Lesson }) {
  const t = useTranslations("school");
  const [editing, setEditing] = useState(false);
  const [showQuiz, setShowQuiz] = useState(false);
  const [isPending, startTransition] = useTransition();
  const Icon = CONTENT_ICONS[lesson.content_type_code] ?? Type;

  if (editing) {
    return <LessonEditor moduleId="" courseId={courseId} lesson={lesson} onClose={() => setEditing(false)} />;
  }

  return (
    <div className="rounded-lg border border-slate-100 px-3 py-2">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-fuchsia-500 shrink-0" />
        <span className="flex-1 text-sm text-slate-700">{lesson.title}</span>
        <span className="text-xs text-slate-400">{CONTENT_TYPE_LABELS[lesson.content_type_code]}</span>
        {lesson.content_type_code === "quiz" && (
          <button onClick={() => setShowQuiz((v) => !v)} className="text-xs text-fuchsia-700 hover:underline">
            {t("questionCount", { count: lesson.quiz?.questions.length ?? 0 })}
          </button>
        )}
        <button onClick={() => setEditing(true)} className="rounded p-1 text-slate-400 hover:bg-slate-100"><Pencil className="h-3.5 w-3.5" /></button>
        <button
          onClick={() => { if (confirm(t("confirmDeleteLesson"))) startTransition(() => deleteLesson(lesson.id, courseId)); }}
          className="rounded p-1 text-red-400 hover:bg-red-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {lesson.content_type_code === "quiz" && showQuiz && lesson.quiz && (
        <QuizManager courseId={courseId} quiz={lesson.quiz} />
      )}
    </div>
  );
}

function QuizManager({ courseId, quiz }: { courseId: string; quiz: Quiz }) {
  const t = useTranslations("school");
  const tc = useTranslations("common");
  const [showForm, setShowForm] = useState(false);
  const [options, setOptions] = useState(["", ""]);
  const [correctIndex, setCorrectIndex] = useState(0);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="mt-3 ml-6 space-y-2 border-l-2 border-fuchsia-100 pl-4">
      {quiz.questions.map((q, i) => (
        <div key={q.id} className="rounded-lg bg-slate-50 p-3 text-sm">
          <div className="flex items-start justify-between gap-2">
            <p className="font-medium text-slate-800">{i + 1}. {q.question_text}</p>
            <button onClick={() => startTransition(() => deleteQuizQuestion(q.id, courseId))} className="text-red-400 hover:text-red-600 shrink-0">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
          <ul className="mt-1.5 space-y-0.5">
            {q.options.map((o) => (
              <li key={o.id} className={`text-xs ${o.is_correct ? "text-green-700 font-medium" : "text-slate-500"}`}>
                {o.is_correct ? "✓ " : "○ "}{o.option_text}
              </li>
            ))}
          </ul>
        </div>
      ))}

      {showForm ? (
        <form
          action={(fd) => startTransition(async () => { await addQuizQuestion(quiz.id, courseId, fd); setShowForm(false); setOptions(["", ""]); setCorrectIndex(0); })}
          className="rounded-lg border border-slate-200 p-3 space-y-2"
        >
          <input name="question_text" required placeholder={t("writeQuestionPlaceholder")} className={inputClass} />
          {options.map((opt, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="radio"
                name="correct_index"
                value={i}
                checked={correctIndex === i}
                onChange={() => setCorrectIndex(i)}
                className="accent-fuchsia-600"
              />
              <input
                name="option_text"
                value={opt}
                onChange={(e) => setOptions((prev) => prev.map((o, idx) => (idx === i ? e.target.value : o)))}
                placeholder={t("optionPlaceholder", { number: i + 1 })}
                required
                className={inputClass}
              />
            </div>
          ))}
          <input type="hidden" name="correct_index" value={correctIndex} />
          <div className="flex gap-2">
            <button type="button" onClick={() => setOptions((p) => [...p, ""])} className="text-xs text-fuchsia-700 hover:underline">+ {t("option")}</button>
          </div>
          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={isPending} className="rounded-lg bg-fuchsia-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-fuchsia-700">{t("saveQuestion")}</button>
            <button type="button" onClick={() => setShowForm(false)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-600">{tc("cancel")}</button>
          </div>
        </form>
      ) : (
        <button onClick={() => setShowForm(true)} className="inline-flex items-center gap-1 text-xs text-fuchsia-700 hover:underline">
          <Plus className="h-3 w-3" /> {t("addQuestion")}
        </button>
      )}
    </div>
  );
}

function LessonEditor({
  moduleId, courseId, lesson, onClose,
}: { moduleId: string; courseId: string; lesson?: Lesson; onClose: () => void }) {
  const t = useTranslations("school");
  const tc = useTranslations("common");
  const [contentType, setContentType] = useState(lesson?.content_type_code ?? "text");
  const [isPending, startTransition] = useTransition();

  async function handleSubmit(fd: FormData) {
    if (lesson) await updateLesson(lesson.id, courseId, fd);
    else await createLesson(moduleId, courseId, fd);
    onClose();
  }

  return (
    <form action={(fd) => startTransition(() => handleSubmit(fd))} className="rounded-lg border border-fuchsia-200 bg-fuchsia-50/30 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-600">{lesson ? t("editLesson") : t("newLesson")}</span>
        <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="h-4 w-4" /></button>
      </div>
      <input name="title" defaultValue={lesson?.title} required placeholder={t("lessonTitlePlaceholder")} className={inputClass} />
      <select name="content_type_code" value={contentType} onChange={(e) => setContentType(e.target.value)} className={inputClass}>
        {CONTENT_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>

      {contentType === "video" && (
        <div className="space-y-2">
          <input name="video_url" type="url" defaultValue={lesson?.video_url ?? ""} placeholder={t("videoUrlPlaceholder")} className={inputClass} />
          <p className="text-xs text-slate-400">{t("videoUrlHelp")}</p>
          <MultiFileUpload
            name="lesson_video_attachments"
            label={t("uploadVideoFile")}
            existingFiles={lesson?.videoFiles}
            onDeleteExisting={(id) => deleteLessonAttachment(id, courseId)}
            maxSizeBytes={VIDEO_MAX_SIZE_BYTES}
          />
        </div>
      )}
      {contentType === "text" && (
        <textarea name="text_content" rows={5} defaultValue={lesson?.text_content ?? ""} placeholder={t("textContentPlaceholder")} required className={inputClass} />
      )}
      {contentType === "document" && (
        <MultiFileUpload
          name="lesson_attachments"
          label={t("materialDocument")}
          existingFiles={lesson?.documents}
          onDeleteExisting={(id) => deleteLessonAttachment(id, courseId)}
        />
      )}
      {contentType === "quiz" && !lesson && (
        <input name="passing_score_percent" type="number" defaultValue={70} placeholder={t("passingScorePlaceholder")} className={inputClass} />
      )}

      <button type="submit" disabled={isPending} className="rounded-lg bg-fuchsia-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-fuchsia-700">
        {tc("save")}
      </button>
    </form>
  );
}
