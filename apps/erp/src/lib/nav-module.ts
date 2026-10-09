"use client";
// The module a page is shown under (QA 2026-10-08): its owner, unless you came from a module that lists the page as
// shared ("Bersama divisi lain"). Sales → Client Active stays in Sales instead of jumping to TA. Remembered per tab
// (sessionStorage); a direct link or a fresh tab shows the owner, as before. Sidebar and the phone's context bar share it.
import { useEffect, useState } from "react";
import { MODULES, type ModuleConfig } from "./modules-config";
import { moduleForPath } from "./module-access";

const KEY = "nav-module";

function sharedIn(m: ModuleConfig, pathname: string) {
  // A shared Sales V2 page also shares its V1 page (`v1`), so the V1 link keeps you in the module you came from.
  return m.subPages.some((s) => s.collab && [s.href, s.v1].some((h) => h && (pathname === h || pathname.startsWith(h + "/"))));
}

/** Pure core of useNavModule: `from` is the module this tab was last in. */
export function navModuleFor(pathname: string, from: string | null | undefined): ModuleConfig | undefined {
  const clean = pathname.split(/[?#]/)[0];
  const owner = moduleForPath(clean);
  const remembered = from ? MODULES.find((m) => m.key === from) : undefined;
  return remembered && remembered.key !== owner?.key && sharedIn(remembered, clean) ? remembered : owner;
}

export function useNavModule(pathname: string): ModuleConfig | undefined {
  // undefined until this tab's memory is read, so the first render cannot overwrite it with the owner.
  const [from, setFrom] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let saved: string | null = null;
    try { saved = sessionStorage.getItem(KEY); } catch { /* storage blocked: owner module */ }
    setFrom(saved);
  }, []);
  const current = navModuleFor(pathname, from);
  useEffect(() => {
    if (from === undefined || !current) return;
    setFrom(current.key);
    try { sessionStorage.setItem(KEY, current.key); } catch { /* storage blocked */ }
  }, [from === undefined, current?.key]); // eslint-disable-line react-hooks/exhaustive-deps
  return current;
}
