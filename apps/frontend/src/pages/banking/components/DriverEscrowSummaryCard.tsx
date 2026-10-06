import { Link } from "react-router-dom";
import type { BankingKpi } from "../../../api/banking-kpis";
import { formatUsdCents } from "../../../lib/money";

type Props = {
  /** Month-to-date driver-escrow KPIs from the banking KPI engine (escrow_liability_default + sub-accounts). */
  held: BankingKpi | null;
  contributions: BankingKpi | null;
  deductions: BankingKpi | null;
  failed: boolean;
};

/**
 * ROUND 335 item 2 — approved preview, Banking Feature 2 (Driver Escrow visualizer, the home's right-hand panel): total
 * escrow held, the accounts holding it, contributions and deductions month to date, and the way into the full ledger.
 * Every figure is the banking KPI engine's (ledger-tied by verify-factoring-banking-kpis-tie-to-ledger) — no component math.
 * A zero says why (the engine's empty_reason); a failed read says so.
 */
function Line({ kpi, failed, testId }: { kpi: BankingKpi | null; failed: boolean; testId: string }) {
  if (failed) {
    return (
      <dd className="text-right text-[#B91C1C]" data-testid={testId} title="The banking KPI engine could not be read">
        Unavailable
      </dd>
    );
  }
  if (!kpi) return <dd className="text-right text-[#6B7280]" data-testid={testId}>…</dd>;
  const quiet = kpi.value == null || kpi.row_count === 0;
  return (
    <dd
      data-testid={testId}
      title={quiet ? kpi.empty_reason ?? `${kpi.label}: none` : `${kpi.label}${kpi.gl_account ? ` · GL ${kpi.gl_account}` : ""} · ${kpi.row_count} posting(s)`}
      className={quiet ? "text-right text-[#6B7280]" : "text-right font-medium tabular-nums text-[#0F1219]"}
    >
      {/* ROUND 433.2 — the board lists every driver's escrow; its total ties to this figure. */}
      {quiet ? formatUsdCents(kpi.value ?? 0) : <Link to="/banking/driver-escrow" className="hover:underline">{formatUsdCents(kpi.value ?? 0)}</Link>}
    </dd>
  );
}

export function DriverEscrowSummaryCard({ held, contributions, deductions, failed }: Props) {
  const accounts = held?.compare_value;
  return (
    <section className="rounded-sm border border-[#E5E7EB] bg-white p-3" data-testid="banking-driver-escrow-summary-card">
      <div className="flex items-center justify-between">
        <Link to="/banking/driver-escrow" className="text-xs font-bold uppercase tracking-wide text-[#4B5563] hover:underline">
          Driver escrow
        </Link>
        <Link to="/banking/driver-escrow" className="text-xs font-medium text-[#14314F] hover:underline" data-testid="banking-driver-escrow-summary-filter">
          Filter →
        </Link>
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <dt className="text-[#6B7280]">Total escrow held</dt>
        <Line kpi={held} failed={failed} testId="banking-driver-escrow-held" />
        <dt className="text-[#6B7280]">Accounts holding escrow</dt>
        <dd data-quantity className="text-right tabular-nums text-[#0F1219]" data-testid="banking-driver-escrow-accounts">
          {failed ? "—" : accounts == null ? "…" : String(accounts)}
        </dd>
        <dt className="text-[#6B7280]">Contributions MTD</dt>
        <Line kpi={contributions} failed={failed} testId="banking-driver-escrow-contributions-mtd" />
        <dt className="text-[#6B7280]">Deductions / releases MTD</dt>
        <Line kpi={deductions} failed={failed} testId="banking-driver-escrow-deductions-mtd" />
      </dl>
    </section>
  );
}
