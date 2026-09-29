/**
 * Sebagian besar label modul/subpage di modules-config.tsx sudah berbahasa Inggris.
 * Map ini cuma buat yang masih bahasa Indonesia -- key-nya cocok ke namespace "nav"
 * di messages/*.json, dipakai Sidebar buat translate on-the-fly tanpa ubah modules-config.
 */
export const NAV_LABEL_KEYS: Record<string, string> = {
  "Dokumen Finance (TM Invoice)": "financeDocument",
  "Katalog Course": "courseCatalog",
  "Daftar Request": "requestList",
  "Tanda Tangan Digital": "digitalSignature",
  "Automasi & Chatbot": "automationChatbot",
};
