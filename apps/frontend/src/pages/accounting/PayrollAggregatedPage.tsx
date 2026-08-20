import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getAggregatedPayroll,
  refreshAggregatedPayroll,
  type AggregatedDriverSettlement,
  type AggregatedQboW2Run,
} from "../../api/payrollAggregated";
import { Button } from "../../components/Button";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useToast } from "../../components/Toast";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";
import { entityLabel } from "../../lib/entity-label";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
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

const W2_RUN_COLUMNS: Array<ParityColumn<AggregatedQboW2Run>> = [
  {
    key: "qbo_payroll_run_name",
    label: "Run",
    render: (row) => entityLabel(row.qbo_payroll_run_name, row.qbo_payroll_run_id, "Payroll run"),
  },
  {
    key: "employee_count",
    label: "Employees",
    className: "text-right",
    render: (row) => row.employee_count ?? 0,
  },
  {
    key: "net_cents",
    label: "Net",
    className: "text-right",
    render: (row) => money(Number(row.net_cents ?? 0)),
  },
];

export function PayrollAggregatedPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const { pushToast } = useToast();
  const queryClient = useQueryClient();

  const aggregatedQuery = useQuery({
    queryKey: ["payroll", "aggregated", companyId],
    queryFn: () => getAggregatedPayroll(companyId),
    enabled: Boolean(companyId),
  });

  const refreshMutation = useMutation({
    mutationFn: () => refreshAggregatedPayroll(companyId),
    onSuccess: () => {
      pushToast("Payroll sync refreshed", "success");
      void queryClient.invalidateQueries({ queryKey: ["payroll", "aggregated", companyId] });
    },
    onError: (error: unknown) => {
      pushToast(error instanceof Error ? error.message : "Refresh failed", "error");
    },
  });

  const data = aggregatedQuery.data;

  return (
    <AccountingSubNavWrapper title="Payroll (aggregated)" subtitle="Option B — driver settlements in TMS + W-2 runs mirrored from QBO Payroll">
      <div data-testid="payroll-aggregated-page" className="contents">
      {aggregatedQuery.isError ? <ListErrorBanner message="Failed to load aggregated payroll view." /> : null}
      <div className="flex flex-wrap items-center gap-2 rounded-sm border border-gray-200 bg-white p-3 text-sm">
        <span>
          Sync state: <strong>{data?.sync_state ?? "—"}</strong>
        </span>
        <span className="text-gray-500">
          Last synced: {data?.last_synced_at ? new Date(data.last_synced_at).toLocaleString() : "Never"}
        </span>
        <Button size="sm" variant="secondary" loading={refreshMutation.isPending} onClick={() => void refreshMutation.mutateAsync()}>
          Refresh
        </Button>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <section className="rounded-sm border border-gray-200 bg-white p-3">
          <h2 className="mb-2 text-sm font-semibold text-gray-900">Driver settlements (TMS)</h2>
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

        <section className="rounded-sm border border-gray-200 bg-white p-3">
          <h2 className="mb-2 text-sm font-semibold text-gray-900">QBO Payroll W-2 runs</h2>
          <ParityTable<AggregatedQboW2Run>
            columns={W2_RUN_COLUMNS}
            rows={data?.qbo_w2_runs ?? []}
            rowKey={(row) => row.qbo_payroll_run_id}
            loading={aggregatedQuery.isLoading}
            emptyText="No QBO payroll runs linked yet."
            storageKey="payroll-aggregated-qbo-w2-runs"
            tableTestId="payroll-aggregated-qbo-w2-runs-table"
          />
        </section>
      </div>
      </div>
    </AccountingSubNavWrapper>
  );
}
