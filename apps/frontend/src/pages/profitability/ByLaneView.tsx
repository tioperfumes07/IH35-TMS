import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";

interface ByLaneViewProps {
  filters: {
    dateFrom: string;
    dateTo: string;
    equipmentType?: string;
    customerId?: string;
  };
}

type LaneRow = {
  lane: string;
  loads: string;
  miles: string;
  revPerMile: string;
  costPerMile: string;
  marginPerMile: string;
  totalMargin: string;
};

const COLUMNS: Array<ParityColumn<LaneRow>> = [
  { key: "lane", label: "Lane", sortable: true },
  { key: "loads", label: "Loads", sortable: true, className: "text-right" },
  { key: "miles", label: "Miles", sortable: true, className: "text-right" },
  { key: "revPerMile", label: "Rev/Mi", sortable: true, className: "text-right" },
  { key: "costPerMile", label: "Cost/Mi", sortable: true, className: "text-right" },
  { key: "marginPerMile", label: "Margin/Mi", sortable: true, className: "text-right" },
  { key: "totalMargin", label: "Total Margin", sortable: true, className: "text-right" },
];

export function ByLaneView({ filters }: ByLaneViewProps) {
  // Display-only stub (no data fetch wired yet) — rows stay empty until the
  // profitability engine feed is connected; ParityTable renders the empty state.
  const rows: LaneRow[] = [];

  return (
    <div className="rounded-sm border border-gray-200 bg-white p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">By Lane</h3>
      <p className="text-sm text-gray-500 mb-4">
        Lane profitability view for {filters.dateFrom} to {filters.dateTo}.
      </p>
      <ParityTable<LaneRow>
        columns={COLUMNS}
        rows={rows}
        rowKey={(row) => row.lane}
        storageKey="profitability-by-lane"
        tableTestId="profitability-by-lane-table"
        emptyText="Profitability feed is not connected; no figures are available for this view."
      />
    </div>
  );
}
