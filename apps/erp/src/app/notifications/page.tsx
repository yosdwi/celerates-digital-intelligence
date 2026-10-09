import { getServerSession } from "next-auth";
import { desc, eq } from "drizzle-orm";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { ReviewList } from "@/components/mobile/review-list";
import { Inbox } from "@/features/inbox/inbox";

export const dynamic = "force-dynamic";

// Phone: Kabar terbaru (doc 18 §12, §17; the Tinjau queue itself lives at /review). Desktop: the Inbox (QA doc page 23).
export default async function NotificationsPage() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  const rows = userId ? await db.select().from(notifications).where(eq(notifications.user_id, userId)).orderBy(desc(notifications.created_at)).limit(200) : [];
  return (
    <>
      <div className="md:hidden">
        <ReviewList />
      </div>
      <div className="hidden md:block">
        <Inbox items={rows.map((n) => ({ id: n.id, title: n.title, body: n.body, link: n.link, isRead: n.is_read, createdAt: n.created_at.toISOString() }))} />
      </div>
    </>
  );
}
