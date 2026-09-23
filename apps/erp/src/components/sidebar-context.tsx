"use client";
import { createContext, useContext, useEffect, useState } from "react";

type SidebarContextValue = { collapsed: boolean; toggle: () => void };

const SidebarContext = createContext<SidebarContextValue>({ collapsed: false, toggle: () => {} });

export function SidebarCollapseProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (localStorage.getItem("sidebar-collapsed") === "true") setCollapsed(true);
  }, []);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("sidebar-collapsed", String(next));
      return next;
    });
  }

  return <SidebarContext.Provider value={{ collapsed, toggle }}>{children}</SidebarContext.Provider>;
}

export function useSidebarCollapse() {
  return useContext(SidebarContext);
}
