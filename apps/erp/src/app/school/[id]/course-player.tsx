"use client";
import { useState, useTransition } from "react";
import { CheckCircle2, Circle, Video, FileText, Type, ListChecks, Lock, Award } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { enrollInCourse, markLessonComplete, submitQuiz } from "../actions";
import { CONTENT_TYPE_LABELS } from "../constants";

type QuizOption = { id: string; option_text: string };
type QuizQuestion = { id: string; question_text: string; options: QuizOption[] };
type Quiz = { id: string; passing_score_percent: number; questions: QuizQuestion[] };
type Lesson = {
  id: string; title: string; content_type_code: string; video_url: string | null; text_content: string | null;
  quiz: Quiz | null; documents: { id: string; file_name: string; url: string | null }[];
  videoFiles: { id: string; file_name: string; url: string | null }[];
};
type ModuleWithLessons = { id: string; title: string; lessons: Lesson[] };
type Course = { id: string; title: string; passing_score_percent: number };
type Progress = { completed_at: Date | null; passed: boolean | null; score_percent: number | null };

const CONTENT_ICONS: Record<string, any> = { video: Video, document: FileText, text: Type, quiz: ListChecks };

function toEmbedUrl(url: string) {
  const yt = url.match(/(?:youtu\.be\/|youtube\.com\/watch\?v=)([\w-]+)/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  return url;
}

export function CoursePlayer({
  course, modules, enrollment, progressByLesson, coverImageUrl,
}: {
  course: Course; modules: ModuleWithLessons[]; enrollment: { id: string; status_code: string; certificate_no: string | null } | null;
  progressByLesson: Record<string, Progress>; coverImageUrl: string | null;
}) {
  const t = useTranslations("school");
  const allLessons = modules.flatMap((m) => m.lessons);
  const [activeLessonId, setActiveLessonId] = useState<string | null>(allLessons[0]?.id ?? null);
  const [isPending, startTransition] = useTransition();

  if (!enrollment) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-10 text-center shadow-sm">
        {coverImageUrl && <img src={coverImageUrl} alt={course.title} className="mx-auto mb-5 h-40 w-full max-w-md rounded-lg object-cover" />}
        <h2 className="text-lg font-semibold text-slate-900">{course.title}</h2>
        <p className="mt-2 text-sm text-slate-500">{t("lessonModuleSummary", { lessonCount: allLessons.length, moduleCount: modules.length })}</p>
        <button
          onClick={() => startTransition(() => enrollInCourse(course.id))}
          disabled={isPending}
          className="mt-5 rounded-lg bg-fuchsia-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-fuchsia-700"
        >
          {t("enrollNow")}
        </button>
      </div>
    );
  }

  const doneCount = allLessons.filter((l) => progressByLesson[l.id]?.completed_at).length;
  const progressPercent = allLessons.length ? Math.round((doneCount / allLessons.length) * 100) : 0;
  const activeLesson = allLessons.find((l) => l.id === activeLessonId) ?? null;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-sm font-medium text-slate-700">{t("learningProgress")}</span>
          <span className="text-sm font-semibold text-fuchsia-700">{progressPercent}%</span>
        </div>
        <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
          <div className="h-full rounded-full bg-fuchsia-500 transition-all" style={{ width: `${progressPercent}%` }} />
        </div>
        {enrollment.status_code === "completed" && enrollment.certificate_no && (
          <Link href={`/school/certificate/${enrollment.id}`} className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-green-700 hover:underline">
            <Award className="h-4 w-4" /> {t("viewCertificate")} ({enrollment.certificate_no})
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-5">
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden h-fit">
          {modules.map((m) => (
            <div key={m.id} className="border-b border-slate-100 last:border-0">
              <div className="px-4 py-2.5 bg-slate-50 text-xs font-semibold text-slate-600">{m.title}</div>
              {m.lessons.map((l) => {
                const Icon = CONTENT_ICONS[l.content_type_code] ?? Type;
                const done = progressByLesson[l.id]?.completed_at;
                return (
                  <button
                    key={l.id}
                    onClick={() => setActiveLessonId(l.id)}
                    className={`w-full flex items-center gap-2 px-4 py-2.5 text-left text-sm hover:bg-fuchsia-50 ${activeLessonId === l.id ? "bg-fuchsia-50 text-fuchsia-700 font-medium" : "text-slate-600"}`}
                  >
                    {done ? <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" /> : <Circle className="h-4 w-4 text-slate-300 shrink-0" />}
                    <Icon className="h-3.5 w-3.5 shrink-0 opacity-60" />
                    <span className="truncate">{l.title}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm min-h-[300px]">
          {activeLesson ? (
            <LessonContent
              key={activeLesson.id}
              courseId={course.id}
              lesson={activeLesson}
              progress={progressByLesson[activeLesson.id] ?? null}
              passingScore={course.passing_score_percent}
            />
          ) : (
            <p className="text-sm text-slate-400">{t("noLessonYet")}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function LessonContent({
  courseId, lesson, progress, passingScore,
}: { courseId: string; lesson: Lesson; progress: Progress | null; passingScore: number }) {
  const t = useTranslations("school");
  const [isPending, startTransition] = useTransition();
  const done = Boolean(progress?.completed_at);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-slate-900">{lesson.title}</h3>
        <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">{CONTENT_TYPE_LABELS[lesson.content_type_code]}</span>
      </div>

      {lesson.content_type_code === "video" && (
        <div className="space-y-3 mb-4">
          {lesson.video_url && (
            <div className="aspect-video w-full rounded-lg overflow-hidden bg-black">
              <iframe src={toEmbedUrl(lesson.video_url)} className="w-full h-full" allowFullScreen />
            </div>
          )}
          {lesson.videoFiles.map((v) => (
            <video key={v.id} controls className="w-full rounded-lg bg-black" src={v.url ?? undefined}>
              {t("videoNotSupported")}
            </video>
          ))}
          {!lesson.video_url && lesson.videoFiles.length === 0 && <p className="text-sm text-slate-400">{t("noVideoYet")}</p>}
        </div>
      )}

      {lesson.content_type_code === "text" && (
        <div className="prose prose-sm max-w-none whitespace-pre-wrap text-slate-700 mb-4">{lesson.text_content}</div>
      )}

      {lesson.content_type_code === "document" && (
        <div className="space-y-2 mb-4">
          {lesson.documents.length === 0 && <p className="text-sm text-slate-400">{t("noDocumentYet")}</p>}
          {lesson.documents.map((d) => (
            <a key={d.id} href={d.url ?? "#"} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-fuchsia-700 hover:bg-fuchsia-50">
              <FileText className="h-4 w-4" /> {d.file_name}
            </a>
          ))}
        </div>
      )}

      {lesson.content_type_code === "quiz" && lesson.quiz && (
        <QuizTaker courseId={courseId} lessonId={lesson.id} quiz={lesson.quiz} passingScore={lesson.quiz.passing_score_percent ?? passingScore} lastScore={progress?.score_percent ?? null} passed={progress?.passed ?? null} />
      )}

      {lesson.content_type_code !== "quiz" && (
        <button
          onClick={() => startTransition(() => markLessonComplete(lesson.id, courseId))}
          disabled={isPending || done}
          className={`mt-2 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium ${done ? "bg-green-50 text-green-700 cursor-default" : "bg-fuchsia-600 text-white hover:bg-fuchsia-700"}`}
        >
          {done ? <><CheckCircle2 className="h-4 w-4" /> {t("completed")}</> : t("markComplete")}
        </button>
      )}
    </div>
  );
}

function QuizTaker({
  courseId, lessonId, quiz, passingScore, lastScore, passed,
}: { courseId: string; lessonId: string; quiz: Quiz; passingScore: number; lastScore: number | null; passed: boolean | null }) {
  const t = useTranslations("school");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ score_percent: number; passed: boolean } | null>(
    lastScore !== null ? { score_percent: lastScore, passed: Boolean(passed) } : null
  );
  const [isPending, startTransition] = useTransition();

  if (quiz.questions.length === 0) {
    return <p className="text-sm text-slate-400">{t("quizNoQuestionsYet")}</p>;
  }

  function handleSubmit() {
    const fd = new FormData();
    for (const [qId, optId] of Object.entries(answers)) fd.set(`answer_${qId}`, optId);
    startTransition(async () => {
      const res = await submitQuiz(lessonId, courseId, fd);
      if (res.ok) setResult({ score_percent: res.score_percent, passed: res.passed });
      else alert(res.error);
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">{t("passingScoreLabel", { score: passingScore })}</p>
      {quiz.questions.map((q, i) => (
        <div key={q.id} className="rounded-lg border border-slate-200 p-3">
          <p className="text-sm font-medium text-slate-800 mb-2">{i + 1}. {q.question_text}</p>
          <div className="space-y-1.5">
            {q.options.map((o) => (
              <label key={o.id} className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                <input
                  type="radio"
                  name={`q_${q.id}`}
                  checked={answers[q.id] === o.id}
                  onChange={() => setAnswers((prev) => ({ ...prev, [q.id]: o.id }))}
                  className="accent-fuchsia-600"
                />
                {o.option_text}
              </label>
            ))}
          </div>
        </div>
      ))}

      {result && (
        <div className={`rounded-lg p-3 text-sm font-medium ${result.passed ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
          {result.passed ? <CheckCircle2 className="inline h-4 w-4 mr-1.5" /> : <Lock className="inline h-4 w-4 mr-1.5" />}
          {t("yourScore", { score: result.score_percent })} -- {result.passed ? t("passed") : t("notPassedTryAgain")}
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={isPending || Object.keys(answers).length < quiz.questions.length}
        className="rounded-lg bg-fuchsia-600 px-4 py-2 text-sm font-medium text-white hover:bg-fuchsia-700 disabled:opacity-50"
      >
        {result?.passed ? t("retakeQuiz") : t("submitAnswers")}
      </button>
    </div>
  );
}
