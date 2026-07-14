type Props = {
  checks: Array<{ label: string; ok: boolean }>;
};

export function CreateWOSectionValidation({ checks }: Props) {
  return (
    <section className="rounded-sm border border-slate-200 bg-slate-50 p-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-800">D. Pre-Save Validation</h3>
      <ul className="space-y-1 text-xs">
        {checks.map((check) => (
          <li key={check.label} className={check.ok ? "text-slate-700" : "text-slate-900 font-semibold"}>
            {check.ok ? "✓" : "!"} {check.label}
          </li>
        ))}
      </ul>
    </section>
  );
}
