// Short relative time for mobile lists ("5 mnt lalu" / "5 min ago"), from the browser clock.
export function timeAgo(value: string | Date, locale = typeof document !== "undefined" ? document.documentElement.lang || "id" : "id") {
  const seconds = Math.round((new Date(value).getTime() - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto", style: "short" });
  const abs = Math.abs(seconds);
  if (abs < 60) return rtf.format(0, "second");
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(seconds / 3600), "hour");
  return rtf.format(Math.round(seconds / 86400), "day");
}
