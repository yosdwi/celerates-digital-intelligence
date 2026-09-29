import { FolderOpen } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { requireActor } from "@/lib/actor";
import { agentEnabled } from "@/lib/agent/bff";
import { FilesExplorer } from "@/components/files/explorer";

// Company Files (doc 17, ADR-018): one place to find, open and ask about company files — ERP attachments (CVs, PKS,
// PO, BAST, …) and files uploaded here (SOP, proposals, manpower sheets, …) — with access decided by ERP policy.
export default async function FilesPage({ searchParams }: { searchParams: Promise<{ file?: string; q?: string }> }) {
  await requireActor();
  const params = await searchParams;
  return (
    <div className="min-h-screen">
      <PageHeader
        icon={FolderOpen}
        color="bg-indigo-600"
        eyebrow="Intelligence"
        title="Company Files"
        subtitle="Cari, buka, dan tanyakan berkas perusahaan: lampiran ERP dan berkas yang diunggah di sini. Akses mengikuti kebijakan kelas berkas."
      />
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-8 sm:py-8">
        {agentEnabled() ? (
          <FilesExplorer initialFile={params.file ?? null} initialQuery={params.q ?? ""} />
        ) : (
          <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">Company Files belum dikonfigurasi di lingkungan ini.</p>
        )}
      </main>
    </div>
  );
}
