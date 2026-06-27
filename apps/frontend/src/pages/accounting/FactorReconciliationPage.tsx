import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  importFactorReconciliationRun,
  listFactorReconciliationItems,
  listFactorReconciliationRuns,
  listFactorReconciliationImportCandidates,
  type FactorReconciliationRun,
} from "../../api/accounting";
import { Button } from "../../components/Button";
import { DataPanel } from "../../components/layout/DataPanel";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
}

export function FactorReconciliationPage() {
  const { selectedCompanyId } = useCompanyContext();
  const queryClient = useQueryClient();
  const [selectedRunId, setSelectedRunId] = useState<string>("");

  const runsQuery = useQuery({
    queryKey: ["accounting", "factor-reconciliation-runs", selectedCompanyId],
    queryFn: () => listFactorReconciliationRuns(selectedCompanyId!, { limit: 100 }).then((res) => res.rows),
    enabled: Boolean(selectedCompanyId),
  });

  const candidatesQuery = useQuery({
    queryKey: ["accounting", "factor-reconciliation-import-candidates", selectedCompanyId],
    queryFn: () => listFactorReconciliationImportCandidates(selectedCompanyId!, { limit: 50 }).then((res) => res.rows),
    enabled: Boolean(selectedCompanyId),
  });

  const itemsQuery = useQuery({
    queryKey: ["accounting", "factor-reconciliation-items", selectedCompanyId, selectedRunId],
    queryFn: () => listFactorReconciliationItems(selectedRunId, selectedCompanyId!).then((res) => res.rows),
    enabled: Boolean(selectedCompanyId && selectedRunId),
  });

  const importMutation = useMutation({
    mutationFn: async (payload: { factor_id: string; daily_import_id: string }) => {
      if (!selectedCompanyId) return;
      return importFactorReconciliationRun(selectedCompanyId, payload);
    },
    onSuccess: async (res) => {
      if (res?.run?.id) setSelectedRunId(res.run.id);
      await queryClient.invalidateQueries({ queryKey: ["accounting", "factor-reconciliation-runs", selectedCompanyId] });
      await queryClient.invalidateQueries({ queryKey: ["accounting", "factor-reconciliation-import-candidates", selectedCompanyId] });
    },
  });

  const selectedRun = useMemo(
    () => (runsQuery.data ?? []).find((run) => run.id === selectedRunId) ?? null,
    [runsQuery.data, selectedRunId]
  );

  const mismatchCount = (itemsQuery.data ?? []).filter((row) => row.ledger_match_state !== "matched").length;

  return (
    <AccountingSubNavWrapper title="Factor reconciliation" subtitle="Statement-to-ledger reconciliation with Q11 tolerance and match-state drilldown.">

      <DataPanel title="Import candidates (Faro statements)">
        <div className="space-y-2">
          {(candidatesQuery.data ?? []).length === 0 ? <div className="text-xs text-gray-500">No pending statement imports.</div> : null}
          {(candidatesQuery.data ?? []).map((candidate) => (
            <div key={candidate.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-gray-200 p-2 text-xs">
              <div className="space-y-0.5">
                <div className="font-semibold text-gray-900">
                  {candidate.statement_date} · {candidate.statement_reference}
                </div>
                <div className="text-gray-600">
                  {candidate.factor_name ?? "Unknown factor"} | Advances {money(candidate.advance_total_cents)} | Fees {money(candidate.fee_total_cents)} | Reserves{" "}
                  {money(candidate.reserve_total_cents)}
                </div>
              </div>
              <Button
                loading={importMutation.isPending}
                disabled={!candidate.factor_id}
                onClick={() =>
                  importMutation.mutate({
                    factor_id: candidate.factor_id ?? "",
                    daily_import_id: candidate.id,
                  })
                }
              >
                Import reconciliation run
              </Button>
            </div>
          ))}
        </div>
      </DataPanel>

      <div className="grid gap-3 md:grid-cols-2">
        <DataPanel title="Recent reconciliation runs">
          <div className="space-y-2">
            {(runsQuery.data ?? []).length === 0 ? <div className="text-xs text-gray-500">No runs yet.</div> : null}
            {(runsQuery.data ?? []).map((run: FactorReconciliationRun) => (
              <button
                key={run.id}
                type="button"
                onClick={() => setSelectedRunId(run.id)}
                className={`w-full rounded border px-2 py-1.5 text-left text-xs ${
                  selectedRunId === run.id ? "border-slate-300 bg-slate-100" : "border-gray-200 bg-white hover:bg-gray-50"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-gray-900">{run.statement_date}</span>
                  <span className="text-gray-600">
                    {(run.mismatch_count ?? 0)}/{run.item_count ?? 0} mismatches
                  </span>
                </div>
                <div className="mt-0.5 text-gray-600">
                  Advances {money(run.total_advances_cents)} | Fees {money(run.total_fees_cents)} | Reserve release {money(run.total_reserves_released_cents)}
                </div>
              </button>
            ))}
          </div>
        </DataPanel>

        <DataPanel title="Run detail items">
          {!selectedRun ? <div className="text-xs text-gray-500">Select a reconciliation run.</div> : null}
          {selectedRun ? (
            <div className="space-y-2">
              <div className="text-xs text-gray-700">
                <span className="font-semibold">Run:</span> {selectedRun.statement_date} | <span className="font-semibold">Status:</span> {selectedRun.status} |{" "}
                <span className="font-semibold">Mismatches:</span> {mismatchCount}
              </div>
              <div className="max-h-[320px] overflow-auto rounded border border-gray-200">
                <table className="min-w-full text-left text-xs">
                  <thead className="bg-gray-50">
                    <tr className="text-gray-600">
                      <th className="px-2 py-1.5 font-semibold">Statement invoice</th>
                      <th className="px-2 py-1.5 font-semibold">State</th>
                      <th className="px-2 py-1.5 font-semibold">Factor</th>
                      <th className="px-2 py-1.5 font-semibold">Ledger</th>
                      <th className="px-2 py-1.5 font-semibold">Variance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(itemsQuery.data ?? []).map((item) => (
                      <tr key={item.id} className="border-t border-gray-100">
                        <td className="px-2 py-1.5 text-gray-900">{item.statement_invoice_number ?? "-"}</td>
                        <td className="px-2 py-1.5 text-gray-700">{item.ledger_match_state}</td>
                        <td className="px-2 py-1.5 text-gray-700">{money(item.factor_amount_cents)}</td>
                        <td className="px-2 py-1.5 text-gray-700">{money(item.ledger_amount_cents)}</td>
                        <td className="px-2 py-1.5 text-gray-700">{money(item.variance_cents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </DataPanel>
      </div>
    </AccountingSubNavWrapper>
  );
}
