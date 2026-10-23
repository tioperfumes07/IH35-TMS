import { DrillKpiCard } from "../../../components/layout/DrillKpiCard";
import { formatUsdTable } from "../../../lib/money";

type Props = {
  kpis?: Record<string, unknown>;
  /** ROUND 443.254 N1 — when mounted under Settlements, keep KPI drills in-module. */
  basePath?: string;
};

/**
 * C8 — the cash-advances KPI strip.
 *
 * Was: five hand-rolled <div> tiles, all dead clicks, all money coerced with `Number(x ?? 0)` so a
 * failed KPI query showed `$0.00` outstanding — the most reassuring possible lie about driver debt.
 * Now every tile links to the tab holding its records (the page already reads `?tab=`), and an
 * absent figure renders "—". Same five labels, same order.
 *
 * ROUND 443.254 N8 — money uses formatUsdTable ($2,575.96 with thousands separators).
 */

/** Absent stays absent. */
function amount(kpis: Record<string, unknown> | undefined, key: string): number | null {
  const raw = kpis?.[key];
  if (raw === null || raw === undefined) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}
const money = (n: number | null) => (n === null ? null : formatUsdTable(n));

export function CashAdvancesKpiRow({ kpis, basePath = "/cash-advances" }: Props) {
  const root = basePath.replace(/\/+$/, "") || "/cash-advances";
  return (
    <div className="grid gap-2 md:grid-cols-5">
      <DrillKpiCard
        size="md"
        label="Total Outstanding"
        value={money(amount(kpis, "total_outstanding"))}
        to={`${root}?tab=outstanding`}
      />
      <DrillKpiCard
        size="md"
        label="MTD Disbursed"
        value={money(amount(kpis, "mtd_disbursed"))}
        to={root}
      />
      <DrillKpiCard
        size="md"
        label="Pending Approval"
        value={amount(kpis, "pending_approval")}
        to={`${root}?tab=pending_approval`}
      />
      <DrillKpiCard
        size="md"
        label="Avg Per Advance"
        value={money(amount(kpis, "avg_per_advance"))}
        to={root}
      />
      <DrillKpiCard
        size="md"
        label="Drivers w/ Active Advance"
        value={amount(kpis, "drivers_with_active")}
        to={`${root}?tab=outstanding`}
      />
    </div>
  );
}
