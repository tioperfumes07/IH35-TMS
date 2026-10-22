import type { UnitsWithoutLoad, UnitLiveLocation } from "../../../api/dispatch";
import { ParityTable } from "../../../components/parity/ParityTable";
import { ListErrorState } from "../../../components/ListErrorState";
import { EntityLink } from "../../../components/shared/EntityLink";
import { EntityLinkOrTombstone } from "../../../components/shared/EntityLinkOrTombstone";
import { entityLabel } from "../../../lib/entity-label";
import type { DataTableErrorState } from "../../../lib/tableError";

type Props = {
  /** LEAD 443.174 — the section's real title (rendered in ParityTable's title slot). */
  title?: string;
  rows: UnitsWithoutLoad[];
  onRowClick: (row: UnitsWithoutLoad) => void;
  loading?: boolean;
  errorState?: DataTableErrorState;
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
      {loc.stale ? <span className="mr-1 text-[#1F2A44]" title={`stale · last fix ${loc.captured_at_ct}`}>●</span> : null}
      {place}
      <span className="ml-1 text-xs text-gray-400">· as of {loc.captured_at_ct}</span>
    </span>
  );
}

export function UnitsWithoutLoadTable({ title = "Units without a load", rows, onRowClick, loading, errorState }: Props) {
  return (
    <>
    {errorState ? (
      <ListErrorState
        title="Couldn't load list"
        status={errorState.status}
        message={errorState.message}
        onRetry={errorState.onRetry}
      />
    ) : (
    <ParityTable<UnitsWithoutLoad>
      appearance="board"
      title={<span data-testid="dispatch-units-without-load-title">{title}</span>}
      storageKey="dispatch-units-without-load"
      rows={rows}
      rowKey={(row) => row.id}
      onRowClick={onRowClick}
      loading={loading}
      emptyText="All units currently have active loads."
      columns={[
        {
          key: "unit_number",
          label: "Unit",
          sortable: true,
          // ParityTable compareSortValues uses localeCompare({ numeric: true }) — T9 before T10.
          sortValue: (row) => row.unit_number ?? null,
          cellClass: "font-semibold",
          // stopPropagation: the row also has its own onRowClick (opens "book load for this unit");
          // the unit # link drills through to the unit's fleet profile instead.
          render: (row) => (
            <EntityLink kind="unit" id={row.id} label={entityLabel(row.unit_number, row.id, "Unit")} onClick={(e) => e.stopPropagation()} />
          ),
        },
        {
          key: "trailer_number",
          label: "Trailer",
          sortable: true,
          // ROUND 443.231 — sort by the DISPLAYED label, not a raw id / missing field.
          sortValue: (row) => (row.trailer_number?.trim() ? row.trailer_number : null),
          render: (row) => (
            <EntityLinkOrTombstone
              kind="trailer"
              id={row.trailer_id}
              name={row.trailer_number}
              noun="Trailer"
              onClick={(e) => e.stopPropagation()}
            />
          ),
        },
        {
          key: "driver_name",
          label: "Driver",
          sortable: true,
          sortValue: (row) => (row.driver_name?.trim() ? row.driver_name : null),
          render: (row) => (
            <EntityLinkOrTombstone kind="driver" id={row.driver_id} name={row.driver_name} noun="Driver" onClick={(e) => e.stopPropagation()} />
          ),
        },
        {
          key: "location",
          label: "Current Location",
          sortable: true,
          // ROUND 443.231 — row.location is an OBJECT; without sortValue ParityTable String()s
          // every value to "[object Object]" and the header is a no-op. Nulls last via ParityTable.
          sortValue: (row) => {
            const loc = row.location;
            if (!loc) return null;
            const place = [loc.city, loc.state].filter(Boolean).join(", ");
            return place || loc.formatted || null;
          },
          render: (row) => <LocationCell loc={row.location} />,
        },
        {
          key: "last_drop_at",
          label: "Last Drop · Status",
          sortable: true,
          sortValue: (row) => {
            if (!row.last_drop_at) return null;
            const t = Date.parse(row.last_drop_at);
            return Number.isNaN(t) ? null : t;
          },
          render: (row) => (
            <>
              {row.last_drop_at ? new Date(row.last_drop_at).toLocaleString() : "No prior drop"} ·
              <span className="ml-1 text-[#1F2A44]">Need Load</span>
            </>
          ),
        },
        {
          key: "hours_since_last_delivery",
          label: "Hours Since",
          sortable: true,
          kind: "number",
          cellClass: "text-right tabular-nums",
          sortValue: (row) => row.hours_since_last_delivery,
          render: (row) => (
            <span className={idleClass(row.hours_since_last_delivery)}>{row.hours_since_last_delivery ?? "—"}</span>
          ),
        },
        {
          // GLOBAL-SORT-RULE exemption "idle_time" (see docs/specs/GLOBAL-SORT-RULE.md registry):
          // this column is the same underlying value as "Hours Since" (hours_since_last_delivery),
          // just formatted differently — sorting is already available via the Hours Since column,
          // so a second, no-op sort control here would be misleading rather than useful.
          key: "idle_time",
          label: "Idle Time",
          sortable: false,
          kind: "number",
          cellClass: "text-right tabular-nums",
          render: (row) => (
            <span className={idleClass(row.hours_since_last_delivery)}>
              {row.hours_since_last_delivery !== null ? `${row.hours_since_last_delivery}h idle` : "—"}
            </span>
          ),
        },
      ]}
    />
    )}
    </>
  );
}
