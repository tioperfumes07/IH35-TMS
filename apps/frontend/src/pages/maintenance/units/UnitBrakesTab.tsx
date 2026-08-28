/**
 * Unit Brakes Tab — GAP-63 / CAP-13
 * Per-unit brake lining history, gauges, and replacement projections.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../../api/client";
import { BrakeWearGauge } from "../../../components/maintenance/BrakeWearGauge";
import { ListErrorState } from "../../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";

type MeasurementRow = {
  uuid: string;
  brake_position: string;
  lining_thickness_mm: number;
  measured_at: string;
  source: string;
  odometer_miles: number | null;
};

type ProjectionRow = {
  brake_position: string;
  threshold_mm: number;
  current_thickness_mm: number | null;
  projected_replacement_date: string | null;
  days_until_replacement: number | null;
};

type MeasurementsResponse = { rows: MeasurementRow[] };
type ProjectionsResponse = { rows: ProjectionRow[] };

type UnitBrakesTabProps = {
  unitId: string;
  companyId: string;
};

function fetchLatestMeasurements(unitId: string, companyId: string) {
  const q = new URLSearchParams({ operating_company_id: companyId, unit: unitId });
  return apiRequest<MeasurementsResponse>(`/api/v1/maintenance/brake-wear/measurements?${q.toString()}`);
}

function fetchProjections(unitId: string, companyId: string) {
  const q = new URLSearchParams({ operating_company_id: companyId, unit: unitId });
  return apiRequest<ProjectionsResponse>(`/api/v1/maintenance/brake-wear/projections?${q.toString()}`);
}

function fetchHistory(unitId: string, companyId: string) {
  const q = new URLSearchParams({
    operating_company_id: companyId,
    unit: unitId,
    scope: "history",
  });
  return apiRequest<MeasurementsResponse>(`/api/v1/maintenance/brake-wear/measurements?${q.toString()}`);
}

export function UnitBrakesTab({ unitId, companyId }: UnitBrakesTabProps) {
  const latestQ = useQuery({
    queryKey: ["unit-brakes-latest", unitId, companyId],
    queryFn: () => fetchLatestMeasurements(unitId, companyId),
    enabled: Boolean(unitId && companyId),
  });

  const projectionsQ = useQuery({
    queryKey: ["unit-brakes-projections", unitId, companyId],
    queryFn: () => fetchProjections(unitId, companyId),
    enabled: Boolean(unitId && companyId),
  });

  const historyQ = useQuery({
    queryKey: ["unit-brakes-history", unitId, companyId],
    queryFn: () => fetchHistory(unitId, companyId),
    enabled: Boolean(unitId && companyId),
  });

  const projectionByPosition = new Map(
    (projectionsQ.data?.rows ?? []).map((row) => [row.brake_position, row])
  );

  const positions = Array.from(
    new Set([
      ...(latestQ.data?.rows ?? []).map((r) => r.brake_position),
      ...(projectionsQ.data?.rows ?? []).map((r) => r.brake_position),
    ])
  ).sort();

  const historyRows = historyQ.data?.rows ?? [];

  const historyColumns = useMemo<ParityColumn<MeasurementRow>[]>(
    () => [
      { key: "brake_position", label: "Position", sortable: true, render: (row) => row.brake_position },
      { key: "lining_thickness_mm", label: "Thickness", render: (row) => `${row.lining_thickness_mm.toFixed(1)} mm` },
      { key: "measured_at", label: "Measured", sortable: true, render: (row) => new Date(row.measured_at).toLocaleDateString() },
      { key: "source", label: "Source", sortable: true, render: (row) => <span className="capitalize">{row.source.replace(/_/g, " ")}</span> },
      { key: "odometer_miles", label: "Odometer", render: (row) => row.odometer_miles?.toLocaleString() ?? "—" },
    ],
    [],
  );

  return (
    <section className="space-y-4" data-testid="unit-brakes-tab">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">Brake Lining Wear</h3>
        <p className="text-xs text-gray-500">CAP-13 measurements · PM / DVIR / brake service</p>
      </div>

      {latestQ.isLoading || projectionsQ.isLoading ? (
        <p className="text-xs text-gray-500">Loading brake wear data...</p>
      ) : null}

      {latestQ.isError ? <ListErrorState status={0} message="Brake measurements could not be loaded." onRetry={() => void latestQ.refetch()} /> : null}
      {projectionsQ.isError ? <ListErrorState status={0} message="Brake wear projections could not be loaded." onRetry={() => void projectionsQ.refetch()} /> : null}

      {positions.length === 0 && !latestQ.isLoading && !latestQ.isError && !projectionsQ.isError ? (
        <p className="rounded-sm border border-dashed border-gray-300 p-4 text-xs text-gray-500">
          No brake lining measurements recorded for this unit.
        </p>
      ) : null}

      {!latestQ.isError && !projectionsQ.isError ? (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="unit-brakes-telemetry">
        {positions.map((position) => {
          const latest = latestQ.data?.rows?.find((r) => r.brake_position === position);
          const projection = projectionByPosition.get(position);
          const threshold = projection?.threshold_mm ?? (position.endsWith("-S") ? 6.4 : 3.2);
          return (
            <BrakeWearGauge
              key={position}
              position={position}
              thicknessMm={latest?.lining_thickness_mm ?? projection?.current_thickness_mm ?? null}
              thresholdMm={threshold}
              projectedDate={projection?.projected_replacement_date}
            />
          );
        })}
      </div>
      ) : null}

      <div className="rounded-sm border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-3 py-2">
          <h4 className="text-xs font-semibold text-gray-900">Measurement history</h4>
        </div>
        {/* CLS-LIST-ERROR-STATE-UNGUARDED: a failed query fell through to the empty state — an outage presenting as a unit with no brake
          history, on a component that gates roadworthiness. */}
        {historyQ.isError ? (
          <ListErrorState
            title="Couldn't load brake history"
            status={0}
            message={(historyQ.error as Error)?.message}
            onRetry={() => void historyQ.refetch()}
          />
        ) : (
        <ParityTable
          rows={historyRows}
          columns={historyColumns}
          rowKey={(row) => row.uuid}
          loading={historyQ.isLoading}
          storageKey="maintenance-unit-brakes-history"
          emptyText="No history yet."
        />
        )}
      </div>
    </section>
  );
}
