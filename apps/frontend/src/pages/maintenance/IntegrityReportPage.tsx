/**
 * C-36 — Maintenance Integrity Report tab.
 * Surfaces CC-2 integrity engine scorecards (driver attribution / fuel anomalies).
 * Backend: GET /api/v1/maintenance/integrity/driver-scorecard + fuel-anomalies.
 *
 * ROUND 305 (E-26/E-27, owner order 2026-10-01): three more sections, each built end-to-end on
 * its own engine, screens included —
 *   fuel-integrity    two-independent-signal fuel integrity (fuel-integrity.service.ts)
 *   findings          geofence findings, attributed-or-gap (integrity-findings-attribution.service.ts)
 *   damage-events     damage/accident/tire events, attributed-or-gap (damage-event-attribution.service.ts)
 * Every one of these states a NAMED reason when it cannot attribute a row to a driver — never a
 * silent drop and never a guess. Flags are evidence to review, never an accusation.
 */
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../api/client";
import { ListErrorState } from "../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { EntityLinkOrTombstone } from "../../components/shared/EntityLinkOrTombstone";
import { StatusBadge } from "../../components/layout/StatusBadge";
import { formatDateUS, formatDateTimeUS } from "../../lib/formatDate";
import { formatUsdCents } from "../../lib/money";

type ScorecardRow = {
  driver_id: string;
  driver_name?: string | null;
  mpg?: number | null;
  mpg_reason?: string | null;
  gallons?: number | null;
  miles?: number | null;
  accidents?: number | null;
  damage_wos?: number | null;
  tire_events?: number | null;
  unattributed_events?: number | null;
};

/** B-50 evidence: one fuel fill, as a reviewer needs to see it. */
type FillEvidence = {
  fuel_transaction_id: string;
  transaction_at: string;
  gallons: number | null;
  total_cost_cents: number | null;
  unit_id: string | null;
  unit_number: string | null;
  vendor_name: string | null;
  location: string | null;
};

type AnomalyRow = {
  // The flattened fuel-anomalies row is `{ driver_id, ...flag }` — flag is a tagged union by
  // `kind`, never a `flag`/`detail` string pair (fuel-driver-scorecard.service.ts).
  driver_id?: string | null;
  driver_name?: string | null;
  kind?:
    | "mpg_below_fleet_floor"
    | "tank_overflow"
    | "impossible_distance_refuel"
    | "gallons_exceed_worst_case_consumption"
    | null;
  period_start?: string | null;
  period_end?: string | null;
  arithmetic?: string | null;
  evidence_fills?: FillEvidence[] | null;
  transaction_at?: string | null;
  transaction_at_a?: string | null;
  // kind-specific fields (FuelAnomalyFlag union, fuel-driver-scorecard.service.ts) — used to build
  // a short Detail cell per kind, distinct from the full-sentence Arithmetic cell.
  driver_mpg?: number | null;
  threshold_mpg?: number | null;
  gallons?: number | null;
  tank_capacity_gal?: number | null;
  minutes_apart?: number | null;
  miles_apart?: number | null;
  gallons_bought?: number | null;
  max_plausible_gallons?: number | null;
  // kept for forward-compat with any still-flowing older shape
  unit_id?: string | null;
  unit_number?: string | null;
  flag?: string | null;
  detail?: string | null;
  occurred_at?: string | null;
};

type FuelSignal = {
  signal: "mpg_odometer_snapshot" | "mpg_stop_odometer" | "relay_fill_presence" | "samsara_fuel_energy";
  sources: string[];
  verdict: "anomalous" | "normal" | "unavailable";
  arithmetic: string;
  reason: string;
  evidence: unknown[];
};

type FuelIntegrityRow = {
  driver_id: string;
  driver_name?: string | null;
  period_start: string;
  period_end: string;
  status: "finding" | "suspicion" | "clear" | "insufficient_data";
  basis: string;
  signals: FuelSignal[];
};

type FindingGapReason = "no_unit_on_finding" | "unit_never_assigned" | "no_driver_logged_in" | "no_assignment_at_time";

