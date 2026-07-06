import type { UnitsWithoutLoad, UnitLiveLocation } from "../../../api/dispatch";
import { DataTable } from "../../../components/DataTable";

type Props = {
  rows: UnitsWithoutLoad[];
  onRowClick: (row: UnitsWithoutLoad) => void;
};

function idleClass(hours: number | null) {
  if (hours === null) return "text-gray-500";
  if (hours >= 72) return "font-bold text-red-700";
  if (hours >= 48) return "font-semibold text-red-700";
  if (hours >= 24) return "text-red-600";
  return "text-gray-700";
}

// Live Samsara location cell — city/state (reverse-geo) + "as of HH:MM CT"; gold dot when the fix is stale.
// Shown for EVERY unit regardless of load state; "—" when Samsara has no recent fix.
function LocationCell({ loc }: { loc: UnitLiveLocation | null }) {
  if (!loc) return <span className="text-gray-400">—</span>;
  const place = [loc.city, loc.state].filter(Boolean).join(", ") || loc.formatted || "Unknown";
  return (
    <span title={loc.formatted ?? undefined}>
      {loc.stale ? <span className="mr-1 text-slate-700" title={`stale · last fix ${loc.captured_at_ct}`}>●</span> : null}
      {place}
      <span className="ml-1 text-[10px] text-gray-400">· as of {loc.captured_at_ct}</span>
    </span>
  );
}

export function UnitsWithoutLoadTable({ rows, onRowClick }: Props) {
  return (
    <DataTable
      rows={rows}
      tableKey="dispatch-units-without-load"
      rowKey={(row) => row.id}
      onRowClick={onRowClick}
      emptyText="All units currently have active loads."
      columns={[
        { key: "unit_number", label: "Unit", sortable: true, cellClass: "font-semibold" },
        { key: "trailer_number", label: "Trailer", sortable: true, render: (row) => row.trailer_number ?? "-" },
        { key: "driver_name", label: "Driver", sortable: true, render: (row) => row.driver_name ?? "-" },
        {
          key: "location",
          label: "Current Location",
          sortable: true,
          render: (row) => <LocationCell loc={row.location} />,
        },
        {
          key: "last_drop_at",
          label: "Last Drop · Status",
          sortable: true,
          render: (row) => (
            <>
              {row.last_drop_at ? new Date(row.last_drop_at).toLocaleString() : "No prior drop"} ·
              <span className="ml-1 text-slate-700">Need Load</span>
            </>
          ),
        },
        {
          key: "hours_since_last_delivery",
          label: "Hours Since",
          sortable: true,
          numeric: true,
          render: (row) => (
            <span className={idleClass(row.hours_since_last_delivery)}>{row.hours_since_last_delivery ?? "-"}</span>
          ),
        },
        {
          // GLOBAL-SORT-RULE exemption "idle_time" (see docs/specs/GLOBAL-SORT-RULE.md registry):
          // this column is the same underlying value as "Hours Since" (hours_since_last_delivery),
          // just formatted differently — sorting is already available via the Hours Since column,
          // so a second, no-op sort control here would be misleading rather than useful.
          key: "idle_time",
          label: "Idle Time",
          numeric: true,
          render: (row) => (
            <span className={idleClass(row.hours_since_last_delivery)}>
              {row.hours_since_last_delivery !== null && row.hours_since_last_delivery >= 72 ? "⚠ " : ""}
              {row.hours_since_last_delivery !== null ? `${row.hours_since_last_delivery}h idle` : "-"}
            </span>
          ),
        },
      ]}
    />
  );
}
