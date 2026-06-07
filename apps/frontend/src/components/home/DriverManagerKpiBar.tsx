/**
 * GAP-69 — Driver Manager home KPI bar
 */

import { KpiCard } from "../layout/KpiCard";

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

function KpiTile({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: number;
  hint: string;
  accent?: string;
}) {
  return (
    <div className="space-y-1">
      <KpiCard label={label} number={value} accent={accent} />
      <p className="px-1 text-[11px] text-slate-500">{hint}</p>
    </div>
  );
}

export function DriverManagerKpiBar({ kpis, loading }: Props) {
  if (loading) {
    return (
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="h-20 animate-pulse rounded border border-slate-200 bg-slate-50" />
        <div className="h-20 animate-pulse rounded border border-slate-200 bg-slate-50" />
        <div className="h-20 animate-pulse rounded border border-slate-200 bg-slate-50" />
      </div>
    );
  }

  const snapshot = kpis ?? {
    unread_driver_comms: 0,
    late_arrivals_7d: 0,
    pending_settlements: 0,
  };

  return (
    <div className="grid gap-3 sm:grid-cols-3" aria-label="Driver manager KPIs">
      <KpiTile
        label="Unread driver comms"
        value={snapshot.unread_driver_comms}
        hint="Inbound messages from drivers awaiting review"
        accent={snapshot.unread_driver_comms > 0 ? ACCENT.warning : ACCENT.neutral}
      />
      <KpiTile
        label="Late arrivals (7d)"
        value={snapshot.late_arrivals_7d}
        hint="Stop arrivals past scheduled window this week"
        accent={snapshot.late_arrivals_7d > 0 ? ACCENT.warning : ACCENT.neutral}
      />
      <KpiTile
        label="Pending settlements"
        value={snapshot.pending_settlements}
        hint="Draft or submitted settlements needing validation"
        accent={snapshot.pending_settlements > 0 ? ACCENT.warning : ACCENT.neutral}
      />
    </div>
  );
}
