"use client";
import { useSession } from "next-auth/react";
import { useSidebarCollapse } from "./sidebar-context";
import { MobileContextBar } from "./mobile/tab-bar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const { collapsed } = useSidebarCollapse();
  const isAuthenticated = status === "authenticated";

  // Below `md` there is no sidebar: content is full width and leaves room for the mobile tab bar (doc 18 §14).
  return (
    <main
      className={
        isAuthenticated
          ? `${collapsed ? "md:ml-16" : "md:ml-60"} min-h-screen min-w-0 pb-[calc(88px+env(safe-area-inset-bottom))] transition-all duration-200 md:pb-24 lg:mr-[var(--agent-rail,0px)]`
          : "min-h-screen"
      }
    >
      {isAuthenticated && <MobileContextBar />}
      {children}
    </main>
  );
}