type FindingRow = {
  finding_id: string;
  anomaly_class: string;
  occurred_at: string | null;
  unit_id: string | null;
  unit_number: string | null;
  unit_fleet_class: string | null;
  driver_id: string | null;
  driver_name?: string | null;
  attribution: "attributed" | "gap";
  gap_reason: FindingGapReason | null;
  attribution_note: string;
};

type FindingsSummary = {
  total: number;
  attributed: number;
  gap: number;
  gap_by_reason: Record<FindingGapReason, number>;
};

type DamageEventRow = {
  source: string;
  event_id: string;
  occurred_at: string | null;
  unit_id: string | null;
  unit_number: string | null;
  unit_fleet_class: string | null;
  cost_cents: number | null;
  detail: string | null;
  driver_id: string | null;
  driver_name?: string | null;
  attribution: "attributed" | "gap";
  gap_reason: FindingGapReason | null;
  attribution_note: string;
};

type DamageSummary = {
  total: number;
  attributed: number;
  gap: number;
  by_unit_fleet_class: Record<string, number>;
};

const LINK = "text-[#1F2A44] hover:underline";

const STATUS_BADGE_VARIANT: Record<FuelIntegrityRow["status"], "crit" | "warn" | "positive" | "neutral"> = {
  finding: "crit",
  suspicion: "warn",
  clear: "positive",
  insufficient_data: "neutral",
};

const ATTRIBUTION_BADGE_VARIANT: Record<"attributed" | "gap", "positive" | "warn"> = {
  attributed: "positive",
  gap: "warn",
};

const GAP_REASON_LABEL: Record<FindingGapReason, string> = {
  no_unit_on_finding: "No unit on record",
  unit_never_assigned: "Unit never assigned",
  no_driver_logged_in: "No driver logged in",
  no_assignment_at_time: "No assignment at that time",
};

function query(companyId: string) {
  return new URLSearchParams({ operating_company_id: companyId }).toString();
}

/** "date · unit · gallons gal · $cost", joined — one fill evidence line, never just an id. */
function formatFillEvidence(fill: FillEvidence): string {
  const parts = [
    fill.transaction_at ? formatDateTimeUS(fill.transaction_at) : null,
    fill.unit_number ?? null,
    fill.gallons != null ? `${fill.gallons} gal` : null,
    fill.total_cost_cents != null ? formatUsdCents(fill.total_cost_cents) : null,
  ].filter(Boolean);
  return parts.join(" · ");
}

function formatEvidenceFills(fills: FillEvidence[] | null | undefined): string {
  if (!fills || fills.length === 0) return "—";
  return fills.map(formatFillEvidence).join("; ");
}

const ANOMALY_FLAG_LABEL: Record<NonNullable<AnomalyRow["kind"]>, string> = {
  mpg_below_fleet_floor: "MPG below fleet floor",
  tank_overflow: "Tank overflow",
  impossible_distance_refuel: "Impossible distance refuel",
  gallons_exceed_worst_case_consumption: "Gallons exceed worst-case consumption",
};

function anomalyFlagLabel(row: AnomalyRow): string {
  if (row.kind) return ANOMALY_FLAG_LABEL[row.kind] ?? row.kind;
  return row.flag ?? "—";
}

/** A short, kind-specific summary — the Arithmetic cell carries the full sentence. */
function anomalyDetail(row: AnomalyRow): string {
  switch (row.kind) {
    case "mpg_below_fleet_floor":
      return `${row.driver_mpg ?? "—"} MPG (floor ${row.threshold_mpg ?? "—"})`;
    case "tank_overflow":
      return `${row.gallons ?? "—"} gal (capacity ${row.tank_capacity_gal ?? "—"})`;
    case "impossible_distance_refuel":
      return `${row.miles_apart ?? "—"} mi in ${row.minutes_apart ?? "—"} min`;
    case "gallons_exceed_worst_case_consumption":
      return `${row.gallons_bought ?? "—"} gal vs ${row.max_plausible_gallons ?? "—"} max plausible`;
    default:
      return row.detail ?? "—";
  }
}

/** The single evidence unit for a flag, when every fill in it shares one (tank overflow / impossible
 *  distance refuel); a period-level flag (MPG / worst-case) can span several units, so this is left
 *  blank rather than guessing one. */
