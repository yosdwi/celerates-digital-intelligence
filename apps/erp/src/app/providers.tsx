"use client";
import { SessionProvider } from "next-auth/react";
import { NextIntlClientProvider } from "next-intl";
import { ToastProvider } from "@/components/toast-provider";
import { SavedRedirectToast } from "@/components/saved-redirect-toast";

export function Providers({
  children,
  locale,
  messages,
}: {
  children: React.ReactNode;
  locale: string;
  messages: Record<string, unknown>;
}) {
  return (
    <SessionProvider>
      <NextIntlClientProvider locale={locale} messages={messages}>
        <ToastProvider>
          <SavedRedirectToast />
          {children}
        </ToastProvider>
      </NextIntlClientProvider>
    </SessionProvider>
  );
}