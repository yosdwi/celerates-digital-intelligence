"use client";
import { useState, useTransition } from "react";
import { createClient } from "@/app/clients-actions";

type ClientOption = { id: string; name: string; code: string };

export function ClientSelect({
  clients,
  onSelect,
}: {
  clients: ClientOption[];
  onSelect: (client: ClientOption | null) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCode, setNewCode] = useState("");
  const [isPending, startTransition] = useTransition();
  const [localClients, setLocalClients] = useState(clients);

  function handleSelectChange(id: string) {
    if (id === "__add_new__") {
      setAdding(true);
      return;
    }
    const found = localClients.find((c) => c.id === id) ?? null;
    onSelect(found);
  }

  function handleAddNew() {
    if (!newName.trim() || !newCode.trim()) return;
    startTransition(async () => {
      const created = await createClient(newName.trim(), newCode.trim());
      const option = { id: created.id, name: created.name, code: created.code };
      setLocalClients((prev) => [...prev, option]);
      onSelect(option);
      setAdding(false);
      setNewName("");
      setNewCode("");
    });
  }

  if (adding) {
    return (
      <div className="space-y-1.5 rounded-lg border border-brand-200 bg-brand-50 p-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Nama Perusahaan (misal PT Astra International)"
          className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
        />
        <input
          value={newCode}
          onChange={(e) => setNewCode(e.target.value.toUpperCase())}
          placeholder="Kode Client (misal ASTRA)"
          className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
        />
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={handleAddNew}
            disabled={isPending}
            className="rounded bg-brand-600 px-2 py-1 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {isPending ? "Menyimpan..." : "Simpan"}
          </button>
          <button type="button" onClick={() => setAdding(false)} className="rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-100">
            Batal
          </button>
        </div>
      </div>
    );
  }

  return (
    <select
      onChange={(e) => handleSelectChange(e.target.value)}
      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
      defaultValue=""
    >
      <option value="">- pilih client -</option>
      {localClients.map((c) => (
        <option key={c.id} value={c.id}>{c.code} - {c.name}</option>
      ))}
      <option value="__add_new__">+ Tambah Client Baru</option>
    </select>
  );
}