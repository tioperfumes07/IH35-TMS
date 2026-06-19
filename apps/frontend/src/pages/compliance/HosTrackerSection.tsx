import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getHosDailyRoster, DUTY_LABEL, DUTY_COLOR, type HosRosterDriver } from "../../api/hosTracker";

// Laredo (America/Chicago) calendar today as YYYY-MM-DD.
function laredoToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
// The 8-day strip ending today (Laredo), oldest→newest.
function buildDayStrip(today: string): { date: string; mon: string; day: string; weekday: string; isToday: boolean }[] {
  const base = new Date(`${today}T12:00:00Z`);
  const out: { date: string; mon: string; day: string; weekday: string; isToday: boolean }[] = [];
  for (let i = 7; i >= 0; i--) {
    const d = new Date(base.getTime() - i * 86_400_000);
    const iso = d.toISOString().slice(0, 10);
    out.push({
      date: iso,
      mon: new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short" }).format(d),
      day: new Intl.DateTimeFormat("en-US", { timeZone: "UTC", day: "numeric" }).format(d),
      weekday: i === 0 ? "Today" : new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short" }).format(d),
      isToday: i === 0,
    });
  }
  return out;
}

function hmm(min: number | null): string {
  if (min == null) return "—";
  const s = min < 0 ? "-" : "";
  const a = Math.abs(min);
  return `${s}${Math.floor(a / 60)}:${String(a % 60).padStart(2, "0")}`;
}

const STATUS_VERDICT: Record<string, { label: string; cls: string }> = {
  ok: { label: "OK", cls: "text-emerald-700" },
  warning_1hr: { label: "Low", cls: "text-amber-700" },
  warning_15min: { label: "Low", cls: "text-amber-700" },
  violation: { label: "Violation", cls: "text-red-700" },
};

function driverVerdict(d: HosRosterDriver): { label: string; cls: string } {
  if (!d.available || !d.clocks) return { label: "Unavailable", cls: "text-slate-400" };
  return STATUS_VERDICT[d.clocks.status] ?? { label: "OK", cls: "text-emerald-700" };
}

