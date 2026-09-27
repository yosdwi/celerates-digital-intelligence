// Formatting for mobile record screens: dates as "18 Okt 2026", months as "Agu 2026", money as "Rp 31.313.131".
export const fmtDate = (d: string | null | undefined, locale = "id") =>
  d ? new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(d + "T00:00:00Z")) : "—";
export const fmtMonth = (d: string | null | undefined, locale = "id") =>
  d ? new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "id-ID", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(d.slice(0, 7) + "-01T00:00:00Z")) : "—";
export const fmtMoney = (n: number | null | undefined) => (n === null || n === undefined ? "—" : "Rp " + n.toLocaleString("id-ID"));
export const fmtStamp = (d: Date | string | null | undefined, locale = "id") =>
  d ? new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date(d)) : "—";
