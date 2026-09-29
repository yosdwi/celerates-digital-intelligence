import Link from "next/link";

const TABS = [
    { href: "/ta", label: "Requisition" },
    { href: "/ta/candidates", label: "Candidate" },
    { href: "/ta/pipeline", label: "Hiring Pipeline" },
    { href: "/ta/onboarding", label: "Onboarding" },
  ];

export function TATabs({ active }: { active: string }) {
  return (
    <div className="flex gap-1 border-b border-slate-200 px-8 bg-white">
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px ${
            active === tab.href
              ? "border-brand-600 text-brand-600"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}