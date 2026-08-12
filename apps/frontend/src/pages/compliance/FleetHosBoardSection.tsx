import { useMemo, useState } from "react";
import { Button } from "../../components/Button";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  getFleetLocationHos,
  downloadFleetLocationHosXlsx,
  type FleetLocationHosRow,
} from "../../api/reports";
import { ListErrorState } from "../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { formatClockTimeCT } from "../../lib/businessDate";
import { entityLabel } from "../../lib/entity-label";
import { EntityLink } from "../../components/shared/EntityLink";

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
  return Number.isFinite(v) ? Number(v).toFixed(digits) : "—";
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

// GLOBAL-TABLE-CONTROLS: every data column sortable and resizable via the shared ParityTable grammar.
// "LAST UPDATE" (the real position date+time) replaces the confusing standalone "MIN AGO" as the prominent
// staleness signal; min-ago is kept only as a muted relative hint inside that cell.
// GLOBAL-TABLE-ALIGNMENT (Block A): numeric columns (speed/heading + the four HOS HH:MM clocks)
// right-align the header and cells through matching column classes.
const FLEET_HOS_COLUMNS: ParityColumn<FleetLocationHosRow>[] = [
  {
    key: "unit_number",
    label: "Unit",
    alwaysVisible: true,
    sortable: true,
    cellClass: "font-medium",
    render: (row) => <EntityLink kind="unit" id={row.unit_id} label={entityLabel(row.unit_number, row.unit_id, "Unit")} onClick={(event) => event.stopPropagation()} />,
  },
  {
    key: "driver_name",
    label: "Driver",
    sortable: true,
    render: (row) => (
      <span className={row.driver_name ? "" : "text-slate-400 italic"}>
        {entityLabel(row.driver_name, row.driver_id, "Driver")}
      </span>
    ),
  },
  {
    key: "city",
    label: "City",
    sortable: true,
    render: (row) => (
      <span className={row.city ? "" : "text-slate-400"} title={row.formatted_location ?? undefined}>
        {row.city ?? "—"}
      </span>
    ),
  },
  {
    key: "state",
    label: "State",
    sortable: true,
    render: (row) => <span className={row.state ? "" : "text-slate-400"}>{row.state ?? "—"}</span>,
  },
  {
    key: "speed_mph",
    label: "Speed",
    sortable: true,
    className: "text-right",
    cellClass: "text-right tabular-nums",
    sortValue: (row) => (row.speed_mph == null ? null : Number(row.speed_mph)),
    render: (row) => num(row.speed_mph),
  },
  {
    key: "heading_deg",
    label: "Heading",
    sortable: true,
    className: "text-right",
    cellClass: "text-right tabular-nums",
    sortValue: (row) => (row.heading_deg == null ? null : Number(row.heading_deg)),
    render: (row) => num(row.heading_deg),
  },
  {
    key: "engine_state",
    label: "Engine",
    sortable: true,
    render: (row) => row.engine_state ?? "—",
  },
  {
    key: "last_update",
    label: "Last Update (Laredo)",
    sortable: true,
    sortValue: (row) => row.captured_at_utc,
    render: (row) => (
      <span className={`whitespace-nowrap ${row.stale ? "font-semibold text-slate-700" : ""}`}>
        {row.captured_at_local ?? "—"}
        {row.minutes_since_fix != null ? (
          <span className="ml-1 text-[10px] text-slate-400">({row.minutes_since_fix} min ago)</span>
        ) : null}
      </span>
    ),
  },
  {
    key: "drive_remaining_min",
    label: "Drive Rem (11h)",
    sortable: true,
    className: "text-right",
    cellClass: "text-right tabular-nums",
    render: (row) => (
      <span className={row.drive_remaining_min != null && row.drive_remaining_min < HOS_WARN_MIN ? "font-semibold text-slate-700" : ""}>
        {hmm(row.drive_remaining_min)}
      </span>
    ),
  },
  {
    key: "window_remaining_min",
    label: "Shift Rem (14h)",
    sortable: true,
    className: "text-right",
    cellClass: "text-right tabular-nums",
    render: (row) => (
      <span className={row.window_remaining_min != null && row.window_remaining_min < HOS_WARN_MIN ? "font-semibold text-slate-700" : ""}>
        {hmm(row.window_remaining_min)}
      </span>
    ),
  },
  {
    key: "break_remaining_min",
    label: "Break Rem",
    sortable: true,
    className: "text-right",
    cellClass: "text-right tabular-nums",
    render: (row) => hmm(row.break_remaining_min),
  },
  {
    key: "cycle_remaining_min",
    label: "Cycle Rem (70h)",
    sortable: true,
    className: "text-right",
    cellClass: "text-right tabular-nums",
    render: (row) => hmm(row.cycle_remaining_min),
  },
  {
    key: "hos_status",
    label: "HOS",
    sortable: true,
    render: (row) => (
      <span className={row.hos_status === "unavailable" ? "text-slate-400 italic" : ""}>
        {row.hos_status ?? "—"}
      </span>
    ),
  },
  {
    key: "map",
    label: "Map",
    render: (row) =>
      row.lat != null && row.lng != null ? (
        <a
          className="text-slate-700 hover:underline"
          href={`https://www.google.com/maps?q=${row.lat},${row.lng}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(event) => event.stopPropagation()}
        >
          map
        </a>
      ) : (
        "—"
      ),
  },
];

function fleetHosSearchText(r: FleetLocationHosRow): string {
  return [r.unit_number, r.driver_name, r.city, r.state].filter(Boolean).join(" ");
}

const OFFLINE_FLEET_HOS_COLUMNS: ParityColumn<FleetLocationHosRow>[] = [
  FLEET_HOS_COLUMNS[0],
  FLEET_HOS_COLUMNS[1],
  FLEET_HOS_COLUMNS[2],
  FLEET_HOS_COLUMNS[3],
  {
    key: "last_update",
    label: "Last Update (Laredo)",
    sortable: true,
    sortValue: (row) => row.captured_at_utc,
    cellClass: "font-semibold text-slate-700",
    render: (row) => (
      <span className="whitespace-nowrap">
        {row.captured_at_local ?? "Never reported"}
        {row.minutes_since_fix != null ? (
          <span className="ml-1 text-[10px] font-normal text-slate-400">({row.minutes_since_fix} min ago)</span>
        ) : null}
      </span>
    ),
  },
];

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
  const [search, setSearch] = useState("");

  const allRows = query.data?.rows ?? [];
  // COMPLIANCE-1: default view = only units reporting within the freshness threshold; years/weeks-
  // stale (or never-reported) units are segregated into the collapsible group below.
  const { live: liveRows, offline: offlineRows } = useMemo(() => partitionFleetByFreshness(allRows), [allRows]);
  const filteredLiveRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return needle
      ? liveRows.filter((row) => fleetHosSearchText(row).toLowerCase().includes(needle))
      : liveRows;
  }, [liveRows, search]);

  return (
    <section data-testid="compliance-section-fleet-hos">
      <div className="mb-2">
        <h2 className="text-base font-semibold text-slate-900">Live Fleet — Location &amp; Hours of Service</h2>
        <p className="text-xs text-slate-500">Every vehicle Samsara reports, its current driver, and HOS clocks (refreshes every 5 min).</p>
      </div>

      {query.isError ? (
        <ListErrorState
          title="Couldn't load fleet HOS"
          status={0}
          message={(query.error as Error)?.message}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <ParityTable
          rows={filteredLiveRows}
          columns={FLEET_HOS_COLUMNS}
          rowKey={(row) => row.unit_id}
          loading={query.isLoading}
          onRowClick={(row) => navigate(`/fleet/units/${row.unit_id}`)}
          rowClassName={(row) => (row.stale ? "bg-slate-100" : "")}
          storageKey="compliance-fleet-hos"
          emptyText="No reporting vehicles."
          initialPageSize={50}
          tableTestId="compliance-fleet-hos-table"
          filterBar={
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search unit, driver, city…"
                className="rounded-sm border border-slate-300 px-2 py-1 text-sm"
              />
              <span className="text-xs text-slate-500">
                {filteredLiveRows.length} of {liveRows.length}
              </span>
              <span className="text-xs text-slate-500">
                {query.data?.generated_at ? `as of ${formatClockTimeCT(query.data.generated_at)} CT` : ""}
              </span>
              <div className="ml-auto flex gap-2">
                <Button type="button" variant="secondary" onClick={() => void query.refetch()}>
                  Refresh
                </Button>
                <Button type="button" variant="secondary" onClick={() => void downloadFleetLocationHosXlsx(companyId).catch(() => undefined)}>
                  Export (Excel)
                </Button>
              </div>
            </div>
          }
        />
      )}

      {offlineRows.length > 0 ? (
        <div className="mt-4" data-testid="compliance-fleet-hos-offline">
          <button
            type="button"
            onClick={() => setShowOffline((v) => !v)}
            className="flex w-full items-center gap-2 rounded-sm border border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-100"
            aria-expanded={showOffline}
          >
            <span className="text-slate-400">{showOffline ? "▾" : "▸"}</span>
            Offline / stale ({offlineRows.length})
            <span className="ml-2 font-normal text-slate-500">
              no fix in the last {OFFLINE_STALE_THRESHOLD_DAYS} days — hidden from the live view
            </span>
          </button>
          {showOffline ? (
            <div className="mt-2">
              <ParityTable
                rows={offlineRows}
                columns={OFFLINE_FLEET_HOS_COLUMNS}
                rowKey={(row) => row.unit_id}
                onRowClick={(row) => navigate(`/fleet/units/${row.unit_id}`)}
                storageKey="compliance-fleet-hos-offline"
                emptyText="No offline or stale vehicles."
                initialPageSize={50}
                tableTestId="compliance-fleet-hos-offline-table"
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
