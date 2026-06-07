/**
 * GAP-68 — Safety Officer home KPI bar
 */

import { KpiCard } from "../layout/KpiCard";

export type SafetyKpiSnapshot = {
  open_dvir_major_defects: number;
  hos_violations_today: number;
  expiring_certs_30d: number;
};

type Props = {
  kpis: SafetyKpiSnapshot | null | undefined;
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

export function SafetyKpiBar({ kpis, loading }: Props) {
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
    open_dvir_major_defects: 0,
    hos_violations_today: 0,
    expiring_certs_30d: 0,
  };

  return (
    <div className="grid gap-3 sm:grid-cols-3" aria-label="Safety officer KPIs">
      <KpiTile
        label="Open DVIR major defects"
        value={snapshot.open_dvir_major_defects}
        hint="Major/critical defects awaiting resolution"
        accent={snapshot.open_dvir_major_defects > 0 ? ACCENT.warning : ACCENT.neutral}
      />
      <KpiTile
        label="HOS violations today"
        value={snapshot.hos_violations_today}
        hint="Violations recorded today"
        accent={snapshot.hos_violations_today > 0 ? ACCENT.warning : ACCENT.neutral}
      />
      <KpiTile
        label="Certs expiring (30d)"
        value={snapshot.expiring_certs_30d}
        hint="CDL, medical, hazmat, TWIC within 30 days"
        accent={snapshot.expiring_certs_30d > 0 ? ACCENT.warning : ACCENT.neutral}
      />
    </div>
  );
}
