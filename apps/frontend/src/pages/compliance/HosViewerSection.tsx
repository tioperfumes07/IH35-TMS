import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DatePicker } from "../../components/forms/DatePicker";
import { ListErrorState } from "../../components/ListErrorState";
import { EntityPicker } from "../../components/EntityPicker";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import {
  getHosDaily,
  getHosDailyRoster,
  DUTY_LABEL,
  DUTY_COLOR,
  type HosDutyStatus,
  type HosSegment,
} from "../../api/hosTracker";
import { companyToday } from "../../lib/businessDate";

// SAFETY-1: the HOS date filter defaults to the current duty day in the CARRIER timezone
// (America/Chicago), never the UTC calendar date (which rolls to "tomorrow" after ~19:00 CT and
// showed empty/next-day data). Reuse the canonical `companyToday()` — do not reinvent a local Intl
// formatter (kept in lockstep with lib/businessDate + backend lib/company-business-date).
function laredoToday(): string {
  return companyToday();
}
// 8-day strip ending today (Laredo), oldest→newest — quick day picker.
function buildDayStrip(today: string): { date: string; mon: string; day: string; weekday: string }[] {
  const base = new Date(`${today}T12:00:00Z`);
  const out: { date: string; mon: string; day: string; weekday: string }[] = [];
  for (let i = 7; i >= 0; i--) {
    const d = new Date(base.getTime() - i * 86_400_000);
    out.push({
      date: d.toISOString().slice(0, 10),
      mon: new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short" }).format(d),
      day: new Intl.DateTimeFormat("en-US", { timeZone: "UTC", day: "numeric" }).format(d),
      weekday: i === 0 ? "Today" : new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short" }).format(d),
    });
  }
  return out;
}

function hmm(min: number | null | undefined): string {
  if (min == null) return "—";
  const s = min < 0 ? "-" : "";
  const a = Math.abs(min);
  return `${s}${Math.floor(a / 60)}:${String(a % 60).padStart(2, "0")}`;
}
function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { timeZone: "America/Chicago", hour: "2-digit", minute: "2-digit", hour12: false });
}
const STATUS_VERDICT: Record<string, { label: string; cls: string }> = {
  ok: { label: "OK", cls: "text-slate-700" },
  warning_1hr: { label: "Low (<1h)", cls: "text-slate-700" },
  warning_15min: { label: "Low (<15m)", cls: "text-slate-700" },
  violation: { label: "Violation", cls: "text-red-700" },
};
const TOTAL_ORDER: HosDutyStatus[] = ["driving", "on_duty_not_driving", "sleeper", "off_duty", "personal_conveyance", "yard_moves"];

