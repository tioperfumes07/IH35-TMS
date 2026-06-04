import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ChangeEvent } from "react";
import {
  getAccountingReconciliationWorkspace,
  matchAccountingReconciliation,
  unmatchAccountingReconciliation,
} from "../../api/accounting";
import { getPlaidBankAccounts } from "../../api/banking";
import { PageHeader } from "../../components/layout/PageHeader";
import { ActionButton } from "../../components/shared/ActionButton";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { SelectCombobox } from "../../components/shared/SelectCombobox";
import { useToast } from "../../components/Toast";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    (Number(cents) || 0) / 100
  );
}

function defaultPeriod() {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 30);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { start: fmt(start), end: fmt(end) };
}

export function ReconciliationWorkspacePage() {
  const { companyId } = useCompanyContext();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const period = useMemo(() => defaultPeriod(), []);
  const [periodStart, setPeriodStart] = useState(period.start);
  const [periodEnd, setPeriodEnd] = useState(period.end);
  const [accountId, setAccountId] = useState("");
  const [selectedBankTxnId, setSelectedBankTxnId] = useState<string | null>(null);

  const accountsQuery = useQuery({
    queryKey: ["banking", "plaid-accounts", companyId],
    queryFn: () => getPlaidBankAccounts(companyId),
    enabled: Boolean(companyId),
  });

  const effectiveAccountId = accountId || accountsQuery.data?.accounts?.[0]?.id || "";

  const workspaceQuery = useQuery({
    queryKey: [
      "accounting",
      "reconciliation-workspace",
      companyId,
      effectiveAccountId,
      periodStart,
      periodEnd,
    ],
    queryFn: () =>
      getAccountingReconciliationWorkspace(companyId, {
        account_id: effectiveAccountId,
        period_start: periodStart,
        period_end: periodEnd,
      }),
    enabled: Boolean(companyId && effectiveAccountId),
  });

  const matchMutation = useMutation({
    mutationFn: (input: {
      bank_transaction_id: string;
      ledger_entry_kind: "payment" | "bill_payment" | "transfer" | "je";
      ledger_entry_id: string;
    }) =>
      matchAccountingReconciliation({
        operating_company_id: companyId,
        ...input,
      }),
    onSuccess: () => {
      pushToast("Match saved", "success");
      setSelectedBankTxnId(null);
      void queryClient.invalidateQueries({ queryKey: ["accounting", "reconciliation-workspace"] });
    },
    onError: (err: Error) => pushToast(err.message || "Match failed", "error"),
  });

  const unmatchMutation = useMutation({
    mutationFn: (input: {
      bank_transaction_id: string;
      ledger_entry_kind: "payment" | "bill_payment" | "transfer" | "je";
      ledger_entry_id: string;
    }) =>
      unmatchAccountingReconciliation({
        operating_company_id: companyId,
        ...input,
      }),
    onSuccess: () => {
      pushToast("Match removed", "success");
      void queryClient.invalidateQueries({ queryKey: ["accounting", "reconciliation-workspace"] });
    },
    onError: (err: Error) => pushToast(err.message || "Unmatch failed", "error"),
  });

  const bankRows = workspaceQuery.data?.unreconciled_bank_transactions ?? [];
  const candidates = workspaceQuery.data?.candidate_ledger_entries ?? [];

  return (
    <div className="page-stack" data-testid="accounting-reconciliation-workspace">
      <PageHeader
        title="Bank reconciliation workspace"
        subtitle="Match unreconciled bank transactions to ledger entries (±3 day / amount scoring)."
      />
      {workspaceQuery.error ? <ListErrorBanner error={workspaceQuery.error as Error} /> : null}
      <div className="filter-row" style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
        <label>
          Account
          <SelectCombobox
            value={effectiveAccountId}
            onChange={(event: ChangeEvent<HTMLSelectElement>) => setAccountId(event.target.value)}
            className="rounded border border-gray-300 px-2 py-1 text-xs"
          >
            {(accountsQuery.data?.accounts ?? []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.account_name || a.institution_name || a.id}
              </option>
            ))}
          </SelectCombobox>
        </label>
        <label>
          From
          <input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
        </label>
        <label>
          To
          <input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
        </label>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, minHeight: 360 }}>
        <section aria-label="Unreconciled bank transactions">
          <h3>Unreconciled bank transactions</h3>
          <ul className="list-plain">
            {bankRows.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  className={selectedBankTxnId === row.id ? "is-selected" : undefined}
                  onClick={() => setSelectedBankTxnId(row.id)}
                >
                  {row.transaction_date} · {money(row.amount_cents)} · {row.description || row.merchant_name || "—"}
                </button>
              </li>
            ))}
            {!bankRows.length && !workspaceQuery.isLoading ? <li>No unreconciled transactions</li> : null}
          </ul>
        </section>
        <section aria-label="Candidate ledger entries">
          <h3>Candidate ledger entries</h3>
          <ul className="list-plain">
            {candidates.map((row) => (
              <li key={`${row.id}-${row.ledger_entry_id}`}>
                <div>
                  {row.transaction_date} · {money(row.amount_cents)} · score {row.match_score}
                  <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                    <ActionButton
                      disabled={!selectedBankTxnId || matchMutation.isPending}
                      onClick={() => {
                        if (!selectedBankTxnId) return;
                        matchMutation.mutate({
                          bank_transaction_id: selectedBankTxnId,
                          ledger_entry_kind: row.ledger_entry_kind,
                          ledger_entry_id: row.ledger_entry_id,
                        });
                      }}
                    >
                      Match
                    </ActionButton>
                    <ActionButton
                      disabled={unmatchMutation.isPending}
                      onClick={() =>
                        unmatchMutation.mutate({
                          bank_transaction_id: row.id,
                          ledger_entry_kind: row.ledger_entry_kind,
                          ledger_entry_id: row.ledger_entry_id,
                        })
                      }
                    >
                      Unmatch
                    </ActionButton>
                  </div>
                </div>
              </li>
            ))}
            {!candidates.length && !workspaceQuery.isLoading ? <li>No candidates for period</li> : null}
          </ul>
        </section>
      </div>
    </div>
  );
}
