import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export type SchoolAccess = {
  userId?: string;
  userName: string;
  isOwner: boolean;
  canManage: boolean; // instruktur/admin School (editor/full): bisa kelola course, module, lesson, quiz
  canDelete: boolean; // cuma level "full" (atau Owner) yang boleh hapus
};

/** Owner selalu admin. Selain itu, level "editor"/"full" pada divisi "school" = admin/instruktur (boleh create/update), "viewer" = learner saja (cuma baca). Delete cuma boleh "full". */
export async function getSchoolAccess(): Promise<SchoolAccess> {
  const session = await getServerSession(authOptions);
  const isOwner = Boolean((session?.user as any)?.isOwner);
  const userId = (session?.user as any)?.id as string | undefined;
  const userName = ((session?.user as any)?.fullName ?? session?.user?.name ?? session?.user?.email ?? "Seseorang") as string;
  const access = ((session?.user as any)?.access ?? []) as { divisionKey: string; level: string }[];
  const schoolLevel = access.find((a) => a.divisionKey === "school")?.level;
  const canManage = isOwner || schoolLevel === "editor" || schoolLevel === "full";
  const canDelete = isOwner || schoolLevel === "full";
  return { userId, userName, isOwner, canManage, canDelete };
}
