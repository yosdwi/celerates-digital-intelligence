import Link from "next/link";
import { BookOpen, CheckCircle2, PlayCircle } from "lucide-react";
import { COURSE_STATUS_LABELS, COURSE_STATUS_STYLES, COURSE_CATEGORIES } from "./constants";
import { getTranslations } from "next-intl/server";

const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(COURSE_CATEGORIES);

export async function CourseCard({
  course, lessonCount, canManage, enrollment, coverImageUrl,
}: {
  course: { id: string; title: string; description: string | null; category: string | null; status_code: string; estimated_duration_minutes: number | null };
  lessonCount: number;
  canManage: boolean;
  enrollment: { status_code: string } | null;
  coverImageUrl: string | null;
}) {
  const t = await getTranslations("school");
  return (
    <Link
      href={`/school/${course.id}`}
      className="block rounded-xl border border-slate-200 bg-white shadow-sm hover:shadow-md hover:border-fuchsia-300 transition-all overflow-hidden"
    >
      {coverImageUrl ? (
        <img src={coverImageUrl} alt={course.title} className="h-32 w-full object-cover" />
      ) : (
        <div className="h-32 w-full bg-gradient-to-br from-fuchsia-100 to-fuchsia-50 flex items-center justify-center">
          <BookOpen className="h-8 w-8 text-fuchsia-300" />
        </div>
      )}
      <div className="p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="rounded-lg bg-fuchsia-50 p-2">
          <BookOpen className="h-5 w-5 text-fuchsia-600" />
        </div>
        {canManage && (
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${COURSE_STATUS_STYLES[course.status_code]}`}>
            {COURSE_STATUS_LABELS[course.status_code]}
          </span>
        )}
        {!canManage && enrollment?.status_code === "completed" && (
          <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700">
            <CheckCircle2 className="h-3 w-3" /> {t("completed")}
          </span>
        )}
        {!canManage && enrollment?.status_code === "in_progress" && (
          <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
            <PlayCircle className="h-3 w-3" /> {t("inProgress")}
          </span>
        )}
      </div>

      <h3 className="mt-3 font-semibold text-slate-900 line-clamp-2">{course.title}</h3>
      {course.description && <p className="mt-1 text-sm text-slate-500 line-clamp-2">{course.description}</p>}

      <div className="mt-4 flex items-center gap-3 text-xs text-slate-400">
        {course.category && <span>{CATEGORY_LABELS[course.category] ?? course.category}</span>}
        <span>&middot;</span>
        <span>{t("lessonCount", { count: lessonCount })}</span>
        {course.estimated_duration_minutes && (
          <>
            <span>&middot;</span>
            <span>{t("durationMinutes", { minutes: course.estimated_duration_minutes })}</span>
          </>
        )}
      </div>
      </div>
    </Link>
  );
}
