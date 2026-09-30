import { redirect } from "next/navigation";
import { jakartaToday } from "@/lib/conform/pmo";

export const dynamic = "force-dynamic";

function validMonth(year: number, month: number) {
  return Number.isInteger(year) && year >= 2000 && year <= 2100 && Number.isInteger(month) && month >= 1 && month <= 12;
}

export default async function TalentHome({ searchParams }: { searchParams: Promise<{ year?: string; month?: string }> }) {
  const sp = await searchParams;
  const [todayYear, todayMonth] = jakartaToday().split("-").map(Number);
  const requestedYear = Number(sp.year);
  const requestedMonth = Number(sp.month);
  const period = validMonth(requestedYear, requestedMonth) ? { year: requestedYear, month: requestedMonth } : { year: todayYear, month: todayMonth };
  redirect(`/me/attendance?year=${period.year}&month=${period.month}`);
}
