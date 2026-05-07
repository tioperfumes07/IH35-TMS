type Props = {
  line26: number | null;
  line27: number | null;
  onChange: (payload: { line_26_employees_at_filing: number; line_27_employees_now: number }) => void;
};

export function Part5Employees({ line26, line27, onChange }: Props) {
  return (
    <section className="rounded border border-gray-200 bg-white p-3">
      <h3 className="mb-2 text-sm font-semibold text-gray-900">Part 5 — Employees (Lines 26-27)</h3>
      <div className="grid gap-2 text-xs md:grid-cols-2">
        <label>
          Line 26 Employees at filing
          <input
            className="mt-1 h-8 w-full rounded border border-gray-300 px-2"
            type="number"
            value={line26 ?? 0}
            onChange={(e) => onChange({ line_26_employees_at_filing: Number(e.target.value || 0), line_27_employees_now: line27 ?? 0 })}
          />
        </label>
        <label>
          Line 27 Employees now
          <input
            className="mt-1 h-8 w-full rounded border border-gray-300 px-2"
            type="number"
            value={line27 ?? 0}
            onChange={(e) => onChange({ line_26_employees_at_filing: line26 ?? 0, line_27_employees_now: Number(e.target.value || 0) })}
          />
        </label>
      </div>
    </section>
  );
}
