import { Button } from "../../components/Button";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  getFleetLocationHos,
  downloadFleetLocationHosXlsx,
  type FleetLocationHosRow,
} from "../../api/reports";
import {
  TableControls,
  Paginator,
  TableHeaderCell,
  useTableController,
  type TableColumn,
} from "../../components/table";

function hmm(min: number | null): string {
  if (min == null || Number.isNaN(min)) return "—";
  const s = min < 0 ? "-" : "";
  const a = Math.abs(min);
  return `${s}${Math.floor(a / 60)}:${String(a % 60).padStart(2, "0")}`;
}
// DEFENSIVE: speed_mph/lat/lng/heading_deg arrive as STRINGS from node-postgres numeric columns (the API
// types claim number but lie). Calling .toFixed() on a string threw "toFixed is not a function" and the whole
// Live Fleet HOS section was skipped (Jorge saw no HOS). Coerce to number + guard NaN so this can't recur even
// if the serializer regresses. The backend (fleet-location-hos toNum) is the primary fix; this is the backstop.
export function num(n: number | string | null | undefined, digits = 0): string {
  if (n == null || n === "") return "—";
  const v = typeof n === "number" ? n : Number(n);
  return Number.isFinite(v) ? v.toFixed(digits) : "—";
}

const HOS_WARN_MIN = 60; // shift/drive remaining under this → amber

// GLOBAL-TABLE-CONTROLS: every column sortable (click asc→desc→off) + resizable (drag edge, persists per user).
// "LAST UPDATE" (the real position date+time) replaces the confusing standalone "MIN AGO" as the prominent
// staleness signal; min-ago is kept only as a muted relative hint inside that cell.
// GLOBAL-TABLE-ALIGNMENT (Block A): numeric columns (speed/heading + the four HOS HH:MM clocks)
// marked `numeric` so the shared TableHeaderCell right-aligns the HEADER over the right-aligned
// tabular-nums data cells below. Text columns stay default (center).
const FLEET_HOS_COLUMNS: TableColumn[] = [
  { key: "unit_number", label: "Unit", alwaysVisible: true },
  { key: "driver_name", label: "Driver" },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "speed_mph", label: "Speed", numeric: true },
  { key: "heading_deg", label: "Heading", numeric: true },
  { key: "engine_state", label: "Engine" },
  { key: "last_update", label: "Last Update (Laredo)" },
  { key: "drive_remaining_min", label: "Drive Rem (11h)", numeric: true },
  { key: "window_remaining_min", label: "Shift Rem (14h)", numeric: true },
  { key: "break_remaining_min", label: "Break Rem", numeric: true },
  { key: "cycle_remaining_min", label: "Cycle Rem (70h)", numeric: true },
  { key: "hos_status", label: "HOS" },
  { key: "map", label: "Map" },
];

function fleetHosSearchText(r: FleetLocationHosRow): string {
  return [r.unit_number, r.driver_name, r.city, r.state].filter(Boolean).join(" ");
}

// Per-column sort value — sorts the FULL dataset (not just the visible page). Timestamps sort by ISO string
// (chronological); numeric HOS/telemetry sort numerically; "map" is presentation-only (not sortable).
function fleetHosSortValue(r: FleetLocationHosRow, key: string): string | number | null {
  switch (key) {
    case "unit_number": return r.unit_number ?? null;
    case "driver_name": return r.driver_name ?? null;
    case "city": return r.city ?? null;
    case "state": return r.state ?? null;
    case "speed_mph": return r.speed_mph ?? null;
    case "heading_deg": return r.heading_deg ?? null;
    case "engine_state": return r.engine_state ?? null;
    case "last_update": return r.captured_at_utc ?? null;
    case "drive_remaining_min": return r.drive_remaining_min ?? null;
    case "window_remaining_min": return r.window_remaining_min ?? null;
    case "break_remaining_min": return r.break_remaining_min ?? null;
    case "cycle_remaining_min": return r.cycle_remaining_min ?? null;
    case "hos_status": return r.hos_status ?? null;
    default: return null;
  }
}

