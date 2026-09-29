"use client";
import { createContext, useContext, useState } from "react";

type ModalKey = "activity" | "contact" | null;
type Ctx = { openModal: ModalKey; setOpenModal: (m: ModalKey) => void };

const AccountModalsContext = createContext<Ctx | null>(null);

/**
 * Cuma satu modal (Activity atau Contact) yang boleh terbuka bersamaan di
 * halaman Account 360 -- sebelumnya dua AddRecordModal independen bisa
 * ke-buka bareng dan overlay-nya numpuk jadi keliatan pucat/transparan.
 */
export function AccountModalsProvider({ children }: { children: React.ReactNode }) {
  const [openModal, setOpenModal] = useState<ModalKey>(null);
  return <AccountModalsContext.Provider value={{ openModal, setOpenModal }}>{children}</AccountModalsContext.Provider>;
}

export function useAccountModal() {
  const ctx = useContext(AccountModalsContext);
  if (!ctx) throw new Error("useAccountModal must be used inside AccountModalsProvider");
  return ctx;
}
