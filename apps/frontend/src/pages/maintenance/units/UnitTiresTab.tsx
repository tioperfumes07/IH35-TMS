/**
 * Unit Tires Tab — GAP-62 wear chart on unit detail
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../../api/client";
import { TireWearProjectionChart } from "../../../components/maintenance/TireWearProjectionChart";

type TreadMeasurement = {
  uuid: string;
  tire_position: string;
  tread_depth_32nds: number;
  measured_at: string;
  source: string;
};

type ReplacementProjection = {
  tire_position: string;
  threshold_32nds: number;
  current_depth_32nds: number | null;
  projected_replacement_date: string | null;
};

type UnitTiresTabProps = {
  unitId: string;
  companyId: string;
};

function fetchMeasurements(unitId: string, companyId: string, position?: string) {
  const q = new URLSearchParams({ operating_company_id: companyId, unit: unitId });
  if (position) q.set("position", position);
  return apiRequest<{ rows: TreadMeasurement[] }>(`/api/v1/maintenance/tire-tread/measurements?${q.toString()}`);
}

function fetchProjections(unitId: string, companyId: string) {
  const q = new URLSearchParams({ operating_company_id: companyId, unit: unitId });
  return apiRequest<{ rows: ReplacementProjection[] }>(`/api/v1/maintenance/tire-tread/projections?${q.toString()}`);
}

export function UnitTiresTab({ unitId, companyId }: UnitTiresTabProps) {
  const [selectedPosition, setSelectedPosition] = useState<string>("");

  const measurementsQ = useQuery({
    queryKey: ["unit-tire-measurements", unitId, companyId],
    queryFn: () => fetchMeasurements(unitId, companyId),
    enabled: Boolean(unitId && companyId),
  });

  const projectionsQ = useQuery({
    queryKey: ["unit-tire-projections", unitId, companyId],
    queryFn: () => fetchProjections(unitId, companyId),
    enabled: Boolean(unitId && companyId),
  });

  const positions = useMemo(() => {
    const fromMeasurements = (measurementsQ.data?.rows ?? []).map((r) => r.tire_position);
    const fromProjections = (projectionsQ.data?.rows ?? []).map((r) => r.tire_position);
    return Array.from(new Set([...fromMeasurements, ...fromProjections])).sort();
  }, [measurementsQ.data?.rows, projectionsQ.data?.rows]);

  const activePosition = selectedPosition || positions[0] || "";

  const positionMeasurements = useMemo(
    () =>
      (measurementsQ.data?.rows ?? []).filter((row) => row.tire_position === activePosition),
    [measurementsQ.data?.rows, activePosition]
  );

  const projection = useMemo(
    () => (projectionsQ.data?.rows ?? []).find((row) => row.tire_position === activePosition),
    [projectionsQ.data?.rows, activePosition]
  );

  return (
    <section className="space-y-3 rounded border border-gray-200 bg-white p-3" data-testid="unit-tires-tab">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900">Tire Tread Wear</h3>
        <span className="text-xs text-gray-500">CAP-12 projection · DOT thresholds</span>
      </div>

      {measurementsQ.isLoading || projectionsQ.isLoading ? (
        <p className="text-xs text-gray-500">Loading tire wear data...</p>
      ) : null}

      {positions.length === 0 ? (
        <p className="text-xs text-gray-500">No tread measurements recorded for this unit yet.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-1">
            {positions.map((position) => (
              <button
                key={position}
                type="button"
                onClick={() => setSelectedPosition(position)}
                className={`rounded px-2 py-1 text-[11px] font-medium ${
                  activePosition === position ? "bg-sky-100 text-sky-800" : "bg-gray-100 text-gray-700"
                }`}
              >
                {position}
              </button>
            ))}
          </div>
          <TireWearProjectionChart
            position={activePosition}
            measurements={positionMeasurements}
            threshold32nds={projection?.threshold_32nds ?? (activePosition.startsWith("STEER") ? 4 : 2)}
            projectedReplacementDate={projection?.projected_replacement_date}
          />
        </>
      )}
    </section>
  );
}