function anomalyUnitLabel(row: AnomalyRow): string | null {
  if (row.unit_number) return row.unit_number;
  const fills = row.evidence_fills ?? [];
  const uniqueUnits = new Set(fills.map((f) => f.unit_number).filter(Boolean));
  if (uniqueUnits.size === 1) return [...uniqueUnits][0] ?? null;
  if (uniqueUnits.size > 1) return `${uniqueUnits.size} units`;
  return null;
}

function anomalyWhen(row: AnomalyRow): string | null {
  const at = row.occurred_at ?? row.transaction_at ?? row.transaction_at_a ?? null;
  return at ? formatDateTimeUS(at) : null;
}

export function IntegrityReportPage({ operatingCompanyId }: { operatingCompanyId: string }) {
  const scorecardQuery = useQuery({
    queryKey: ["maintenance", "integrity", "driver-scorecard", operatingCompanyId],
    queryFn: () =>
      apiRequest<{ rows?: ScorecardRow[]; total_count?: number }>(
        `/api/v1/maintenance/integrity/driver-scorecard?${query(operatingCompanyId)}`,
      ),
    enabled: Boolean(operatingCompanyId),
  });

  const anomaliesQuery = useQuery({
    queryKey: ["maintenance", "integrity", "fuel-anomalies", operatingCompanyId],
    queryFn: () =>
      apiRequest<{ rows?: AnomalyRow[]; anomalies?: AnomalyRow[]; total_count?: number }>(
        `/api/v1/maintenance/integrity/fuel-anomalies?${query(operatingCompanyId)}`,
      ),
    enabled: Boolean(operatingCompanyId),
  });

  // ROUND 305 B-47 — two-independent-signal fuel integrity.
  const fuelIntegrityQuery = useQuery({
    queryKey: ["maintenance", "integrity", "fuel-integrity", operatingCompanyId],
    queryFn: () =>
      apiRequest<{ rows: FuelIntegrityRow[]; coverage?: Record<string, number> }>(
        `/api/v1/maintenance/integrity/fuel-integrity?${query(operatingCompanyId)}`,
      ),
    enabled: Boolean(operatingCompanyId),
  });

  // ROUND 305 B-49 — geofence integrity findings, attributed or gap.
  const findingsQuery = useQuery({
    queryKey: ["maintenance", "integrity", "findings", operatingCompanyId],
    queryFn: () =>
      apiRequest<{ rows: FindingRow[]; summary: FindingsSummary }>(
        `/api/v1/maintenance/integrity/findings?${query(operatingCompanyId)}`,
      ),
    enabled: Boolean(operatingCompanyId),
  });

  // ROUND 305 B-48 — damage / accident / tire events, attributed or gap.
  const damageEventsQuery = useQuery({
    queryKey: ["maintenance", "integrity", "damage-events", operatingCompanyId],
    queryFn: () =>
      apiRequest<{ events: DamageEventRow[]; summary: DamageSummary }>(
        `/api/v1/maintenance/integrity/damage-events?${query(operatingCompanyId)}`,
      ),
    enabled: Boolean(operatingCompanyId),
  });

  const scorecardCols: ParityColumn<ScorecardRow>[] = [
    {
      key: "driver",
      label: "Driver",
      render: (row) => (
        <EntityLinkOrTombstone kind="driver" id={row.driver_id} name={row.driver_name} noun="Driver" className={LINK} />
      ),
    },
    {
      key: "mpg",
      label: "MPG",
      render: (row) =>
        row.mpg == null ? (
          <span className="text-[#6B7280]" title={row.mpg_reason ?? undefined}>
            {row.mpg_reason === "odometer_gap" ? "— (odometer gap)" : "—"}
          </span>
        ) : (
          <span className="tabular-nums">{Number(row.mpg).toFixed(2)}</span>
        ),
    },
    {
      key: "gallons",
      label: "Gallons",
      render: (row) => (row.gallons == null ? "—" : <span className="tabular-nums">{Number(row.gallons).toLocaleString()}</span>),
    },
    {
      key: "miles",
      label: "Miles",
      render: (row) => (row.miles == null ? "—" : <span className="tabular-nums">{Number(row.miles).toLocaleString()}</span>),
    },
    {
      key: "accidents",
      label: "Accidents",
      render: (row) => (row.accidents == null ? "—" : <span className="tabular-nums">{row.accidents}</span>),
    },
    {
      key: "damage",
      label: "Damage WOs",
      render: (row) => (row.damage_wos == null ? "—" : <span className="tabular-nums">{row.damage_wos}</span>),
    },
    {
      key: "tires",
      label: "Tire events",
      render: (row) => (row.tire_events == null ? "—" : <span className="tabular-nums">{row.tire_events}</span>),
    },
    {
      key: "unattr",
      label: "Unattributed",
      render: (row) =>
        row.unattributed_events == null ? "—" : <span className="tabular-nums">{row.unattributed_events}</span>,
    },
  ];

  const anomalyCols: ParityColumn<AnomalyRow>[] = [
    {
      key: "driver",
      label: "Driver",
      render: (row) =>
        row.driver_id ? (
          <EntityLinkOrTombstone kind="driver" id={row.driver_id} name={row.driver_name} noun="Driver" className={LINK} />
        ) : (
          "—"
        ),
    },
    {
      key: "unit",
      label: "Unit", sortable: true,
      render: (row) => anomalyUnitLabel(row) ?? "—",
    },
    { key: "flag", label: "Flag", sortable: true, render: (row) => anomalyFlagLabel(row) },
    { key: "detail", label: "Detail", sortable: true, render: (row) => anomalyDetail(row) },
    { key: "when", label: "When", sortable: true, render: (row) => anomalyWhen(row) ?? "—" },
    {
      // ROUND 305 B-50 — the flag's own period, so a reviewer can see what window it was measured over.
      key: "period",
      label: "Period",
      render: (row) =>
        row.period_start && row.period_end ? `${formatDateUS(row.period_start)} – ${formatDateUS(row.period_end)}` : "—",
    },
    {
      key: "arithmetic",
      label: "Arithmetic", sortable: true,
      allowWrap: true,
      render: (row) => row.arithmetic ?? "—",
    },
    {
      key: "evidence",
      label: "Evidence", sortable: true,
      allowWrap: true,
      render: (row) => formatEvidenceFills(row.evidence_fills),
    },
  ];

  // ROUND 305 B-47 — fuel integrity: two independent signals.
  const fuelIntegrityCols: ParityColumn<FuelIntegrityRow>[] = [
    {
      key: "driver",
      label: "Driver",
      render: (row) => (
        <EntityLinkOrTombstone kind="driver" id={row.driver_id} name={row.driver_name} noun="Driver" className={LINK} />
      ),
    },
    {
      key: "status",
      label: "Status",
      render: (row) => <StatusBadge variant={STATUS_BADGE_VARIANT[row.status]}>{row.status.replace(/_/g, " ")}</StatusBadge>,
    },
    { key: "basis", label: "Basis", sortable: true, allowWrap: true, render: (row) => row.basis },
    {
      key: "signals",
      label: "Signals",
      allowWrap: true,
      render: (row) => (
        <div className="space-y-0.5">
          {row.signals.map((signal) => (
            <div key={signal.signal}>
              <span className="font-semibold">{signal.signal}</span>: {signal.verdict} — {signal.arithmetic}
            </div>
          ))}
        </div>
      ),
    },
  ];

  // ROUND 305 B-49 — geofence findings, attributed or gap.
  const findingsCols: ParityColumn<FindingRow>[] = [
    { key: "occurred_at", label: "Occurred", sortable: true, render: (row) => (row.occurred_at ? formatDateTimeUS(row.occurred_at) : "—") },
    { key: "anomaly_class", label: "Class", sortable: true, render: (row) => row.anomaly_class },
    {
      key: "unit",
      label: "Unit",
      render: (row) =>
        row.unit_id ? (
          <EntityLinkOrTombstone kind="unit" id={row.unit_id} name={row.unit_number} noun="Unit" className={LINK} />
        ) : (
          "—"
        ),
    },
    { key: "unit_fleet_class", label: "Fleet class", sortable: true, render: (row) => row.unit_fleet_class ?? "—" },
    {
      key: "driver",
      label: "Driver",
      render: (row) =>
        row.driver_id ? (
          <EntityLinkOrTombstone kind="driver" id={row.driver_id} name={row.driver_name} noun="Driver" className={LINK} />
        ) : (
          "—"
        ),
    },
    {
      key: "attribution",
      label: "Attribution",
      render: (row) => <StatusBadge variant={ATTRIBUTION_BADGE_VARIANT[row.attribution]}>{row.attribution}</StatusBadge>,
    },
    {
      key: "gap_reason",
      label: "Gap reason / note", sortable: true,
      allowWrap: true,
      render: (row) => (row.gap_reason ? GAP_REASON_LABEL[row.gap_reason] : row.attribution_note),
    },
  ];

  // ROUND 305 B-48 — damage / accident / tire events, attributed or gap.
  const damageEventCols: ParityColumn<DamageEventRow>[] = [
    { key: "occurred_at", label: "Occurred", sortable: true, render: (row) => (row.occurred_at ? formatDateTimeUS(row.occurred_at) : "—") },
    { key: "source", label: "Source", sortable: true, render: (row) => row.source.replace(/_/g, " ") },
    {
      key: "unit",
      label: "Unit",
      render: (row) =>
        row.unit_id ? (
          <EntityLinkOrTombstone kind="unit" id={row.unit_id} name={row.unit_number} noun="Unit" className={LINK} />
        ) : (
          "—"
        ),
    },
    { key: "unit_fleet_class", label: "Fleet class", sortable: true, render: (row) => row.unit_fleet_class ?? "—" },
    {
      key: "driver",
      label: "Driver",
      render: (row) =>
        row.driver_id ? (
          <EntityLinkOrTombstone kind="driver" id={row.driver_id} name={row.driver_name} noun="Driver" className={LINK} />
        ) : (
          "—"
        ),
    },
    { key: "cost_cents", label: "Cost", sortable: true, render: (row) => (row.cost_cents == null ? "—" : formatUsdCents(row.cost_cents)) },
    { key: "detail", label: "Detail", sortable: true, render: (row) => row.detail ?? "—" },
    {
      key: "attribution",
      label: "Attribution",
      render: (row) => <StatusBadge variant={ATTRIBUTION_BADGE_VARIANT[row.attribution]}>{row.attribution}</StatusBadge>,
    },
    {
      key: "gap_reason",
      label: "Gap reason / note", sortable: true,
      allowWrap: true,
      render: (row) => (row.gap_reason ? GAP_REASON_LABEL[row.gap_reason] : row.attribution_note),
    },
  ];

  const scoreRows = scorecardQuery.data?.rows ?? [];
  const anomalyRows = anomaliesQuery.data?.rows ?? anomaliesQuery.data?.anomalies ?? [];
  const fuelIntegrityRows = fuelIntegrityQuery.data?.rows ?? [];
  const findingRows = findingsQuery.data?.rows ?? [];
  const findingsSummary = findingsQuery.data?.summary ?? null;
  const damageEventRows = damageEventsQuery.data?.events ?? [];
  const damageSummary = damageEventsQuery.data?.summary ?? null;

  return (
    <div className="space-y-4" data-testid="maintenance-integrity-report-tab" data-maintenance-tab="integrity_report">
      <div>
        <h2 className="text-xs font-bold uppercase tracking-wide text-[#4B5563]">Driver scorecard</h2>
        <p className="text-xs text-[#6B7280]">
          Attribution uses the assignment window at the event time — never today&apos;s assigned driver.
        </p>
        {scorecardQuery.isError ? (
          <ListErrorState
            title="Couldn't load driver scorecard"
            status={0}
            message={(scorecardQuery.error as Error)?.message}
            onRetry={() => void scorecardQuery.refetch()}
          />
        ) : (
          <ParityTable
            rows={scoreRows}
            columns={scorecardCols}
            loading={scorecardQuery.isPending}
            storageKey="maint-integrity-scorecard"
            emptyText="No driver scorecard rows yet"
            rowKey={(row) => row.driver_id}
          />
        )}
      </div>
      <div>
        <h2 className="text-xs font-bold uppercase tracking-wide text-[#4B5563]">Fuel anomalies</h2>
        <p className="text-xs text-[#6B7280]">Flags are evidence to review — never an accusation.</p>
        {anomaliesQuery.isError ? (
          <ListErrorState
            title="Couldn't load fuel anomalies"
            status={0}
            message={(anomaliesQuery.error as Error)?.message}
            onRetry={() => void anomaliesQuery.refetch()}
          />
        ) : (
          <ParityTable
            rows={anomalyRows}
            columns={anomalyCols}
            loading={anomaliesQuery.isPending}
            storageKey="maint-integrity-fuel-anomalies"
            emptyText="No fuel anomalies in window"
            rowKey={(row) =>
              `${row.driver_id ?? "x"}-${row.kind ?? row.flag ?? "row"}-${anomalyWhen(row) ?? "no-time"}-${
                row.evidence_fills?.[0]?.fuel_transaction_id ?? ""
              }`
            }
          />
        )}
      </div>

      <div>
        <h2 className="text-xs font-bold uppercase tracking-wide text-[#4B5563]">Fuel integrity (two independent signals)</h2>
        <p className="text-xs text-[#6B7280]">
          A driver is a FINDING only when two signals from independent sources agree; one signal alone is a
          suspicion, never a finding.
        </p>
        {fuelIntegrityQuery.isError ? (
          <ListErrorState
            title="Couldn't load fuel integrity"
            status={0}
            message={(fuelIntegrityQuery.error as Error)?.message}
            onRetry={() => void fuelIntegrityQuery.refetch()}
          />
        ) : (
          <ParityTable
            rows={fuelIntegrityRows}
            columns={fuelIntegrityCols}
            loading={fuelIntegrityQuery.isPending}
            storageKey="maint-integrity-fuel-integrity"
            emptyText="No fuel integrity rows in window"
            rowKey={(row) => row.driver_id}
          />
        )}
      </div>

      <div>
        <h2 className="text-xs font-bold uppercase tracking-wide text-[#4B5563]">Geofence findings — attributed or gap</h2>
        <p className="text-xs text-[#6B7280]">
          A finding this engine cannot place to a driver comes back with a named gap reason — never a guess.
        </p>
        {findingsSummary ? (
          <p className="text-xs text-[#6B7280]">
            {findingsSummary.attributed} attributed · {findingsSummary.gap} gap of {findingsSummary.total} total
            {findingsSummary.gap > 0
              ? ` — gap: ${(Object.entries(findingsSummary.gap_by_reason) as Array<[FindingGapReason, number]>)
                  .filter(([, count]) => count > 0)
                  .map(([reason, count]) => `${GAP_REASON_LABEL[reason]} (${count})`)
                  .join(", ")}`
              : ""}
          </p>
        ) : null}
        {findingsQuery.isError ? (
          <ListErrorState
            title="Couldn't load geofence findings"
            status={0}
            message={(findingsQuery.error as Error)?.message}
            onRetry={() => void findingsQuery.refetch()}
          />
        ) : (
          <ParityTable
            rows={findingRows}
            columns={findingsCols}
            loading={findingsQuery.isPending}
            storageKey="maint-integrity-findings"
            emptyText="No geofence findings in window"
            rowKey={(row) => row.finding_id}
          />
        )}
      </div>

      <div>
        <h2 className="text-xs font-bold uppercase tracking-wide text-[#4B5563]">Damage, accident &amp; tire events</h2>
        <p className="text-xs text-[#6B7280]">
          Every damage / accident / tire event, one row each, with its driver or the named reason it has none.
        </p>
        {damageSummary ? (
          <p className="text-xs text-[#6B7280]">
            {damageSummary.attributed} attributed · {damageSummary.gap} gap of {damageSummary.total} total — by fleet
            class: {Object.entries(damageSummary.by_unit_fleet_class)
              .map(([cls, count]) => `${cls} (${count})`)
              .join(", ") || "—"}
          </p>
        ) : null}
        {damageEventsQuery.isError ? (
          <ListErrorState
            title="Couldn't load damage events"
            status={0}
            message={(damageEventsQuery.error as Error)?.message}
            onRetry={() => void damageEventsQuery.refetch()}
          />
        ) : (
          <ParityTable
            rows={damageEventRows}
            columns={damageEventCols}
            loading={damageEventsQuery.isPending}
            storageKey="maint-integrity-damage-events"
            emptyText="No damage/accident/tire events in window"
            rowKey={(row) => `${row.source}-${row.event_id}`}
          />
        )}
      </div>
    </div>
  );
}
