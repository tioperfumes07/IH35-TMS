import { Link } from "react-router-dom";
import type { FactoringKpi } from "../../../api/factoring-kpis";
import { formatUsd, formatUsdCents } from "../../../lib/money";

type Props = {
  /** Escrow + cash reserve from the factoring KPI engine (escrow + cash reserve roles); null while loading / on error. */
  reserve: number | null;
  outstandingLiability: number;
  lastAdvanceAt: string | null;
  /** Month-to-date lines from the factoring KPI engine (the same engine Factoring renders). */
  mtd?: { purchased: FactoringKpi | null; defaultInterest: FactoringKpi | null; failed: boolean };
};

/**
 * One engine line. A value renders as money; an engine KPI with no rows says why (its empty_reason), and a failed read
 * says so — never a "see elsewhere" placeholder (ROUND 326.2: "A KPI with no data says so and says why").
 */
function EngineLine({ kpi, failed, testId, to }: { kpi: FactoringKpi | null; failed: boolean; testId: string; to: string }) {
  if (failed) {
    return (
      <dd className="text-right text-[#B91C1C]" data-testid={testId} title="The factoring KPI engine could not be read">
        Unavailable
      </dd>
    );
  }
  if (!kpi) return <dd className="text-right text-[#6B7280]" data-testid={testId}>…</dd>;
  if (kpi.value == null || kpi.row_count === 0) {
    return (
      <dd className="text-right text-[#6B7280]" data-testid={testId} title={kpi.empty_reason ?? `${kpi.label}: no rows this month`}>
        {formatUsdCents(0)}
      </dd>
    );
  }
  return (
    <dd className="text-right font-medium tabular-nums text-[#0F1219]" data-testid={testId} title={`${kpi.label}${kpi.gl_account ? ` · GL ${kpi.gl_account}` : ""} · ${kpi.row_count} record(s)`}>
      <Link to={to} className="hover:underline">{formatUsdCents(kpi.value)}</Link>
    </dd>
  );
}

/**
 * C-64 — Factoring is NOT a tab. Summary card deep-links to the Factoring module.
 * Rule 07: keep the "Factoring · virtual bank" label. MTD lines come from the factoring KPI engine (ROUND 335 item 2) —
 * the old "— (see Factoring module)" deferrals were placeholders; a real zero renders $0.00 with the engine's reason.
 */
export function FactoringSummaryCard({ reserve, outstandingLiability, lastAdvanceAt, mtd }: Props) {
  return (
    <section
      className="rounded-sm border border-[#E5E7EB] bg-white p-3"
      data-testid="banking-factoring-summary-card"
      data-c64-factoring-card="1"
    >
      <div className="flex items-center justify-between">
        <Link to="/factoring" className="text-xs font-bold uppercase tracking-wide text-[#4B5563] hover:underline">
          Factoring · virtual bank
        </Link>
        <Link to="/factoring" className="text-xs font-medium text-[#14314F] hover:underline">
          Open Factoring
        </Link>
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <dt className="text-[#6B7280]">Reserves held</dt>
        <dd className="text-right font-medium tabular-nums text-[#0F1219]">{reserve == null ? "—" : formatUsd(reserve)}</dd>
        <dt className="text-[#6B7280]" title="Gross invoice value purchased by the factor this month (posted purchases)">Purchased MTD (gross)</dt>
        <EngineLine kpi={mtd?.purchased ?? null} failed={Boolean(mtd?.failed)} testId="banking-factoring-card-purchased-mtd" to="/factoring/purchase-report" />
        <dt className="text-[#6B7280]">Outstanding liability</dt>
        <dd className="text-right font-medium tabular-nums text-[#0F1219]">
          {formatUsd(outstandingLiability)}
        </dd>
        <dt className="text-[#6B7280]" title="Faro default interest accrued this month on purchases past 30 days">+30d aging fees MTD</dt>
        <EngineLine kpi={mtd?.defaultInterest ?? null} failed={Boolean(mtd?.failed)} testId="banking-factoring-card-aging-fees-mtd" to="/factoring/fees-paid" />
        <dt className="text-[#6B7280]">Last advance</dt>
        <dd className="text-right text-[#0F1219]">
          {lastAdvanceAt ? String(lastAdvanceAt).slice(0, 10) : "—"}
        </dd>
      </dl>
    </section>
  );
}
