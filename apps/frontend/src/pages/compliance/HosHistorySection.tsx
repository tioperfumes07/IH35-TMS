import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Combobox, type ComboboxOption } from "../../components/Combobox";
import { DatePicker } from "../../components/forms/DatePicker";
import { listDrivers } from "../../api/mdata";
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
  // SAF-B29: never silent listDrivers(limit:500) — type-ahead re-queries (HosViewer parity).
  const [driverSearch, setDriverSearch] = useState("");

  const driversQ = useQuery({
    queryKey: ["hos-history", "drivers", operatingCompanyId, driverSearch],
    queryFn: () =>
      listDrivers({
        operating_company_id: operatingCompanyId,
        status: "Active",
        limit: 200,
        search: driverSearch || undefined,
      }),
    enabled: Boolean(operatingCompanyId),
    staleTime: 5 * 60 * 1000,
  });
  // Today's roster only used to auto-select a driver with recent HOS data (so the tab isn't an empty prompt).
  const rosterQ = useQuery({
    queryKey: ["hos-history", "roster", operatingCompanyId, today],
    queryFn: () => getHosDailyRoster(operatingCompanyId, today),
    enabled: Boolean(operatingCompanyId),
    staleTime: 60_000,
  });

  const options: ComboboxOption[] = useMemo(() => {
    const drivers = driversQ.data?.drivers ?? [];
    return drivers
      .map((d) => ({ value: d.id, label: [d.first_name, d.last_name].filter(Boolean).join(" ") || d.id }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [driversQ.data]);

  useEffect(() => {
    if (driverId) return;
    const firstWithData = (rosterQ.data?.drivers ?? []).find((d) => d.available);
    if (firstWithData) { setDriverId(firstWithData.driver_id); return; }
    const firstActive = driversQ.data?.drivers?.[0];
    if (firstActive) setDriverId(firstActive.id);
  }, [driverId, rosterQ.data, driversQ.data]);

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

  const selectedName = options.find((o) => o.value === driverId)?.label ?? "driver";
  const events = eventsQ.data?.events ?? [];

  return (
    <section data-testid="compliance-section-hos-history">
      <div className="flex flex-wrap items-end gap-3 rounded-sm border border-slate-200 bg-white px-3 py-3">
        <div className="min-w-[240px] flex-1">
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-500">Driver</label>
          <Combobox
            options={options}
            value={driverId}
            onChange={setDriverId}
            onSearch={setDriverSearch}
            placeholder={driversQ.isLoading ? "Loading drivers…" : "Search a driver…"}
            loading={driversQ.isLoading}
            filterMode="contains"
            dataField="hos-history-driver"
          />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-500">From</label>
          <DatePicker
            value={fromDate}
            max={toDate}
            onChange={(next) => next && setFromDate(next)}
            className="h-[34px] rounded-sm border border-slate-300 px-2 text-[12px] text-slate-800"
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
            className="h-[34px] rounded-sm border border-slate-300 px-2 text-[12px] text-slate-800"
            data-testid="hos-history-to"
          />
        </div>
      </div>

      <div className="mt-3">
        {!driverId ? (
          <div className="rounded-sm border border-slate-200 bg-white px-4 py-12 text-center">
            <div className="text-sm font-semibold text-slate-700">HOS History</div>
            <div className="mt-1 text-xs text-slate-500">Pick a driver above to view their duty-status event history.</div>
          </div>
        ) : eventsQ.isLoading ? (
          <div className="space-y-1">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-[26px] animate-pulse rounded-sm bg-slate-100" />)}</div>
        ) : eventsQ.isError ? (
          <div className="rounded-sm border border-slate-200 bg-white px-4 py-10 text-center text-sm text-red-600">Failed to load HOS history for {selectedName}.</div>
        ) : events.length === 0 ? (
          <div className="rounded-sm border border-slate-200 bg-white px-4 py-12 text-center">
            <div className="text-sm font-semibold text-slate-700">No HOS history in this range.</div>
            <div className="mt-1 text-xs text-slate-500">No duty-status events for {selectedName} between {fromDate} and {toDate}.</div>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-sm border border-slate-200 bg-white">
            <table className="w-full text-left text-[11px]" data-testid="hos-history-table">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                <tr>
                  {["Duty status", "Started (CT)", "Ended (CT)", "Duration"].map((h) => (
                    <th key={h} className="whitespace-nowrap px-2 py-1.5">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {events.map((ev, i) => (
                  <tr key={`${ev.started_at}-${i}`} className="border-t border-slate-100">
                    <td className="px-2 py-1.5">
                      <span className="inline-flex items-center gap-1.5 font-medium text-slate-800">
                        <span className="inline-block h-[8px] w-[8px] rounded-full" style={{ background: DUTY_COLOR[ev.duty_status] }} />
                        {DUTY_LABEL[ev.duty_status]}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 font-mono tabular-nums">{formatInCompanyTimeZone(ev.started_at, { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</td>
                    <td className="px-2 py-1.5 font-mono tabular-nums">{ev.ended_at ? formatInCompanyTimeZone(ev.ended_at, { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                    <td className="px-2 py-1.5 text-right font-mono tabular-nums">{hmm(durationMinutes(ev.started_at, ev.ended_at))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
