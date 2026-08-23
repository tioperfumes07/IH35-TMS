import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listDriverSafetyTrend, listDriverScoreEvents, type DriverSafetyScoreRow } from "../../../api/safety";
import { ListErrorState } from "../../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { EntityLink } from "../../../components/shared/EntityLink";
import { entityLabel } from "../../../lib/entity-label";
import { HarshEventDetail } from "../HarshEventDetail";

type Props = {
  companyId: string;
  driverUuid: string;
  driverName: string;
  onClose: () => void;
};

const EVENT_PERIODS = [7, 30, 90] as const;

function TrendChart({ periods }: { periods: DriverSafetyScoreRow[] }) {
  const points = periods
    .map((row) => row.composite_score)
    .filter((value): value is number => value != null);

  if (points.length < 2) {
    return <div className="h-16 text-xs text-slate-500">Not enough scored periods for a trend yet.</div>;
  }

  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const coordinates = points
    .map((value, idx) => {
      const x = (idx / (points.length - 1)) * 100;
      const y = 100 - ((value - min) / span) * 100;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className="space-y-1">
      <svg viewBox="0 0 100 100" className="h-24 w-full rounded-sm border border-slate-100 bg-slate-50 p-2">
        <polyline points={coordinates} fill="none" stroke="currentColor" strokeWidth="4" className="text-slate-700" />
      </svg>
      <div className="flex justify-between text-[10px] text-slate-500">
        <span>{periods[0]?.period_start ?? ""}</span>
        <span>{periods[periods.length - 1]?.period_end ?? ""}</span>
      </div>
    </div>
  );
}

export function DriverScoreDetail({ companyId, driverUuid, driverName, onClose }: Props) {
  const trendQuery = useQuery({
    queryKey: ["safety", "driver-scoring", "trend", companyId, driverUuid],
    queryFn: () => listDriverSafetyTrend(companyId, driverUuid, 12),
    enabled: Boolean(companyId && driverUuid),
  });

  const periods = trendQuery.data?.periods ?? [];
  const latest = useMemo(() => (periods.length > 0 ? periods[periods.length - 1] : null), [periods]);

  const periodColumns = useMemo<ParityColumn<DriverSafetyScoreRow>[]>(
    () => [
      {
        key: "period",
        label: "Period",
        sortable: true,
        sortValue: (row) => row.period_start,
        render: (row) => `${row.period_start} → ${row.period_end}`,
      },
      {
        key: "composite_score",
        label: "Score",
        sortable: true,
        className: "text-right",
        cellClass: "text-right",
        render: (row) => row.composite_score?.toFixed(1) ?? "N/A",
      },
      {
        key: "rank_in_fleet",
        label: "Rank",
        sortable: true,
        className: "text-right",
        cellClass: "text-right",
        render: (row) => row.rank_in_fleet ?? "—",
      },
      {
        key: "harsh_brake_count",
        label: "Brakes",
        sortable: true,
        className: "text-right",
        cellClass: "text-right",
      },
      {
        key: "hard_accel_count",
        label: "Accel",
        sortable: true,
        className: "text-right",
        cellClass: "text-right",
      },
      {
        key: "speeding_seconds",
        label: "Speeding (s)",
        sortable: true,
        className: "text-right",
        cellClass: "text-right",
      },
      {
        key: "lane_departure_count",
        label: "Lane",
        sortable: true,
        className: "text-right",
        cellClass: "text-right",
      },
    ],
    [],
  );

  // Harsh-event timeline (raw telematics events behind the composite score) + per-event dashcam
  // clip drill-through — ports the standalone event view so a reviewer can go from "score dropped"
  // straight to "here's the clip" without leaving the driver's detail panel.
  const [eventPeriodDays, setEventPeriodDays] = useState<(typeof EVENT_PERIODS)[number]>(30);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const eventsQuery = useQuery({
    queryKey: ["safety", "driver-scoring-events", companyId, driverUuid, eventPeriodDays],
    queryFn: () => listDriverScoreEvents(companyId, driverUuid, eventPeriodDays),
    enabled: Boolean(companyId && driverUuid),
  });

  return (
    <div className="space-y-3">
      <section
        className="overflow-hidden rounded-sm border border-slate-200 bg-white"
        data-testid="driver-score-detail-panel"
      >
        <div className="flex items-start justify-between gap-2 border-b border-slate-200 px-3 py-2">
          <div>
            <h4 className="text-sm font-semibold text-slate-900">
              <EntityLink
                kind="driver"
                id={driverUuid}
                label={entityLabel(driverName, driverUuid, "Driver")}
              />
            </h4>
            <p className="text-xs text-slate-500">12-period composite safety trend</p>
          </div>
          <button type="button" className="text-xs text-slate-600 underline" onClick={onClose}>
            Close
          </button>
        </div>

        {trendQuery.isError ? (
          <div className="px-3 py-2">
            <ListErrorState
              title="Couldn't load driver score history"
              status={0}
              message={(trendQuery.error as Error)?.message}
              onRetry={() => void trendQuery.refetch()}
            />
          </div>
        ) : (
          <>
            <div className="border-b border-slate-100 px-3 py-2">
              <TrendChart periods={periods} />
            </div>

            {latest ? (
              <div className="grid grid-cols-2 text-xs sm:divide-x sm:divide-slate-100 md:grid-cols-4">
                <div className="border-t border-slate-100 px-3 py-2 md:border-t-0">
                  <div className="text-slate-500">Latest score</div>
                  <div className="font-semibold">{latest.composite_score?.toFixed(1) ?? "N/A"}</div>
                </div>
                <div className="border-t border-slate-100 px-3 py-2 md:border-t-0">
                  <div className="text-slate-500">Fleet rank</div>
                  <div className="font-semibold">{latest.rank_in_fleet ?? "—"}</div>
                </div>
                <div className="border-t border-slate-100 px-3 py-2 md:border-t-0">
                  <div className="text-slate-500">Miles</div>
                  <div className="font-semibold">{latest.miles_driven.toFixed(0)}</div>
                </div>
                <div className="border-t border-slate-100 px-3 py-2 md:border-t-0">
                  <div className="text-slate-500">Period</div>
                  <div className="font-semibold">
                    {latest.period_start} → {latest.period_end}
                  </div>
                </div>
              </div>
            ) : null}

            <ParityTable<DriverSafetyScoreRow>
              columns={periodColumns}
              rows={periods}
              rowKey={(row) => `${row.period_start}-${row.period_end}`}
              loading={trendQuery.isLoading}
              emptyText="No historical periods stored for this driver."
              storageKey="safety-driver-score-detail-periods"
              exportFilename="driver-score-detail-periods"
              tableTestId="driver-score-detail-periods-table"
            />
          </>
        )}
      </section>

      <section
        className="overflow-hidden rounded-sm border border-slate-200 bg-white"
        data-testid="driver-score-harsh-events-panel"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
          <h5 className="text-sm font-semibold text-slate-900">Harsh Event Timeline</h5>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500">Period</span>
            {EVENT_PERIODS.map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => setEventPeriodDays(days)}
                className={`rounded-sm px-2 py-1 ${eventPeriodDays === days ? "bg-[#1f2a44] text-white" : "bg-slate-100 text-slate-700"}`}
              >
                {days}d
              </button>
            ))}
          </div>
        </div>
        <div className="divide-y divide-slate-100 text-xs">
          {eventsQuery.isError ? (
            <div className="px-3 py-2">
              <ListErrorState
                title="Couldn't load harsh events"
                status={0}
                message={(eventsQuery.error as Error)?.message}
                onRetry={() => void eventsQuery.refetch()}
              />
            </div>
          ) : (
            <>
              {(eventsQuery.data?.events ?? []).slice(0, 50).map((event) => (
                <div key={event.id} className="px-3 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      {String(event.event_at).slice(0, 19).replace("T", " ")} · {event.event_kind} · {event.severity} · Unit{" "}
                      {event.unit_id ? (
                        <EntityLink
                          kind="unit"
                          id={String(event.unit_id)}
                          label={entityLabel(event.unit_number, event.unit_id, "Unit")}
                        />
                      ) : (
                        entityLabel(event.unit_number, null, "Unit")
                      )}{" "}
                      · lat/lng {event.latitude ?? "—"}/{event.longitude ?? "—"}
                    </span>
                    <button
                      type="button"
                      className="text-slate-700 underline"
                      onClick={() => setExpandedEventId(expandedEventId === event.id ? null : event.id)}
                    >
                      {expandedEventId === event.id ? "Hide dashcam" : "View dashcam"}
                    </button>
                  </div>
                  {expandedEventId === event.id ? (
                    <div className="mt-2">
                      <HarshEventDetail harshEventId={event.id} />
                    </div>
                  ) : null}
                </div>
              ))}
              {(eventsQuery.data?.events ?? []).length === 0 ? (
                <div className="px-3 py-2 text-slate-500">No harsh events for this driver in period.</div>
              ) : null}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
