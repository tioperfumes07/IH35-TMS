/**
 * EarningsSection — settlement earnings lines per the reference design
 * (docs/design/reference/DRIVER-SETTLEMENT-DETAIL-REFERENCE-2026-09-05.html).
 *
 * Columns: Number, Load #, Date, From, To, Loaded mi, Rate, Amount, Driver bill.
 * Section header: "Earnings — loaded miles" with subtitle
 * "one line per load · from the driver bill · edit the bill, not the line".
 *
 * Display-only section (lines passed in as props; no query/mutation here — the parent
 * settlement page owns fetch/error state). Uses ParityTable; amount formatting ($X.XX),
 * em-dash fallbacks, column order, and the Subtotal/Miles footer line preserved.
 */
import { entityLabel } from "../../../lib/entity-label";
import { EntityLink } from "../../../components/shared/EntityLink";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { mmmDd } from "../../../lib/formatDate";

type Line = {
  id: string;
  /** C5 — the load this earnings line was earned on (settlement_lines.load_id, the 2026-06-27
   *  direct-trace column the parent already reads at SettlementDetailPage.tsx:118-124). */
  load_id?: string | null;
  load_number?: string | null;
  /** S.1b — line_date (COALESCE of delivery-stop arrival), origin/dest city+state from load_stops. */
  line_date?: string | null;
  origin_city?: string | null;
  origin_state?: string | null;
  dest_city?: string | null;
  dest_state?: string | null;
  /** SRC-02 — canonical driver bill that generated this earnings line (when linked). */
  source_driver_bill_id?: string | null;
  source_label?: string | null;
  description: string;
  miles?: number;
  rate?: number;
  /** SET-RATE — 'card' (driver rate card at line creation) vs 'derived' (backfilled amount/miles
   *  for a line minted before the rate snapshot existed). Not rendered as its own column today;
   *  carried through so a future audit surface can show provenance without another API round trip. */
  rate_source?: string | null;
  amount: number;
};

type Props = {
  lines: Line[];
  isOpen?: boolean;
};

const COLUMNS: Array<ParityColumn<Line>> = [
  {
    key: "source_label",
    label: "Number",
    render: (line) => line.source_label ?? "—",
  },
  {
    key: "load_id",
    label: "Load #",
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
    key: "line_date",
    label: "Date",
    sortable: true,
    sortValue: (line) => line.line_date ?? "",
    render: (line) => {
      const d = mmmDd(line.line_date);
      return d || "—";
    },
  },
  {
    key: "origin_city",
    label: "From",
    render: (line) => {
      if (!line.origin_city && !line.origin_state) return "—";
      return [line.origin_city, line.origin_state].filter(Boolean).join(", ") || "—";
    },
  },
  {
    key: "dest_city",
    label: "To",
    render: (line) => {
      if (!line.dest_city && !line.dest_state) return "—";
      return [line.dest_city, line.dest_state].filter(Boolean).join(", ") || "—";
    },
  },
  // S.1 — miles/rate now arrive real (driver_bills join, settlements.routes.ts) instead of always
  // 0/blank; format to the design contract: miles 1-decimal + thousands separator (design ref
  // "1,319.7"), rate 4-decimal dollars-per-mile (design ref "$0.4800") — a bare rate like 0.48
  // read as "0.48" elsewhere in this app, but the driver-settlement register specifically prints
  // the full printed-document precision, matching LoadCostsBoardPage.tsx's own fmtRate pattern.
  {
    key: "miles",
    label: "Loaded mi",
    // SET-RATE (LAW §8 "zero is a claim") — a genuinely-unknown leg (no telematics/dispatch miles
    // captured for it) renders "—" with the reason on hover, never a 0.0 that reads as a real
    // zero-mile trip.
    render: (line) =>
      line.miles != null ? (
        <>{line.miles.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</>
      ) : (
        <span title="no telematics miles for this leg">—</span>
      ),
  },
  {
    key: "rate",
    label: "Rate",
    render: (line) =>
      line.rate != null ? (
        <>${line.rate.toFixed(4)}</>
      ) : (
        <span title="no telematics miles for this leg">—</span>
      ),
  },
  {
    key: "amount",
    label: "Amount",
    render: (line) => <>${Number(line.amount).toFixed(2)}</>,
  },
  {
    key: "source_driver_bill_id",
    label: "Driver bill",
    render: (line) =>
      line.source_driver_bill_id ? (
        <EntityLink kind="driver_bill" id={line.source_driver_bill_id} label={line.source_label ?? "—"} />
      ) : (
        line.source_label ?? "—"
      ),
  },
];

export function EarningsSection({ lines, isOpen: _isOpen }: Props) {
  const subtotal = lines.reduce((sum, line) => sum + Number(line.amount || 0), 0);
  const totalMiles = lines.reduce((sum, line) => sum + Number(line.miles || 0), 0);
  return (
    <section className="rounded-sm border border-gray-200 bg-white">
      <header className="flex items-center border-b border-gray-200 px-2.5 py-1.5">
        <h2 className="m-0 text-xs font-bold uppercase tracking-wide text-slate-600">Earnings — loaded miles</h2>
        <span className="ml-2 text-xs text-slate-500">one line per load · from the driver bill · edit the bill, not the line</span>
      </header>
      <ParityTable
        columns={COLUMNS}
        rows={lines}
        rowKey={(line) => line.id}
        storageKey="driver-finance-earnings-section"
        tableTestId="earnings-section-table"
        embedded
        hidePager
      />
      <div className="mt-1 px-2.5 py-1 text-xs font-semibold">Subtotal: ${subtotal.toFixed(2)} · Miles: {totalMiles.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</div>
    </section>
  );
}
