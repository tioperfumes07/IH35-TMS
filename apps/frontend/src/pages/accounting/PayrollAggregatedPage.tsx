import { useQuery } from "@tanstack/react-query";
import { getAggregatedPayroll, type AggregatedDriverSettlement } from "../../api/payrollAggregated";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";

import { formatUsdCents } from "../../lib/money";

// GLB-05 -- delegates to the canonical formatter instead of reimplementing an identical
// local currency formatter (same shape lib/money.ts already covers).
function money(cents: number) {
  return formatUsdCents(cents);
}

// Display-only ParityTable migration: column order, cell content, amount formatting, and
// right-alignment preserved 1:1 from the former hand-rolled tables.
const SETTLEMENT_COLUMNS: Array<ParityColumn<AggregatedDriverSettlement>> = [
  {
    key: "pay_period_start",
    label: "Period",
    render: (row) => (
      <>
        {row.pay_period_start ?? "—"} → {row.pay_period_end ?? "—"}
      </>
    ),
  },
  { key: "status", label: "Status", render: (row) => row.status ?? "—" },
  {
    key: "net_cents",
    label: "Net",
    className: "text-right",
    render: (row) => money(Number(row.net_cents ?? 0)),
  },
];

// ACCT-F4431379 (Lead 443.137 9d) — the QBO Payroll W-2 runs table and its sync Refresh were removed:
// driver pay comes ONLY from driver_finance and QBO is out of scope for USMCA.
export function PayrollAggregatedPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const aggregatedQuery = useQuery({
    queryKey: ["payroll", "aggregated", companyId],
    queryFn: () => getAggregatedPayroll(companyId),
    enabled: Boolean(companyId),
  });

  const data = aggregatedQuery.data;

  return (
    <AccountingSubNavWrapper title="Payroll (aggregated)" subtitle="Option B — driver settlements from driver_finance, the only source of driver pay">
      <div data-testid="payroll-aggregated-page" className="contents">
      {aggregatedQuery.isError ? <ListErrorBanner message="Failed to load aggregated payroll view." /> : null}
      <div className="grid gap-3">
        <section className="rounded-sm border border-gray-200 bg-white p-3">
          <h2 className="mb-2 text-xs font-semibold text-gray-900">Driver settlements (TMS)</h2>
          <ParityTable<AggregatedDriverSettlement>
            columns={SETTLEMENT_COLUMNS}
            rows={data?.driver_settlements ?? []}
            rowKey={(row) => row.id}
            loading={aggregatedQuery.isLoading}
            emptyText="No driver settlements."
            storageKey="payroll-aggregated-driver-settlements"
            tableTestId="payroll-aggregated-driver-settlements-table"
          />
        </section>
      </div>
      </div>
    </AccountingSubNavWrapper>
  );
}
