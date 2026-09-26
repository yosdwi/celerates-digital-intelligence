import { db } from "@/db";
import { schoolEnrollments, schoolCourses, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getSchoolAccess } from "@/lib/school-access";
import { Award } from "lucide-react";
import Link from "next/link";
import { PrintButton } from "./print-button";
import { getTranslations } from "next-intl/server";

export default async function CertificatePage({ params }: { params: Promise<{ enrollmentId: string }> }) {
  const { enrollmentId } = await params;
  const t = await getTranslations("school");
  const access = await getSchoolAccess();

  const [enrollment] = await db.select().from(schoolEnrollments).where(eq(schoolEnrollments.id, enrollmentId));
  if (!enrollment || enrollment.status_code !== "completed") notFound();
  if (!access.canManage && enrollment.user_id !== access.userId) notFound();

  const [[course], [user]] = await Promise.all([
    db.select().from(schoolCourses).where(eq(schoolCourses.id, enrollment.course_id)),
    db.select().from(users).where(eq(users.id, enrollment.user_id)),
  ]);

  const completedDate = enrollment.completed_at
    ? new Date(enrollment.completed_at).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })
    : "-";

  return (
    <div className="min-h-screen bg-slate-100 py-10 px-4 print:bg-white print:py-0">
      <div className="max-w-3xl mx-auto mb-4 flex justify-between print:hidden">
        <Link href="/school/my-learning" className="text-sm font-medium text-fuchsia-700 hover:underline">&larr; {t("backAction")}</Link>
        <PrintButton />
      </div>

      <div className="max-w-3xl mx-auto rounded-2xl border-8 border-fuchsia-100 bg-white p-12 shadow-lg text-center print:shadow-none print:border-fuchsia-200">
        <Award className="h-14 w-14 text-fuchsia-500 mx-auto" />
        <p className="mt-4 text-xs uppercase tracking-widest text-slate-400">{t("certificateOfCompletion")}</p>
        <h1 className="mt-2 text-3xl font-bold text-slate-900">{user?.full_name ?? t("talent")}</h1>
        <p className="mt-4 text-sm text-slate-500">{t("hasCompletedCourse")}</p>
        <h2 className="mt-1 text-xl font-semibold text-fuchsia-700">{course?.title}</h2>
        <p className="mt-6 text-sm text-slate-500">{t("completedOn", { date: completedDate })}</p>
        <p className="mt-1 text-xs text-slate-400">{t("certificateNo", { number: enrollment.certificate_no ?? "-" })}</p>
        <div className="mt-10 pt-6 border-t border-dashed border-slate-200 text-xs text-slate-400">
          {t("celeratesSchoolFooter")}
        </div>
      </div>
    </div>
  );
}
