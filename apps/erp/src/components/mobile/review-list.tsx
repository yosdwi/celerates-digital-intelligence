"use client";
// Kabar terbaru: the user's own notifications (emitted by approvals, TTD, time off, PQ setup, onboarding).
// Since MS3 the Tinjau tab is the decision queue (/review); this is its "see all updates" surface (doc 18 §17).
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMobileData } from "./data";
import { Card, MobileScreen, ScreenTitle } from "./primitives";
import { timeAgo } from "./time";

export function ReviewList() {
  const t = useTranslations("mobile");
  const router = useRouter();
  const { notifications, unread, markRead, markAllRead } = useMobileData();
  return (
    <MobileScreen label={t("review.updates")}>
      <div data-review-list className="flex flex-col gap-4">
        <Link href="/review" className="-mb-2 -ml-2 flex h-11 items-center gap-0.5 self-start px-2 text-base font-semibold text-j-accent">
          <ChevronLeft aria-hidden className="h-[22px] w-[22px]" strokeWidth={2.2} />
          {t("tabs.review")}
        </Link>
        <ScreenTitle
          title={t("review.updates")}
          subtitle={t("reviewSubtitle")}
          action={
            unread > 0 ? (
              <button type="button" onClick={markAllRead} className="h-11 whitespace-nowrap rounded-xl px-2 text-[13px] font-bold text-j-accent">
                {t("markAllRead")}
              </button>
            ) : undefined
          }
        />
        {notifications === null ? (
          <Card className="p-4 text-sm text-j-muted">{t("loading")}</Card>
        ) : notifications.length === 0 ? (
          <Card className="p-4 text-sm text-j-muted">{t("reviewEmpty")}</Card>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {notifications.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => {
                    if (!n.is_read) markRead(n.id);
                    if (n.link) router.push(n.link);
                  }}
                  className={`flex w-full gap-3 rounded-j-card border p-3.5 text-left shadow-j-card ${n.is_read ? "border-j-line bg-j-surface" : "border-[#c9d4f2] bg-[#f7f9ff]"}`}
                >
                  <span aria-hidden className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.is_read ? "bg-[#c5ccd8]" : "bg-j-accent"}`} />
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex items-start justify-between gap-2">
                      <span className={`text-sm ${n.is_read ? "font-semibold" : "font-bold"}`}>{n.title}</span>
                      <span className="whitespace-nowrap text-xs text-j-muted">{timeAgo(n.created_at)}</span>
                    </span>
                    {n.body && <span className="line-clamp-2 text-[13px] text-j-muted">{n.body}</span>}
                    {!n.is_read && <span className="sr-only">{t("unreadItem")}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </MobileScreen>
  );
}
