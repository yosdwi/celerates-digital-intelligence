export type UserOption = { id: string; full_name: string; email: string };

export function UserSelect({
  name,
  label,
  options,
  required,
  defaultValue,
}: {
  name: string;
  label: string;
  options: UserOption[];
  required?: boolean;
  defaultValue?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      <select
        name={name}
        required={required}
        defaultValue={defaultValue ?? ""}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
      >
        <option value="">- pilih user -</option>
        {options.map((u) => (
          <option key={u.id} value={u.id}>{u.full_name} ({u.email})</option>
        ))}
      </select>
    </label>
  );
}
