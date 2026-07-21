import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";

interface ByTypeViewProps {
  filters: {
    dateFrom: string;
    dateTo: string;
    customerId?: string;
  };
}

// Static placeholder rows (no query wired yet) — the ParityTable renders the
// same 7-column grammar the former hand-rolled markup carried, with the empty
// state preserving the former "No data loaded" copy.
type ByTypeRow = {
  id: string;
  equipment_type: string;
  loads: number | null;
  miles: number | null;
  rev_per_mile: string | null;
  cost_per_mile: string | null;
  margin_per_mile: string | null;
  total_margin: string | null;
};

const COLUMNS: Array<ParityColumn<ByTypeRow>> = [
  { key: "equipment_type", label: "Type", sortable: true },
  { key: "loads", label: "Loads", sortable: true, className: "text-right" },
  { key: "miles", label: "Miles", sortable: true, className: "text-right" },
  { key: "rev_per_mile", label: "Rev/Mi", sortable: true, className: "text-right" },
  { key: "cost_per_mile", label: "Cost/Mi", sortable: true, className: "text-right" },
  { key: "margin_per_mile", label: "Margin/Mi", sortable: true, className: "text-right" },
  { key: "total_margin", label: "Total Margin", sortable: true, className: "text-right" },
];

export function ByTypeView({ filters }: ByTypeViewProps) {
  const rows: ByTypeRow[] = [];
  return (
    <div className="rounded-sm border border-gray-200 bg-white p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">By Equipment Type</h3>
      <p className="text-sm text-gray-500 mb-4">
        Equipment type profitability view for {filters.dateFrom} to {filters.dateTo}.
      </p>
      <ParityTable<ByTypeRow>
        columns={COLUMNS}
        rows={rows}
        rowKey={(row) => row.id}
        storageKey="profitability-by-type"
        tableTestId="profitability-by-type-table"
        emptyText="No data loaded"
      />
    </div>
  );
}
