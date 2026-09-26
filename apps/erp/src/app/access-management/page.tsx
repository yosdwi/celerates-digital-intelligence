import { getServerSession } from "next-auth";
import { getTranslations } from "next-intl/server";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { users, divisions, userAccess } from "@/db/schema";
import { ApproveRejectButtons } from "./approve-reject-buttons";
import { AccessEditor } from "./access-editor";
import { OwnerToggle } from "./owner-toggle";
import { createDivision } from "./actions";
import { ExpandableSection } from "@/components/expandable-section";
import { InviteUserForm } from "./invite-user-form";
import { EditUserButton } from "./edit-user-button";
import { DeleteUserButton } from "./delete-user-button";
import { PageHeader } from "@/components/page-header";
import { Shield } from "lucide-react";

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  active: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
};

function AccountTypeBadge({ accountType, talentLabel, backofficeLabel }: { accountType: string; talentLabel: string; backofficeLabel: string }) {
  const isTalent = accountType === "talent";
  return (
    <span className={`inline-flex items-center rounded-full whitespace-nowrap px-2 py-0.5 text-[10px] font-medium ${isTalent ? "bg-purple-100 text-purple-700" : "bg-slate-100 text-slate-600"}`}>
      {isTalent ? talentLabel : backofficeLabel}
    </span>
  );
}

export default async function AccessManagementPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user || !(session.user as any).isOwner) {
    redirect("/");
  }

  const t = await getTranslations("accessManagement");

  const [allUsers, divisionOptions, allAccess] = await Promise.all([
    db.select().from(users),
    db.select({ id: divisions.id, key: divisions.key, name: divisions.name }).from(divisions),
    db.select().from(userAccess),
  ]);

  const pendingUsers = allUsers.filter((u) => u.status === "pending");
  const otherUsers = allUsers.filter((u) => u.status !== "pending");

  function getRequestedDivisionName(divisionId: string | null) {
    if (!divisionId) return "-";
    return divisionOptions.find((d) => d.id === divisionId)?.name ?? "-";
  }

  const accountTypeLabels = { talent: t("talent"), backoffice: t("backoffice") };
  const statusLabels: Record<string, string> = {
    pending: t("statusPending"),
    active: t("statusActive"),
    rejected: t("statusRejected"),
  };

  function getAccessFor(userId: string) {
    return allAccess.filter((a) => a.user_id === userId).map((a) => ({ divisionId: a.division_id, level: a.level }));
  }

  return (
    <div className="min-h-screen">
      <PageHeader icon={Shield} color="bg-slate-800" eyebrow={t("eyebrow")} title={t("pageTitle")} />

      <main className="px-8 py-8 space-y-8 max-w-6xl mx-auto">
        {pendingUsers.length > 0 && (
          <section className="rounded-xl border border-amber-200 bg-amber-50 p-6">
            <h2 className="mb-4 text-sm font-semibold text-amber-800">{t("waitingApproval", { count: pendingUsers.length })}</h2>
            <div className="space-y-3">
              {pendingUsers.map((u) => (
                <div key={u.id} className="flex items-center justify-between gap-4 rounded-lg bg-white border border-amber-100 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-slate-900 flex items-center gap-2">
                      {u.full_name}
                      <AccountTypeBadge accountType={u.account_type} talentLabel={accountTypeLabels.talent} backofficeLabel={accountTypeLabels.backoffice} />
                    </p>
                    <p className="text-xs text-slate-500">
                      {u.email} &middot; {u.role_title ?? "-"}
                      {u.account_type === "talent" ? ` · ${t("timesheetModule")}` : ` · ${t("requestAccess")}: ${getRequestedDivisionName(u.requested_division_id)}`}
                    </p>
                  </div>
                  <ApproveRejectButtons userId={u.id} />
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-slate-700">{t("inviteNewUser")}</h2>
          <InviteUserForm divisionOptions={divisionOptions} />
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-slate-700">{t("addNewDivision")}</h2>
          <form action={createDivision} className="flex gap-3">
            <input name="name" placeholder={t("divisionNamePlaceholder")} required className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <input name="key" placeholder={t("divisionKeyPlaceholder")} required className="w-48 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <button type="submit" className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">{t("add")}</button>
          </form>
        </section>


        <ExpandableSection title={t("allUsers", { count: otherUsers.length })}>
          <div className="divide-y divide-slate-100">
            {otherUsers.map((u) => (
              <div key={u.id} className="px-6 py-4 space-y-3">
                <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-slate-900 flex items-center gap-2">
                    {u.full_name}
                    <AccountTypeBadge accountType={u.account_type} talentLabel={accountTypeLabels.talent} backofficeLabel={accountTypeLabels.backoffice} />
                  </p>
                  <p className="text-xs text-slate-500">{u.email} &middot; {u.role_title ?? "-"}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`inline-flex items-center rounded-full whitespace-nowrap px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[u.status] ?? "bg-slate-100 text-slate-600"}`}>
                    {statusLabels[u.status] ?? u.status}
                  </span>
                  <EditUserButton
                    userId={u.id}
                    currentName={u.full_name}
                    currentRole={u.role_title}
                    isOwner={u.is_owner}
                    accountType={u.account_type}
                    canUseTimesheetConverter={u.can_use_timesheet_converter}
                    divisionOptions={divisionOptions}
                    currentAccess={getAccessFor(u.id)}
                  />
                  {u.email !== "abi.rohmat@celerates.co.id" && <DeleteUserButton userId={u.id} userName={u.full_name} />}
                </div>
              </div>
              </div>
            ))}
            {otherUsers.length === 0 && (
              <p className="px-6 py-10 text-center text-slate-400 text-sm">{t("noOtherUsers")}</p>
            )}
          </div>
        </ExpandableSection>
      </main>
    </div>
  );
}