// PMO mobile lists (doc 18 §16): A.Contract and TM Invoice as searchable card lists, not shrunken tables.
// Server components: they shape existing records into the shared FilterableList model.
import { getLocale, getTranslations } from "next-intl/server";
import { contractCards, invoiceCards, type ContractStatus, type FollowUp } from "@/lib/pmo/mobile-data";
import { fmtDate, fmtMoney, fmtMonth } from "@/lib/pmo/mobile-format";
import { FilterableList, type ListItem, type Tone } from "../filterable-list";
import { MobileScreen } from "../primitives";
import { ModuleHeader } from "../record";

const STATUS_TONE: Record<ContractStatus, Tone> = { active: "ok", ending: "warn", ended: "muted", upcoming: "accent", undated: "muted" };
const INVOICE_TONE: Record<string, Tone> = { overdue: "danger", planned: "muted", submitted: "ok", canceled: "muted" };
const HANDOFF_TONE: Record<string, Tone> = { notified: "accent", received: "ok", needs_revision: "danger", pending: "muted" };

async function siblings(active: "contracts" | "invoices") {
  const t = await getTranslations("mobile.pmo");
  return [
    { href: "/pmo/contracts", label: t("contracts.title"), active: active === "contracts" },
    { href: "/pmo/invoices", label: t("invoices.title"), active: active === "invoices" },
  ];
}

export async function followUpLabel(f: FollowUp) {
  const t = await getTranslations("mobile.pmo.followUp");
  return f ? { label: t(f.key, { count: f.count ?? 0 }), tone: f.tone } : null;
}

export async function ContractListMobile({ query }: { query?: string }) {
  const t = await getTranslations("mobile.pmo");
  const locale = await getLocale();
  const cards = await contractCards();
  const items: ListItem[] = await Promise.all(
    cards.map(async (c) => ({
      id: c.id,
      href: `/pmo/contracts/${c.id}`,
      eyebrow: c.opty_no,
      title: c.client_name ?? "—",
      subtitle: [c.position_name, c.project_name].filter(Boolean).join(" · ") || null,
      facts: [
        ...(c.start_date || c.end_date ? [{ icon: "calendar" as const, text: `${fmtDate(c.start_date, locale)} – ${fmtDate(c.end_date, locale)}` }] : []),
        ...(c.monthly_value_amount !== null ? [{ icon: "wallet" as const, text: `${fmtMoney(c.monthly_value_amount)}${t("perMonth")}` }] : []),
      ],
      status: { label: c.status === "ending" ? t("status.ending", { days: c.days_left ?? 0 }) : t(`status.${c.status}`), tone: STATUS_TONE[c.status] },
      flag: await followUpLabel(c.follow_up),
      search: c.search,
      tabs: [c.status === "ending" ? "active" : c.status, c.status === "ending" ? "ending" : "", c.follow_up ? "followUp" : ""].filter(Boolean),
      sort: { end: c.end_date, client: (c.client_name ?? "").toLowerCase(), start: c.start_date },
    })),
  );
  return (
    <MobileScreen label={t("contracts.title")}>
      <ModuleHeader moduleKey="pmo" title={t("contracts.title")} siblings={await siblings("contracts")} />
      <FilterableList
        label={t("contracts.title")}
        items={items}
        initialQuery={query}
        tabs={[
          { key: "all", label: t("tabs.all") },
          { key: "active", label: t("tabs.active") },
          { key: "ending", label: t("tabs.ending") },
          { key: "followUp", label: t("tabs.followUp") },
          { key: "ended", label: t("tabs.ended") },
        ]}
        sorts={[
          { key: "end", label: t("sort.endSoon"), dir: "asc" },
          { key: "client", label: t("sort.client"), dir: "asc" },
          { key: "start", label: t("sort.startNew"), dir: "desc" },
        ]}
      />
    </MobileScreen>
  );
}

export async function InvoiceListMobile({ query }: { query?: string }) {
  const t = await getTranslations("mobile.pmo");
  const locale = await getLocale();
  const cards = await invoiceCards();
  const items: ListItem[] = cards.map((c) => {
    const status = c.status ?? "other";
    return {
      id: c.id,
      href: `/pmo/invoices/${c.id}`,
      eyebrow: c.opty_no,
      title: c.client_name ?? "—",
      subtitle: t("invoices.serviceMonth", { month: fmtMonth(c.month, locale) }),
      facts: [
        ...(c.plan ? [{ icon: "calendar" as const, text: t("invoices.plan", { date: fmtDate(c.plan, locale) }) }] : []),
        { icon: c.has_bast ? ("check" as const) : ("alert" as const), text: c.has_bast ? t("invoices.bastPresent") : t("invoices.bastMissing"), tone: c.has_bast ? undefined : ("warn" as const) },
        ...(c.issue_label ? [{ icon: "clock" as const, text: c.issue_label }] : []),
      ],
      status: { label: t.has(`invoiceStatus.${status}`) ? t(`invoiceStatus.${status}`) : status, tone: INVOICE_TONE[status] ?? "muted" },
      flag: c.handoff && c.handoff !== "pending" ? { label: t(`handoffStatus.${c.handoff}`), tone: HANDOFF_TONE[c.handoff] ?? "muted" } : null,
      search: c.search,
      tabs: [status, c.handoff === "needs_revision" ? "returned" : ""].filter(Boolean),
      sort: { month: c.month, client: (c.client_name ?? "").toLowerCase() },
    };
  });
  return (
    <MobileScreen label={t("invoices.title")}>
      <ModuleHeader moduleKey="pmo" title={t("invoices.title")} siblings={await siblings("invoices")} />
      <FilterableList
        label={t("invoices.title")}
        items={items}
        initialQuery={query}
        tabs={[
          { key: "all", label: t("tabs.all") },
          { key: "overdue", label: t("invoiceStatus.overdue") },
          { key: "planned", label: t("invoiceStatus.planned") },
          { key: "submitted", label: t("invoiceStatus.submitted") },
          { key: "returned", label: t("handoffStatus.needs_revision") },
        ]}
        sorts={[
          { key: "month", label: t("sort.monthNew"), dir: "desc" },
          { key: "client", label: t("sort.client"), dir: "asc" },
        ]}
      />
    </MobileScreen>
  );
}
