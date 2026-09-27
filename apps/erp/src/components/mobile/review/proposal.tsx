"use client";
import { useRouter } from "next/navigation";
import { ProposalCard } from "@/components/agent/proposal";
import { useMobileData } from "../data";

/** The ERP-held proposal card; after a decision the queue badge refreshes and the user returns to Tinjau. */
export function ProposalReview({ id }: { id: string }) {
  const router = useRouter();
  const { refresh } = useMobileData();
  return (
    <div data-review-proposal className="rounded-j-card border border-j-line bg-j-surface p-3 shadow-j-card">
      <ProposalCard
        id={id}
        onDecided={() => {
          refresh();
          router.refresh();
        }}
      />
    </div>
  );
}
