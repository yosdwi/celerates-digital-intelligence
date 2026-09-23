export function LinkOrFileField({
    label,
    urlName,
    fileName,
    accept = ".pdf,.doc,.docx",
    defaultValue,
  }: {
    label: string;
    urlName: string;
    fileName: string;
    accept?: string;
    defaultValue?: string;
  }) {
    return (
      <div className="space-y-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">{label} (link)</span>
          <input name={urlName} defaultValue={defaultValue} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-slate-500">atau upload file</span>
          <input
            name={fileName}
            type="file"
            accept={accept}
            className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm file:mr-3 file:rounded file:border-0 file:bg-slate-100 file:px-2 file:py-1 file:text-xs"
          />
        </label>
      </div>
    );
  }