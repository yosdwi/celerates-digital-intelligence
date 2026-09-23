import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";

export const LOCALE_COOKIE = "locale";
export const DEFAULT_LOCALE = "id";
export const LOCALES = ["id", "en"] as const;
export type AppLocale = (typeof LOCALES)[number];

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value;
  const locale = LOCALES.includes(cookieLocale as AppLocale) ? (cookieLocale as AppLocale) : DEFAULT_LOCALE;

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
