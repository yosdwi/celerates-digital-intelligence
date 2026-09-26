import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ProfileForm } from "./profile-form";

export default async function ProfilePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/login");

  const [user] = await db.select().from(users).where(eq(users.email, session.user.email as string));
  if (!user) redirect("/login");

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white px-8 py-5">
        <p className="text-xs font-medium uppercase tracking-wide text-brand-500">Akun Saya</p>
        <h1 className="text-2xl font-semibold text-slate-900 mt-0.5">Edit Profile</h1>
      </header>

      <main className="px-8 py-8 max-w-lg mx-auto">
        <ProfileForm user={{ full_name: user.full_name, role_title: user.role_title, email: user.email, hasPassword: !!user.password_hash }} />
      </main>
    </div>
  );
}