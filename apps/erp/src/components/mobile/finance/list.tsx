// Finance on a phone (doc 18 §17): the PMO → Finance handoff as a card list with state tabs. Each card opens the
// project's latest TM Invoice record, where Finance verifies (Terima / Kembalikan) with the existing actions.
import { getLocale, getTranslations } from "next-intl/server";
import { handoffCards } from "@/lib/pmo/mobile-data";
import { fmtStamp } from "@/lib/pmo/mobile-format";
import { FilterableList, type ListItem, type Tone } from "../filterable-list";
import { MobileScreen } from "../primitives";
import { ModuleHeader } from "../record";

const TONE: Record<string, Tone> = { notified: "accent", received: "ok", needs_revision: "danger" };

export async function FinanceListMobile({ query }: { query?: string }) {
  const t = await getTranslations("mobile.finance");
  const tp = await getTranslations("mobile.pmo");
  const locale = await getLocale();
  const cards = await handoffCards();
  const items: ListItem[] = cards.map((c) => ({
    id: c.id,
    href: c.invoice_id ? `/pmo/invoices/${c.invoice_id}` : `/pmo/invoices?q=${encodeURIComponent(c.opty_no ?? "")}`,
    eyebrow: c.opty_no,
    title: c.client_name ?? "—",
    subtitle: c.project_name,
    facts: [
      ...(c.notified_at ? [{ icon: "clock" as const, text: t("notified", { name: c.notified_by_name ?? "PMO", at: fmtStamp(c.notified_at, locale) }) }] : []),
      ...(c.status === "received" && c.received_at ? [{ icon: "check" as const, text: t("received", { name: c.received_by_name ?? "Finance", at: fmtStamp(c.received_at, locale) }) }] : []),
      ...(c.status === "needs_revision" && c.finance_notes ? [{ icon: "alert" as const, text: c.finance_notes, tone: "warn" as const }] : []),
      { icon: "file" as const, text: t("invoices", { count: c.invoice_count }) },
    ],
    status: { label: tp(`handoffStatus.${c.status}`), tone: TONE[c.status] ?? "muted" },
    flag: null,
    search: c.search,
    tabs: [c.status],
    sort: { notified: c.notified_at ? new Date(c.notified_at).toISOString() : null, client: (c.client_name ?? "").toLowerCase() },
  }));
  return (
    <MobileScreen label={t("title")}>
      <ModuleHeader moduleKey="finance" title={t("title")} />
      <FilterableList
        label={t("title")}
        items={items}
        initialQuery={query}
        tabs={[
          { key: "all", label: tp("tabs.all") },
          { key: "notified", label: t("tabs.notified") },
          { key: "needs_revision", label: t("tabs.needs_revision") },
          { key: "received", label: t("tabs.received") },
        ]}
        sorts={[
          { key: "notified", label: t("sort.notified"), dir: "desc" },
          { key: "client", label: tp("sort.client"), dir: "asc" },
        ]}
      />
    </MobileScreen>
  );
}
