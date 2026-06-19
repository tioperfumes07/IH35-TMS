import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "../../components/Button";
import {
  getFleetLocationHos,
  downloadFleetLocationHosXlsx,
  type FleetLocationHosRow,
} from "../../api/reports";

function hmm(min: number | null): string {
  if (min == null || Number.isNaN(min)) return "—";
  const s = min < 0 ? "-" : "";
  const a = Math.abs(min);
  return `${s}${Math.floor(a / 60)}:${String(a % 60).padStart(2, "0")}`;
}
function num(n: number | null, digits = 0): string {
  return n == null ? "—" : n.toFixed(digits);
}

const HOS_WARN_MIN = 60; // shift/drive remaining under this → amber

export function FleetHosBoardSection({ operatingCompanyId }: { operatingCompanyId: string }) {
  const companyId = operatingCompanyId;
  const [search, setSearch] = useState("");

  const query = useQuery({
    queryKey: ["compliance", "fleet-location-hos", companyId],
    queryFn: () => getFleetLocationHos(companyId),
    enabled: Boolean(companyId),
    refetchInterval: 5 * 60 * 1000, // live, every 5 min (CST/Laredo)
    staleTime: 60_000,
  });

  const rows = useMemo(() => query.data?.rows ?? [], [query.data?.rows]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        (r.unit_number ?? "").toLowerCase().includes(q) || (r.driver_name ?? "").toLowerCase().includes(q)
    );
  }, [rows, search]);

  return (
    <section data-testid="compliance-section-fleet-hos">
      <div className="mb-2">
        <h2 className="text-base font-semibold text-slate-900">Live Fleet — Location &amp; Hours of Service</h2>
        <p className="text-xs text-slate-500">Every vehicle Samsara reports, its current driver, and HOS clocks (refreshes every 5 min).</p>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-3 print:hidden">
        <input
          className="h-9 w-56 rounded border border-slate-300 px-2 text-sm"
          placeholder="Search unit or driver…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span className="text-xs text-slate-500">
          {filtered.length} of {rows.length} reporting vehicles
          {query.data?.generated_at ? ` · as of ${new Date(query.data.generated_at).toLocaleTimeString()}` : ""}
        </span>
        <div className="ml-auto flex gap-2">
          <Button type="button" variant="secondary" onClick={() => void query.refetch()}>
            Refresh
          </Button>
          <Button type="button" variant="secondary" onClick={() => void downloadFleetLocationHosXlsx(companyId).catch(() => undefined)}>
            ⬇ Export (Excel)
          </Button>
        </div>
      </div>

      {query.isLoading ? (
        <div className="px-3 py-6 text-sm text-slate-500">Loading fleet HOS…</div>
      ) : query.isError ? (
        <div className="px-3 py-6 text-sm text-red-600">Failed to load fleet HOS.</div>
      ) : (
        <div className="overflow-x-auto rounded border border-slate-200 bg-white">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 z-10 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
              <tr>
                {["Unit", "Driver", "City", "State", "Speed", "Heading", "Engine", "Last Fix (Laredo)", "Min Ago",
                  "Drive Rem (11h)", "Shift Rem (14h)", "Break Rem", "Cycle Rem (70h)", "HOS", "Map"].map((h) => (
                  <th key={h} className="px-2 py-2 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r: FleetLocationHosRow) => (
                <tr key={r.unit_id} className={`border-t border-slate-100 hover:bg-slate-50 ${r.stale ? "bg-amber-50" : ""}`}>
                  <td className="px-2 py-1.5 font-medium">{r.unit_number ?? "—"}</td>
                  <td className={`px-2 py-1.5 ${r.driver_name ? "" : "text-slate-400 italic"}`}>{r.driver_name ?? "Not assigned"}</td>
                  {/* City/State from Samsara reverseGeo (stats?types=gps,engineStates ingest). */}
                  <td className={`px-2 py-1.5 ${r.city ? "" : "text-slate-400"}`} title={r.formatted_location ?? undefined}>{r.city ?? "—"}</td>
                  <td className={`px-2 py-1.5 ${r.state ? "" : "text-slate-400"}`}>{r.state ?? "—"}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{num(r.speed_mph)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{num(r.heading_deg)}</td>
                  <td className="px-2 py-1.5">{r.engine_state ?? "—"}</td>
                  <td className={`px-2 py-1.5 whitespace-nowrap ${r.stale ? "font-semibold text-amber-700" : ""}`}>
                    {r.captured_at_local ?? "—"}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{r.minutes_since_fix ?? "—"}</td>
                  <td className={`px-2 py-1.5 text-right tabular-nums ${r.drive_remaining_min != null && r.drive_remaining_min < HOS_WARN_MIN ? "text-amber-700 font-semibold" : ""}`}>
                    {hmm(r.drive_remaining_min)}
                  </td>
                  <td className={`px-2 py-1.5 text-right tabular-nums ${r.window_remaining_min != null && r.window_remaining_min < HOS_WARN_MIN ? "text-amber-700 font-semibold" : ""}`}>
                    {hmm(r.window_remaining_min)}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{hmm(r.break_remaining_min)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{hmm(r.cycle_remaining_min)}</td>
                  <td className="px-2 py-1.5">{r.hos_status ?? "—"}</td>
                  <td className="px-2 py-1.5">
                    {r.lat != null && r.lng != null ? (
                      <a className="text-sky-700 hover:underline" href={`https://www.google.com/maps?q=${r.lat},${r.lng}`} target="_blank" rel="noopener noreferrer">
                        map
                      </a>
                    ) : "—"}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 ? (
                <tr><td colSpan={15} className="px-3 py-6 text-center text-slate-500">No reporting vehicles.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-[11px] text-slate-400">
        City/State columns await a reverse-geocoding source (Samsara reverse-geo ingest or a geocoding service +
        cache) — see docs. Lat/Lng + Map link give exact position meanwhile.
      </p>
    </section>
  );
}
