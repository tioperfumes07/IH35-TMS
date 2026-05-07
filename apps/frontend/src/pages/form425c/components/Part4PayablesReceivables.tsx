type Props = {
  line24: number | null;
  line25: number | null;
  onChange: (payload: { line_24_payables: number; line_25_receivables: number }) => void;
};

export function Part4PayablesReceivables({ line24, line25, onChange }: Props) {
  return (
    <section className="rounded border border-gray-200 bg-white p-3">
      <h3 className="mb-2 text-sm font-semibold text-gray-900">Part 4 — Payables / Receivables (Lines 24-25)</h3>
      <div className="grid gap-2 text-xs md:grid-cols-2">
        <label>
          Line 24 Payables
          <input
            className="mt-1 h-8 w-full rounded border border-gray-300 px-2"
            type="number"
            value={line24 ?? 0}
            onChange={(e) => onChange({ line_24_payables: Number(e.target.value || 0), line_25_receivables: line25 ?? 0 })}
          />
        </label>
        <label>
          Line 25 Receivables
          <input
            className="mt-1 h-8 w-full rounded border border-gray-300 px-2"
            type="number"
            value={line25 ?? 0}
            onChange={(e) => onChange({ line_24_payables: line24 ?? 0, line_25_receivables: Number(e.target.value || 0) })}
          />
        </label>
      </div>
    </section>
  );
}
