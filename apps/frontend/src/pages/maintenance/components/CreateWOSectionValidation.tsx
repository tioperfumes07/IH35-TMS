type Props = {
  checks: Array<{ label: string; ok: boolean }>;
};

export function CreateWOSectionValidation({ checks }: Props) {
  return (
    <section className="rounded border border-green-200 bg-green-50 p-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-green-800">D. Pre-Save Validation</h3>
      <ul className="space-y-1 text-xs">
        {checks.map((check) => (
          <li key={check.label} className={check.ok ? "text-green-700" : "text-amber-700"}>
            {check.ok ? "✓" : "⚠"} {check.label}
          </li>
        ))}
      </ul>
    </section>
  );
}
