import { DrillKpiCard } from "../../../components/layout/DrillKpiCard";

type Props = {
  kpis: Record<string, unknown> | undefined;
};

/**
 * C8 — the safety KPI strip.
 *
 * Was: six hand-rolled <div> tiles, all dead clicks, each reading `Number(kpis?.x ?? 0)`. On a
 * SAFETY surface that zero is the dangerous case — the 2026-07-23 audit found every tile reading 0
 * while the fleet had 82 active drivers, and nothing on screen distinguished that from an
 * all-clear. Every tile now drills to its records, and an absent count renders "—".
 *
 * The `kpis?.<field>` bindings below are deliberately literal: verify-safety-dashboard-kpis-wired
 * parses them to prove every rendered tile is a field the endpoint actually returns. Do not
 * refactor them behind a string-key helper — that guard goes blind.
 */

/** Absent stays absent — never a substituted zero. */
function num(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function SafetyKpiRow({ kpis }: Props) {
  const cards: Array<{ label: string; value: number | null; to: string }> = [
    { label: "Active Drivers", value: num(kpis?.active_drivers), to: "/drivers" },
    { label: "Drivers with Open Fines", value: num(kpis?.drivers_with_open_fines), to: "/safety/internal-fines" },
    {
      // A23-9 merged company violations into External Fines behind a record-type filter — that tab
      // is where these records live, not the violation-TYPES catalog.
      label: "Open Company Violations",
      value: num(kpis?.open_company_violations),
      to: "/safety/external-fines",
    },
    { label: "Critical Integrity Alerts", value: num(kpis?.critical_integrity_alerts), to: "/safety/integrity-alerts" },
    {
      label: "Pending Acknowledgments",
      value: num(kpis?.pending_acknowledgments) ?? num(kpis?.pending_acks),
      to: "/safety/driver-files",
    },
    { label: "Open Liabilities", value: num(kpis?.open_liabilities), to: "/liabilities" },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
      {cards.map((card) => (
        <DrillKpiCard key={card.label} label={card.label} value={card.value} to={card.to} />
      ))}
    </div>
  );
}
