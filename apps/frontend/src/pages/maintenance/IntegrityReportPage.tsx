/**
 * C-36 — Maintenance Integrity Report tab.
 * Surfaces CC-2 integrity engine scorecards (driver attribution / fuel anomalies).
 * Backend: GET /api/v1/maintenance/integrity/driver-scorecard + fuel-anomalies.
 */
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../api/client";
import { ListErrorState } from "../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { EntityLinkOrTombstone } from "../../components/shared/EntityLinkOrTombstone";
import { formatDateUS } from "../../lib/formatDate";

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

type AnomalyRow = {
  id?: string;
  driver_id?: string | null;
  driver_name?: string | null;
  unit_id?: string | null;
  unit_number?: string | null;
  flag?: string | null;
  detail?: string | null;
  occurred_at?: string | null;
};

const LINK = "text-slate-700 hover:underline";

function query(companyId: string) {
  return new URLSearchParams({ operating_company_id: companyId }).toString();
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
          <span className="text-slate-500" title={row.mpg_reason ?? undefined}>
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
      label: "Unit",
      render: (row) =>
        row.unit_id ? (
          <EntityLinkOrTombstone kind="unit" id={row.unit_id} name={row.unit_number} noun="Unit" className={LINK} />
        ) : (
          "—"
        ),
    },
    { key: "flag", label: "Flag", render: (row) => row.flag ?? "—" },
    { key: "detail", label: "Detail", render: (row) => row.detail ?? "—" },
    { key: "when", label: "When", render: (row) => (row.occurred_at ? formatDateUS(row.occurred_at) : "—") },
  ];

  const scoreRows = scorecardQuery.data?.rows ?? [];
  const anomalyRows = anomaliesQuery.data?.rows ?? anomaliesQuery.data?.anomalies ?? [];

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
            rowKey={(row) => row.id ?? `${row.driver_id ?? "x"}-${row.unit_id ?? ""}-${row.occurred_at ?? row.flag ?? "row"}`}
          />
        )}
      </div>
    </div>
  );
}
