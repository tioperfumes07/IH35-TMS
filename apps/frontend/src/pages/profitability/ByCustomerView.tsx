import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";

interface ByCustomerViewProps {
  filters: {
    dateFrom: string;
    dateTo: string;
    equipmentType?: string;
  };
}

type CustomerProfitabilityRow = {
  customer: string;
  loads: string;
  miles: string;
  rev_per_mile: string;
  cost_per_mile: string;
  margin_per_mile: string;
  total_margin: string;
};

const COLUMNS: Array<ParityColumn<CustomerProfitabilityRow>> = [
  { key: "customer", label: "Customer" },
  { key: "loads", label: "Loads", className: "text-right" },
  { key: "miles", label: "Miles", className: "text-right" },
  { key: "rev_per_mile", label: "Rev/Mi", className: "text-right" },
  { key: "cost_per_mile", label: "Cost/Mi", className: "text-right" },
  { key: "margin_per_mile", label: "Margin/Mi", className: "text-right" },
  { key: "total_margin", label: "Total Margin", className: "text-right" },
];

// Stub view — no data source is wired yet (module unrouted; see stub-inventory recon).
// The former hand-rolled table rendered a single hardcoded "No data loaded" placeholder
// row, which is expressed here as the ParityTable empty state. No amounts are computed.
const ROWS: CustomerProfitabilityRow[] = [];

export function ByCustomerView({ filters }: ByCustomerViewProps) {
  return (
    <div className="rounded-sm border border-gray-200 bg-white p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">By Customer</h3>
      <p className="text-sm text-gray-500">
        Customer profitability view for {filters.dateFrom} to {filters.dateTo}.
      </p>
      <div className="mt-4">
        <ParityTable
          columns={COLUMNS}
          rows={ROWS}
          rowKey={(row) => row.customer}
          storageKey="profitability-by-customer"
          tableTestId="profitability-by-customer-table"
          emptyText="No data loaded"
        />
      </div>
    </div>
  );
}
