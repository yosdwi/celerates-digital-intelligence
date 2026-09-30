"use client";

import { useRouter } from "next/navigation";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";

const pad2 = (value: number) => String(value).padStart(2, "0");

function shiftMonth(year: number, month: number, delta: number) {
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

export function TalentMonthPicker({
  year,
  month,
  label,
  basePath,
  maxYear,
  maxMonth,
}: {
  year: number;
  month: number;
  label: string;
  basePath: string;
  maxYear: number;
  maxMonth: number;
}) {
  const router = useRouter();
  const currentValue = `${year}-${pad2(month)}`;
  const maxValue = `${maxYear}-${pad2(maxMonth)}`;
  const prev = shiftMonth(year, month, -1);
  const next = shiftMonth(year, month, 1);
  const canNext = next.year * 12 + next.month <= maxYear * 12 + maxMonth;
  const go = (targetYear: number, targetMonth: number) => router.push(`${basePath}?year=${targetYear}&month=${targetMonth}`);

  return (
    <div className="flex items-center justify-between gap-3" data-talent-month-picker={currentValue}>
      <button
        type="button"
        onClick={() => go(prev.year, prev.month)}
        aria-label="Bulan sebelumnya"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-j-line bg-j-surface text-j-muted transition hover:text-j-ink"
      >
        <ChevronLeft aria-hidden className="h-5 w-5" />
      </button>

      <label className="relative flex min-w-0 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-center">
        <span className="truncate text-[18px] font-extrabold tracking-[-0.3px]">{label}</span>
        <ChevronDown aria-hidden className="h-4 w-4 shrink-0 text-j-muted" />
        <input
          type="month"
          value={currentValue}
          max={maxValue}
          aria-label="Pilih bulan dan tahun"
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          onChange={(event) => {
            const [targetYear, targetMonth] = event.target.value.split("-").map(Number);
            if (targetYear && targetMonth) go(targetYear, targetMonth);
          }}
        />
      </label>

      <button
        type="button"
        onClick={() => canNext && go(next.year, next.month)}
        disabled={!canNext}
        aria-label="Bulan berikutnya"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-j-line bg-j-surface text-j-muted transition hover:text-j-ink disabled:cursor-default disabled:opacity-25"
      >
        <ChevronRight aria-hidden className="h-5 w-5" />
      </button>
    </div>
  );
}
