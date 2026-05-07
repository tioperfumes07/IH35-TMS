type ProjectionState = {
  line_20_receipts: number | null;
  line_21_disbursements: number | null;
  line_22_net_cash_flow: number | null;
  line_32_proj_receipts: number | null;
  line_33_proj_disbursements: number | null;
  line_34_proj_net_cash_flow: number | null;
  line_35_next_proj_receipts: number | null;
  line_36_next_proj_disbursements: number | null;
  line_37_next_proj_net_cash_flow: number | null;
  projection_override_reason: string;
};

type Props = {
  state: ProjectionState;
  hasCarryForward: boolean;
  onChange: (payload: Partial<ProjectionState>) => void;
};

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function Part7Projections({ state, hasCarryForward, onChange }: Props) {
  const colA32 = state.line_32_proj_receipts ?? 0;
  const colA33 = state.line_33_proj_disbursements ?? 0;
  const colA34 = colA32 - colA33;
  const colB32 = state.line_20_receipts ?? 0;
  const colB33 = state.line_21_disbursements ?? 0;
  const colB34 = state.line_22_net_cash_flow ?? colB32 - colB33;
  const diff32 = colB32 - colA32;
  const diff33 = colB33 - colA33;
  const diff34 = colB34 - colA34;
  const next37 = (state.line_35_next_proj_receipts ?? 0) - (state.line_36_next_proj_disbursements ?? 0);

  return (
    <section className="rounded border border-blue-200 bg-blue-50 p-3">
      <h3 className="mb-2 text-sm font-semibold text-gray-900">Part 7 — Projections vs Actual (Lines 32-37)</h3>
      {hasCarryForward ? (
        <div className="mb-2 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-800">
          Column A is carry-forward from last month lines 35-37. Manual override requires reason (30+ chars).
        </div>
      ) : null}
      <div className="grid gap-2 text-xs md:grid-cols-[1fr_160px_160px_160px]">
        <div className="font-semibold text-gray-600">Line</div>
        <div className="font-semibold text-gray-600">Col A Projected</div>
        <div className="font-semibold text-gray-600">Col B Actual</div>
        <div className="font-semibold text-gray-600">Col C Diff</div>

        <div>Line 32 Cash receipts</div>
        <input className="h-8 rounded border border-gray-300 px-2" type="number" value={colA32} onChange={(e) => onChange({ line_32_proj_receipts: Number(e.target.value || 0), line_34_proj_net_cash_flow: Number(e.target.value || 0) - colA33 })} />
        <div className="rounded border border-gray-200 bg-white px-2 py-2">{currency.format(colB32)}</div>
        <div className="rounded border border-gray-200 bg-white px-2 py-2">{currency.format(diff32)}</div>

        <div>Line 33 Cash disbursements</div>
        <input className="h-8 rounded border border-gray-300 px-2" type="number" value={colA33} onChange={(e) => onChange({ line_33_proj_disbursements: Number(e.target.value || 0), line_34_proj_net_cash_flow: colA32 - Number(e.target.value || 0) })} />
        <div className="rounded border border-gray-200 bg-white px-2 py-2">{currency.format(colB33)}</div>
        <div className="rounded border border-gray-200 bg-white px-2 py-2">{currency.format(diff33)}</div>

        <div>Line 34 Net cash flow</div>
        <div className="rounded border border-gray-200 bg-white px-2 py-2">{currency.format(colA34)}</div>
        <div className="rounded border border-gray-200 bg-white px-2 py-2">{currency.format(colB34)}</div>
        <div className="rounded border border-gray-200 bg-white px-2 py-2">{currency.format(diff34)}</div>
      </div>

      <div className="mt-3 grid gap-2 text-xs md:grid-cols-3">
        <label>
          Line 35 Next projected receipts
          <input className="mt-1 h-8 w-full rounded border border-gray-300 px-2" type="number" value={state.line_35_next_proj_receipts ?? 0} onChange={(e) => onChange({ line_35_next_proj_receipts: Number(e.target.value || 0), line_37_next_proj_net_cash_flow: Number(e.target.value || 0) - (state.line_36_next_proj_disbursements ?? 0) })} />
        </label>
        <label>
          Line 36 Next projected disbursements
          <input className="mt-1 h-8 w-full rounded border border-gray-300 px-2" type="number" value={state.line_36_next_proj_disbursements ?? 0} onChange={(e) => onChange({ line_36_next_proj_disbursements: Number(e.target.value || 0), line_37_next_proj_net_cash_flow: (state.line_35_next_proj_receipts ?? 0) - Number(e.target.value || 0) })} />
        </label>
        <div className="rounded border border-gray-200 bg-white px-2 py-2">
          <div className="text-gray-600">Line 37 Net cash flow (auto)</div>
          <div className="mt-2 font-semibold">{currency.format(next37)}</div>
        </div>
      </div>

      <label className="mt-3 block text-xs">
        Override reason (required when changing carry-forward values)
        <textarea className="mt-1 min-h-16 w-full rounded border border-gray-300 px-2 py-1" value={state.projection_override_reason} onChange={(e) => onChange({ projection_override_reason: e.target.value })} />
      </label>
    </section>
  );
}
