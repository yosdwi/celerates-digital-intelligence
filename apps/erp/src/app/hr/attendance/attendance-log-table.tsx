"use client";
import { MapPin } from "lucide-react";

type Row = {
  id: string;
  user_id: string;
  user_name: string | null;
  work_date: string;
  check_in_at: Date;
  check_in_lat: number | null;
  check_in_lng: number | null;
  check_out_at: Date | null;
  check_out_lat: number | null;
  check_out_lng: number | null;
};

function formatTime(d: Date | null): string {
  if (!d) return "-";
  return new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date(d));
}

function formatDate(dateStr: string): string {
  return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(new Date(dateStr + "T00:00:00"));
}

function locationLink(lat: number | null, lng: number | null) {
  if (lat == null || lng == null) return null;
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

export function AttendanceLogTable({ data }: { data: Row[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-slate-400 text-center py-8">Belum ada data attendance.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs font-semibold text-slate-500 uppercase border-b border-slate-200">
            <th className="px-4 py-3">Nama</th>
            <th className="px-4 py-3">Tanggal</th>
            <th className="px-4 py-3">Check In</th>
            <th className="px-4 py-3">Check Out</th>
            <th className="px-4 py-3">Lokasi</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {data.map((r) => {
            const inLink = locationLink(r.check_in_lat, r.check_in_lng);
            const outLink = locationLink(r.check_out_lat, r.check_out_lng);
            return (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-800">{r.user_name ?? "-"}</td>
                <td className="px-4 py-3 text-slate-600">{formatDate(r.work_date)}</td>
                <td className="px-4 py-3 text-slate-600">{formatTime(r.check_in_at)}</td>
                <td className="px-4 py-3 text-slate-600">{formatTime(r.check_out_at)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {inLink && (
                      <a href={inLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline">
                        <MapPin className="h-3 w-3" /> Masuk
                      </a>
                    )}
                    {outLink && (
                      <a href={outLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline">
                        <MapPin className="h-3 w-3" /> Keluar
                      </a>
                    )}
                    {!inLink && !outLink && <span className="text-xs text-slate-300">-</span>}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
