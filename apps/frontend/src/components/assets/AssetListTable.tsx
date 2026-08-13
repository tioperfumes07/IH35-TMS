import { ParityTable, type ParityColumn } from "../parity/ParityTable";
import { entityLabel } from "../../lib/entity-label";
import type { AssetLifecycle, AssetRow } from "./types";
import { EntityLink } from "../shared/EntityLink";

type Props = {
  rows: AssetRow[];
  isLoading: boolean;
};

const LIFECYCLE_BADGE: Record<AssetLifecycle, string> = {
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  maintenance: "bg-amber-50 text-amber-700 border-amber-200",
  out_of_service: "bg-red-50 text-red-700 border-red-200",
};

function LifecyclePill({ value }: { value: AssetLifecycle }) {
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${LIFECYCLE_BADGE[value]}`}>
      {value.replaceAll("_", " ")}
    </span>
  );
}

const COLUMNS: Array<ParityColumn<AssetRow>> = [
  {
    key: "unit_number",
    label: "Unit",
    sortable: true,
    render: (row) => (
      <div>
        <p className="font-medium text-gray-900"><EntityLink kind="unit" id={row.id} label={entityLabel(row.unit_number, row.id, "Unit")} /></p>
        <p className="text-xs text-gray-500">{row.vin || "VIN pending"}</p>
      </div>
    ),
  },
  {
    key: "kind",
    label: "Type",
    sortable: true,
    render: (row) => <span className="capitalize text-gray-700">{row.kind}</span>,
  },
  {
    key: "lifecycle",
    label: "Lifecycle",
    sortable: true,
    render: (row) => <LifecyclePill value={row.lifecycle} />,
  },
  {
    key: "assigned_driver_name",
    label: "Driver",
    sortable: true,
    render: (row) => row.assigned_driver_name || "Unassigned",
  },
  {
    key: "assigned_load_display",
    label: "Assigned load",
    sortable: true,
    render: (row) => row.assigned_load_display || "—",
  },
  {
    key: "location_label",
    label: "Location",
    sortable: true,
    render: (row) => row.location_label || "—",
  },
  {
    key: "utilization_score",
    label: "Utilization",
    sortable: true,
    sortValue: (row) => row.utilization_score ?? -1,
    cellClass: "text-right tabular-nums",
    render: (row) => (row.utilization_score == null ? "—" : `${Math.round(row.utilization_score)}%`),
  },
];

export function AssetListTable({ rows, isLoading }: Props) {
  return (
    <section className="overflow-x-auto rounded-sm border border-gray-200 bg-white">
      <header className="border-b border-gray-200 px-3 py-2">
        <h2 className="text-sm font-semibold text-gray-900">Asset register</h2>
      </header>
      <div className="p-2">
        <ParityTable
          rows={rows}
          columns={COLUMNS}
          rowKey={(row) => row.id}
          loading={isLoading}
          storageKey="assets-register-list"
          emptyText="No assets found for this filter."
          tableTestId="assets-register-table"
          rowTestId={(row) => `assets-register-row-${row.id}`}
        />
      </div>
    </section>
  );
}
