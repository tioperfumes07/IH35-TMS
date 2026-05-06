type Props = {
  issues: string[];
};

export function BookLoadValidationSection({ issues }: Props) {
  return (
    <section className="rounded border border-[#E8E5D8] bg-[#F0F0E8] p-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-700">D. Pre-Dispatch Validation</h3>
      <ul className="space-y-1 text-xs text-gray-700">
        {issues.map((issue) => (
          <li key={issue}>• {issue}</li>
        ))}
      </ul>
    </section>
  );
}
