"use client";
// Beranda search (doc 18 §17): one field for "where is it?" — pages you can open, ERP records you may read (governed
// catalog search), Company Files you may read — and, always first, handing the question to the Agent.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft, FileText, Search, Sparkles, X } from "lucide-react";
import { openAgent } from "./events";
import { ModuleGlyph, useModuleLabel, useOpenModules } from "./modules";
import { Card, GroupLabel, Row, RowList } from "./primitives";

type RecordHit = { type: string; type_label: string; id: string; label: string; href: string; module: string; matched_field: string };
type FileHit = { id: string; title: string; kind: string; snippet?: string; page?: number | null };
type State<T> = { query: string; items: T[] | null; error?: boolean };

export function MobileSearch({ initialQuery }: { initialQuery: string }) {
  const t = useTranslations("mobile.search");
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const modules = useOpenModules();
  const label = useModuleLabel();
  const [query, setQuery] = useState(initialQuery);
  const [records, setRecords] = useState<State<RecordHit>>({ query: "", items: null });
  const [files, setFiles] = useState<State<FileHit>>({ query: "", items: null });
  const q = query.trim();

  useEffect(() => input.current?.focus(), []);
  useEffect(() => {
    // Keep the query in the URL so back/forward returns to the same results.
    const url = q ? `/search?q=${encodeURIComponent(q)}` : "/search";
    window.history.replaceState(window.history.state, "", url);
    if (q.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const get = (url: string) => fetch(url, { cache: "no-store", signal: controller.signal }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))));
      get(`/api/search?q=${encodeURIComponent(q)}`)
        .then((body) => setRecords({ query: q, items: body.results ?? [] }))
        .catch(() => !controller.signal.aborted && setRecords({ query: q, items: [], error: true }));
      get(`/api/files?q=${encodeURIComponent(q)}`)
        .then((body) => setFiles({ query: q, items: (body.items ?? []).slice(0, 5) }))
        .catch(() => !controller.signal.aborted && setFiles({ query: q, items: [], error: true }));
    }, 250);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [q]);

  const pages = useMemo(() => {
    if (q.length < 2) return [];
    const needle = q.toLowerCase();
    const out: { key: string; href: string; title: string; subtitle: string; module: (typeof modules)[number] }[] = [];
    for (const m of modules) {
      const name = label(m.config.label);
      for (const s of m.subPages) {
        const sub = label(s.label);
        if (name.toLowerCase().includes(needle) || sub.toLowerCase().includes(needle)) out.push({ key: s.href, href: s.href, title: sub, subtitle: name, module: m });
      }
    }
    return out.slice(0, 5);
  }, [q, modules, label]);

  const loading = (s: State<unknown>) => q.length >= 2 && s.query !== q;
  const askAgent = () => openAgent({ ask: q });

  return (
    <div className="min-h-[100dvh] bg-j-bg font-sans text-j-ink" data-mobile-search>
      <div className="mx-auto flex max-w-xl flex-col gap-4 px-5 pb-[calc(104px+env(safe-area-inset-bottom))] pt-[max(12px,env(safe-area-inset-top))]">
        <form
          role="search"
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            input.current?.blur();
          }}
        >
          <Link href="/" aria-label={t("back")} className="-ml-2 flex h-11 w-9 shrink-0 items-center justify-center text-j-accent">
            <ChevronLeft aria-hidden className="h-6 w-6" strokeWidth={2.2} />
          </Link>
          <div className="flex h-[50px] min-w-0 flex-1 items-center gap-2.5 rounded-2xl border border-[#e1e6ef] bg-j-surface pl-3.5 pr-1.5 shadow-j-card focus-within:border-j-accent">
            <Search aria-hidden className="h-5 w-5 shrink-0 text-j-muted" strokeWidth={1.9} />
            <input
              ref={input}
              type="search"
              enterKeyHint="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("placeholder")}
              aria-label={t("placeholder")}
              data-search-input
              className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-j-muted [&::-webkit-search-cancel-button]:hidden"
            />
            {query && (
              <button type="button" aria-label={t("clear")} onClick={() => { setQuery(""); input.current?.focus(); }} className="flex h-9 w-9 items-center justify-center rounded-full text-j-muted">
                <X aria-hidden className="h-4 w-4" />
              </button>
            )}
          </div>
        </form>

        {q.length < 2 ? (
          <Card className="flex flex-col gap-2 p-4 text-sm text-j-muted">
            <p className="font-semibold text-j-ink">{t("hintTitle")}</p>
            <p>{t("hintBody")}</p>
          </Card>
        ) : (
          <>
            <button type="button" onClick={askAgent} data-search-ask className="flex items-center gap-3 rounded-j-card border border-[#c9d4f2] bg-[#f7f9ff] px-3.5 py-3 text-left">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-j-accent text-white">
                <Sparkles aria-hidden className="h-5 w-5" strokeWidth={1.9} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-xs font-bold text-j-accent">{t("askAgent")}</span>
                <span className="truncate text-[15px] font-semibold">“{q}”</span>
              </span>
            </button>

            {pages.length > 0 && (
              <section className="flex flex-col gap-2" data-search-section="pages">
                <GroupLabel>{t("pages")}</GroupLabel>
                <RowList>
                  {pages.map((p) => (
                    <Row key={p.key} href={p.href} leading={<ModuleGlyph module={p.module} size="sm" />} title={p.title} subtitle={p.subtitle} />
                  ))}
                </RowList>
              </section>
            )}

            <section className="flex flex-col gap-2" data-search-section="records">
              <GroupLabel>{t("records")}</GroupLabel>
              {loading(records) || records.items === null ? (
                <Card className="p-3.5 text-sm text-j-muted">{t("searching")}</Card>
              ) : records.error ? (
                <Card className="p-3.5 text-sm text-j-muted">{t("recordsError")}</Card>
              ) : records.items.length === 0 ? (
                <Card className="p-3.5 text-sm text-j-muted">{t("noRecords")}</Card>
              ) : (
                <RowList>
                  {records.items.map((r) => (
                    <li key={`${r.type}:${r.id}`} data-search-record={r.type}>
                      <button type="button" onClick={() => router.push(r.href)} className="flex min-h-[60px] w-full items-center gap-3 py-2.5 text-left">
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="truncate text-[15px] font-bold">{r.label}</span>
                          <span className="truncate text-xs text-j-muted">{t("recordMeta", { type: r.type_label, field: r.matched_field })}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </RowList>
              )}
            </section>

            {files.items && files.items.length > 0 && files.query === q && (
              <section className="flex flex-col gap-2" data-search-section="files">
                <GroupLabel>{t("files")}</GroupLabel>
                <RowList>
                  {files.items.map((f) => (
                    <li key={f.id} data-search-file={f.id}>
                      <a href={`/api/files/${f.id}/content?preview=1`} target="_blank" rel="noopener" className="flex min-h-[60px] items-center gap-3 py-2.5">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[#fdebe8] text-[#b3261e]">
                          <FileText aria-hidden className="h-[18px] w-[18px]" />
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="truncate text-[15px] font-bold">{f.title}</span>
                          <span className="line-clamp-1 text-xs text-j-muted">{f.snippet || f.kind}</span>
                        </span>
                      </a>
                    </li>
                  ))}
                </RowList>
                <Link href={`/files?q=${encodeURIComponent(q)}`} className="self-start text-[13px] font-semibold text-j-accent">
                  {t("allFiles")}
                </Link>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
