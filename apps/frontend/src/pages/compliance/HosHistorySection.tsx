import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DatePicker } from "../../components/forms/DatePicker";
import { EntityPicker } from "../../components/parity/EntityPicker";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { getHosDailyRoster, getHosEvents, DUTY_LABEL, DUTY_COLOR } from "../../api/hosTracker";
import { companyToday, addDaysIso, formatInCompanyTimeZone } from "../../lib/businessDate";

// Compliance "HOS History" tab — the raw duty-status EVENT log (append-only `hos.duty_status_events`)
// for a driver across a date range, for FMCSA audit / drill-down. Distinct from "HOS Viewer" (a single
// day's reconstructed timeline) and "HOS Tracker" (today's fleet roster): this is the multi-day history
// read verbatim via GET /api/v1/telematics/hos/events (see hos-tracker.routes.ts).
function durationMinutes(startedAt: string, endedAt: string | null): number | null {
  if (!endedAt) return null;
  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  return Math.round(ms / 60000);
}
function hmm(min: number | null): string {
  if (min == null) return "—";
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`;
}

export function HosHistorySection({ operatingCompanyId }: { operatingCompanyId: string }) {
  const today = companyToday();
  const [driverId, setDriverId] = useState<string | null>(null);
  const [fromDate, setFromDate] = useState(addDaysIso(today, -7));
  const [toDate, setToDate] = useState(today);

  // Today's roster only used to auto-select a driver with recent HOS data (so the tab isn't an empty prompt).
  const rosterQ = useQuery({
    queryKey: ["hos-history", "roster", operatingCompanyId, today],
    queryFn: () => getHosDailyRoster(operatingCompanyId, today),
    enabled: Boolean(operatingCompanyId),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (driverId) return;
    const firstWithData = (rosterQ.data?.drivers ?? []).find((d) => d.available);
    if (firstWithData) setDriverId(firstWithData.driver_id);
  }, [driverId, rosterQ.data]);

  // Window is a plain UTC calendar span for audit drill-down (not the FMCSA home-terminal day boundary
  // used by the daily/roster endpoints) — inclusive of the full "to" day.
  const fromUtcIso = `${fromDate}T00:00:00.000Z`;
  const toUtcIso = `${toDate}T23:59:59.999Z`;

  const eventsQ = useQuery({
    queryKey: ["hos-history", "events", operatingCompanyId, driverId, fromUtcIso, toUtcIso],
    queryFn: () => getHosEvents(operatingCompanyId, driverId as string, fromUtcIso, toUtcIso),
    enabled: Boolean(operatingCompanyId && driverId),
    staleTime: 60_000,
  });

  const rosterName =
    (rosterQ.data?.drivers ?? []).find((d) => d.driver_id === driverId)?.driver_name?.trim() || null;
  const selectedName = rosterName || "driver";
  const events = eventsQ.data?.events ?? [];

  type HosEventRow = (typeof events)[number];

  const columns = useMemo<ParityColumn<HosEventRow>[]>(
    () => [
      {
        key: "duty_status",
        label: "Duty status",
        render: (ev) => (
          <span className="inline-flex items-center gap-1.5 font-medium text-slate-800">
            <span className="inline-block h-[8px] w-[8px] rounded-full" style={{ background: DUTY_COLOR[ev.duty_status] }} />
            {DUTY_LABEL[ev.duty_status]}
          </span>
        ),
      },
      {
        key: "started_at",
        label: "Started (CT)",
        sortable: true,
        render: (ev) => (
          <span className="font-mono tabular-nums">
            {formatInCompanyTimeZone(ev.started_at, { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
          </span>
        ),
      },
      {
        key: "ended_at",
        label: "Ended (CT)",
        render: (ev) => (
          <span className="font-mono tabular-nums">
            {ev.ended_at
              ? formatInCompanyTimeZone(ev.ended_at, { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" })
              : "—"}
          </span>
        ),
      },
      {
        key: "duration",
        label: "Duration",
        render: (ev) => (
          <span className="font-mono tabular-nums">{hmm(durationMinutes(ev.started_at, ev.ended_at))}</span>
        ),
        // PARITY-EXPORT-COMPUTED-COLUMN-BLANK: HosEvent has no `duration` field — it's computed
        // purely inside render — so export left this column blank on every row.
        exportValue: (ev) => hmm(durationMinutes(ev.started_at, ev.ended_at)),
      },
    ],
    [],
  );

  return (
    <section data-testid="compliance-section-hos-history">
      <div className="flex flex-wrap items-end gap-3 rounded-sm border border-slate-200 bg-white px-3 py-3">
        <div className="min-w-[240px] flex-1" data-testid="hos-history-driver-picker">
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-500">Driver</label>
          {/* Picker law: EntityPicker kind=driver — not Combobox over listDrivers page. */}
          <EntityPicker
            kind="driver"
            operatingCompanyId={operatingCompanyId}
            value={driverId}
            onChange={setDriverId}
            enabled={Boolean(operatingCompanyId)}
            placeholder="Search a driver…"
            dataField="hos-history-driver"
            allowClear
          />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-500">From</label>
          <DatePicker
            value={fromDate}
            max={toDate}
            onChange={(next) => next && setFromDate(next)}
            className="h-[34px]"
            data-testid="hos-history-from"
          />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-500">To</label>
          <DatePicker
            value={toDate}
            min={fromDate}
            max={today}
            onChange={(next) => next && setToDate(next)}
            className="h-[34px]"
            data-testid="hos-history-to"
          />
        </div>
      </div>

      {(rosterQ.isError || eventsQ.isError) && (
        <div className="mt-3">
          <ListErrorBanner
            onRetry={() => {
              void rosterQ.refetch();
              void eventsQ.refetch();
            }}
          />
        </div>
      )}

      <div className="mt-3">
        {!driverId ? (
          <div className="rounded-sm border border-slate-200 bg-white px-4 py-12 text-center">
            <div className="text-sm font-semibold text-slate-700">HOS History</div>
            <div className="mt-1 text-xs text-slate-500">Pick a driver above to view their duty-status event history.</div>
          </div>
        ) : (
          // COMP-F3538: always mount ParityTable (Search+Range+gear); raw HTML table had no surface bar.
          <ParityTable<HosEventRow>
            columns={columns}
            rows={events}
            rowKey={(ev) => `${ev.started_at}-${ev.duty_status}-${ev.ended_at ?? "open"}`}
            loading={eventsQ.isLoading}
            emptyText={`No duty-status events for ${selectedName} between ${fromDate} and ${toDate}.`}
            storageKey="hos-history-events"
            exportFilename={`hos-history-${fromDate}-${toDate}`}
            tableTestId="hos-history-table"
          />
        )}
      </div>
    </section>
  );
}
