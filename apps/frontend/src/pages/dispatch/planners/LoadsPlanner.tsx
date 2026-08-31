import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getDispatchPlannerWeek, type PlannerLoadEvent } from "../../../api/dispatch";
import { ListErrorBanner } from "../../../components/shared/ListErrorBanner";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { userFacingApiError } from "../../../lib/api-error-message";
import { addDaysIso } from "./planner-range";
import { usePlannerRange } from "./PlannerRangeContext";
import { EntityLinkOrTombstone } from "../../../components/shared/EntityLinkOrTombstone";
import { PlannerAxisHead } from "./PlannerAxisHead";
import { PlannerGrid } from "./PlannerGrid";

void PlannerAxisHead;

function toDayKey(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return iso.slice(0, 10);
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
        <PlannerGrid
          days={days}
          frozenLabel="Load"
          frozenPx={260}
          rows={rows.map((load) => {
            const start = toDayKey(load.start_at) ?? days[0];
            const end = toDayKey(load.end_at) ?? start;
            const lane = [load.pickup_city, load.pickup_state].filter(Boolean).join(", ") || "—";
            return {
              id: load.id,
              name: <EntityLinkOrTombstone kind="load" id={load.id} name={load.load_number} noun="Load" />,
              secondary: (
                <>
                  <span className="text-[10px] font-medium text-gray-600">{lane}</span>
                  <EntityLinkOrTombstone kind="customer" id={load.customer_id} name={load.customer_name} noun="Customer" />
                </>
              ),
              bars: [
                {
                  id: `${load.id}-bar`,
                  label: load.load_number || load.id,
                  startYmd: start,
                  endYmd: end,
                  kind: "nb" as const,
                  testId: `loads-planner-bar-${load.load_number}`,
                  loadId: load.id,
                },
              ],
            };
          })}
          empty={
            <span data-testid="dispatch-loads-planner-honest-empty">
              No loads with a start_at in this range for this company. Book or schedule loads under Dispatch — bars
              appear here once planner week feed returns load events.
            </span>
          }
        />
      ) : null}
    </div>
  );
}
