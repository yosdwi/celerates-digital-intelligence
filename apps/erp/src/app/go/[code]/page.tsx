// Personal deep link from a WhatsApp reminder (doc 19 §3). GET never consumes the grant (link previews are harmless).
// Same user already signed in → consume and continue. Another account signed in → fail closed, nothing consumed.
// No session → the browser redeems the grant in an explicit sign-in call and continues to the target.
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { getTranslations } from "next-intl/server";
import { authOptions } from "@/lib/auth";
import { sql } from "@/db";
import { peekGrant, redeemGrant } from "@/lib/talent/identity";
import { GoSignIn, LinkNotice } from "@/components/talent/go";

export const dynamic = "force-dynamic";

export default async function GoPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const t = await getTranslations("talent.go");
  const grant = await peekGrant(sql, code);
  if (!grant) return <LinkNotice title={t("invalidTitle")} body={t("invalidBody")} kind="invalid" />;
  const session = await getServerSession(authOptions);
  const current = (session?.user as { id?: string } | undefined)?.id;
  if (current) {
    if (current !== grant.userId) return <LinkNotice title={t("otherTitle")} body={t("otherBody")} kind="other-account" />;
    const redeemed = await redeemGrant(sql, code, current);
    if (!redeemed) return <LinkNotice title={t("invalidTitle")} body={t("invalidBody")} kind="invalid" />;
    redirect(redeemed.targetPath);
  }
  return <GoSignIn code={code} target={grant.targetPath} />;
}
