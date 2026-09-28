import { headers } from "next/headers";
import { requirePilotActor } from "@/lib/actor";
import { requireTalentSession } from "@/lib/talent/actor";
import "@fontsource-variable/plus-jakarta-sans";
import "./globals.css";
import { getLocale, getMessages, getTimeZone } from "next-intl/server";
import { Sidebar } from "@/components/sidebar";
import { Providers } from "./providers";
import { UserMenu } from "@/components/user-menu";
import { NotificationBell } from "@/components/notification-bell";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ActivityLogLink } from "@/components/activity-log-link";
import { AppShell } from "@/components/app-shell";
import { SidebarCollapseProvider } from "@/components/sidebar-context";
import { AgentPanel } from "@/components/agent/agent-panel";
import { MobileDataProvider } from "@/components/mobile/data";
import { MobileTabBar } from "@/components/mobile/tab-bar";
import { PwaRegister } from "@/components/mobile/pwa-register";
import type { Viewport } from "next";
export const dynamic = 'force-dynamic';

export const metadata = {
  title: "Celerates ERP",
  applicationName: "Celerates",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Celerates", statusBarStyle: "default" as const },
  icons: { icon: "/favicon.ico", apple: "/icons/apple-touch-icon.png" },
};

// Full-screen on phones, safe-area aware (doc 18 §14).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f4f6fa",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const requestHeaders = await headers();
  if (requestHeaders.get("x-erp-protected") === "1") await requirePilotActor();
  // A Talent gets only their own surfaces (ADR-019 §4): no sidebar, Agent, module tabs or backoffice widgets.
  const talent = requestHeaders.get("x-erp-talent") === "1";
  if (talent) await requireTalentSession();
  // Deep-link exchange pages render bare too, whoever (if anyone) is signed in.
  const bare = talent || requestHeaders.get("x-erp-link") === "1";
  const locale = await getLocale();
  const messages = await getMessages();
  const timeZone = await getTimeZone();

  return (
    <html lang={locale}>
      <body className="text-slate-900" suppressHydrationWarning>
      <Providers locale={locale} messages={messages} timeZone={timeZone}>
  {bare ? (
    <main className="min-h-[100dvh] bg-j-bg">
      {children}
      <PwaRegister />
    </main>
  ) : (
  <SidebarCollapseProvider>
  <MobileDataProvider>
    <Sidebar />
    <ActivityLogLink />
    <LanguageSwitcher />
    <NotificationBell />
    <UserMenu />
    <AppShell>{children}</AppShell>
    <AgentPanel />
    <MobileTabBar />
    <PwaRegister />
  </MobileDataProvider>
  </SidebarCollapseProvider>
  )}
</Providers>
      </body>
    </html>
  );
}