export function FleetHosBoardSection({ operatingCompanyId }: { operatingCompanyId: string }) {
  const companyId = operatingCompanyId;
  const navigate = useNavigate(); // AUTO-07: row click → unit detail (clickable sweep)

  const query = useQuery({
    queryKey: ["compliance", "fleet-location-hos", companyId],
    queryFn: () => getFleetLocationHos(companyId),
    enabled: Boolean(companyId),
    refetchInterval: 5 * 60 * 1000, // live, every 5 min (CST/Laredo)
    staleTime: 60_000,
  });

  const rows = query.data?.rows ?? [];
  const table = useTableController<FleetLocationHosRow>({
    rows,
    columns: FLEET_HOS_COLUMNS,
    tableKey: "compliance-fleet-hos",
    searchText: fleetHosSearchText,
    sortValue: fleetHosSortValue,
    defaultPageSize: 50,
  });
  const isVisible = (key: string) => table.isColumnVisible(key);
  const pageRows = table.paged;

  return (
    <section data-testid="compliance-section-fleet-hos">
      <div className="mb-2">
        <h2 className="text-base font-semibold text-slate-900">Live Fleet — Location &amp; Hours of Service</h2>
        <p className="text-xs text-slate-500">Every vehicle Samsara reports, its current driver, and HOS clocks (refreshes every 5 min).</p>
      </div>

      <TableControls
        search={table.search}
        onSearchChange={table.setSearch}
        searchPlaceholder="Search unit, driver, city…"
        filteredCount={table.filteredCount}
        totalCount={rows.length}
        columns={FLEET_HOS_COLUMNS}
        hidden={table.hidden}
        onToggleColumn={table.toggleColumn}
        pageSize={table.pageSize}
        onPageSizeChange={table.setPageSize}
      >
        <span className="text-xs text-slate-500">
          {query.data?.generated_at ? `as of ${new Date(query.data.generated_at).toLocaleTimeString()}` : ""}
        </span>
        <div className="ml-auto flex gap-2">
          <Button type="button" variant="secondary" onClick={() => void query.refetch()}>
            Refresh
          </Button>
          <Button type="button" variant="secondary" onClick={() => void downloadFleetLocationHosXlsx(companyId).catch(() => undefined)}>
            ⬇ Export (Excel)
          </Button>
        </div>
      </TableControls>

      {query.isLoading ? (
        <div className="px-3 py-6 text-sm text-slate-500">Loading fleet HOS…</div>
      ) : query.isError ? (
        <div className="px-3 py-6 text-sm text-red-600">Failed to load fleet HOS.</div>
      ) : (
        <div className="overflow-x-auto rounded border border-slate-200 bg-white">
          <table className="w-full table-fixed text-left text-xs">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
              <tr>
                {FLEET_HOS_COLUMNS.filter((c) => isVisible(c.key)).map((c) => (
                  <TableHeaderCell
                    key={c.key}
                    columnKey={c.key}
                    label={c.label}
                    sortable={c.key !== "map"}
                    sortKey={table.sortKey}
                    sortDir={table.sortDir}
                    onToggleSort={table.toggleSort}
                    width={table.widths[c.key]}
                    onResize={table.setColumnWidth}
                    align={c.align}
                    numeric={c.numeric}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r: FleetLocationHosRow) => (
                <tr
                  key={r.unit_id}
                  onClick={() => navigate(`/fleet/units/${r.unit_id}`)}
                  className={`cursor-pointer border-t border-slate-100 hover:bg-slate-50 ${r.stale ? "bg-amber-50" : ""}`}
                  title="Open unit detail"
                >
                  {isVisible("unit_number") ? <td className="px-2 py-1.5 font-medium">{r.unit_number ?? "—"}</td> : null}
                  {isVisible("driver_name") ? (
                    <td className={`px-2 py-1.5 ${r.driver_name ? "" : "text-slate-400 italic"}`}>{r.driver_name ?? "Not assigned"}</td>
                  ) : null}
                  {isVisible("city") ? (
                    <td className={`px-2 py-1.5 ${r.city ? "" : "text-slate-400"}`} title={r.formatted_location ?? undefined}>{r.city ?? "—"}</td>
                  ) : null}
                  {isVisible("state") ? <td className={`px-2 py-1.5 ${r.state ? "" : "text-slate-400"}`}>{r.state ?? "—"}</td> : null}
                  {isVisible("speed_mph") ? <td className="px-2 py-1.5 text-right tabular-nums">{num(r.speed_mph)}</td> : null}
                  {isVisible("heading_deg") ? <td className="px-2 py-1.5 text-right tabular-nums">{num(r.heading_deg)}</td> : null}
                  {isVisible("engine_state") ? <td className="px-2 py-1.5">{r.engine_state ?? "—"}</td> : null}
                  {isVisible("last_update") ? (
                    <td className={`px-2 py-1.5 whitespace-nowrap ${r.stale ? "font-semibold text-amber-700" : ""}`}>
                      {r.captured_at_local ?? "—"}
                      {r.minutes_since_fix != null ? (
                        <span className="ml-1 text-[10px] text-slate-400">({r.minutes_since_fix} min ago)</span>
                      ) : null}
                    </td>
                  ) : null}
                  {isVisible("drive_remaining_min") ? (
                    <td className={`px-2 py-1.5 text-right tabular-nums ${r.drive_remaining_min != null && r.drive_remaining_min < HOS_WARN_MIN ? "text-amber-700 font-semibold" : ""}`}>
                      {hmm(r.drive_remaining_min)}
                    </td>
                  ) : null}
                  {isVisible("window_remaining_min") ? (
                    <td className={`px-2 py-1.5 text-right tabular-nums ${r.window_remaining_min != null && r.window_remaining_min < HOS_WARN_MIN ? "text-amber-700 font-semibold" : ""}`}>
                      {hmm(r.window_remaining_min)}
                    </td>
                  ) : null}
                  {isVisible("break_remaining_min") ? <td className="px-2 py-1.5 text-right tabular-nums">{hmm(r.break_remaining_min)}</td> : null}
                  {isVisible("cycle_remaining_min") ? <td className="px-2 py-1.5 text-right tabular-nums">{hmm(r.cycle_remaining_min)}</td> : null}
                  {isVisible("hos_status") ? (
                    <td className={`px-2 py-1.5 ${r.hos_status === "unavailable" ? "text-slate-400 italic" : ""}`}>{r.hos_status ?? "—"}</td>
                  ) : null}
                  {isVisible("map") ? (
                    <td className="px-2 py-1.5">
                      {r.lat != null && r.lng != null ? (
                        <a className="text-slate-700 hover:underline" href={`https://www.google.com/maps?q=${r.lat},${r.lng}`} target="_blank" rel="noopener noreferrer">
                          map
                        </a>
                      ) : "—"}
                    </td>
                  ) : null}
                </tr>
              ))}
              {pageRows.length === 0 ? (
                <tr><td colSpan={FLEET_HOS_COLUMNS.length} className="px-3 py-6 text-center text-slate-500">No reporting vehicles.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}

      <Paginator page={table.page} pageCount={table.pageCount} onPageChange={table.setPage} />
    </section>
  );
}
