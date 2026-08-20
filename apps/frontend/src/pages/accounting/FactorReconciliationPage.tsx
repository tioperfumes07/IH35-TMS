import { formatDateUS } from "../../lib/formatDate";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  importFactorReconciliationRun,
  listFactorReconciliationItems,
  listFactorReconciliationRuns,
  listFactorReconciliationImportCandidates,
  type FactorReconciliationItem,
  type FactorReconciliationRun,
} from "../../api/accounting";
import { Button } from "../../components/Button";
import { ListErrorState } from "../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { DataPanel } from "../../components/layout/DataPanel";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useToast } from "../../components/Toast";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";
import { EntityLink } from "../../components/shared/EntityLink";
import { entityLabel } from "../../lib/entity-label";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { userFacingApiError } from "../../lib/api-error-message";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
}

export function FactorReconciliationPage() {
  const { selectedCompanyId } = useCompanyContext();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
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
    onError: (error) => pushToast(userFacingApiError(error, "Failed to import reconciliation run"), "error"),
  });

  const selectedRun = useMemo(
    () => (runsQuery.data ?? []).find((run) => run.id === selectedRunId) ?? null,
    [runsQuery.data, selectedRunId]
  );

  const mismatchCount = (itemsQuery.data ?? []).filter((row) => row.ledger_match_state !== "matched").length;

  // Display-only ParityTable migration: column order, money formatting, and cell text colors
  // are preserved 1:1 from the former hand-rolled table markup.
  const itemColumns = useMemo<Array<ParityColumn<FactorReconciliationItem>>>(
    () => [
      {
        key: "statement_invoice_number",
        label: "Statement invoice",
        sortable: true,
        render: (item) => (
          <span className="text-gray-900">{item.statement_invoice_number ?? "-"}</span>
        ),
      },
      {
        key: "invoice_id",
        label: "Ledger invoice",
        sortable: true,
        sortValue: (item) => item.invoice_id ?? "",
        render: (item) => (
          <EntityLink
            kind="invoice"
            id={item.invoice_id ?? undefined}
            label={item.invoice_id ? entityLabel(item.invoice_display_id, item.invoice_id, "Invoice") : "-"}
          />
        ),
      },
      {
        key: "ledger_match_state",
        label: "State",
        sortable: true,
        render: (item) => <span className="text-gray-700">{item.ledger_match_state}</span>,
      },
      {
        key: "factor_amount_cents",
        label: "Factor",
        sortable: true,
        sortValue: (item) => Number(item.factor_amount_cents) || 0,
        render: (item) => <span className="text-gray-700">{money(item.factor_amount_cents)}</span>,
      },
      {
        key: "ledger_amount_cents",
        label: "Ledger",
        sortable: true,
        sortValue: (item) => Number(item.ledger_amount_cents) || 0,
        render: (item) => <span className="text-gray-700">{money(item.ledger_amount_cents)}</span>,
      },
      {
        key: "variance_cents",
        label: "Variance",
        sortable: true,
        sortValue: (item) => Number(item.variance_cents) || 0,
        render: (item) => <span className="text-gray-700">{money(item.variance_cents)}</span>,
      },
    ],
    []
  );

  return (
    <AccountingSubNavWrapper title="Factor reconciliation" subtitle="Statement-to-ledger reconciliation with Q11 tolerance and match-state drilldown.">

      <DataPanel title="Import candidates (Faro statements)">
        <div className="space-y-2">
          {candidatesQuery.isError ? (
            <ListErrorState
              title="Couldn't load import candidates"
              status={0}
              message={(candidatesQuery.error as Error)?.message}
              onRetry={() => void candidatesQuery.refetch()}
            />
          ) : (candidatesQuery.data ?? []).length === 0 ? <div className="text-xs text-gray-500">No pending statement imports.</div> : null}
          {(candidatesQuery.data ?? []).map((candidate) => (
            <div key={candidate.id} className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-gray-200 p-2 text-xs">
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
            {runsQuery.isError ? (
              <ListErrorState
                title="Couldn't load reconciliation runs"
                status={0}
                message={(runsQuery.error as Error)?.message}
                onRetry={() => void runsQuery.refetch()}
              />
            ) : (runsQuery.data ?? []).length === 0 ? <div className="text-xs text-gray-500">No runs yet.</div> : null}
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
                  <span className="font-semibold text-gray-900">{formatDateUS(run.statement_date)}</span>
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
              {itemsQuery.isError ? (
                <ListErrorBanner
                  message={`Failed to load reconciliation items: ${(itemsQuery.error as Error)?.message ?? "Request failed"}`}
                  onRetry={() => void itemsQuery.refetch()}
                />
              ) : null}
              {!itemsQuery.isError ? (
                <>
                  <div className="text-xs text-gray-700">
                    <span className="font-semibold">Run:</span> {selectedRun.statement_date} | <span className="font-semibold">Status:</span> {selectedRun.status} |{" "}
                    <span className="font-semibold">Mismatches:</span> {mismatchCount}
                  </div>
                  <ParityTable
                    columns={itemColumns}
                    rows={itemsQuery.data ?? []}
                    rowKey={(item) => item.id}
                    loading={itemsQuery.isLoading}
                    storageKey="accounting-factor-reconciliation-items"
                    tableTestId="factor-reconciliation-items-table"
                    emptyText="No reconciliation items."
                  />
                </>
              ) : null}
            </div>
          ) : null}
        </DataPanel>
      </div>
    </AccountingSubNavWrapper>
  );
}
