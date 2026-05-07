type FeeState = {
  line_28_bk_fees_this_month: number | null;
  line_29_bk_fees_since_filing: number | null;
  line_30_other_fees_this_month: number | null;
  line_31_other_fees_since_filing: number | null;
};

type Props = {
  state: FeeState;
  onChange: (payload: Partial<FeeState>) => void;
};

export function Part6ProfessionalFees({ state, onChange }: Props) {
  return (
    <section className="rounded border border-gray-200 bg-white p-3">
      <h3 className="mb-2 text-sm font-semibold text-gray-900">Part 6 — Professional Fees (Lines 28-31)</h3>
      <div className="grid gap-2 text-xs md:grid-cols-2">
        <label>
          Line 28 Bankruptcy fees this month
          <input className="mt-1 h-8 w-full rounded border border-gray-300 px-2" type="number" value={state.line_28_bk_fees_this_month ?? 0} onChange={(e) => onChange({ line_28_bk_fees_this_month: Number(e.target.value || 0) })} />
        </label>
        <label>
          Line 29 Bankruptcy fees since filing
          <input className="mt-1 h-8 w-full rounded border border-gray-300 px-2" type="number" value={state.line_29_bk_fees_since_filing ?? 0} onChange={(e) => onChange({ line_29_bk_fees_since_filing: Number(e.target.value || 0) })} />
        </label>
        <label>
          Line 30 Other professional fees this month
          <input className="mt-1 h-8 w-full rounded border border-gray-300 px-2" type="number" value={state.line_30_other_fees_this_month ?? 0} onChange={(e) => onChange({ line_30_other_fees_this_month: Number(e.target.value || 0) })} />
        </label>
        <label>
          Line 31 Other professional fees since filing
          <input className="mt-1 h-8 w-full rounded border border-gray-300 px-2" type="number" value={state.line_31_other_fees_since_filing ?? 0} onChange={(e) => onChange({ line_31_other_fees_since_filing: Number(e.target.value || 0) })} />
        </label>
      </div>
    </section>
  );
}
