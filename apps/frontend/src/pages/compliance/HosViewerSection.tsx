import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Combobox, type ComboboxOption } from "../../components/Combobox";
import { listDrivers } from "../../api/mdata";
import { getHosDaily, getHosDailyRoster, DUTY_LABEL, DUTY_COLOR, type HosDutyStatus } from "../../api/hosTracker";
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
  ok: { label: "OK", cls: "text-emerald-700" },
  warning_1hr: { label: "Low (<1h)", cls: "text-amber-700" },
  warning_15min: { label: "Low (<15m)", cls: "text-amber-700" },
  violation: { label: "Violation", cls: "text-red-700" },
};
const TOTAL_ORDER: HosDutyStatus[] = ["driving", "on_duty_not_driving", "sleeper", "off_duty", "personal_conveyance", "yard_moves"];

export function HosViewerSection({ operatingCompanyId }: { operatingCompanyId: string }) {
  const today = laredoToday();
  const strip = useMemo(() => buildDayStrip(today), [today]);
  const [selectedDate, setSelectedDate] = useState(today);
  const [driverId, setDriverId] = useState<string | null>(null);

  // Picker source = all ACTIVE drivers (so all 49 are selectable, not just the 8 with HOS today).
  const driversQ = useQuery({
    queryKey: ["hos-viewer", "drivers", operatingCompanyId],
    queryFn: () => listDrivers({ operating_company_id: operatingCompanyId, status: "Active", limit: 500 }),
    enabled: Boolean(operatingCompanyId),
    staleTime: 5 * 60 * 1000,
  });
  // Roster for the chosen date = who HAS HOS data + their unit number (always passes date; roster 400s without it).
  const rosterQ = useQuery({
    queryKey: ["hos-viewer", "roster", operatingCompanyId, selectedDate],
    queryFn: () => getHosDailyRoster(operatingCompanyId, selectedDate),
    enabled: Boolean(operatingCompanyId),
    staleTime: 60_000,
  });

  const rosterByDriver = useMemo(() => {
    const m = new Map<string, { unit: string | null; hasData: boolean }>();
    for (const d of rosterQ.data?.drivers ?? []) m.set(d.driver_id, { unit: d.unit_number, hasData: d.available });
    return m;
  }, [rosterQ.data]);

  const options: ComboboxOption[] = useMemo(() => {
    const drivers = driversQ.data?.drivers ?? [];
    return drivers
      .map((d) => {
        const name = [d.first_name, d.last_name].filter(Boolean).join(" ") || d.id;
        const meta = rosterByDriver.get(d.id);
        const bits: string[] = [];
        if (meta?.unit) bits.push(`Unit ${meta.unit}`);
        if (meta?.hasData) bits.push("HOS today");
        return { value: d.id, label: name, sublabel: bits.join(" · ") || undefined };
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [driversQ.data, rosterByDriver]);

  // Auto-select so the Viewer is never an empty prompt: prefer the first roster driver WITH HOS data for the date,
  // else the first active driver.
  useEffect(() => {
    if (driverId) return;
    const firstWithData = (rosterQ.data?.drivers ?? []).find((d) => d.available);
    if (firstWithData) { setDriverId(firstWithData.driver_id); return; }
    const firstActive = driversQ.data?.drivers?.[0];
    if (firstActive) setDriverId(firstActive.id);
  }, [driverId, rosterQ.data, driversQ.data]);

  const dailyQ = useQuery({
    queryKey: ["hos-viewer", "daily", operatingCompanyId, driverId, selectedDate],
    queryFn: () => getHosDaily(operatingCompanyId, driverId as string, selectedDate),
    enabled: Boolean(operatingCompanyId && driverId),
    staleTime: 60_000,
  });

  const selectedName = options.find((o) => o.value === driverId)?.label ?? "driver";
  const daily = dailyQ.data;
  const verdict = daily?.clocks ? STATUS_VERDICT[daily.clocks.status] ?? STATUS_VERDICT.ok : null;

  return (
    <section data-testid="compliance-section-hos-viewer">
      {/* Picker + date controls */}
      <div className="flex flex-wrap items-end gap-3 rounded border border-slate-200 bg-white px-3 py-3">
        <div className="min-w-[260px] flex-1">
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-500">Driver</label>
          <Combobox
            options={options}
            value={driverId}
            onChange={setDriverId}
            placeholder={driversQ.isLoading ? "Loading drivers…" : "Search a driver…"}
            loading={driversQ.isLoading}
            filterMode="contains"
            dataField="hos-viewer-driver"
          />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-500">Date</label>
          <input
            type="date"
            value={selectedDate}
            max={today}
            onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
            className="h-[34px] rounded border border-slate-300 px-2 text-[12px] text-slate-800"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {strip.map((d) => (
            <button
              key={d.date}
              type="button"
              onClick={() => setSelectedDate(d.date)}
              className={`rounded border px-2 py-1 text-center text-[10px] leading-tight ${selectedDate === d.date ? "border-slate-800 font-bold text-slate-900 shadow-[inset_0_-2px_0_#1f2a44]" : "border-slate-200 text-slate-500"}`}
            >
              {d.mon} {d.day}
              <span className="block text-[8px] text-slate-400">{d.weekday}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="mt-3">
        {!driverId ? (
          <div className="rounded border border-slate-200 bg-white px-4 py-12 text-center">
            <div className="text-sm font-semibold text-slate-700">HOS Viewer</div>
            <div className="mt-1 text-xs text-slate-500">Pick a driver above to open their daily ELD log.</div>
          </div>
        ) : dailyQ.isLoading ? (
          <div className="space-y-1">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-[26px] animate-pulse rounded bg-slate-100" />)}</div>
        ) : dailyQ.isError ? (
          <div className="rounded border border-slate-200 bg-white px-4 py-10 text-center text-sm text-red-600">Failed to load the ELD log for {selectedName}.</div>
        ) : !daily || daily.available === false || (daily.segments?.length ?? 0) === 0 ? (
          <div className="rounded border border-slate-200 bg-white px-4 py-12 text-center">
            <div className="text-sm font-semibold text-slate-700">No ELD data</div>
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
                <div key={k.label} className="flex h-[34px] min-w-[130px] flex-1 items-center justify-between rounded border border-slate-200 bg-white px-2.5">
                  <span className="text-[9px] uppercase tracking-[0.05em] text-slate-500">{k.label}</span>
                  <span className="text-[15px] font-semibold tabular-nums text-slate-900">{hmm(k.v)}</span>
                </div>
              ))}
              {verdict ? (
                <div className="flex h-[34px] min-w-[110px] items-center justify-center rounded border border-slate-200 bg-white px-3">
                  <span className={`text-[13px] font-bold ${verdict.cls}`}>{verdict.label}</span>
                </div>
              ) : null}
            </div>

            {/* Duty-segment ELD log (the day's timeline) */}
            <div className="overflow-x-auto rounded border border-slate-200 bg-white">
              <table className="w-full text-left text-[11px]">
                <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                  <tr>
                    {["Duty status", "Start (CT)", "End (CT)", "Duration"].map((h) => (
                      <th key={h} className="whitespace-nowrap px-2 py-1.5">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {daily.segments.map((s, i) => (
                    <tr key={`${s.start_utc}-${i}`} className="border-t border-slate-100">
                      <td className="px-2 py-1.5">
                        <span className="inline-flex items-center gap-1.5 font-medium text-slate-800">
                          <span className="inline-block h-[8px] w-[8px] rounded-full" style={{ background: DUTY_COLOR[s.duty_status] }} />
                          {DUTY_LABEL[s.duty_status]}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-center font-mono tabular-nums">{clockTime(s.start_utc)}</td>
                      <td className="px-2 py-1.5 text-center font-mono tabular-nums">{clockTime(s.end_utc)}</td>
                      <td className="px-2 py-1.5 text-right font-mono tabular-nums">{hmm(s.minutes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Per-status daily totals */}
            <div className="flex flex-wrap gap-2">
              {TOTAL_ORDER.map((st) => (
                <div key={st} className="flex h-[28px] min-w-[120px] flex-1 items-center justify-between rounded border border-slate-200 bg-white px-2.5">
                  <span className="inline-flex items-center gap-1 text-[9px] uppercase tracking-[0.05em] text-slate-500">
                    <span className="inline-block h-[7px] w-[7px] rounded-full" style={{ background: DUTY_COLOR[st] }} />
                    {DUTY_LABEL[st]}
                  </span>
                  <span className="text-[13px] font-semibold tabular-nums text-slate-900">{hmm(daily.per_status_minutes?.[st] ?? 0)}</span>
                </div>
              ))}
            </div>

            <p className="text-[10px] text-slate-400">
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
