import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { SignOutButton } from "./sign-out-button";
import { SessionSync } from "./session-sync";
import { getTranslations } from "next-intl/server";

export default async function PendingApprovalPage() {
  const t = await getTranslations("pendingApproval");
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/login");

  const [dbUser] = await db.select().from(users).where(eq(users.email, session.user.email as string));
  const isRejected = dbUser?.status === "rejected";
  const isApproved = dbUser?.status === "active";

  if (isApproved) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto h-14 w-14 rounded-2xl flex items-center justify-center mb-4 bg-emerald-100">
            <span className="text-2xl text-emerald-600">✓</span>
          </div>
          <h1 className="text-xl font-semibold text-slate-900">{t("accessApproved")}</h1>
          <SessionSync redirectTo="/" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md text-center">
        <div className={`mx-auto h-14 w-14 rounded-2xl flex items-center justify-center mb-4 ${isRejected ? "bg-red-100" : "bg-amber-100"}`}>
          <span className={`text-2xl ${isRejected ? "text-red-600" : "text-amber-600"}`}>{isRejected ? "!" : "..."}</span>
        </div>
        <h1 className="text-xl font-semibold text-slate-900">
          {isRejected ? t("accessRejected") : t("waitingApproval")}
        </h1>
        <p className="text-sm text-slate-500 mt-2">
          {isRejected ? t("rejectedMessage") : t("waitingMessage")}
        </p>
        <div className="mt-6">
          <SignOutButton />
        </div>
      </div>
    </div>
  );
}