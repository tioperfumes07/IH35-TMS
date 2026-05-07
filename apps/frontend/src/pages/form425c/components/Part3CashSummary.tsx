import { Button } from "../../../components/Button";

type CashState = {
  line_19_opening_cash: number | null;
  line_20_receipts: number | null;
  line_21_disbursements: number | null;
  line_22_net_cash_flow: number | null;
  line_23_ending_cash: number | null;
};

type Props = {
  state: CashState;
  onChange: (payload: Partial<CashState>) => void;
  onImport: () => void;
  importing: boolean;
};

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function Part3CashSummary({ state, onChange, onImport, importing }: Props) {
  const line22 = (state.line_20_receipts ?? 0) - (state.line_21_disbursements ?? 0);
  const line23 = (state.line_19_opening_cash ?? 0) + line22;
  return (
    <section className="rounded border border-green-200 bg-green-50 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">Part 3 — Cash Summary (Lines 19-23)</h3>
        <Button size="sm" variant="secondary" onClick={onImport} loading={importing}>
          Import from Banking
        </Button>
      </div>
      <div className="grid gap-2 text-xs md:grid-cols-2">
        <label className="rounded border border-gray-200 bg-white p-2">
          Line 19 Opening cash
          <input
            className="mt-1 h-8 w-full rounded border border-gray-300 px-2"
            type="number"
            value={state.line_19_opening_cash ?? 0}
            onChange={(e) => onChange({ line_19_opening_cash: Number(e.target.value || 0), line_23_ending_cash: line23 })}
          />
        </label>
        <label className="rounded border border-gray-200 bg-white p-2">
          Line 20 Receipts
          <input
            className="mt-1 h-8 w-full rounded border border-gray-300 px-2"
            type="number"
            value={state.line_20_receipts ?? 0}
            onChange={(e) =>
              onChange({
                line_20_receipts: Number(e.target.value || 0),
                line_22_net_cash_flow: (Number(e.target.value || 0) - (state.line_21_disbursements ?? 0)),
                line_23_ending_cash: (state.line_19_opening_cash ?? 0) + (Number(e.target.value || 0) - (state.line_21_disbursements ?? 0)),
              })
            }
          />
        </label>
        <label className="rounded border border-gray-200 bg-white p-2">
          Line 21 Disbursements
          <input
            className="mt-1 h-8 w-full rounded border border-gray-300 px-2"
            type="number"
            value={state.line_21_disbursements ?? 0}
            onChange={(e) =>
              onChange({
                line_21_disbursements: Number(e.target.value || 0),
                line_22_net_cash_flow: (state.line_20_receipts ?? 0) - Number(e.target.value || 0),
                line_23_ending_cash: (state.line_19_opening_cash ?? 0) + ((state.line_20_receipts ?? 0) - Number(e.target.value || 0)),
              })
            }
          />
        </label>
        <div className="rounded border border-gray-200 bg-white p-2">
          <div className="text-gray-600">Line 22 Net cash flow (auto)</div>
          <div className="mt-2 text-sm font-semibold">{currency.format(line22)}</div>
        </div>
        <div className="rounded border border-gray-200 bg-white p-2 md:col-span-2">
          <div className="text-gray-600">Line 23 Ending cash (auto)</div>
          <div className="mt-2 text-sm font-semibold">{currency.format(line23)}</div>
        </div>
      </div>
    </section>
  );
}
