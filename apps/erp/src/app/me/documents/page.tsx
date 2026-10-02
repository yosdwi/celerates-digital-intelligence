// The Talent's own identity documents (docs/security/04): upload and view their own KTP. Viewing needs a WhatsApp
// link opened in the last 10 minutes; the server enforces it, this page only renders the panel.
import { requireTalentSession } from "@/lib/talent/actor";
import { TalentFrame } from "@/components/talent/frame";
import { IdentityDocuments } from "@/components/security/identity-documents";

export const dynamic = "force-dynamic";

export default async function TalentDocumentsPage() {
  const session = await requireTalentSession();
  return (
    <TalentFrame name={session.name} email={session.email}>
      <IdentityDocuments subjectKind="self" talent />
    </TalentFrame>
  );
}
