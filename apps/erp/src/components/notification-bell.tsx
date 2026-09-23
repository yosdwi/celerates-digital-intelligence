"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Bell } from "lucide-react";
import { getMyNotifications, markNotificationRead, markAllNotificationsRead } from "@/app/notifications/actions";

type Notification = {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  is_read: boolean;
  created_at: Date;
};

function timeAgo(date: Date, t: (key: string, values?: Record<string, string | number | Date>) => string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return t("justNow");
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t("minutesAgo", { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("hoursAgo", { count: hours });
  const days = Math.floor(hours / 24);
  return t("daysAgo", { count: days });
}

export function NotificationBell() {
  const { data: session } = useSession();
  const router = useRouter();
  const t = useTranslations("notifications");
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  function refresh() {
    startTransition(async () => {
      const result = await getMyNotifications();
      setItems(result as Notification[]);
    });
  }

  useEffect(() => {
    if (!session?.user) return;
    refresh();
    const interval = setInterval(refresh, 30000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!session?.user) return null;

  const unreadCount = items.filter((n) => !n.is_read).length;

  function handleItemClick(n: Notification) {
    setOpen(false);
    if (!n.is_read) {
      setItems((prev) => prev.map((i) => (i.id === n.id ? { ...i, is_read: true } : i)));
      startTransition(async () => { await markNotificationRead(n.id); });
    }
    if (n.link) router.push(n.link);
  }

  function handleMarkAll() {
    setItems((prev) => prev.map((i) => ({ ...i, is_read: true })));
    startTransition(async () => { await markAllNotificationsRead(); });
  }

  return (
    <div ref={ref} className="fixed top-4 right-[68px] z-40">
      <button
        onClick={() => { setOpen((v) => !v); if (!open) refresh(); }}
        className="relative flex h-9 w-9 items-center justify-center rounded-full bg-white/75 backdrop-blur-xl border border-white/70 text-slate-600 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:shadow-[0_4px_12px_rgba(15,23,42,0.10)] hover:-translate-y-0.5 transition-all duration-200"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-h-[70vh] overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 sticky top-0 bg-white">
            <p className="text-sm font-semibold text-slate-900">{t("title")}</p>
            {unreadCount > 0 && (
              <button onClick={handleMarkAll} className="text-xs text-brand-600 hover:underline">{t("markAllRead")}</button>
            )}
          </div>
          {items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-400">{t("empty")}</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleItemClick(n)}
                  className={`block w-full text-left px-4 py-3 hover:bg-slate-50 ${!n.is_read ? "bg-brand-50/50" : ""}`}
                >
                  <div className="flex items-start gap-2">
                    {!n.is_read && <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-brand-500 shrink-0" />}
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm ${!n.is_read ? "font-semibold text-slate-900" : "font-medium text-slate-700"}`}>{n.title}</p>
                      {n.body && <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{n.body}</p>}
                      <p className="text-[11px] text-slate-400 mt-1">{timeAgo(n.created_at, t)}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
