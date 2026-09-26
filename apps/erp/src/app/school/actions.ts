"use server";
import { requirePilotActor } from "@/lib/actor";
import { db } from "@/db";
import {
  schoolCourses, schoolModules, schoolLessons, schoolQuizzes, schoolQuizQuestions,
  schoolQuizOptions, schoolEnrollments, schoolLessonProgress, users,
} from "@/db/schema";
import { eq, and, asc, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { markSaved } from "@/lib/saved-flag";
import { logActivity } from "@/lib/activity-log";
import { createNotification } from "@/lib/notifications";
import { saveAttachmentsAndLinks, extractFiles, extractLinks, deleteAttachment } from "@/lib/attachments";
import { uploadDocument, VIDEO_MAX_SIZE_BYTES } from "@/lib/storage";
import { getSchoolAccess } from "@/lib/school-access";
import { LESSON_DOCUMENT_SOURCE, LESSON_VIDEO_SOURCE } from "./constants";

async function saveCourseCoverImage(courseId: string, formData: FormData) {
  const file = formData.get("cover_image");
  if (!(file instanceof File) || file.size === 0) return;
  const path = await uploadDocument(file, `school_courses/${courseId}`, "cover");
  await db.update(schoolCourses).set({ cover_image_url: path }).where(eq(schoolCourses.id, courseId));
}

async function requireManage() {
  const access = await getSchoolAccess();
  if (!access.canManage) throw new Error("Hanya admin/instruktur School yang bisa melakukan ini");
  return access;
}

async function requireDelete() {
  const access = await getSchoolAccess();
  if (!access.canDelete) throw new Error("Menghapus cuma bisa dilakukan oleh akses Full di divisi School");
  return access;
}

async function generateCourseNo(): Promise<string> {
  const now = new Date();
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  for (let i = 0; i < 5; i++) {
    const seq = String(Math.floor(1 + Math.random() * 999)).padStart(3, "0");
    const candidate = `CRS-${ymd}-${seq}`;
    const existing = await db.select().from(schoolCourses).where(eq(schoolCourses.course_no, candidate));
    if (existing.length === 0) return candidate;
  }
  return `CRS-${ymd}-${Date.now()}`;
}

// ---------- Course ----------

export async function createCourse(formData: FormData): Promise<void> {
  await requirePilotActor();

  const access = await requireManage();
  const title = formData.get("title") as string;
  if (!title) throw new Error("Judul course wajib diisi");

  const course_no = await generateCourseNo();
  const [{ id }] = await db.insert(schoolCourses).values({
    course_no,
    title,
    description: (formData.get("description") as string) || null,
    category: (formData.get("category") as string) || null,
    passing_score_percent: Number(formData.get("passing_score_percent")) || 70,
    estimated_duration_minutes: formData.get("estimated_duration_minutes") ? Number(formData.get("estimated_duration_minutes")) : null,
    created_by_name: access.userName,
  }).returning({ id: schoolCourses.id });

  await saveCourseCoverImage(id, formData);

  await logActivity("school", "create", `Course baru: ${title} (${course_no})`, "School");
  revalidatePath("/school");
  await markSaved();
  redirect(`/school/${id}`);
}

export async function updateCourse(id: string, formData: FormData): Promise<void> {
  await requirePilotActor();

  await requireManage();
  const title = formData.get("title") as string;
  if (!title) throw new Error("Judul course wajib diisi");

  await db.update(schoolCourses).set({
    title,
    description: (formData.get("description") as string) || null,
    category: (formData.get("category") as string) || null,
    status_code: (formData.get("status_code") as string) || "draft",
    passing_score_percent: Number(formData.get("passing_score_percent")) || 70,
    estimated_duration_minutes: formData.get("estimated_duration_minutes") ? Number(formData.get("estimated_duration_minutes")) : null,
    updated_at: new Date(),
  }).where(eq(schoolCourses.id, id));

  await saveCourseCoverImage(id, formData);

  await logActivity("school", "update", `Course diperbarui: ${title}`, "School");
  revalidatePath("/school");
  revalidatePath(`/school/${id}`);
}

export async function publishCourse(id: string, statusCode: string) {
  await requirePilotActor();

  await requireManage();
  await db.update(schoolCourses).set({ status_code: statusCode, updated_at: new Date() }).where(eq(schoolCourses.id, id));
  await logActivity("school", "update", `Status course diubah jadi ${statusCode}`, "School");
  revalidatePath("/school");
  revalidatePath(`/school/${id}`);
}

export async function deleteCourse(id: string) {
  await requirePilotActor();

  await requireDelete();
  const [course] = await db.select().from(schoolCourses).where(eq(schoolCourses.id, id));
  if (!course) throw new Error("Course tidak ditemukan");
  await db.delete(schoolCourses).where(eq(schoolCourses.id, id));
  await logActivity("school", "delete", `Course dihapus: ${course.title}`, "School");
  revalidatePath("/school");
  redirect("/school");
}

// ---------- Module ----------

export async function createModule(courseId: string, title: string) {
  await requirePilotActor();

  await requireManage();
  if (!title) throw new Error("Judul module wajib diisi");
  const [{ maxPos }] = await db.select({ maxPos: sql<number>`coalesce(max(${schoolModules.position}), -1)` })
    .from(schoolModules).where(eq(schoolModules.course_id, courseId));
  await db.insert(schoolModules).values({ course_id: courseId, title, position: maxPos + 1 });
  revalidatePath(`/school/${courseId}`);
}

export async function updateModule(id: string, courseId: string, title: string) {
  await requirePilotActor();

  await requireManage();
  if (!title) throw new Error("Judul module wajib diisi");
  await db.update(schoolModules).set({ title }).where(eq(schoolModules.id, id));
  revalidatePath(`/school/${courseId}`);
}

export async function deleteModule(id: string, courseId: string) {
  await requirePilotActor();

  await requireDelete();
  await db.delete(schoolModules).where(eq(schoolModules.id, id));
  revalidatePath(`/school/${courseId}`);
}

// ---------- Lesson ----------

export async function createLesson(moduleId: string, courseId: string, formData: FormData) {
  await requirePilotActor();

  await requireManage();
  const title = formData.get("title") as string;
  if (!title) throw new Error("Judul lesson wajib diisi");
  const content_type_code = (formData.get("content_type_code") as string) || "text";
  if (content_type_code === "video") {
    const hasUrl = Boolean((formData.get("video_url") as string)?.trim());
    const hasFile = extractFiles(formData, "lesson_video_attachments").length > 0;
    if (!hasUrl && !hasFile) throw new Error("Isi URL video atau upload file video");
  }

  const [{ maxPos }] = await db.select({ maxPos: sql<number>`coalesce(max(${schoolLessons.position}), -1)` })
    .from(schoolLessons).where(eq(schoolLessons.module_id, moduleId));

  const [{ id: lessonId }] = await db.insert(schoolLessons).values({
    module_id: moduleId,
    title,
    content_type_code,
    video_url: content_type_code === "video" ? ((formData.get("video_url") as string) || null) : null,
    text_content: content_type_code === "text" ? ((formData.get("text_content") as string) || null) : null,
    position: maxPos + 1,
  }).returning({ id: schoolLessons.id });

  if (content_type_code === "document") {
    const files = extractFiles(formData, "lesson_attachments");
    const links = extractLinks(formData, "lesson_attachments_links");
    if (files.length > 0 || links.length > 0) {
      await saveAttachmentsAndLinks(LESSON_DOCUMENT_SOURCE, lessonId, { files, links });
    }
  }

  if (content_type_code === "video") {
    const files = extractFiles(formData, "lesson_video_attachments");
    if (files.length > 0) {
      await saveAttachmentsAndLinks(LESSON_VIDEO_SOURCE, lessonId, { files, links: [] }, null, { maxSizeBytes: VIDEO_MAX_SIZE_BYTES });
    }
  }

  if (content_type_code === "quiz") {
    await db.insert(schoolQuizzes).values({
      lesson_id: lessonId,
      passing_score_percent: Number(formData.get("passing_score_percent")) || 70,
      time_limit_minutes: formData.get("time_limit_minutes") ? Number(formData.get("time_limit_minutes")) : null,
    });
  }

  revalidatePath(`/school/${courseId}`);
}

export async function updateLesson(id: string, courseId: string, formData: FormData) {
  await requirePilotActor();

  await requireManage();
  const title = formData.get("title") as string;
  if (!title) throw new Error("Judul lesson wajib diisi");
  const content_type_code = (formData.get("content_type_code") as string) || "text";

  await db.update(schoolLessons).set({
    title,
    content_type_code,
    video_url: content_type_code === "video" ? ((formData.get("video_url") as string) || null) : null,
    text_content: content_type_code === "text" ? ((formData.get("text_content") as string) || null) : null,
  }).where(eq(schoolLessons.id, id));

  if (content_type_code === "document") {
    const files = extractFiles(formData, "lesson_attachments");
    const links = extractLinks(formData, "lesson_attachments_links");
    if (files.length > 0 || links.length > 0) {
      await saveAttachmentsAndLinks(LESSON_DOCUMENT_SOURCE, id, { files, links });
    }
  }

  if (content_type_code === "video") {
    const files = extractFiles(formData, "lesson_video_attachments");
    if (files.length > 0) {
      await saveAttachmentsAndLinks(LESSON_VIDEO_SOURCE, id, { files, links: [] }, null, { maxSizeBytes: VIDEO_MAX_SIZE_BYTES });
    }
  }

  revalidatePath(`/school/${courseId}`);
}

export async function deleteLessonAttachment(attachmentId: string, courseId: string) {
  await requirePilotActor();

  await requireManage();
  await deleteAttachment(attachmentId);
  revalidatePath(`/school/${courseId}`);
}

export async function deleteLesson(id: string, courseId: string) {
  await requirePilotActor();

  await requireDelete();
  await db.delete(schoolLessons).where(eq(schoolLessons.id, id));
  revalidatePath(`/school/${courseId}`);
}

// ---------- Quiz builder ----------

export async function addQuizQuestion(quizId: string, courseId: string, formData: FormData) {
  await requirePilotActor();

  await requireManage();
  const question_text = formData.get("question_text") as string;
  if (!question_text) throw new Error("Pertanyaan wajib diisi");

  const options = formData.getAll("option_text").map((v) => String(v).trim()).filter(Boolean);
  const correctIndex = Number(formData.get("correct_index"));
  if (options.length < 2) throw new Error("Minimal 2 pilihan jawaban");
  if (Number.isNaN(correctIndex) || correctIndex < 0 || correctIndex >= options.length) {
    throw new Error("Pilih jawaban yang benar");
  }

  const [{ maxPos }] = await db.select({ maxPos: sql<number>`coalesce(max(${schoolQuizQuestions.position}), -1)` })
    .from(schoolQuizQuestions).where(eq(schoolQuizQuestions.quiz_id, quizId));

  const [{ id: questionId }] = await db.insert(schoolQuizQuestions).values({
    quiz_id: quizId,
    question_text,
    position: maxPos + 1,
  }).returning({ id: schoolQuizQuestions.id });

  for (let i = 0; i < options.length; i++) {
    await db.insert(schoolQuizOptions).values({
      question_id: questionId,
      option_text: options[i],
      is_correct: i === correctIndex,
      position: i,
    });
  }

  revalidatePath(`/school/${courseId}`);
}

export async function deleteQuizQuestion(id: string, courseId: string) {
  await requirePilotActor();

  await requireDelete();
  await db.delete(schoolQuizQuestions).where(eq(schoolQuizQuestions.id, id));
  revalidatePath(`/school/${courseId}`);
}

// ---------- Learner: enrollment & progress ----------

async function currentUser() {
  const access = await getSchoolAccess();
  if (!access.userId) throw new Error("Sesi tidak valid, silakan login ulang");
  return access;
}

export async function enrollInCourse(courseId: string) {
  await requirePilotActor();

  const { userId } = await currentUser();
  const existing = await db.select().from(schoolEnrollments)
    .where(and(eq(schoolEnrollments.course_id, courseId), eq(schoolEnrollments.user_id, userId!)));
  if (existing.length === 0) {
    await db.insert(schoolEnrollments).values({ course_id: courseId, user_id: userId! });
    await logActivity("school", "create", "Enroll ke course baru", "School");
  }
  revalidatePath(`/school/${courseId}`);
  revalidatePath("/school/my-learning");
}

async function checkAndCompleteCourse(enrollmentId: string) {
  const [enrollment] = await db.select().from(schoolEnrollments).where(eq(schoolEnrollments.id, enrollmentId));
  if (!enrollment || enrollment.status_code === "completed") return;

  const allLessons = await db.select({ id: schoolLessons.id })
    .from(schoolLessons)
    .innerJoin(schoolModules, eq(schoolLessons.module_id, schoolModules.id))
    .where(eq(schoolModules.course_id, enrollment.course_id));

  if (allLessons.length === 0) return;

  const doneLessons = await db.select({ lesson_id: schoolLessonProgress.lesson_id })
    .from(schoolLessonProgress)
    .where(and(eq(schoolLessonProgress.enrollment_id, enrollmentId), sql`${schoolLessonProgress.completed_at} is not null`));

  const doneIds = new Set(doneLessons.map((d) => d.lesson_id));
  const allDone = allLessons.every((l) => doneIds.has(l.id));
  if (!allDone) return;

  const certificateNo = `CERT-${new Date().getFullYear()}-${enrollment.id.slice(0, 8).toUpperCase()}`;
  await db.update(schoolEnrollments).set({
    status_code: "completed",
    completed_at: new Date(),
    certificate_no: certificateNo,
    certificate_issued_at: new Date(),
  }).where(eq(schoolEnrollments.id, enrollmentId));

  const [user] = await db.select().from(users).where(eq(users.id, enrollment.user_id));
  const [course] = await db.select().from(schoolCourses).where(eq(schoolCourses.id, enrollment.course_id));
  if (user) {
    await createNotification(
      user.id,
      "Selamat! Course Selesai",
      `Kamu berhasil menyelesaikan course "${course?.title ?? ""}" dan mendapat sertifikat ${certificateNo}.`,
      `/school/certificate/${enrollmentId}`
    );
  }
}

export async function markLessonComplete(lessonId: string, courseId: string) {
  await requirePilotActor();

  const { userId } = await currentUser();
  const [lesson] = await db.select().from(schoolLessons).where(eq(schoolLessons.id, lessonId));
  if (!lesson) throw new Error("Lesson tidak ditemukan");
  if (lesson.content_type_code === "quiz") throw new Error("Lesson quiz harus diselesaikan lewat submit quiz");

  const [enrollment] = await db.select().from(schoolEnrollments)
    .where(and(eq(schoolEnrollments.course_id, courseId), eq(schoolEnrollments.user_id, userId!)));
  if (!enrollment) throw new Error("Kamu belum enroll di course ini");

  const [existing] = await db.select().from(schoolLessonProgress)
    .where(and(eq(schoolLessonProgress.enrollment_id, enrollment.id), eq(schoolLessonProgress.lesson_id, lessonId)));

  if (existing) {
    await db.update(schoolLessonProgress).set({ completed_at: new Date() }).where(eq(schoolLessonProgress.id, existing.id));
  } else {
    await db.insert(schoolLessonProgress).values({
      enrollment_id: enrollment.id, lesson_id: lessonId, user_id: userId!, completed_at: new Date(), attempt_count: 1,
    });
  }

  await checkAndCompleteCourse(enrollment.id);
  revalidatePath(`/school/${courseId}`);
  revalidatePath("/school/my-learning");
}

export type QuizSubmitResult = { ok: true; score_percent: number; passed: boolean } | { ok: false; error: string };

export async function submitQuiz(lessonId: string, courseId: string, formData: FormData): Promise<QuizSubmitResult> {
  await requirePilotActor();

  const { userId } = await currentUser();
  const [lesson] = await db.select().from(schoolLessons).where(eq(schoolLessons.id, lessonId));
  if (!lesson || lesson.content_type_code !== "quiz") return { ok: false, error: "Lesson quiz tidak ditemukan" };

  const [quiz] = await db.select().from(schoolQuizzes).where(eq(schoolQuizzes.lesson_id, lessonId));
  if (!quiz) return { ok: false, error: "Quiz belum dikonfigurasi" };

  const [enrollment] = await db.select().from(schoolEnrollments)
    .where(and(eq(schoolEnrollments.course_id, courseId), eq(schoolEnrollments.user_id, userId!)));
  if (!enrollment) return { ok: false, error: "Kamu belum enroll di course ini" };

  const questions = await db.select().from(schoolQuizQuestions).where(eq(schoolQuizQuestions.quiz_id, quiz.id)).orderBy(asc(schoolQuizQuestions.position));
  if (questions.length === 0) return { ok: false, error: "Quiz belum punya pertanyaan" };

  let correctCount = 0;
  for (const q of questions) {
    const selectedOptionId = formData.get(`answer_${q.id}`) as string | null;
    if (!selectedOptionId) continue;
    const [option] = await db.select().from(schoolQuizOptions).where(eq(schoolQuizOptions.id, selectedOptionId));
    if (option?.is_correct) correctCount++;
  }

  const score_percent = Math.round((correctCount / questions.length) * 100);
  const passed = score_percent >= quiz.passing_score_percent;

  const [existing] = await db.select().from(schoolLessonProgress)
    .where(and(eq(schoolLessonProgress.enrollment_id, enrollment.id), eq(schoolLessonProgress.lesson_id, lessonId)));

  if (existing) {
    await db.update(schoolLessonProgress).set({
      score_percent, passed, attempt_count: existing.attempt_count + 1,
      completed_at: passed ? new Date() : existing.completed_at,
    }).where(eq(schoolLessonProgress.id, existing.id));
  } else {
    await db.insert(schoolLessonProgress).values({
      enrollment_id: enrollment.id, lesson_id: lessonId, user_id: userId!,
      score_percent, passed, attempt_count: 1, completed_at: passed ? new Date() : null,
    });
  }

  if (passed) await checkAndCompleteCourse(enrollment.id);
  revalidatePath(`/school/${courseId}`);
  revalidatePath("/school/my-learning");
  return { ok: true, score_percent, passed };
}
