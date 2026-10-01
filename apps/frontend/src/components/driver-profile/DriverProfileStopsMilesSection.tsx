/**
 * ORDERS C-57 / E-44 — stops + miles on driver profile (30-day window).
 * GET /api/v1/drivers/:id/profile/stops-miles — driver-at-time attribution, source stated.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getDriverProfileStopsMiles } from "../../api/driver-profile-tabs";
import { addDaysIso, companyToday } from "../../lib/businessDate";
import { formatDateTimeUS } from "../../lib/formatDate";
import { EntityLinkOrTombstone } from "../shared/EntityLinkOrTombstone";
import { ListErrorState } from "../ListErrorState";
import { ParityTable, type ParityColumn } from "../parity/ParityTable";

type ProfileStopRow = {
  rowKey: string;
  started_at: string;
  dwell_minutes: number | null;
  unit_id: string | null;
  unit_number: string | null;
  place: string;
  odometer_mi: number | null;
  miles_since_previous_stop: number | null;
  load_id: string | null;
  load_number: string | null;
};

function pickString(row: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const v = row[key];
    if (typeof v === "string" && v) return v;
  }
  return null;
}

function pickNumber(row: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const v = row[key];
    if (v == null) continue;
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function normalizeStop(row: Record<string, unknown>, index: number): ProfileStopRow {
  const started =
    pickString(row, "started_at", "startedAt") ??
    (row.startedAt instanceof Date ? row.startedAt.toISOString() : "");
  const unitId = pickString(row, "unit_id", "unitId");
  const city = pickString(row, "city");
  const state = pickString(row, "state");
  const geofence =
    pickString(row, "geofence_label") ??
    (typeof row.fence === "object" && row.fence && "label" in row.fence
      ? pickString(row.fence as Record<string, unknown>, "label")
      : null);
  const place = geofence ?? ([city, state].filter(Boolean).join(", ") || "—");
  const dwell =
    pickNumber(row, "dwell_minutes", "dwellMinutes") ??
    (() => {
      const ended = pickString(row, "ended_at", "endedAt");
      if (!started || !ended) return null;
      const mins = (new Date(ended).getTime() - new Date(started).getTime()) / 60_000;
      return Number.isFinite(mins) ? Math.round(mins) : null;
    })();

  return {
    rowKey: `${unitId ?? "unit"}-${started || index}`,
    started_at: started,
    dwell_minutes: dwell,
    unit_id: unitId,
    unit_number: pickString(row, "unit_number", "unitNumber"),
    place,
    odometer_mi: pickNumber(row, "odometer_mi", "odometerMi"),
    miles_since_previous_stop: pickNumber(row, "miles_since_previous_stop", "milesSincePreviousStop"),
    load_id: pickString(row, "load_id", "loadId"),
    load_number: pickString(row, "load_number", "loadNumber"),
  };
}

function sourceLabel(source: string): string {
  if (source === "unit_stop_events") return "Persisted stop events (driver at time)";
  if (source === "computed_e03") return "Computed from E-03 engine (driver at time)";
  return source;
}

export function DriverProfileStopsMilesSection({
  companyId,
  driverId,
}: {
  companyId: string;
  driverId: string;
}) {
  const to = companyToday();
  const from = addDaysIso(to, -30);

  const q = useQuery({
    queryKey: ["driver-profile", "stops-miles", companyId, driverId, from, to],
    queryFn: () => getDriverProfileStopsMiles(companyId, driverId, { from, to }),
    enabled: Boolean(companyId && driverId),
  });

  const rows = useMemo(
    () => (q.isError ? [] : (q.data?.stops ?? []).map((row, i) => normalizeStop(row, i))),
    [q.data?.stops, q.isError],
  );

  const columns = useMemo<ParityColumn<ProfileStopRow>[]>(
    () => [
      {
        key: "started_at",
        label: "Stopped",
        sortable: true,
        render: (row) => (row.started_at ? `${formatDateTimeUS(row.started_at)} CT` : "—"),
      },
      {
        key: "dwell_minutes",
        label: "Dwell min",
        sortable: true,
        render: (row) => (row.dwell_minutes == null ? "—" : String(row.dwell_minutes)),
      },
      {
        key: "unit_number",
        label: "Unit",
        sortable: true,
        render: (row) => (
          <EntityLinkOrTombstone kind="unit" id={row.unit_id} name={row.unit_number} noun="Unit" />
        ),
      },
      {
        key: "place",
        label: "Place",
        sortable: true,
        render: (row) => row.place,
      },
      {
        key: "odometer_mi",
        label: "Odometer",
        sortable: true,
        render: (row) => (row.odometer_mi == null ? "—" : row.odometer_mi.toFixed(1)),
      },
      {
        key: "miles_since_previous_stop",
        label: "Miles since prior",
        sortable: true,
        render: (row) =>
          row.miles_since_previous_stop == null ? "—" : row.miles_since_previous_stop.toFixed(1),
      },
      {
        key: "load_number",
        label: "Load",
        sortable: true,
        render: (row) =>
          row.load_id ? (
            <EntityLinkOrTombstone kind="load" id={row.load_id} name={row.load_number} noun="Load" />
          ) : (
            "—"
          ),
      },
    ],
    [],
  );

  const readMiles = q.data?.read_miles ?? 0;
  const source = q.data?.source ?? "";

  return (
    <section
      className="rounded-sm border border-gray-200 bg-white p-3"
      data-testid="dp-section-stops-miles"
      data-dp-stops-miles="1"
    >
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-xs font-semibold text-slate-900">Stops + miles (last 30 days)</h2>
          <p className="text-xs text-slate-600">
            Every stop ≥ 3 minutes with odometer and miles since the prior stop — driver at time.{" "}
            {source ? sourceLabel(source) : ""}
          </p>
        </div>
        {!q.isLoading && !q.isError ? (
          <div className="rounded-sm bg-gray-50 px-2 py-1 text-center">
            <p className="text-page-title font-bold text-slate-900">{readMiles.toFixed(1)}</p>
            <p className="text-[11px] uppercase text-gray-500">Read miles</p>
          </div>
        ) : null}
      </div>
      {q.isError ? (
        <ListErrorState
          title="Couldn't load stops + miles"
          status={0}
          message={(q.error as Error)?.message}
          onRetry={() => void q.refetch()}
        />
      ) : (
        <ParityTable
          storageKey="driver-profile-stops-miles"
          tableTestId="driver-profile-stops-miles-table"
          columns={columns}
          rows={rows}
          rowKey={(row) => row.rowKey}
          loading={q.isLoading}
          emptyText="No stops ≥ 3 minutes for this driver in the last 30 days."
          initialPageSize={10}
          pageSizeOptions={[10, 25, 50]}
        />
      )}
    </section>
  );
}
