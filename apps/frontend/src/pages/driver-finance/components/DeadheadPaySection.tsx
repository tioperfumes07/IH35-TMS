/**
 * DeadheadPaySection — 25-task #12 (CC-1-INSTRUCTIONS-09-02-2026.txt): "Deadhead pay line renders
 * on the settlement as its own row labeled 'Empty Miles', never folded into 'Loaded Miles'."
 *
 * ROOT CAUSE: settlement_lines line_type='deadhead_pay' rows have existed end to end since
 * MILES SPEC (book-load.service.ts snapshots loaded_pay_cents/deadhead_pay_cents onto the driver
 * bill; settlement-engine.ts's applySettlementLinesFromDriverBill mints a SEPARATE
 * settlement_lines row with line_type='deadhead_pay' precisely so it never folds into the
 * 'earnings' loaded-mile line) and company-settlement-report.service.ts already labels the type
 * "Empty Miles" for the company-level report -- but SettlementDetailPage.tsx, the actual
 * driver/company-user-facing settlement screen, never filtered for 'deadhead_pay' at all: not
 * its own row, not folded into Earnings either -- just silently absent, and excluded from the
 * displayed earnings/gross total the backend's own net_pay otherwise includes.
 *
 * Mirrors EarningsSection's exact column/subtotal shape (same data source, same settlement_lines
 * table) so a reader sees identical Load/Description/Miles/Rate/Amount columns for both — only
 * the section title and line_type filter differ.
 */
import { entityLabel } from "../../../lib/entity-label";
import { EntityLink } from "../../../components/shared/EntityLink";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";

type Line = {
  id: string;
  load_id?: string | null;
  load_number?: string | null;
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
  // S.1 — same real-data + formatting fix as EarningsSection.tsx (driver_bills join, design-contract
  // precision: miles 1-decimal + thousands separator, rate 4-decimal dollars-per-mile).
  {
    key: "miles",
    label: "Miles",
    render: (line) => <>{line.miles != null ? line.miles.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : "—"}</>,
  },
  {
    key: "rate",
    label: "Rate",
    render: (line) => <>{line.rate != null ? `$${line.rate.toFixed(4)}` : "—"}</>,
  },
  {
    key: "amount",
    label: "Amount",
    render: (line) => <>${Number(line.amount).toFixed(2)}</>,
  },
];

export function DeadheadPaySection({ lines }: Props) {
  if (lines.length === 0) return null;
  const subtotal = lines.reduce((sum, line) => sum + Number(line.amount || 0), 0);
  const totalMiles = lines.reduce((sum, line) => sum + Number(line.miles || 0), 0);
  return (
    <section className="rounded-sm border border-slate-200 bg-slate-50 p-2" data-testid="deadhead-pay-section">
      <h3 className="mb-1 text-xs font-semibold uppercase text-slate-800">Empty Miles</h3>
      <ParityTable
        columns={COLUMNS}
        rows={lines}
        rowKey={(line) => line.id}
        storageKey="driver-finance-deadhead-pay-section"
        tableTestId="deadhead-pay-section-table"
      />
      <div className="mt-1 text-xs font-semibold">Subtotal: ${subtotal.toFixed(2)} · Miles: {totalMiles}</div>
    </section>
  );
}
