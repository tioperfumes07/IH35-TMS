import { DataTable } from "../../../components/DataTable";
import { EntityLink } from "../../../components/shared/EntityLink";
import { entityLabel } from "../../../lib/entity-label";

// AUTO-15 — migrated onto the shared DataTable (sort/resize/paging/search/gear). Same 4 columns,
// same cell rendering — additive only. Non-financial safety sub-list.
type Row = Record<string, unknown>;
type Props = {
  rows: Row[];
};

export function DrugAlcoholTable({ rows }: Props) {
  return (
    <DataTable<Row>
      rows={rows}
      rowKey={(row) => String(row.id)}
      tableKey="safety-drug-alcohol"
      columns={[
        { key: "test_date", label: "Test Date", sortable: true, render: (row) => String(row.test_date ?? "").slice(0, 10) },
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
        { key: "test_type", label: "Type", sortable: true, render: (row) => String(row.test_type ?? "—") },
        { key: "result", label: "Result", sortable: true, render: (row) => String(row.result ?? "—") },
      ]}
    />
  );
}