export function HosViewerSection({ operatingCompanyId }: { operatingCompanyId: string }) {
  const today = laredoToday();
  const strip = useMemo(() => buildDayStrip(today), [today]);
  const [selectedDate, setSelectedDate] = useState(today);
  const [driverId, setDriverId] = useState<string | null>(null);

  // Roster for the chosen date = who HAS HOS data + their unit number (always passes date; roster 400s without it).
  const rosterQ = useQuery({
    queryKey: ["hos-viewer", "roster", operatingCompanyId, selectedDate],
    queryFn: () => getHosDailyRoster(operatingCompanyId, selectedDate),
    enabled: Boolean(operatingCompanyId),
    staleTime: 60_000,
  });

  // Auto-select so the Viewer is never an empty prompt: prefer the first roster driver WITH HOS data for the date.
  useEffect(() => {
    if (driverId) return;
    const firstWithData = (rosterQ.data?.drivers ?? []).find((d) => d.available);
    if (firstWithData) setDriverId(firstWithData.driver_id);
  }, [driverId, rosterQ.data]);

  const dailyQ = useQuery({
    queryKey: ["hos-viewer", "daily", operatingCompanyId, driverId, selectedDate],
    queryFn: () => getHosDaily(operatingCompanyId, driverId as string, selectedDate),
    enabled: Boolean(operatingCompanyId && driverId),
    staleTime: 60_000,
  });

  const selectedName =
    (rosterQ.data?.drivers ?? []).find((d) => d.driver_id === driverId)?.driver_name?.trim() || "driver";
  const daily = dailyQ.data;
  const verdict = daily?.clocks ? STATUS_VERDICT[daily.clocks.status] ?? STATUS_VERDICT.ok : null;
  const segmentColumns = useMemo<ParityColumn<HosSegment>[]>(
    () => [
      {
        key: "duty_status",
        label: "Duty status",
        sortable: true,
        render: (segment) => (
          <span className="inline-flex items-center gap-1.5 font-medium text-slate-800">
            <span
              className="inline-block h-[8px] w-[8px] rounded-full"
              style={{ background: DUTY_COLOR[segment.duty_status] }}
            />
            {DUTY_LABEL[segment.duty_status]}
          </span>
        ),
      },
      {
        key: "start_utc",
        label: "Start (CT)",
        sortable: true,
        render: (segment) => clockTime(segment.start_utc),
        cellClass: "text-center font-mono tabular-nums",
      },
      {
        key: "end_utc",
        label: "End (CT)",
        sortable: true,
        render: (segment) => clockTime(segment.end_utc),
        cellClass: "text-center font-mono tabular-nums",
      },
      {
        key: "minutes",
        label: "Duration",
        sortable: true,
        render: (segment) => hmm(segment.minutes),
        cellClass: "text-right font-mono tabular-nums",
      },
    ],
    []
  );

  return (
    <section data-testid="compliance-section-hos-viewer">
      {/* Picker + date controls */}
      <div className="flex flex-wrap items-end gap-3 rounded-sm border border-slate-200 bg-white px-3 py-3">
        <div className="min-w-[260px] flex-1" data-testid="hos-viewer-driver-picker">
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">Driver</label>
          {/* Picker law: EntityPicker kind=driver — not Combobox over listDrivers page. */}
          <EntityPicker
            kind="driver"
            operatingCompanyId={operatingCompanyId}
            value={driverId}
            onChange={setDriverId}
            enabled={Boolean(operatingCompanyId)}
            placeholder="Search a driver…"
            dataField="hos-viewer-driver"
            allowClear
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">Date</label>
          <DatePicker
            value={selectedDate}
            max={today}
            onChange={(next) => next && setSelectedDate(next)}
            className="h-[34px]"
            data-testid="hos-viewer-date"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {strip.map((d) => (
            <button
              key={d.date}
              type="button"
              onClick={() => setSelectedDate(d.date)}
              className={`rounded-sm border px-2 py-1 text-center text-xs leading-tight ${selectedDate === d.date ? "border-slate-800 font-bold text-slate-900 shadow-[inset_0_-2px_0_#1f2a44]" : "border-slate-200 text-slate-500"}`}
            >
              {d.mon} {d.day}
              <span className="block text-xs text-slate-400">{d.weekday}</span>
            </button>
          ))}
        </div>
      </div>

      {(rosterQ.isError || dailyQ.isError) && (
        <div className="mt-3">
          <ListErrorState
            title={`Couldn't load the ELD log for ${selectedName}.`}
            status={0}
            message={((rosterQ.error ?? dailyQ.error) as Error | undefined)?.message}
            onRetry={() => {
              void rosterQ.refetch();
              void dailyQ.refetch();
            }}
          />
        </div>
      )}

      {/* Body */}
      <div className="mt-3">
        {!driverId ? (
          <div className="rounded-sm border border-slate-200 bg-white px-4 py-12 text-center">
            <div className="text-xs font-semibold text-slate-700">HOS Viewer</div>
            <div className="mt-1 text-xs text-slate-500">Pick a driver above to open their daily ELD log.</div>
          </div>
        ) : dailyQ.isLoading ? (
          <div className="space-y-1">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-[26px] animate-pulse rounded-sm bg-slate-100" />)}</div>
        ) : !daily || daily.available === false || (daily.segments?.length ?? 0) === 0 ? (
          <div className="rounded-sm border border-slate-200 bg-white px-4 py-12 text-center">
            <div className="text-xs font-semibold text-slate-700">No ELD data</div>
            <div className="mt-1 text-xs text-slate-500">No HOS / ELD records for {selectedName} on {selectedDate}.</div>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Headline remaining clocks — VERBATIM target (flips to Samsara computed clocks with PR C2). */}
            <div className="flex flex-wrap items-stretch gap-2">
              {[
                { label: "Drive left", v: daily.clocks?.drive_remaining_min },
                { label: "Shift (14h) left", v: daily.clocks?.window_remaining_min },
                { label: "Break left", v: daily.clocks?.break_remaining_min },
                { label: "Cycle (70h) left", v: daily.clocks?.cycle_remaining_min },
              ].map((k) => (
                <div key={k.label} className="flex h-[34px] min-w-[130px] flex-1 items-center justify-between rounded-sm border border-slate-200 bg-white px-2.5">
                  <span className="text-[11px] uppercase tracking-wider text-slate-500">{k.label}</span>
                  <span className="text-xs font-semibold tabular-nums text-slate-900">{hmm(k.v)}</span>
                </div>
              ))}
              {verdict ? (
                <div className="flex h-[34px] min-w-[110px] items-center justify-center rounded-sm border border-slate-200 bg-white px-3">
                  <span className={`text-xs font-bold ${verdict.cls}`}>{verdict.label}</span>
                </div>
              ) : null}
            </div>

            {/* Duty-segment ELD log (the day's timeline) */}
            <ParityTable<HosSegment>
              columns={segmentColumns}
              rows={daily.segments}
              rowKey={(segment) => `${segment.start_utc}-${segment.end_utc}-${segment.duty_status}`}
              storageKey="compliance-hos-viewer-segments"
              tableTestId="compliance-hos-viewer-segments-table"
              exportFilename="hos-viewer-duty-segments"
              initialPageSize={15}
              emptyText="No ELD duty-status segments for this date."
            />

            {/* Per-status daily totals */}
            <div className="flex flex-wrap gap-2">
              {TOTAL_ORDER.map((st) => (
                <div key={st} className="flex h-[28px] min-w-[120px] flex-1 items-center justify-between rounded-sm border border-slate-200 bg-white px-2.5">
                  <span className="inline-flex items-center gap-1 text-[11px] uppercase tracking-wider text-slate-500">
                    <span className="inline-block h-[7px] w-[7px] rounded-full" style={{ background: DUTY_COLOR[st] }} />
                    {DUTY_LABEL[st]}
                  </span>
                  <span className="text-xs font-semibold tabular-nums text-slate-900">{hmm(daily.per_status_minutes?.[st] ?? 0)}</span>
                </div>
              ))}
            </div>

            <p className="text-xs text-slate-400">
              Timeline + totals are reconstructed from the ELD duty-status events (recompute). The remaining clocks above are the
              FMCSA-rule numbers and flip to Samsara's certified computed clocks once the verbatim reader (PR&nbsp;C2) ships. The full
              15-column FMCSA daily-log grid is HOS Tracker Block&nbsp;05.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
