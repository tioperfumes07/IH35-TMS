import { DrillKpiCard } from "../../../components/layout/DrillKpiCard";

export const LIABILITY_TABS = [
  "All Active",
  "By Driver",
  "By Type",
  "Pending Acknowledgments",
  "Paid Off",
] as const;
export type LiabilityTab = (typeof LIABILITY_TABS)[number];

type Props = {
  kpis: Record<string, unknown> | undefined;
  /** C8 — a KPI drills to the tab that holds the records it counted. */
  onSelectTab: (tab: LiabilityTab) => void;
};

/**
 * C8 — the liabilities KPI strip.
 *
 * Was: six hand-rolled <div> tiles, every one a dead click, every value `Number(x ?? 0)` so a failed
 * query rendered `$0.00` of driver debt. Now each tile opens the tab holding its records, and an
 * absent figure renders "—". Same six labels, same order.
 */

/** Absent stays absent — a money figure especially must not default to zero. */
function amount(kpis: Record<string, unknown> | undefined, key: string): number | null {
  const raw = kpis?.[key];
  if (raw === null || raw === undefined) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}
const usd = (n: number | null) => (n === null ? null : `$${n.toFixed(2)}`);

export function LiabilitiesKpiRow({ kpis, onSelectTab }: Props) {
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
      <DrillKpiCard
        label="Total Active Debt"
        value={amount(kpis, "total_active_debt")}
        onClick={() => onSelectTab("All Active")}
      />
      <DrillKpiCard
        label="Drivers w/ Debt"
        value={amount(kpis, "drivers_with_debt")}
        onClick={() => onSelectTab("By Driver")}
      />
      <DrillKpiCard
        label="Pending Acks"
        value={amount(kpis, "pending_acks")}
        onClick={() => onSelectTab("Pending Acknowledgments")}
      />
      <DrillKpiCard
        label="Equipment Loss YTD"
        value={usd(amount(kpis, "equipment_loss_ytd"))}
        onClick={() => onSelectTab("By Type")}
      />
      {/* Civil fines are recorded in Safety — A23-9 merged them into External Fines. */}
      <DrillKpiCard
        label="Civil Fines YTD"
        value={usd(amount(kpis, "civil_fines_ytd"))}
        to="/safety/external-fines"
      />
      <DrillKpiCard
        label="Avg Time to Pay-Off (days)"
        value={amount(kpis, "avg_days_to_payoff")}
        onClick={() => onSelectTab("Paid Off")}
      />
    </div>
  );
}