export function HosTrackerSection({ operatingCompanyId }: { operatingCompanyId: string }) {
  const today = laredoToday();
  const strip = useMemo(() => buildDayStrip(today), [today]);
  const [selectedDate, setSelectedDate] = useState(today);

  const rosterQ = useQuery({
    queryKey: ["compliance", "hos-roster", operatingCompanyId, selectedDate],
    queryFn: () => getHosDailyRoster(operatingCompanyId, selectedDate),
    enabled: Boolean(operatingCompanyId),
    refetchInterval: 5 * 60 * 1000,
    staleTime: 60_000,
  });
  const roster = rosterQ.data;
  const c = roster?.counts ?? { active: 0, on_duty: 0, driving: 0, low: 0, violation: 0, unavailable: 0 };
  const asOf = roster?.generated_at ? new Date(roster.generated_at).toLocaleTimeString("en-US", { timeZone: "America/Chicago", hour: "2-digit", minute: "2-digit", hour12: false }) : null;

  const kpis: { label: string; value: number; cls: string }[] = [
    { label: "On Duty", value: c.on_duty, cls: "text-slate-900" },
    { label: "Driving", value: c.driving, cls: "text-slate-900" },
    { label: "Low hours", value: c.low, cls: "text-amber-700" },
    { label: "Violation", value: c.violation, cls: "text-red-700" },
    { label: "Unavailable", value: c.unavailable, cls: "text-slate-500" },
  ];

  return (
    <section data-testid="compliance-section-hos-tracker">
      {/* Section band */}
      <div className="flex items-center bg-[#F1EFE8] px-3" style={{ height: 26 }}>
        <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-500">
          Driver duty-status timeline · {selectedDate === today ? "today" : selectedDate}
        </span>
        <span className="ml-auto text-[10px] text-slate-400">
          {c.active} active · {c.unavailable} unavailable{asOf ? ` · as of ${asOf} CT` : ""}
        </span>
      </div>

      <div className="space-y-3 px-1 py-3">
        {/* KPI row */}
        <div className="flex flex-wrap gap-2">
          {kpis.map((k) => (
            <div key={k.label} className="flex h-[30px] min-w-[120px] flex-1 items-center justify-between rounded border border-slate-200 bg-white px-2.5">
              <span className="text-[9px] uppercase tracking-[0.05em] text-slate-500">{k.label}</span>
              <span className={`text-[16px] font-semibold tabular-nums ${k.cls}`}>{k.value}</span>
            </div>
          ))}
        </div>

        {/* 8-day day-strip selector */}
        <div className="flex flex-wrap gap-1.5">
          {strip.map((d) => (
            <button
              key={d.date}
              type="button"
              onClick={() => setSelectedDate(d.date)}
              className={`rounded border px-2.5 py-1 text-center text-[11px] leading-tight ${selectedDate === d.date ? "border-slate-800 font-bold text-slate-900 shadow-[inset_0_-2px_0_#1f2a44]" : "border-slate-200 text-slate-500"}`}
            >
              {d.mon} {d.day}
              <span className="block text-[8.5px] text-slate-400">{d.weekday}</span>
            </button>
          ))}
        </div>

        {/* Body — Block 03 (ELD timeline) renders above this; Block 04 replaces this summary with the dense
            sortable+resizable table. For now: an honest per-driver summary from the canonical roster. */}
        {rosterQ.isLoading ? (
          <div className="space-y-1">
            {[0, 1, 2, 3].map((i) => <div key={i} className="h-[28px] animate-pulse rounded bg-slate-100" />)}
          </div>
        ) : rosterQ.isError ? (
          <div className="px-3 py-6 text-sm text-red-600">Failed to load HOS roster.</div>
        ) : (
          <div className="overflow-x-auto rounded border border-slate-200 bg-white">
            <table className="w-full text-left text-[11px]">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                <tr>
                  {["Driver", "Unit", "Status", "Drive", "Shift", "Cycle", "Driven (cyc)"].map((h) => (
                    <th key={h} className="px-2 py-1.5 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(roster?.drivers ?? []).map((d) => {
                  const verdict = driverVerdict(d);
                  const dot = d.current_duty_status ? DUTY_COLOR[d.current_duty_status] : "#94A3B8";
                  return (
                    <tr key={d.driver_id} className={`border-t border-slate-100 ${d.available ? "" : "opacity-70"}`}>
                      <td className="px-2 py-1.5 font-medium text-slate-900">{d.driver_name ?? "—"}</td>
                      <td className="px-2 py-1.5 font-mono">{d.unit_number ?? "—"}</td>
                      <td className="px-2 py-1.5">
                        <span className={`inline-flex items-center gap-1 font-semibold ${verdict.cls}`}>
                          <span className="inline-block h-[7px] w-[7px] rounded-full" style={{ background: d.available ? dot : "#94A3B8" }} />
                          {d.available && d.current_duty_status ? DUTY_LABEL[d.current_duty_status] : verdict.label}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono tabular-nums">{d.clocks ? hmm(d.clocks.drive_remaining_min) : "—"}</td>
                      <td className="px-2 py-1.5 text-right font-mono tabular-nums">{d.clocks ? hmm(d.clocks.window_remaining_min) : "—"}</td>
                      <td className="px-2 py-1.5 text-right font-mono tabular-nums">{d.clocks ? hmm(d.clocks.cycle_remaining_min) : "—"}</td>
                      <td className="px-2 py-1.5 text-right font-mono tabular-nums">{d.driven_cycle_min != null ? hmm(d.driven_cycle_min) : "—"}</td>
                    </tr>
                  );
                })}
                {roster && roster.drivers.length === 0 ? (
                  <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-500">No active drivers.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
