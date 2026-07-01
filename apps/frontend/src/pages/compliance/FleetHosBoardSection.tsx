import { useMemo, useState } from "react";
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

// COMPLIANCE-1: a "Live Fleet · refreshes every 5 min" view should only show units that are
// actually reporting. Units last seen years/weeks ago (decommissioned/sold/offline demo units)
// dilute the live picture, inflate the row count, and mislead DOT/insurer reviewers. Defense-in-
// depth on top of the fleet-cleanup migration: units whose last fix is older than this single
// named threshold (or that have never reported) are SEGREGATED out of the default live table into
// a collapsible "Offline / stale (N)" group — additive, the data is never removed. The backend
// `stale` amber flag (hours/1–2 days borderline) is preserved for the units that stay live.
export const OFFLINE_STALE_THRESHOLD_DAYS = 7;
export const OFFLINE_STALE_THRESHOLD_MINUTES = OFFLINE_STALE_THRESHOLD_DAYS * 24 * 60;

/** A row is "offline" when it has no fix at all, or its last fix is older than the threshold. */
export function isFleetRowOffline(
  row: Pick<FleetLocationHosRow, "minutes_since_fix">,
  thresholdMinutes: number = OFFLINE_STALE_THRESHOLD_MINUTES
): boolean {
  const mins = row.minutes_since_fix;
  if (mins == null) return true; // never reported → not part of the live picture
  return mins > thresholdMinutes;
}

/** Split the fleet feed into the default live list and the segregated offline/stale group. */
export function partitionFleetByFreshness(
  rows: FleetLocationHosRow[],
  thresholdMinutes: number = OFFLINE_STALE_THRESHOLD_MINUTES
): { live: FleetLocationHosRow[]; offline: FleetLocationHosRow[] } {
  const live: FleetLocationHosRow[] = [];
  const offline: FleetLocationHosRow[] = [];
  for (const r of rows) {
    (isFleetRowOffline(r, thresholdMinutes) ? offline : live).push(r);
  }
  return { live, offline };
}

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

  const [showOffline, setShowOffline] = useState(false);

  const allRows = query.data?.rows ?? [];
  // COMPLIANCE-1: default view = only units reporting within the freshness threshold; years/weeks-
  // stale (or never-reported) units are segregated into the collapsible group below.
  const { live: liveRows, offline: offlineRows } = useMemo(() => partitionFleetByFreshness(allRows), [allRows]);

  const table = useTableController<FleetLocationHosRow>({
    rows: liveRows,
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
        totalCount={liveRows.length}
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

      {offlineRows.length > 0 ? (
        <div className="mt-4" data-testid="compliance-fleet-hos-offline">
          <button
            type="button"
            onClick={() => setShowOffline((v) => !v)}
            className="flex w-full items-center gap-2 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-100"
            aria-expanded={showOffline}
          >
            <span className="text-slate-400">{showOffline ? "▾" : "▸"}</span>
            Offline / stale ({offlineRows.length})
            <span className="ml-2 font-normal text-slate-500">
              no fix in the last {OFFLINE_STALE_THRESHOLD_DAYS} days — hidden from the live view
            </span>
          </button>
          {showOffline ? (
            <div className="mt-2 overflow-x-auto rounded border border-slate-200 bg-white">
              <table className="w-full table-fixed text-left text-xs">
                <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-2 py-1.5">Unit</th>
                    <th className="px-2 py-1.5">Driver</th>
                    <th className="px-2 py-1.5">City</th>
                    <th className="px-2 py-1.5">State</th>
                    <th className="px-2 py-1.5">Last Update (Laredo)</th>
                  </tr>
                </thead>
                <tbody>
                  {offlineRows.map((r) => (
                    <tr
                      key={r.unit_id}
                      onClick={() => navigate(`/fleet/units/${r.unit_id}`)}
                      className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                      title="Open unit detail"
                    >
                      <td className="px-2 py-1.5 font-medium">{r.unit_number ?? "—"}</td>
                      <td className={`px-2 py-1.5 ${r.driver_name ? "" : "text-slate-400 italic"}`}>{r.driver_name ?? "Not assigned"}</td>
                      <td className={`px-2 py-1.5 ${r.city ? "" : "text-slate-400"}`}>{r.city ?? "—"}</td>
                      <td className={`px-2 py-1.5 ${r.state ? "" : "text-slate-400"}`}>{r.state ?? "—"}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap font-semibold text-amber-700">
                        {r.captured_at_local ?? "Never reported"}
                        {r.minutes_since_fix != null ? (
                          <span className="ml-1 text-[10px] font-normal text-slate-400">({r.minutes_since_fix} min ago)</span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
