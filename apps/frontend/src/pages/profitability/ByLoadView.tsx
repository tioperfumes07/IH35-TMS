import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";

interface ByLoadViewProps {
  filters: {
    dateFrom: string;
    dateTo: string;
    equipmentType?: string;
    customerId?: string;
    laneKey?: string;
  };
}

/** Row shape for the per-load profitability detail grid (display-only; no data source wired yet). */
type ByLoadRow = {
  load_id: string;
  lane: string;
  miles: string;
  revenue: string;
  cost: string;
  margin: string;
  per_mile: string;
};

const COLUMNS: Array<ParityColumn<ByLoadRow>> = [
  { key: "load_id", label: "Load ID", sortable: true },
  { key: "lane", label: "Lane", sortable: true },
  { key: "miles", label: "Miles", sortable: true, className: "text-right" },
  { key: "revenue", label: "Revenue", sortable: true, className: "text-right" },
  { key: "cost", label: "Cost", sortable: true, className: "text-right" },
  { key: "margin", label: "Margin", sortable: true, className: "text-right" },
  { key: "per_mile", label: "$/Mi", sortable: true, className: "text-right" },
];

export function ByLoadView({ filters }: ByLoadViewProps) {
  const rows: ByLoadRow[] = [];

  return (
    <div className="rounded-sm border border-gray-200 bg-white p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">By Load (Detail)</h3>
      <p className="text-sm text-gray-500 mb-4">
        Per-load detail view for {filters.dateFrom} to {filters.dateTo}.
      </p>
      <ParityTable<ByLoadRow>
        columns={COLUMNS}
        rows={rows}
        rowKey={(row) => row.load_id}
        storageKey="profitability-by-load"
        tableTestId="profitability-by-load-table"
        emptyText="No data loaded"
      />
    </div>
  );
}
