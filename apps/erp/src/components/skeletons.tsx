// Loading skeletons (docs/design/FRONTEND-LOADING-ARCHITECTURE.md §3). Each one has the page's real shape, uses plain
// blocks without shimmer, and appears at once on navigation (loading.tsx) while the server renders the page.
const Bar = ({ className }: { className: string }) => <div className={`erp-skel ${className}`} />;

/** A generic module page: title, a row of summary blocks, then a list. */
export function PageSkeleton() {
  return (
    <div aria-busy="true" aria-label="Memuat halaman" className="space-y-5 p-6">
      <Bar className="h-5 w-56" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Bar key={i} className="h-16" />)}</div>
      <div className="space-y-2">{Array.from({ length: 10 }, (_, i) => <Bar key={i} className="h-9" />)}</div>
    </div>
  );
}

/** A Sales V2 workspace: title, summary cards, toolbar, then table rows. */
export function WorkspaceSkeleton() {
  return (
    <div aria-busy="true" aria-label="Memuat data" className="space-y-3 pt-3">
      <div className="px-5"><Bar className="h-4 w-48" /><Bar className="mt-2 h-3 w-80" /></div>
      <div className="mx-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">{Array.from({ length: 5 }, (_, i) => <Bar key={i} className="h-14 rounded-xl" />)}</div>
      <div className="flex gap-2 border-y border-slate-100 px-5 py-2"><Bar className="h-7 w-40" /><Bar className="h-7 w-24" /><Bar className="h-7 w-56" /><div className="flex-1" /><Bar className="h-7 w-20" /></div>
      <div className="space-y-px px-5">{Array.from({ length: 14 }, (_, i) => <Bar key={i} className="h-8 rounded-none" />)}</div>
    </div>
  );
}

/** A record page: identity and details on the left, tabs and content on the right. */
export function RecordSkeleton() {
  return (
    <div aria-busy="true" aria-label="Memuat record" className="grid min-h-[60vh] grid-cols-1 md:grid-cols-[minmax(280px,38%)_1fr]">
      <div className="space-y-3 border-r border-slate-100 p-5">
        <Bar className="h-6 w-64" /><Bar className="h-3 w-40" />
        {Array.from({ length: 9 }, (_, i) => <div key={i} className="flex gap-4"><Bar className="h-4 w-28" /><Bar className="h-4 flex-1" /></div>)}
      </div>
      <div className="space-y-4 p-5">
        <div className="flex gap-3"><Bar className="h-7 w-24" /><Bar className="h-7 w-16" /><Bar className="h-7 w-20" /></div>
        <Bar className="h-16" /><Bar className="h-24" /><Bar className="h-24" />
      </div>
    </div>
  );
}
