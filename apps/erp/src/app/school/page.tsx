import { db } from "@/db";
import { schoolCourses, schoolModules, schoolLessons, schoolEnrollments } from "@/db/schema";
import { eq, inArray, and } from "drizzle-orm";
import { getSchoolAccess } from "@/lib/school-access";
import { getDocumentUrls } from "@/lib/storage";
import { createCourse } from "./actions";
import { COURSE_CATEGORIES } from "./constants";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { AddRecordModal } from "@/components/add-record-modal";
import { CourseCard } from "./course-card";
import { GraduationCap } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

export default async function SchoolPage() {
  const t = await getTranslations("school");
  const access = await getSchoolAccess();

  const courses = access.canManage
    ? await db.select().from(schoolCourses)
    : await db.select().from(schoolCourses).where(eq(schoolCourses.status_code, "published"));

  const courseIds = courses.map((c) => c.id);

  const lessonCounts = courseIds.length
    ? await db.select({ courseId: schoolModules.course_id, lessonId: schoolLessons.id })
        .from(schoolModules)
        .leftJoin(schoolLessons, eq(schoolLessons.module_id, schoolModules.id))
        .where(inArray(schoolModules.course_id, courseIds))
    : [];

  const lessonCountByCourse: Record<string, number> = {};
  for (const row of lessonCounts) {
    if (!row.lessonId) continue;
    lessonCountByCourse[row.courseId] = (lessonCountByCourse[row.courseId] ?? 0) + 1;
  }

  const myEnrollments = access.userId && courseIds.length
    ? await db.select().from(schoolEnrollments).where(and(inArray(schoolEnrollments.course_id, courseIds), eq(schoolEnrollments.user_id, access.userId)))
    : [];
  const enrollmentByCourse: Record<string, (typeof myEnrollments)[number]> = {};
  for (const e of myEnrollments) enrollmentByCourse[e.course_id] = e;

  const coverPaths = courses.map((c) => c.cover_image_url).filter((p): p is string => Boolean(p));
  const coverUrlByPath = await getDocumentUrls(coverPaths);
  const coverUrlByCourse: Record<string, string | null> = {};
  for (const c of courses) {
    coverUrlByCourse[c.id] = c.cover_image_url ? (coverUrlByPath[c.cover_image_url] ?? null) : null;
  }

  const totalPublished = courses.filter((c) => c.status_code === "published").length;
  const totalDraft = courses.filter((c) => c.status_code === "draft").length;
  const totalCompleted = myEnrollments.filter((e) => e.status_code === "completed").length;

  return (
    <div className="min-h-screen">
      <PageHeader
        icon={GraduationCap}
        color="bg-fuchsia-600"
        eyebrow={t("learningManagement")}
        title={t("learningManagement")}
        subtitle={t("pageSubtitle")}
      >
        <Link href="/school/my-learning" className="text-sm font-medium text-fuchsia-700 hover:underline">
          {t("myLearning")} &rarr;
        </Link>
      </PageHeader>

      <main className="px-8 py-8 space-y-8 max-w-7xl mx-auto">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label={t("totalCourse")} value={courses.length} color="navy" />
          <StatCard label={t("published")} value={totalPublished} color="green" />
          {access.canManage && <StatCard label={t("draft")} value={totalDraft} color="amber" />}
          {!access.canManage && <StatCard label={t("courseCompleted")} value={totalCompleted} color="purple" />}
        </div>

        {access.canManage && (
          <div className="flex justify-end">
            <AddRecordModal buttonLabel={t("createNewCourse")} title={t("createNewCourse")} action={createCourse}>
              <div className="sm:col-span-3">
                <Field label={t("courseTitle")} name="title" required />
              </div>
              <SelectField label={t("category")} name="category" options={COURSE_CATEGORIES} />
              <Field label={t("passingScoreQuiz")} name="passing_score_percent" type="number" defaultValue="70" />
              <Field label={t("estimatedDuration")} name="estimated_duration_minutes" type="number" />
              <div className="sm:col-span-3">
                <Field label={t("description")} name="description" textarea rows={3} />
              </div>
              <div className="sm:col-span-3">
                <label className="mb-1 block text-sm font-medium text-slate-700">{t("courseCoverPhoto")}</label>
                <input name="cover_image" type="file" accept="image/*" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>
            </AddRecordModal>
          </div>
        )}

        {courses.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center text-sm text-slate-500">
            {access.canManage ? t("noCourseYet") : t("noPublishedCourseYet")}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {courses.map((c) => (
              <CourseCard
                key={c.id}
                course={c}
                lessonCount={lessonCountByCourse[c.id] ?? 0}
                canManage={access.canManage}
                enrollment={enrollmentByCourse[c.id] ?? null}
                coverImageUrl={coverUrlByCourse[c.id] ?? null}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function Field({
  label, name, type = "text", required, textarea, rows = 3, defaultValue,
}: { label: string; name: string; type?: string; required?: boolean; textarea?: boolean; rows?: number; defaultValue?: string }) {
  const baseClass = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-fuchsia-500 focus:outline-none focus:ring-1 focus:ring-fuchsia-500";
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label} {required && <span className="text-red-500">*</span>}</span>
      {textarea ? <textarea name={name} rows={rows} defaultValue={defaultValue} className={baseClass} /> : <input name={name} type={type} required={required} defaultValue={defaultValue} className={baseClass} />}
    </label>
  );
}

function SelectField({
  label, name, options, required, defaultValue,
}: { label: string; name: string; options: readonly (readonly [string, string])[]; required?: boolean; defaultValue?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label} {required && <span className="text-red-500">*</span>}</span>
      <select name={name} required={required} defaultValue={defaultValue} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-fuchsia-500 focus:outline-none focus:ring-1 focus:ring-fuchsia-500">
        <option value="">-</option>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}
