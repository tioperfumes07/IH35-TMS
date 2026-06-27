import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getAggregatedPayroll, refreshAggregatedPayroll } from "../../api/payrollAggregated";
import { Button } from "../../components/Button";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useToast } from "../../components/Toast";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
}

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
      {aggregatedQuery.isError ? <ListErrorBanner message="Failed to load aggregated payroll view." /> : null}
      <div className="flex flex-wrap items-center gap-2 rounded border border-gray-200 bg-white p-3 text-sm">
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
        <section className="rounded border border-gray-200 bg-white p-3">
          <h2 className="mb-2 text-sm font-semibold text-gray-900">Driver settlements (TMS)</h2>
          {aggregatedQuery.isLoading ? <p className="text-sm text-gray-500">Loading…</p> : null}
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-2 py-1.5">Period</th>
                  <th className="px-2 py-1.5">Status</th>
                  <th className="px-2 py-1.5 text-right">Net</th>
                </tr>
              </thead>
              <tbody>
                {(data?.driver_settlements ?? []).map((row) => (
                  <tr key={row.id} className="border-t border-gray-100">
                    <td className="px-2 py-1.5">
                      {row.pay_period_start ?? "—"} → {row.pay_period_end ?? "—"}
                    </td>
                    <td className="px-2 py-1.5">{row.status ?? "—"}</td>
                    <td className="px-2 py-1.5 text-right">{money(Number(row.net_cents ?? 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!aggregatedQuery.isLoading && (data?.driver_settlements?.length ?? 0) === 0 ? (
              <p className="mt-2 text-sm text-gray-500">No driver settlements.</p>
            ) : null}
          </div>
        </section>

        <section className="rounded border border-gray-200 bg-white p-3">
          <h2 className="mb-2 text-sm font-semibold text-gray-900">QBO Payroll W-2 runs</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-2 py-1.5">Run</th>
                  <th className="px-2 py-1.5 text-right">Employees</th>
                  <th className="px-2 py-1.5 text-right">Net</th>
                </tr>
              </thead>
              <tbody>
                {(data?.qbo_w2_runs ?? []).map((row) => (
                  <tr key={row.qbo_payroll_run_id} className="border-t border-gray-100">
                    <td className="px-2 py-1.5">{row.qbo_payroll_run_name ?? row.qbo_payroll_run_id}</td>
                    <td className="px-2 py-1.5 text-right">{row.employee_count ?? 0}</td>
                    <td className="px-2 py-1.5 text-right">{money(Number(row.net_cents ?? 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!aggregatedQuery.isLoading && (data?.qbo_w2_runs?.length ?? 0) === 0 ? (
              <p className="mt-2 text-sm text-gray-500">No QBO payroll runs linked yet.</p>
            ) : null}
          </div>
        </section>
      </div>
    </AccountingSubNavWrapper>
  );
}
