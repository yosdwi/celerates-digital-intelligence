import { db } from "@/db";
import { schoolCourses, schoolModules, schoolLessons, schoolQuizzes, schoolQuizQuestions, schoolQuizOptions, schoolEnrollments, schoolLessonProgress } from "@/db/schema";
import { eq, asc, and, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getSchoolAccess } from "@/lib/school-access";
import { getAttachmentsWithUrlsForMany } from "@/lib/attachments";
import { getDocumentUrl } from "@/lib/storage";
import { LESSON_DOCUMENT_SOURCE, LESSON_VIDEO_SOURCE } from "../constants";
import { PageHeader } from "@/components/page-header";
import { GraduationCap } from "lucide-react";
import Link from "next/link";
import { CourseBuilder } from "./course-builder";
import { CoursePlayer } from "./course-player";
import { getTranslations } from "next-intl/server";

export default async function CourseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations("school");
  const access = await getSchoolAccess();

  const [[course], modules] = await Promise.all([
    db.select().from(schoolCourses).where(eq(schoolCourses.id, id)),
    db.select().from(schoolModules).where(eq(schoolModules.course_id, id)).orderBy(asc(schoolModules.position)),
  ]);
  if (!course) notFound();

  const moduleIds = modules.map((m) => m.id);

  const lessons = moduleIds.length
    ? await db.select().from(schoolLessons).where(inArray(schoolLessons.module_id, moduleIds)).orderBy(asc(schoolLessons.position))
    : [];
  const lessonIds = lessons.map((l) => l.id);

  const quizzes = lessonIds.length
    ? await db.select().from(schoolQuizzes).where(inArray(schoolQuizzes.lesson_id, lessonIds))
    : [];
  const quizIds = quizzes.map((q) => q.id);

  const questions = quizIds.length
    ? await db.select().from(schoolQuizQuestions).where(inArray(schoolQuizQuestions.quiz_id, quizIds)).orderBy(asc(schoolQuizQuestions.position))
    : [];
  const questionIds = questions.map((q) => q.id);

  const options = questionIds.length
    ? await db.select().from(schoolQuizOptions).where(inArray(schoolQuizOptions.question_id, questionIds)).orderBy(asc(schoolQuizOptions.position))
    : [];

  const [lessonDocs, lessonVideos] = await Promise.all([
    getAttachmentsWithUrlsForMany(LESSON_DOCUMENT_SOURCE, lessons.filter((l) => l.content_type_code === "document").map((l) => l.id)),
    getAttachmentsWithUrlsForMany(LESSON_VIDEO_SOURCE, lessons.filter((l) => l.content_type_code === "video").map((l) => l.id)),
  ]);

  const coverImageUrl = course.cover_image_url ? await getDocumentUrl(course.cover_image_url) : null;

  const modulesWithLessons = modules.map((m) => ({
    ...m,
    lessons: lessons.filter((l) => l.module_id === m.id).map((l) => ({
      ...l,
      quiz: quizzes.find((q) => q.lesson_id === l.id)
        ? {
            ...quizzes.find((q) => q.lesson_id === l.id)!,
            questions: questions.filter((q) => q.quiz_id === quizzes.find((qz) => qz.lesson_id === l.id)!.id).map((q) => ({
              ...q,
              options: options.filter((o) => o.question_id === q.id),
            })),
          }
        : null,
      documents: lessonDocs[l.id] ?? [],
      videoFiles: lessonVideos[l.id] ?? [],
    })),
  }));

  let enrollment = null;
  let progressByLesson: Record<string, { completed_at: Date | null; passed: boolean | null; score_percent: number | null }> = {};
  if (!access.canManage && access.userId) {
    [enrollment] = await db.select().from(schoolEnrollments).where(and(eq(schoolEnrollments.course_id, id), eq(schoolEnrollments.user_id, access.userId)));
    if (enrollment) {
      const progress = await db.select().from(schoolLessonProgress).where(eq(schoolLessonProgress.enrollment_id, enrollment.id));
      for (const p of progress) progressByLesson[p.lesson_id] = p;
    }
  }

  return (
    <div className="min-h-screen">
      <PageHeader icon={GraduationCap} color="bg-fuchsia-600" eyebrow={t("eyebrowSchool")} title={course.title} subtitle={course.description ?? undefined}>
        <Link href="/school" className="text-sm font-medium text-fuchsia-700 hover:underline">&larr; {t("backToCatalog")}</Link>
      </PageHeader>

      <main className="px-8 py-8 max-w-7xl mx-auto">
        {access.canManage ? (
          <CourseBuilder course={course} modules={modulesWithLessons} coverImageUrl={coverImageUrl} />
        ) : (
          <CoursePlayer course={course} modules={modulesWithLessons} enrollment={enrollment} progressByLesson={progressByLesson} coverImageUrl={coverImageUrl} />
        )}
      </main>
    </div>
  );
}
