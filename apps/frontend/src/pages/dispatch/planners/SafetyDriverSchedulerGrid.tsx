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
import { PlannerAxisHead, plannerFrozenThClass } from "./PlannerAxisHead";
import { plannerDayBodyClass, todayYmdAmericaChicago } from "./plannerTimeAxis";

function leaveCellClass(leaveType: string | undefined): string {
  if (leaveType === "vacation") return "bg-slate-100";
  if (leaveType === "sick") return "bg-slate-100";
  if (leaveType === "personal") return "bg-orange-100";
  if (leaveType === "wfh") return "bg-slate-100";
  return "bg-white";
}

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
        <div className="max-w-[calc(100vw-48px)] overflow-x-auto rounded-sm border border-gray-200 bg-white">
        <table className="min-w-max border-collapse text-[10px]">
          <PlannerAxisHead
            days={days}
            frozenColSpan={2}
            frozenDayCells={
              <>
                <th className={plannerFrozenThClass(true)}>Driver</th>
                <th className={plannerFrozenThClass()}>Unit</th>
              </>
            }
          />
          <tbody>
            {drivers.length === 0 ? (
              <tr>
                <td
                  colSpan={2 + days.length}
                  data-testid="dispatch-driver-planner-honest-empty"
                  className="px-3 py-4 text-center text-sm text-gray-500"
                >
                  No drivers in this company for the selected range. Add drivers under Drivers / Lists — leave cells
                  appear here once scheduler leave rows exist for those drivers.
                </td>
              </tr>
            ) : null}
            {drivers.map((dr) => {
              const driverId = String(dr.driver_id);
              const name = String(dr.driver_name ?? "");
              const unitId = dr.unit_id ? String(dr.unit_id) : null;
              const unit = dr.unit_number ? String(dr.unit_number) : null;
              return (
                <tr key={driverId} className="h-[34px] border-t border-gray-100">
                  <td className="sticky left-0 z-10 border-r-2 border-slate-400 bg-white px-2 py-0.5 text-xs font-medium text-gray-900"><EntityLinkOrTombstone kind="driver" id={driverId} name={name} noun="Driver" /></td>
                  <td className="border-r-2 border-slate-400 px-1 py-0.5 text-gray-600"><EntityLinkOrTombstone kind="unit" id={unitId} name={unit} noun="Unit" /></td>
                  {days.map((d) => {
                    const lt = cellByDriverDay.get(`${driverId}|${d}`);
                    const label = lt ? String(lt).slice(0, 3) : "";
                    return (
                      <td key={d} className={plannerDayBodyClass(d, todayYmdAmericaChicago(), leaveCellClass(lt))} title={lt ?? ""}>
                        <span className="text-[9px] text-gray-700">{label}</span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

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
