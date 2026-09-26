"use client";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { History } from "lucide-react";

export function ActivityLogLink() {
  const { data: session } = useSession();
  if (!session?.user) return null;

  return (
    <Link
      href="/activity-log"
      title="Log Activity"
      className="fixed top-4 right-[112px] z-40 flex h-9 w-9 items-center justify-center rounded-full bg-white border border-slate-200 text-slate-600 shadow-sm hover:bg-slate-50"
    >
      <History className="h-4 w-4" />
    </Link>
  );
}
