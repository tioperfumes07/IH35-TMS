import { Link } from "react-router-dom";
import { formatUsd } from "../../../lib/money";

type Props = {
  reserve: number;
  outstandingLiability: number;
  lastAdvanceAt: string | null;
};

/**
 * C-64 — Factoring is NOT a tab. Summary card deep-links to the Factoring module.
 */
export function FactoringSummaryCard({ reserve, outstandingLiability, lastAdvanceAt }: Props) {
  return (
    <section
      className="rounded-sm border border-[#E5E7EB] bg-white p-3"
      data-testid="banking-factoring-summary-card"
      data-c64-factoring-card="1"
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wide text-[#4B5563]">Factoring</p>
        <Link to="/factoring" className="text-xs font-medium text-[#14314F] hover:underline">
          Open Factoring
        </Link>
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <dt className="text-[#6B7280]">Reserves held</dt>
        <dd className="text-right font-medium tabular-nums text-[#0F1219]">{formatUsd(reserve)}</dd>
        <dt className="text-[#6B7280]">Outstanding liability</dt>
        <dd className="text-right font-medium tabular-nums text-[#0F1219]">
          {formatUsd(outstandingLiability)}
        </dd>
        <dt className="text-[#6B7280]">Last advance</dt>
        <dd className="text-right text-[#0F1219]">
          {lastAdvanceAt ? String(lastAdvanceAt).slice(0, 10) : "—"}
        </dd>
      </dl>
    </section>
  );
}
