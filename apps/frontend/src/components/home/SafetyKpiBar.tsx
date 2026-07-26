/**
 * GAP-68 — Safety Officer home KPI bar
 */

import { DrillKpiCard } from "../layout/DrillKpiCard";

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

export function SafetyKpiBar({ kpis, loading }: Props) {
  if (loading) {
    return (
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="h-20 animate-pulse rounded-sm border border-slate-200 bg-slate-50" />
        <div className="h-20 animate-pulse rounded-sm border border-slate-200 bg-slate-50" />
        <div className="h-20 animate-pulse rounded-sm border border-slate-200 bg-slate-50" />
      </div>
    );
  }

  // C8 · HONEST UI: an absent payload must NOT be rendered as an all-clear. A safety bar showing
  // "0 open DVIR major defects" because the query returned nothing is the most dangerous lie this
  // app can tell; null renders "—".
  const snapshot: Partial<SafetyKpiSnapshot> = kpis ?? {};
  const value = (key: keyof SafetyKpiSnapshot) => snapshot[key] ?? null;
  // Accent only when there is a real, positive reading — never because a value is absent.
  const elevated = (key: keyof SafetyKpiSnapshot) => typeof snapshot[key] === "number" && (snapshot[key] as number) > 0;

  return (
    <div className="grid gap-3 sm:grid-cols-3" aria-label="Safety officer KPIs">
      <KpiTile
        label="Open DVIR major defects"
        value={value("open_dvir_major_defects")}
        hint="Major/critical defects awaiting resolution"
        accent={elevated("open_dvir_major_defects") ? ACCENT.warning : ACCENT.neutral}
        to="/safety/idvr"
      />
      <KpiTile
        label="HOS violations today"
        value={value("hos_violations_today")}
        hint="Violations recorded today"
        accent={elevated("hos_violations_today") ? ACCENT.warning : ACCENT.neutral}
        to="/safety/hos/exceptions"
      />
      <KpiTile
        label="Certs expiring (30d)"
        value={value("expiring_certs_30d")}
        hint="CDL, medical, hazmat, TWIC within 30 days"
        accent={elevated("expiring_certs_30d") ? ACCENT.warning : ACCENT.neutral}
        to="/safety/cert-expiry"
      />
    </div>
  );
}
