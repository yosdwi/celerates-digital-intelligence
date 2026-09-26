import { headers } from "next/headers";
import { requirePilotActor } from "@/lib/actor";
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
export const dynamic = 'force-dynamic';

export const metadata = {
  title: "Celerates ERP",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  if ((await headers()).get("x-erp-protected") === "1") await requirePilotActor();
  const locale = await getLocale();
  const messages = await getMessages();
  const timeZone = await getTimeZone();

  return (
    <html lang={locale}>
      <body className="text-slate-900" suppressHydrationWarning>
      <Providers locale={locale} messages={messages} timeZone={timeZone}>
  <SidebarCollapseProvider>
    <Sidebar />
    <ActivityLogLink />
    <LanguageSwitcher />
    <NotificationBell />
    <UserMenu />
    <AppShell>{children}</AppShell>
    <AgentPanel />
  </SidebarCollapseProvider>
</Providers>
      </body>
    </html>
  );
}