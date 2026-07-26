import { DrillKpiCard } from "../../components/layout/DrillKpiCard";

interface KpiStripProps {
  filters: {
    dateFrom: string;
    dateTo: string;
  };
}

/**
 * C8 — the Profitability KPI strip.
 *
 * FINDING, stated rather than papered over: this strip had SIX hardcoded `-` values. It accepted a
 * `filters` prop it never read and issued no query, because the whole Profitability module is an
 * unwired display stub (ByLaneView/ByTypeView/ByCustomerView/ByLoadView all declare `const rows =
 * []` with the same note). There is no profitability aggregate endpoint to call, and building one
 * is a backend change outside this frontend-only sweep.
 *
 * So each tile renders the honest non-navigable state: "—" plus a stated reason, instead of a
 * dash that looks like a real reading of zero activity. These six are the entire `unavailable`
 * budget in scripts/verify-no-dead-kpi-cards.mjs; the budget is shrink-only, so connecting the
 * profitability feed is the only way it ever moves.
 */
const NO_FEED = "Profitability engine feed is not connected — this figure has no source yet.";

const METRICS = [
  "Total Revenue",
  "Total Miles",
  "Avg Rev/Mi",
  "Avg Cost/Mi",
  "Avg Margin/Mi",
  "Loads",
] as const;

export function KpiStrip({ filters }: KpiStripProps) {
  return (
    <div className="space-y-1">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        {METRICS.map((label) => (
          <DrillKpiCard key={label} label={label} value={null} unavailable={NO_FEED} />
        ))}
      </div>
      <div className="text-right text-xs text-gray-400">
        {filters.dateFrom} — {filters.dateTo}
      </div>
    </div>
  );
}
