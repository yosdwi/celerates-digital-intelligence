/** "2026-01-15" -> "2027-01-15" -- string murni, tanpa Date object (hindari isu timezone). */
export function addOneYear(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.slice(0, 10).split("-");
  if (!y || !m || !d) return "";
  return `${Number(y) + 1}-${m}-${d}`;
}
