type Props = {
  checks: Array<{ label: string; ok: boolean }>;
};

export function CreateWOSectionValidation({ checks }: Props) {
  return (
    <section className="rounded-sm border border-[#E5E7EB] bg-[#F7F8FA] p-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#0F1219]">D. Pre-Save Validation</h3>
      <ul className="space-y-1 text-xs">
        {checks.map((check) => (
          <li key={check.label} className={check.ok ? "text-[#1F2A44]" : "text-[#0F1219] font-semibold"}>
            {check.ok ? "✓" : "!"} {check.label}
          </li>
        ))}
      </ul>
    </section>
  );
}
