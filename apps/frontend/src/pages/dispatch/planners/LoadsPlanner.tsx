import { useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { getDispatchPlannerWeek, type PlannerLoadEvent } from "../../../api/dispatch";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { addDaysIso } from "./planner-range";
import { usePlannerRange } from "./PlannerRangeContext";

function toDayKey(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return iso.slice(0, 10);
}

function loadSpanDays(load: PlannerLoadEvent, days: string[]): { startIdx: number; span: number } | null {
  const startDay = toDayKey(load.start_at);
  const endDay = toDayKey(load.end_at) ?? startDay;
  if (!startDay) return null;

  let startIdx = -1;
  let endIdx = -1;
  for (let i = 0; i < days.length; i++) {
    const d = days[i];
    if (d >= startDay && d <= (endDay ?? startDay)) {
      if (startIdx < 0) startIdx = i;
      endIdx = i;
    }
  }
  if (startIdx < 0) return null;
  return { startIdx, span: endIdx - startIdx + 1 };
}

async function fetchLoadsForRange(operatingCompanyId: string, rangeStart: string, rangeEnd: string): Promise<PlannerLoadEvent[]> {
  const seen = new Map<string, PlannerLoadEvent>();
  let weekStart = rangeStart;
  while (weekStart <= rangeEnd) {
    const payload = await getDispatchPlannerWeek(operatingCompanyId, weekStart);
    for (const load of payload.loads) {
      const day = toDayKey(load.start_at);
      if (day && day >= rangeStart && day <= rangeEnd) {
        seen.set(load.id, load);
      }
    }
    weekStart = addDaysIso(weekStart, 7);
  }
  return [...seen.values()].sort((a, b) => a.start_at.localeCompare(b.start_at));
}

export function LoadsPlanner() {
  const navigate = useNavigate();
  const { selectedCompanyId } = useCompanyContext();
  const operatingCompanyId = selectedCompanyId ?? "";
  const { range, days } = usePlannerRange();

  const loadsQuery = useQuery({
    queryKey: ["dispatch", "planners", "loads", operatingCompanyId, range.start, range.end],
    enabled: Boolean(operatingCompanyId),
    queryFn: () => fetchLoadsForRange(operatingCompanyId, range.start, range.end),
  });

  const rows = useMemo(() => loadsQuery.data ?? [], [loadsQuery.data]);

  const openLoad = (loadId: string) => {
    navigate(`/dispatch?load_id=${encodeURIComponent(loadId)}`);
  };

  return (
    <div data-testid="dispatch-loads-planner-page" className="space-y-2">
      {loadsQuery.isLoading ? <div className="text-sm text-gray-500">Loading loads timeline…</div> : null}
      {loadsQuery.isError ? <div className="text-sm text-red-700">Failed to load loads planner.</div> : null}

      {!loadsQuery.isLoading && !loadsQuery.isError ? (
        <div className="max-w-[calc(100vw-48px)] overflow-auto rounded border border-gray-200 bg-white">
          <table className="min-w-max border-collapse text-[10px]">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 border-b border-r bg-gray-50 px-2 py-1 text-left">Load</th>
                <th className="border-b border-r bg-gray-50 px-1 py-1">Lane</th>
                {days.map((d) => (
                  <th key={d} className="border-b border-gray-100 px-0.5 py-1 text-center font-normal text-gray-500">
                    {d.slice(5)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={2 + days.length} className="px-3 py-4 text-center text-sm text-gray-500">
                    No loads in this range.
                  </td>
                </tr>
              ) : (
                rows.map((load) => {
                  const span = loadSpanDays(load, days);
                  const lane = [load.pickup_city, load.pickup_state].filter(Boolean).join(", ") || "—";
                  let dayIdx = 0;
                  const cells: ReactNode[] = [];

                  while (dayIdx < days.length) {
                    if (span && dayIdx === span.startIdx) {
                      cells.push(
                        <td
                          key={`${load.id}-${days[dayIdx]}`}
                          colSpan={span.span}
                          className="border-l border-gray-50 bg-indigo-100 px-1 py-0.5 text-center"
                        >
                          <button
                            type="button"
                            className="w-full truncate text-[9px] font-medium text-indigo-900 hover:underline"
                            data-testid={`loads-planner-bar-${load.load_number}`}
                            onClick={() => openLoad(load.id)}
                            title={`${load.load_number} · ${load.customer_name ?? ""} · ${load.status}`}
                          >
                            {load.load_number}
                          </button>
                        </td>
                      );
                      dayIdx += span.span;
                    } else {
                      cells.push(<td key={`${load.id}-${days[dayIdx]}`} className="border-l border-gray-50 bg-white" />);
                      dayIdx += 1;
                    }
                  }

                  return (
                    <tr key={load.id} className="border-t border-gray-100">
                      <td className="sticky left-0 z-10 border-r bg-white px-2 py-0.5 text-xs font-medium text-gray-900">
                        <button type="button" className="text-blue-700 hover:underline" onClick={() => openLoad(load.id)}>
                          {load.load_number}
                        </button>
                      </td>
                      <td className="border-r px-1 py-0.5 text-gray-600">{lane}</td>
                      {cells}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
