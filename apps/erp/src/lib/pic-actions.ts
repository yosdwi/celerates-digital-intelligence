"use server";
import { requirePilotActor } from "@/lib/actor";
import { db } from "@/db";
import { pics } from "@/db/schema";
import { revalidatePath, revalidateTag } from "next/cache";

export async function createPic(name: string, currentPath: string): Promise<string> {
  await requirePilotActor();

  const trimmed = name.trim();
  if (!trimmed) throw new Error("Nama PIC tidak boleh kosong");

  await db.insert(pics).values({ name: trimmed }).onConflictDoNothing();
  // Wajib -- getPicNames() di-cache lewat unstable_cache, tanpa ini PIC yang
  // baru ditambah nggak bakal muncul di halaman lain sampai cache expired.
  revalidateTag("pics");
  revalidatePath(currentPath);
  return trimmed;
}