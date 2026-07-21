/**
 * EarningsSection — settlement earnings lines: Load | Description | Miles | Rate | Amount
 *
 * Display-only section (lines passed in as props; no query/mutation here — the parent
 * settlement page owns fetch/error state). Migrated to the shared ParityTable grammar;
 * amount formatting ($X.XX), em-dash fallbacks, column order, and the Subtotal/Miles
 * footer line preserved 1:1.
 */
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";

type Line = {
  id: string;
  description: string;
  miles?: number;
  rate?: number;
  amount: number;
};

type Props = {
  lines: Line[];
};

const COLUMNS: Array<ParityColumn<Line>> = [
  { key: "id", label: "Load" },
  { key: "description", label: "Description" },
  { key: "miles", label: "Miles", render: (line) => <>{line.miles ?? "—"}</> },
  { key: "rate", label: "Rate", render: (line) => <>{line.rate ?? "—"}</> },
  {
    key: "amount",
    label: "Amount",
    render: (line) => <>${Number(line.amount).toFixed(2)}</>,
  },
];

export function EarningsSection({ lines }: Props) {
  const subtotal = lines.reduce((sum, line) => sum + Number(line.amount || 0), 0);
  const totalMiles = lines.reduce((sum, line) => sum + Number(line.miles || 0), 0);
  return (
    <section className="rounded-sm border border-slate-200 bg-slate-50 p-2">
      <h3 className="mb-1 text-xs font-semibold uppercase text-slate-800">A. Earnings</h3>
      <ParityTable
        columns={COLUMNS}
        rows={lines}
        rowKey={(line) => line.id}
        storageKey="driver-finance-earnings-section"
        tableTestId="earnings-section-table"
      />
      <div className="mt-1 text-xs font-semibold">Subtotal: ${subtotal.toFixed(2)} · Miles: {totalMiles}</div>
    </section>
  );
}
