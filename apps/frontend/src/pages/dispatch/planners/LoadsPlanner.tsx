import { useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { getDispatchPlannerWeek, type PlannerLoadEvent } from "../../../api/dispatch";
import { ListErrorBanner } from "../../../components/shared/ListErrorBanner";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { userFacingApiError } from "../../../lib/api-error-message";
import { addDaysIso } from "./planner-range";
import { usePlannerRange } from "./PlannerRangeContext";
import { EntityLinkOrTombstone } from "../../../components/shared/EntityLinkOrTombstone";

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
  // Enumerate the weeks first (bounded: the planner range is 7–40 days → ≤6 weeks), then fetch them in
  // PARALLEL. The previous code awaited each week sequentially inside the loop, so the planner stalled
  // for the sum of all round-trips on every load — the "Loads Planner hangs on load" symptom.
  const weekStarts: string[] = [];
  for (let weekStart = rangeStart; weekStart <= rangeEnd; weekStart = addDaysIso(weekStart, 7)) {
    weekStarts.push(weekStart);
  }
  const payloads = await Promise.all(weekStarts.map((w) => getDispatchPlannerWeek(operatingCompanyId, w)));
  const seen = new Map<string, PlannerLoadEvent>();
  for (const payload of payloads) {
    for (const load of payload.loads) {
      const day = toDayKey(load.start_at);
      if (day && day >= rangeStart && day <= rangeEnd) {
        seen.set(load.id, load);
      }
    }
  }
  return [...seen.values()].sort((a, b) => a.start_at.localeCompare(b.start_at));
}

export function LoadsPlanner() {
  const { selectedCompanyId } = useCompanyContext();
  const operatingCompanyId = selectedCompanyId ?? "";
  const { range, days } = usePlannerRange();

  const loadsQuery = useQuery({
    queryKey: ["dispatch", "planners", "loads", operatingCompanyId, range.start, range.end],
    enabled: Boolean(operatingCompanyId),
    queryFn: () => fetchLoadsForRange(operatingCompanyId, range.start, range.end),
  });

  const rows = useMemo(() => loadsQuery.data ?? [], [loadsQuery.data]);

  if (!operatingCompanyId) {
    return (
      <div
        data-testid="dispatch-loads-planner-need-company"
        className="rounded-sm border bg-white p-4 text-sm text-slate-600"
      >
        Select an operating company to load the loads planner.
      </div>
    );
  }

  return (
    <div data-testid="dispatch-loads-planner-page" className="space-y-2">
      {loadsQuery.isLoading ? <div className="text-sm text-gray-500">Loading loads timeline…</div> : null}
      {loadsQuery.isError ? (
        <ListErrorBanner
          message={userFacingApiError(loadsQuery.error, "Could not load loads planner")}
          onRetry={() => void loadsQuery.refetch()}
        />
      ) : null}

      {!loadsQuery.isLoading && !loadsQuery.isError ? (
          <div className="max-w-[calc(100vw-48px)] overflow-x-auto rounded-sm border border-gray-200 bg-white">
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
                  <td
                    colSpan={2 + days.length}
                    data-testid="dispatch-loads-planner-honest-empty"
                    className="px-3 py-4 text-center text-sm text-gray-500"
                  >
                    No loads with a start_at in this range for this company. Book or schedule loads under Dispatch —
                    bars appear here once planner week feed returns load events.
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
                          className="border-l border-gray-50 bg-slate-100 px-1 py-0.5 text-center"
                        >
                          <EntityLinkOrTombstone
                            kind="load"
                            id={load.id}
                            name={load.load_number}
                            noun="Load"
                            className="w-full truncate text-[9px] font-medium text-slate-700 hover:underline"
                            data-testid={`loads-planner-bar-${load.load_number}`}
                          />
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
                        <EntityLinkOrTombstone kind="load" id={load.id} name={load.load_number} noun="Load" />
                        <span className="block text-[9px]"><EntityLinkOrTombstone kind="customer" id={load.customer_id} name={load.customer_name} noun="Customer" /></span>
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
