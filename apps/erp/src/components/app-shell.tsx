"use client";
import { useSession } from "next-auth/react";
import { useSidebarCollapse } from "./sidebar-context";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const { collapsed } = useSidebarCollapse();
  const isAuthenticated = status === "authenticated";

  return (
    <main className={isAuthenticated ? `${collapsed ? "ml-16" : "ml-64"} min-h-screen transition-all duration-200` : "min-h-screen"}>
      {children}
    </main>
  );
}
