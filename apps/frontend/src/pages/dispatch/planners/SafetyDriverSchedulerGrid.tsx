/**
 * Mirrors Safety › Driver Scheduler grid (DriverSchedulerGridPage) using the same
 * driverSchedulerOfficeApi data source — import-only reuse; Safety source is not edited.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { driverSchedulerOfficeApi } from "../../../api/driver-scheduler";
import { ListErrorBanner } from "../../../components/shared/ListErrorBanner";
import { EntityLinkOrTombstone } from "../../../components/shared/EntityLinkOrTombstone";
import { userFacingApiError } from "../../../lib/api-error-message";
import type { PlannerRange } from "./planner-range";
import { listPlannerDays } from "./planner-range";
import { PlannerAxisHead } from "./PlannerAxisHead";
import { dwellsFromDayMap, PlannerGrid } from "./PlannerGrid";

void PlannerAxisHead;

type SafetyDriverSchedulerGridProps = {
  operatingCompanyId: string;
  range: PlannerRange;
  testId?: string;
};

export function SafetyDriverSchedulerGrid({ operatingCompanyId, range, testId = "safety-driver-scheduler-grid" }: SafetyDriverSchedulerGridProps) {
  const days = useMemo(() => listPlannerDays(range), [range.start, range.end]);

  const query = useQuery({
    queryKey: ["driver-scheduler", "grid", operatingCompanyId, range.start, range.end],
    enabled: Boolean(operatingCompanyId),
    queryFn: () => driverSchedulerOfficeApi.getGrid(operatingCompanyId, range.start, range.end),
  });

  const cellByDriverDay = useMemo(() => {
    const m = new Map<string, string>();
    for (const row of query.data?.leave_day_cells ?? []) {
      const key = `${String(row.driver_id)}|${String(row.leave_date)}`;
      m.set(key, String(row.leave_type));
    }
    return m;
  }, [query.data?.leave_day_cells]);

  if (query.isLoading) return <div className="text-sm text-gray-500">Loading grid…</div>;
  if (query.isError) {
    return (
      <ListErrorBanner
        message={userFacingApiError(query.error, "Could not load driver scheduler grid")}
        onRetry={() => void query.refetch()}
      />
    );
  }
  if (!query.data) return null;

  const drivers = query.data.drivers ?? [];

  return (
    <div data-testid={testId} className="space-y-2">
      <PlannerGrid
        days={days}
        frozenLabel="Driver"
        frozenPx={280}
        rows={drivers.map((dr) => {
          const driverId = String(dr.driver_id);
          const name = String(dr.driver_name ?? "");
          const unitId = dr.unit_id ? String(dr.unit_id) : null;
          const unit = dr.unit_number ? String(dr.unit_number) : null;
          return {
            id: driverId,
            name: <EntityLinkOrTombstone kind="driver" id={driverId} name={name} noun="Driver" />,
            unit: unit ? <EntityLinkOrTombstone kind="unit" id={unitId} name={unit} noun="Unit" /> : null,
            bars: [],
            dwells: dwellsFromDayMap(days, (d) => cellByDriverDay.get(`${driverId}|${d}`), `leave-${driverId}`),
          };
        })}
        empty={
          <span data-testid="dispatch-driver-planner-honest-empty">
            No drivers in this company for the selected range. Add drivers under Drivers / Lists — leave cells appear
            here once scheduler leave rows exist for those drivers.
          </span>
        }
      />

      {query.data.pending_requests?.length ? (
        <div className="rounded-sm border border-slate-200 bg-slate-100 p-2 text-xs text-slate-700">
          <div className="font-semibold">Pending in this window</div>
          <ul className="list-inside list-disc">
            {query.data.pending_requests.map((p) => (
              <li key={String(p.id)}>
                {String(p.request_number)} · {String(p.leave_type)} · {String(p.start_date)}–{String(p.end_date)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
