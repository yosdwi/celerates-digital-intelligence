export const COURSE_STATUSES = [
  ["draft", "Draft"],
  ["published", "Published"],
  ["archived", "Archived"],
] as const;

export const COURSE_STATUS_LABELS: Record<string, string> = Object.fromEntries(COURSE_STATUSES);

export const COURSE_STATUS_STYLES: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600",
  published: "bg-green-100 text-green-700",
  archived: "bg-amber-100 text-amber-700",
};

export const COURSE_CATEGORIES = [
  ["onboarding", "Onboarding"],
  ["technical", "Technical Skill"],
  ["soft_skill", "Soft Skill"],
  ["compliance", "Compliance / Kebijakan"],
  ["leadership", "Leadership"],
  ["product", "Product Knowledge"],
  ["other", "Lainnya"],
] as const;

export const CONTENT_TYPES = [
  ["video", "Video"],
  ["document", "Dokumen"],
  ["text", "Teks / Artikel"],
  ["quiz", "Quiz"],
] as const;

export const CONTENT_TYPE_LABELS: Record<string, string> = Object.fromEntries(CONTENT_TYPES);

export const ENROLLMENT_STATUSES = [
  ["in_progress", "Sedang Belajar"],
  ["completed", "Selesai"],
] as const;

export const ENROLLMENT_STATUS_LABELS: Record<string, string> = Object.fromEntries(ENROLLMENT_STATUSES);

export const LESSON_DOCUMENT_SOURCE = "school_lesson_document";
export const LESSON_VIDEO_SOURCE = "school_lesson_video";
