import Link from "next/link";

export function ConvertToOnboardingLink({
  candidateId,
  requisitionId,
}: {
  candidateId: string | null;
  requisitionId: string | null;
}) {
  if (!candidateId || !requisitionId) return null;

  return (
    <Link
      href={`/ta/onboarding?candidate_id=${candidateId}&requisition_id=${requisitionId}`}
      className="rounded-md bg-purple-50 px-2 py-1 text-xs font-medium text-purple-700 hover:bg-purple-100 block text-center"
    >
      Convert to Onboarding
    </Link>
  );
}