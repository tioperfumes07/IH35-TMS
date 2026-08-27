import { DataTable } from "../../../components/DataTable";
import { EntityLink } from "../../../components/shared/EntityLink";
import { entityLabel } from "../../../lib/entity-label";
import { formatDateUS } from "../../../lib/formatDate";

// AUTO-15 — migrated onto the shared DataTable (sort/resize/paging/search/gear). Same 4 columns,
// same cell rendering — additive only. Non-financial safety sub-list.
type Row = Record<string, unknown>;
type Props = {
  rows: Row[];
  hidePager?: boolean;
};

export function TrainingTable({ rows, hidePager = false }: Props) {
  return (
    <DataTable<Row>
      rows={rows}
      rowKey={(row) => String(row.id)}
      tableKey="safety-training"
      hidePager={hidePager}
      columns={[
        { key: "completed_at", label: "Date", sortable: true, render: (row) => formatDateUS(row.completed_at ?? row.due_at) },
        {
          key: "driver_id",
          label: "Driver",
          sortable: true,
          render: (row) => (
            <EntityLink
              kind="driver"
              id={row.driver_id ? String(row.driver_id) : undefined}
              label={entityLabel(row.driver_name, row.driver_id ? String(row.driver_id) : undefined, "Driver")}
            />
          ),
        },
        { key: "training_type", label: "Training", sortable: true, render: (row) => String(row.training_type ?? row.name ?? "Training") },
        { key: "status", label: "Status", sortable: true, render: (row) => String(row.status ?? "complete") },
      ]}
    />
  );
}
