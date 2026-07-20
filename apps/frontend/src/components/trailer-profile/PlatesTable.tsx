import { formatDateUS } from "../../lib/formatDate";
import { ParityTable, type ParityColumn } from "../parity/ParityTable";

type PlateRow = Record<string, unknown> & { id?: unknown };

function fmtDate(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  return formatDateUS(value as string) || "—";
}

const COLUMNS: Array<ParityColumn<PlateRow>> = [
  {
    key: "country",
    label: "Country",
    sortable: true,
    sortValue: (row) => String(row.country ?? ""),
    render: (row) => String(row.country ?? "—"),
  },
  {
    key: "jurisdiction",
    label: "Jurisdiction",
    sortable: true,
    sortValue: (row) => String(row.jurisdiction ?? ""),
    render: (row) => String(row.jurisdiction ?? "—"),
  },
  {
    key: "plate_number",
    label: "Plate",
    sortable: true,
    sortValue: (row) => String(row.plate_number ?? ""),
    render: (row) => String(row.plate_number ?? "—"),
  },
  {
    key: "expiration",
    label: "Expiration",
    sortable: true,
    sortValue: (row) => String(row.expiration ?? ""),
    render: (row) => fmtDate(row.expiration),
  },
];

export function PlatesTable({ plates }: { plates: Array<Record<string, unknown>> }) {
  return (
    <div className="mt-3" data-testid="tp-plates-table">
      <ParityTable
        rows={plates as PlateRow[]}
        columns={COLUMNS}
        rowKey={(row) => String(row.id)}
        loading={false}
        storageKey="trailer-profile-plates"
        emptyText="No plates on file."
        exportFilename="trailer-plates"
        tableTestId="tp-plates-parity-table"
        rowTestId={(row) => `tp-plates-row-${String(row.id)}`}
      />
    </div>
  );
}
