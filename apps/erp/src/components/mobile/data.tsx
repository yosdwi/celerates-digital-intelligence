"use client";
// Shared mobile data (doc 18 §14): notifications (Tinjau, Terbaru) and the deterministic operational signals
// (Perlu perhatian), fetched once for the whole mobile shell and only while a phone-width viewport is active.
import { createContext, useCallback, useContext, useEffect, useState, useTransition } from "react";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { getMyNotifications, markAllNotificationsRead, markNotificationRead } from "@/app/notifications/actions";
import { getReviewCount } from "@/app/review/actions";
import type { OperationalGroup } from "@/lib/operations/policy";

export type MobileNotification = { id: string; title: string; body: string | null; link: string | null; is_read: boolean; created_at: string | Date };
type MobileData = {
  active: boolean;
  notifications: MobileNotification[] | null;
  unread: number;
  /** Records waiting for the user's decision (Tinjau queue). */
  reviewCount: number;
  signals: OperationalGroup[] | null;
  signalsError: boolean;
  markRead: (id: string) => void;
  markAllRead: () => void;
  refresh: () => void;
};

const Ctx = createContext<MobileData | null>(null);
export const MOBILE_QUERY = "(max-width: 767.98px)";

export function useIsMobile() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const update = () => setMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return mobile;
}

export function MobileDataProvider({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const mobile = useIsMobile();
  const pathname = usePathname();
  // Phone-width viewports, plus the two mobile surfaces when opened on a desktop.
  const active = status === "authenticated" && (mobile || pathname === "/notifications" || pathname === "/modules" || pathname.startsWith("/review"));
  const [notifications, setNotifications] = useState<MobileNotification[] | null>(null);
  const [reviewCount, setReviewCount] = useState(0);
  const [signals, setSignals] = useState<OperationalGroup[] | null>(null);
  const [signalsError, setSignalsError] = useState(false);
  const [tick, setTick] = useState(0);
  const [, startTransition] = useTransition();

  const refresh = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    getMyNotifications()
      .then((rows) => !cancelled && setNotifications(rows as MobileNotification[]))
      .catch(() => !cancelled && setNotifications([]));
    getReviewCount()
      .then((n) => !cancelled && setReviewCount(n))
      .catch(() => undefined);
    const controller = new AbortController();
    fetch("/api/operations/context?path=/", { cache: "no-store", signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data) => {
        if (cancelled) return;
        setSignals(data.groups ?? []);
        setSignalsError(false);
      })
      .catch(() => !cancelled && !controller.signal.aborted && setSignalsError(true));
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [active, tick]);

  useEffect(() => {
    if (!active) return;
    const interval = window.setInterval(refresh, 30000);
    const onFocus = () => document.visibilityState === "visible" && refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [active, refresh]);

  const markRead = useCallback((id: string) => {
    setNotifications((prev) => prev?.map((n) => (n.id === id ? { ...n, is_read: true } : n)) ?? prev);
    startTransition(async () => {
      await markNotificationRead(id);
    });
  }, []);
  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev?.map((n) => ({ ...n, is_read: true })) ?? prev);
    startTransition(async () => {
      await markAllNotificationsRead();
    });
  }, []);

  const unread = notifications?.filter((n) => !n.is_read).length ?? 0;
  return <Ctx.Provider value={{ active, notifications, unread, reviewCount, signals, signalsError, markRead, markAllRead, refresh }}>{children}</Ctx.Provider>;
}

export function useMobileData(): MobileData {
  const value = useContext(Ctx);
  if (!value) throw new Error("MobileDataProvider missing");
  return value;
}

export { AGENT_OPEN_EVENT, openAgent } from "./events";
