// The Talent's own lightweight self-service frame: brand, account, and two monthly work views.
import Image from "next/image";
import Link from "next/link";
import { TalentAccountButton } from "@/components/talent/talent";

export type TalentTab = "attendance" | "tasks";
const TABS: { key: TalentTab; href: string; label: string }[] = [
  { key: "attendance", href: "/me/attendance", label: "Attendance" },
  { key: "tasks", href: "/me/tasks", label: "Tasklist" },
];

export async function TalentFrame({
  name,
  email,
  tab,
  period,
  children,
}: {
  name: string;
  email: string;
  tab?: TalentTab;
  period?: { year: number; month: number };
  children: React.ReactNode;
}) {
  const query = period ? `?year=${period.year}&month=${period.month}` : "";
  const tabs = (className: string) => (
    <nav aria-label="Navigasi Timesheet" className={className} data-talent-nav>
      {TABS.map((item) => (
        <Link
          key={item.key}
          href={`${item.href}${query}`}
          aria-current={item.key === tab ? "page" : undefined}
          className={`flex h-10 items-center justify-center rounded-[10px] px-5 text-[0.875rem] font-bold transition ${
            item.key === tab ? "bg-j-accent text-white shadow-sm" : "text-j-muted hover:bg-j-line-soft hover:text-j-ink"
          }`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );

  return (
    <div className="min-h-[100dvh] bg-j-bg font-sans text-j-ink" data-talent-home={tab ?? "none"}>
      <div className="mx-auto flex max-w-xl flex-col gap-4 px-5 pb-[calc(40px+env(safe-area-inset-bottom))] pt-[max(16px,env(safe-area-inset-top))] md:max-w-6xl md:gap-6 md:px-8 md:pb-12 md:pt-6">
        <header className="flex items-center justify-between gap-4 md:min-h-14 md:border-b md:border-j-line-soft md:pb-4">
          <div className="flex items-center gap-2.5">
            <Image src="/icons/icon-192.png" alt="" width={34} height={34} className="rounded-[10px] border border-j-line bg-white" />
            <span className="text-[1.1875rem] font-extrabold tracking-[-0.3px]">Celerates</span>
          </div>
          {tab && tabs("hidden items-center gap-1 rounded-[14px] border border-j-line bg-j-surface p-1 md:flex")}
          <TalentAccountButton name={name} email={email} />
        </header>
        {tab && tabs("grid grid-cols-2 gap-1 rounded-[14px] border border-j-line bg-j-surface p-1 md:hidden")}
        {children}
      </div>
    </div>
  );
}
