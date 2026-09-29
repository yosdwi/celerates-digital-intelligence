"use client";
import { SessionProvider } from "next-auth/react";
import { NextIntlClientProvider } from "next-intl";
import { ToastProvider } from "@/components/toast-provider";
import { SavedRedirectToast } from "@/components/saved-redirect-toast";

export function Providers({
  children,
  locale,
  messages,
  timeZone,
}: {
  children: React.ReactNode;
  locale: string;
  messages: Record<string, unknown>;
  timeZone: string;
}) {
  return (
    <SessionProvider>
      <NextIntlClientProvider locale={locale} messages={messages} timeZone={timeZone}>
        <ToastProvider>
          <SavedRedirectToast />
          {children}
        </ToastProvider>
      </NextIntlClientProvider>
    </SessionProvider>
  );
}