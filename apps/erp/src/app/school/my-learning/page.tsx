import { db } from "@/db";
import { schoolEnrollments, schoolCourses, schoolModules, schoolLessons, schoolLessonProgress } from "@/db/schema";
import { eq, inArray, and, desc } from "drizzle-orm";
import { getSchoolAccess } from "@/lib/school-access";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { GraduationCap, Award, CheckCircle2, PlayCircle } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

export default async function MyLearningPage() {
  const t = await getTranslations("school");
  const access = await getSchoolAccess();
  if (!access.userId) {
    return <div className="p-8 text-sm text-slate-500">{t("loginToViewProgress")}</div>;
  }

  const enrollments = await db.select().from(schoolEnrollments).where(eq(schoolEnrollments.user_id, access.userId)).orderBy(desc(schoolEnrollments.enrolled_at));
  const courseIds = enrollments.map((e) => e.course_id);
  const courses = courseIds.length ? await db.select().from(schoolCourses).where(inArray(schoolCourses.id, courseIds)) : [];
  const courseById: Record<string, (typeof courses)[number]> = Object.fromEntries(courses.map((c) => [c.id, c]));

  const lessonRows = courseIds.length
    ? await db.select({ courseId: schoolModules.course_id, lessonId: schoolLessons.id })
        .from(schoolModules).leftJoin(schoolLessons, eq(schoolLessons.module_id, schoolModules.id))
        .where(inArray(schoolModules.course_id, courseIds))
    : [];
  const lessonCountByCourse: Record<string, number> = {};
  for (const r of lessonRows) { if (r.lessonId) lessonCountByCourse[r.courseId] = (lessonCountByCourse[r.courseId] ?? 0) + 1; }

  const enrollmentIds = enrollments.map((e) => e.id);
  const completedFullRows = enrollmentIds.length
    ? await db.select().from(schoolLessonProgress).where(inArray(schoolLessonProgress.enrollment_id, enrollmentIds))
    : [];
  const doneCountByEnrollment: Record<string, number> = {};
  for (const r of completedFullRows) { if (r.completed_at) doneCountByEnrollment[r.enrollment_id] = (doneCountByEnrollment[r.enrollment_id] ?? 0) + 1; }

  const inProgress = enrollments.filter((e) => e.status_code === "in_progress");
  const completed = enrollments.filter((e) => e.status_code === "completed");

  return (
    <div className="min-h-screen">
      <PageHeader icon={GraduationCap} color="bg-fuchsia-600" eyebrow={t("eyebrowSchool")} title={t("myLearning")} subtitle={t("myLearningSubtitle")}>
        <Link href="/school" className="text-sm font-medium text-fuchsia-700 hover:underline">&larr; {t("courseCatalog")}</Link>
      </PageHeader>

      <main className="px-8 py-8 space-y-8 max-w-5xl mx-auto">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <StatCard label={t("totalEnroll")} value={enrollments.length} color="navy" />
          <StatCard label={t("inProgressLabel")} value={inProgress.length} color="blue" />
          <StatCard label={t("completedLabel")} value={completed.length} color="green" />
        </div>

        {enrollments.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center text-sm text-slate-500">
            {t("notEnrolledYet")} <Link href="/school" className="text-fuchsia-700 hover:underline">{t("viewCourseCatalog")}</Link>.
          </div>
        ) : (
          <div className="space-y-3">
            {enrollments.map((e) => {
              const course = courseById[e.course_id];
              if (!course) return null;
              const total = lessonCountByCourse[e.course_id] ?? 0;
              const done = doneCountByEnrollment[e.id] ?? 0;
              const pct = total ? Math.round((done / total) * 100) : 0;
              return (
                <div key={e.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Link href={`/school/${course.id}`} className="font-semibold text-slate-900 hover:text-fuchsia-700">{course.title}</Link>
                      {e.status_code === "completed" ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700"><CheckCircle2 className="h-3 w-3" /> {t("completed")}</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700"><PlayCircle className="h-3 w-3" /> {t("inProgress")}</span>
                      )}
                    </div>
                    <div className="mt-2 h-1.5 w-full max-w-xs rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full rounded-full bg-fuchsia-500" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="mt-1 text-xs text-slate-400">{t("progressLessonCount", { percent: pct, done, total })}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {e.status_code === "completed" && e.certificate_no && (
                      <Link href={`/school/certificate/${e.id}`} className="inline-flex items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm font-medium text-green-700 hover:bg-green-100">
                        <Award className="h-4 w-4" /> {t("certificate")}
                      </Link>
                    )}
                    <Link href={`/school/${course.id}`} className="rounded-lg bg-fuchsia-600 px-4 py-2 text-sm font-medium text-white hover:bg-fuchsia-700">
                      {e.status_code === "completed" ? t("review") : t("continueLearning")}
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
