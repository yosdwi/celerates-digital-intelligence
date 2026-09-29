"use server";
import { requirePilotActor } from "@/lib/actor";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { markSaved } from "@/lib/saved-flag";

export async function completeProfile(formData: FormData) {
  await requirePilotActor();

  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/login");

  const role_title = formData.get("role_title") as string;
  const requested_division_id = formData.get("requested_division_id") as string;

  await db.update(users).set({
    role_title: role_title || null,
    requested_division_id,
  }).where(eq(users.email, session.user.email as string));

  await markSaved("Request akses berhasil dikirim! Menunggu persetujuan Owner.");

  redirect("/pending-approval");
}