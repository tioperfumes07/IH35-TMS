import { Link } from "react-router-dom";
import { formatUsd } from "../../../lib/money";

type Props = {
  /** Escrow + cash reserve from the factoring KPI engine (escrow + cash reserve roles); null while loading / on error. */
  reserve: number | null;
  outstandingLiability: number;
  lastAdvanceAt: string | null;
};

/**
 * C-64 — Factoring is NOT a tab. Summary card deep-links to the Factoring module.
 * Rule 07: keep "Factoring · virtual bank" label + honesty deferrals (never invent MTD/aging).
 */
export function FactoringSummaryCard({ reserve, outstandingLiability, lastAdvanceAt }: Props) {
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
        <dt className="text-[#6B7280]">Advances funded MTD</dt>
        <dd
          className="text-right text-[#6B7280]"
          title="No advances_funded_mtd on factoring-virtual API — open Factoring module"
        >
          — (see Factoring module)
        </dd>
        <dt className="text-[#6B7280]">Outstanding liability</dt>
        <dd className="text-right font-medium tabular-nums text-[#0F1219]">
          {formatUsd(outstandingLiability)}
        </dd>
        <dt className="text-[#6B7280]">+30 aging fees</dt>
        <dd
          className="text-right text-[#6B7280]"
          title="No aging_fees_30d field on factoring-virtual — open Chargebacks & Fees"
        >
          — (see Chargebacks & Fees)
        </dd>
        <dt className="text-[#6B7280]">Last advance</dt>
        <dd className="text-right text-[#0F1219]">
          {lastAdvanceAt ? String(lastAdvanceAt).slice(0, 10) : "—"}
        </dd>
      </dl>
    </section>
  );
}
