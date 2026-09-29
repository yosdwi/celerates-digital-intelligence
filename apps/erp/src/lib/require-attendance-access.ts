import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export type AttendanceActor = { userId: string; userName: string; isOwner: boolean };

/**
 * Modul Attendance self-service: record nempel ke `users.id` langsung (sama
 * seperti pola Timesheet -- lihat require-timesheet-access.ts), karena akun
 * Talent belum tentu punya row `employees` yang ter-link, dan Backoffice pun
 * absen sebagai dirinya sendiri lewat akun login. Semua user aktif (Talent
 * atau Backoffice divisi manapun) boleh check-in/out -- tidak ada gating
 * per-divisi di sini, itu dicek di middleware.ts.
 */
export async function currentAttendanceActor(): Promise<AttendanceActor> {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  const userName = ((session?.user as any)?.fullName ?? session?.user?.name ?? session?.user?.email ?? "Seseorang") as string;
  const isOwner = Boolean((session?.user as any)?.isOwner);

  if (!userId) throw new Error("Sesi tidak valid, silakan login ulang");

  return { userId, userName, isOwner };
}
