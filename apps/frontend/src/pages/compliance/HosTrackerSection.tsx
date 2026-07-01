import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getHosDailyRoster, DUTY_LABEL, DUTY_COLOR, type HosRosterDriver } from "../../api/hosTracker";
import { companyToday } from "../../lib/businessDate";

// SAFETY-1: the roster date defaults to the current duty day in the CARRIER timezone
// (America/Chicago), never the UTC calendar date (which rolls to "tomorrow" after ~19:00 CT).
// Reuse the canonical `companyToday()` — do not reinvent a local Intl formatter.
function laredoToday(): string {
  return companyToday();
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
  // AUTO-06: per-driver cycle drawer — uses the roster row's EXISTING verbatim values (clocks + 8-day
  // breakdown from /hos/daily-roster). Never recomputes clocks (§3.15.9.2).
  const [selectedDriver, setSelectedDriver] = useState<HosRosterDriver | null>(null);

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
                {/* GLOBAL-TABLE-ALIGNMENT (Block A): this section uses a local table (not the shared
                    DataTable/TableHeaderCell), so the numeric HH:MM headers (Drive/Shift/Cycle/Driven)
                    are right-aligned here to sit over the already right-aligned tabular-nums data cells.
                    Text columns (Driver/Unit/Status) stay default left here as in the row markup. */}
                <tr>
                  {[
                    { label: "Driver", numeric: false },
                    { label: "Unit", numeric: false },
                    { label: "Status", numeric: false },
                    { label: "Drive", numeric: true },
                    { label: "Shift", numeric: true },
                    { label: "Cycle", numeric: true },
                    { label: "Driven (cyc)", numeric: true },
                  ].map((h) => (
                    <th key={h.label} className={`px-2 py-1.5 whitespace-nowrap ${h.numeric ? "text-right tabular-nums" : ""}`}>{h.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(roster?.drivers ?? []).map((d) => {
                  const verdict = driverVerdict(d);
                  const dot = d.current_duty_status ? DUTY_COLOR[d.current_duty_status] : "#94A3B8";
                  return (
                    <tr
                      key={d.driver_id}
                      onClick={() => setSelectedDriver(d)}
                      className={`cursor-pointer border-t border-slate-100 hover:bg-slate-50 ${d.available ? "" : "opacity-70"}`}
                      title="Open HOS cycle detail"
                    >
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
      {selectedDriver ? (
        <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/30" onClick={() => setSelectedDriver(null)} />
          <div className="relative z-10 h-full w-[380px] max-w-[90vw] overflow-y-auto bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div>
                <div className="text-sm font-semibold text-slate-900">{selectedDriver.driver_name ?? "—"}</div>
                <div className="text-[11px] text-slate-500">Unit {selectedDriver.unit_number ?? "—"} · {selectedDate} · HOS cycle detail</div>
              </div>
              <button type="button" onClick={() => setSelectedDriver(null)} className="rounded px-2 py-1 text-slate-500 hover:bg-slate-100" aria-label="Close">✕</button>
            </div>
            {!selectedDriver.available || !selectedDriver.clocks ? (
              <div className="px-4 py-10 text-center text-sm text-slate-500">HOS unavailable for this driver on {selectedDate}.</div>
            ) : (
              <div className="space-y-4 px-4 py-4">
                <div>
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Remaining (Samsara certified)</div>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: "Drive", v: selectedDriver.clocks.drive_remaining_min },
                      { label: "Shift (14h)", v: selectedDriver.clocks.window_remaining_min },
                      { label: "Break", v: selectedDriver.clocks.break_remaining_min },
                      { label: "Cycle (70h)", v: selectedDriver.clocks.cycle_remaining_min },
                    ].map((c) => (
                      <div key={c.label} className="rounded border border-slate-200 px-2.5 py-1.5">
                        <div className="text-[9px] uppercase tracking-wide text-slate-500">{c.label}</div>
                        <div className="text-[15px] font-semibold tabular-nums text-slate-900">{hmm(c.v)}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">8-day on-duty (home-terminal days)</div>
                  <div className="space-y-1">
                    {(selectedDriver.eight_day_breakdown ?? []).map((day) => {
                      const pct = Math.min(100, ((day.on_duty_min ?? 0) / (14 * 60)) * 100);
                      return (
                        <div key={day.date} className="flex items-center gap-2">
                          <span className="w-16 shrink-0 text-[10px] text-slate-500">{day.date.slice(5)}</span>
                          <div className="h-3 flex-1 rounded bg-slate-100">
                            <div className="h-3 rounded bg-[#1f2a44]" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="w-12 shrink-0 text-right text-[10px] tabular-nums text-slate-600">{hmm(day.on_duty_min)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <p className="text-[10px] text-slate-400">Verbatim Samsara certified ELD — not recomputed.</p>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
