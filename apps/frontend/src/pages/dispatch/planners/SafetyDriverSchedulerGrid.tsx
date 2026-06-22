/**
 * Mirrors Safety › Driver Scheduler grid (DriverSchedulerGridPage) using the same
 * driverSchedulerOfficeApi data source — import-only reuse; Safety source is not edited.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { driverSchedulerOfficeApi } from "../../../api/driver-scheduler";
import type { PlannerRange } from "./planner-range";
import { listPlannerDays } from "./planner-range";

function leaveCellClass(leaveType: string | undefined): string {
  if (leaveType === "vacation") return "bg-emerald-100";
  if (leaveType === "sick") return "bg-yellow-100";
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
  if (query.isError) return <div className="text-sm text-red-700">Failed to load scheduler grid.</div>;
  if (!query.data) return null;

  return (
    <div data-testid={testId} className="space-y-2">
        <div className="max-w-[calc(100vw-48px)] overflow-x-auto rounded border border-gray-200 bg-white">
        <table className="min-w-max border-collapse text-[10px]">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 border-b border-r bg-gray-50 px-2 py-1 text-left">Driver</th>
              <th className="border-b border-r bg-gray-50 px-1 py-1">Unit</th>
              {days.map((d) => (
                <th key={d} className="border-b border-gray-100 px-0.5 py-1 text-center font-normal text-gray-500">
                  {d.slice(5)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(query.data.drivers ?? []).map((dr) => {
              const driverId = String(dr.driver_id);
              const name = String(dr.driver_name ?? "");
              const unit = dr.unit_number ? String(dr.unit_number) : "—";
              return (
                <tr key={driverId} className="border-t border-gray-100">
                  <td className="sticky left-0 z-10 border-r bg-white px-2 py-0.5 text-xs font-medium text-gray-900">{name}</td>
                  <td className="border-r px-1 py-0.5 text-gray-600">{unit}</td>
                  {days.map((d) => {
                    const lt = cellByDriverDay.get(`${driverId}|${d}`);
                    const label = lt ? String(lt).slice(0, 3) : "";
                    return (
                      <td key={d} className={`border-l border-gray-50 px-0 py-0 text-center ${leaveCellClass(lt)}`} title={lt ?? ""}>
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
        <div className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
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
