// The Talent's own frame (doc 22 §2.4–2.5): brand, account, and three self-service views. No backoffice chrome.
import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { TalentAccountButton } from "@/components/talent/talent";

export type TalentTab = "home" | "attendance" | "tasks";
const TABS: { key: TalentTab; href: string }[] = [
  { key: "home", href: "/me" },
  { key: "attendance", href: "/me/attendance" },
  { key: "tasks", href: "/me/tasks" },
];

export async function TalentFrame({ name, email, tab, children }: { name: string; email: string; tab?: TalentTab; children: React.ReactNode }) {
  const t = await getTranslations("talent.nav");
  return (
    <div className="min-h-[100dvh] bg-j-bg font-jakarta text-j-ink" data-talent-home={tab ?? "home"}>
      <div className="mx-auto flex max-w-xl flex-col gap-4 px-5 pb-[calc(40px+env(safe-area-inset-bottom))] pt-[max(16px,env(safe-area-inset-top))]">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Image src="/icons/icon-192.png" alt="" width={34} height={34} className="rounded-[10px] border border-j-line bg-white" />
            <span className="text-[19px] font-extrabold tracking-[-0.3px]">Celerates</span>
          </div>
          <TalentAccountButton name={name} email={email} />
        </header>
        {tab && (
          <nav aria-label={t("label")} className="grid grid-cols-3 gap-1 rounded-[14px] border border-j-line bg-j-surface p-1" data-talent-nav>
            {TABS.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                aria-current={item.key === tab ? "page" : undefined}
                className={`flex h-10 items-center justify-center rounded-[10px] text-[14px] font-bold ${item.key === tab ? "bg-j-accent text-white" : "text-j-muted"}`}
              >
                {t(item.key)}
              </Link>
            ))}
          </nav>
        )}
        {children}
      </div>
    </div>
  );
}
