import { DataTable } from "../../../components/DataTable";

// AUTO-15 — migrated onto the shared DataTable (sort/resize/paging/search/gear). Same 4 columns,
// same cell rendering — additive only. Non-financial safety sub-list.
type Row = Record<string, unknown>;
type Props = {
  rows: Row[];
};

export function TrainingTable({ rows }: Props) {
  return (
    <DataTable<Row>
      rows={rows}
      rowKey={(row) => String(row.id)}
      tableKey="safety-training"
      columns={[
        { key: "completed_at", label: "Date", sortable: true, render: (row) => String(row.completed_at ?? row.due_at ?? "").slice(0, 10) },
        { key: "driver_id", label: "Driver", sortable: true, render: (row) => String(row.driver_id ?? "—") },
        { key: "training_type", label: "Training", sortable: true, render: (row) => String(row.training_type ?? row.name ?? "Training") },
        { key: "status", label: "Status", sortable: true, render: (row) => String(row.status ?? "complete") },
      ]}
    />
  );
}
