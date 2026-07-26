/**
 * GAP-69 — Driver Manager home KPI bar
 */

import { DrillKpiCard } from "../layout/DrillKpiCard";

export type DriverManagerKpiSnapshot = {
  unread_driver_comms: number;
  late_arrivals_7d: number;
  pending_settlements: number;
};

type Props = {
  kpis: DriverManagerKpiSnapshot | null | undefined;
  loading?: boolean;
};

const ACCENT = {
  warning: "#d97706",
  neutral: undefined,
} as const;

// C8: `to` is REQUIRED here — every tile on this bar drills to its records — and `value` accepts
// null so an absent snapshot renders "—" instead of a fabricated 0.
function KpiTile({
  label,
  value,
  hint,
  accent,
  to,
}: {
  label: string;
  value: number | null;
  hint: string;
  accent?: string;
  to: string;
}) {
  return <DrillKpiCard size="md" label={label} value={value} hint={hint} accent={accent} to={to} />;
}

export function DriverManagerKpiBar({ kpis, loading }: Props) {
  if (loading) {
    return (
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="h-20 animate-pulse rounded-sm border border-slate-200 bg-slate-50" />
        <div className="h-20 animate-pulse rounded-sm border border-slate-200 bg-slate-50" />
        <div className="h-20 animate-pulse rounded-sm border border-slate-200 bg-slate-50" />
      </div>
    );
  }

  // C8 · HONEST UI: an absent payload renders "—", not a reassuring row of zeroes.
  const snapshot: Partial<DriverManagerKpiSnapshot> = kpis ?? {};
  const value = (key: keyof DriverManagerKpiSnapshot) => snapshot[key] ?? null;
  // Accent only when there is a real, positive reading — never because a value is absent.
  const elevated = (key: keyof DriverManagerKpiSnapshot) => typeof snapshot[key] === "number" && (snapshot[key] as number) > 0;

  return (
    <div className="grid gap-3 sm:grid-cols-3" aria-label="Driver manager KPIs">
      <KpiTile
        label="Unread driver comms"
        value={value("unread_driver_comms")}
        hint="Inbound messages from drivers awaiting review"
        accent={elevated("unread_driver_comms") ? ACCENT.warning : ACCENT.neutral}
        to="/drivers/messages"
      />
      <KpiTile
        label="Late arrivals (7d)"
        value={value("late_arrivals_7d")}
        hint="Stop arrivals past scheduled window this week"
        accent={elevated("late_arrivals_7d") ? ACCENT.warning : ACCENT.neutral}
        to="/dispatch/alerts/late-arrivals"
      />
      <KpiTile
        label="Pending settlements"
        value={value("pending_settlements")}
        hint="Draft or submitted settlements needing validation"
        accent={elevated("pending_settlements") ? ACCENT.warning : ACCENT.neutral}
        to="/driver-finance/settlements"
      />
    </div>
  );
}
