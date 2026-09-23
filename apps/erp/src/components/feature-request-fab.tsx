"use client";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Lightbulb } from "lucide-react";

export function FeatureRequestFab() {
  const pathname = usePathname();
  const { status } = useSession();
  if (status !== "authenticated") return null;

  return (
    <Link
      href={`/feature-requests?from=${encodeURIComponent(pathname)}`}
      title="Ajukan Feature Request"
      className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-pink-500 text-white shadow-lg hover:bg-pink-600 hover:scale-105 transition-all"
    >
      <Lightbulb className="h-6 w-6" />
    </Link>
  );
}
