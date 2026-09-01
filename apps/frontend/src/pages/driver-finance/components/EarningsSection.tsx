/**
 * EarningsSection — settlement earnings lines: Load | Source | Description | Miles | Rate | Amount
 *
 * Display-only section (lines passed in as props; no query/mutation here — the parent
 * settlement page owns fetch/error state). Migrated to the shared ParityTable grammar;
 * amount formatting ($X.XX), em-dash fallbacks, column order, and the Subtotal/Miles
 * footer line preserved 1:1.
 */
import { entityLabel } from "../../../lib/entity-label";
import { EntityLink } from "../../../components/shared/EntityLink";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";

type Line = {
  id: string;
  /** C5 — the load this earnings line was earned on (settlement_lines.load_id, the 2026-06-27
   *  direct-trace column the parent already reads at SettlementDetailPage.tsx:118-124). */
  load_id?: string | null;
  load_number?: string | null;
  /** SRC-02 — canonical driver bill that generated this earnings line (when linked). */
  source_driver_bill_id?: string | null;
  source_label?: string | null;
  description: string;
  miles?: number;
  rate?: number;
  amount: number;
};

type Props = {
  lines: Line[];
};

const COLUMNS: Array<ParityColumn<Line>> = [
  {
    key: "load_id",
    label: "Load",
    // C5 — this column was `{ key: "id", label: "Load" }`, i.e. it printed the settlement LINE
    // uuid under a "Load" header. Wrong id, dead click. Now the real load, drilled canonically;
    // an em-dash when the line genuinely carries no load rather than a plausible-looking uuid.
    render: (line) =>
      line.load_id ? (
        <EntityLink kind="load" id={line.load_id} label={entityLabel(line.load_number, line.load_id, "Load")} />
      ) : (
        "—"
      ),
  },
  {
    key: "source_label",
    label: "Source",
    sortable: true,
    sortValue: (line) => line.source_label ?? "",
    render: (line) => line.source_label ?? "—",
  },
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
