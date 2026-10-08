import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  bulkReconcileAction,
  getPlaidBankAccounts,
  listReconcileObligations,
  listUnmatchedReconcileTransactions,
  reconcileBankTransaction,
  type ObligationType,
  type UnmatchedBankTxnRow,
} from "../../api/banking";
import { useAuth } from "../../auth/useAuth";
import { PageHeader } from "../../components/layout/PageHeader";
import { ActionButton } from "../../components/shared/ActionButton";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { useToast } from "../../components/Toast";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { MultiSelectDropdown } from "../../components/forms/MultiSelectDropdown";
import { EntityLink, type EntityKind } from "../../components/shared/EntityLink";
import { ReconMatchSuggestions } from "./ReconMatchSuggestions";
import { formatDateUS } from "../../lib/formatDate";

import { formatUsdCents } from "../../lib/money";

// GLB-05 -- delegates to the canonical formatter instead of reimplementing an identical
// local currency formatter (same shape lib/money.ts already covers).
function money(cents: number) {
  return formatUsdCents(cents);
}

const OBLIGATION_ENTITY_KIND: Record<ObligationType, EntityKind> = {
  load: "load",
  settlement: "settlement",
  fuel: "fuel_transaction",
  work_order: "work_order",
  ar_invoice: "invoice",
  bill: "bill",
  expense: "expense",
};

export function BankingObligationReconcilePage() {
  const navigate = useNavigate();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const auth = useAuth();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();

  const [accountFilter, setAccountFilter] = useState<string[]>([]);
  const [selectedTxnIds, setSelectedTxnIds] = useState<Set<string>>(() => new Set());
  const [dragTxnId, setDragTxnId] = useState<string | null>(null);

  const accountsQuery = useQuery({
    queryKey: ["banking", "plaid-accounts", companyId],
    queryFn: () => getPlaidBankAccounts(companyId),
    enabled: Boolean(companyId),
  });

  const txnsQuery = useQuery({
    queryKey: ["banking", "reconcile-unmatched", companyId, accountFilter],
    queryFn: () =>
      listUnmatchedReconcileTransactions(companyId, {
        bank_account_id: accountFilter.length === 1 ? accountFilter[0] : undefined,
      }),
    enabled: Boolean(companyId) && ["Owner", "Administrator", "Accountant"].includes(auth.user?.role ?? ""),
  });

  const obligationsQuery = useQuery({
    queryKey: ["banking", "reconcile-obligations", companyId],
    queryFn: () => listReconcileObligations(companyId),
    enabled: Boolean(companyId) && ["Owner", "Administrator", "Accountant"].includes(auth.user?.role ?? ""),
  });

  const reconcileMutation = useMutation({
    mutationFn: (args: { bank_transaction_id: string; obligation_type: ObligationType; obligation_id: string }) =>
      reconcileBankTransaction(companyId, args),
    onSuccess: async () => {
      pushToast("Reconciled", "success");
      await queryClient.invalidateQueries({ queryKey: ["banking", "reconcile-unmatched"] });
    },
    onError: () => pushToast("Reconcile failed", "error"),
  });

  const bulkMutation = useMutation({
    mutationFn: (args: { bank_transaction_ids: string[]; action: "mark_reviewed" | "categorize_fuel" | "categorize_insurance" | "categorize_transfer" }) =>
      bulkReconcileAction(companyId, args),
    onSuccess: async () => {
      pushToast("Bulk update applied", "success");
      setSelectedTxnIds(new Set());
      await queryClient.invalidateQueries({ queryKey: ["banking", "reconcile-unmatched"] });
    },
  });

  const obligations = obligationsQuery.data?.obligations ?? [];
  const accountOptions = useMemo(
    () =>
      (accountsQuery.data?.accounts ?? []).map((a) => ({
        value: a.id,
        label: `${a.institution_name ?? "Bank"} …${a.account_mask ?? ""}`,
      })),
    [accountsQuery.data?.accounts],
  );
  const transactions = useMemo(() => {
    const rows = txnsQuery.data?.transactions ?? [];
    if (accountFilter.length <= 1) return rows;
    const allow = new Set(accountFilter);
    return rows.filter((row) => allow.has(row.bank_account_id));
  }, [txnsQuery.data?.transactions, accountFilter]);

  const toggleSelect = (id: string) => {
    setSelectedTxnIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedList = useMemo(() => Array.from(selectedTxnIds), [selectedTxnIds]);
  const hasSelected = selectedList.length > 0;
  const selectedRows = useMemo(
    () =>
      transactions
        .filter((row) => selectedTxnIds.has(row.id))
        .map((row) => ({
          bank_transaction_id: row.id,
          transaction_date: row.transaction_date,
          amount_cents: Number(row.amount_cents) || 0,
          description: row.description ?? row.merchant_name ?? "",
        })),
    [transactions, selectedTxnIds]
  );

  if (!["Owner", "Administrator", "Accountant"].includes(auth.user?.role ?? "")) {
    return <div className="p-4 text-xs text-gray-600">You need accounting access to use obligation reconciliation.</div>;
  }

  return (
    <div className="space-y-3">
      <PageHeader backHref="/banking" title="Bank reconciliation" subtitle="Drag a transaction onto an obligation, or use bulk actions." />
      {/*
        Only claim 'nothing to reconcile' when BOTH queries actually ran and succeeded. Without the
        isError/isSuccess checks a failed or not-yet-enabled fetch (companyId still resolving) renders
        the same banner, telling the operator the queue is clear from data we never received — the
        exact dishonesty this banner exists to prevent, inverted.
      */}
      {txnsQuery.isSuccess && obligationsQuery.isSuccess && !txnsQuery.isError && !obligationsQuery.isError &&
      transactions.length === 0 && obligations.length === 0 ? (
        <div
          className="rounded-sm border border-[#E5E7EB] bg-[#F7F8FA] px-3 py-2 text-xs text-[#1F2A44]"
          data-testid="banking-reconcile-queue-empty-honesty-banner"
        >
          <p className="font-semibold">Reconcile queue has no unmatched rows and no open obligations in this view.</p>
          <p className="mt-1">
            That is not proof the company is caught up. Most feed activity still lands on Transactions → For review
            (Match/Categorize). Use that path when this queue is empty but uncategorized KPIs are non-zero.
          </p>
          <Link to="/banking/transactions?type=uncategorized" className="mt-2 inline-block font-medium text-[#1F2A44] underline">
            Open for-review Match/Categorize
          </Link>
        </div>
      ) : null}
      {txnsQuery.isError || obligationsQuery.isError ? (
        <ListErrorBanner
          message={
            txnsQuery.error
              ? String((txnsQuery.error as Error).message ?? "Transactions failed")
              : obligationsQuery.error
                ? String((obligationsQuery.error as Error).message ?? "Obligations failed")
                : "Failed to load"
          }
          onRetry={() => {
            void txnsQuery.refetch();
            void obligationsQuery.refetch();
          }}
        />
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <MultiSelectDropdown
          label="Account"
          options={accountOptions}
          selected={accountFilter}
          onChange={setAccountFilter}
          allLabel="All accounts"
          searchable
          data-testid="reconcile-filter-account"
        />
      </div>
      {hasSelected ? (
        <div className="flex flex-wrap items-center gap-2 rounded-sm border border-[#E5E7EB] bg-[#F7F8FA] px-3 py-2">
          <span className="text-xs font-semibold text-[#1F2A44]">{selectedList.length} selected</span>
          <ActionButton
            disabled={bulkMutation.isPending}
            onClick={() => bulkMutation.mutate({ bank_transaction_ids: selectedList, action: "mark_reviewed" })}
          >
            Mark reviewed
          </ActionButton>
          {/* OWNER LAW 2026-10-02 competing-engine audit: "Categorize as Fuel / Insurance / Transfer" only wrote a text label
              — no account, no journal entry. Categorizing is done on Banking → Transactions, where the account is chosen
              and the entry posts in the same transaction. */}
          <ActionButton
            disabled={selectedRows.length === 0}
            onClick={() =>
              navigate("/accounting/bills/multiple", {
                state: { seeds: selectedRows },
              })
            }
          >
            Create bills ({selectedRows.length})
          </ActionButton>
          <button
            type="button"
            className="rounded-sm border border-[#E5E7EB] px-2 py-1 text-xs text-[#1F2A44] hover:bg-[#F7F8FA]"
            onClick={() => setSelectedTxnIds(new Set())}
          >
            Clear selection
          </button>
        </div>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-2">
        <section className="rounded-sm border border-[#E5E7EB] bg-white p-2">
          <h2 className="mb-2 text-xs font-semibold">Unmatched bank transactions</h2>
          <div className="max-h-[480px] space-y-1 overflow-y-auto text-xs">
            {transactions.map((row: UnmatchedBankTxnRow) => (
              <article
                key={row.id}
                draggable
                onDragStart={() => setDragTxnId(row.id)}
                onDragEnd={() => setDragTxnId(null)}
                className="flex cursor-grab gap-2 px-2 py-1 hover:bg-[#F7F8FA]"
              >
                <input type="checkbox" checked={selectedTxnIds.has(row.id)} onChange={() => toggleSelect(row.id)} />
                <div className="flex-1">
                  <div className="font-medium">{money(row.amount_cents)}</div>
                  <div className="text-xs text-[#4B5563]">
                    {formatDateUS(row.transaction_date)} · {row.description ?? row.merchant_name ?? "—"}
                  </div>
                  <EntityLink
                    kind="bank_transaction"
                    id={row.id}
                    label={row.description?.trim() || row.merchant_name?.trim() || "View bank transaction"}
                    className="text-xs"
                  />
                  <ReconMatchSuggestions
                    companyId={companyId}
                    bankTransactionId={row.id}
                    disabled={reconcileMutation.isPending}
                    onAccept={(obligation_type, obligation_id) =>
                      reconcileMutation.mutate({
                        bank_transaction_id: row.id,
                        obligation_type,
                        obligation_id,
                      })
                    }
                    onFactoringApplied={() => {
                      void queryClient.invalidateQueries({ queryKey: ["banking", "reconcile-unmatched"] });
                    }}
                  />
                </div>
              </article>
            ))}
            {transactions.length === 0 ? <p className="text-xs text-gray-500">No rows.</p> : null}
          </div>
        </section>

        <section className="rounded-sm border border-[#E5E7EB] bg-white p-2">
          <h2 className="mb-2 text-xs font-semibold">Unmatched obligations</h2>
          <div className="max-h-[480px] space-y-1 overflow-y-auto text-xs">
            {obligations.map((o) => (
              <div
                key={`${o.obligation_type}-${o.obligation_id}`}
                className={`w-full px-2 py-2 text-left ${dragTxnId ? "bg-[#F7F8FA]/40" : ""}`}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const txnId = dragTxnId;
                  if (!txnId) return;
                  reconcileMutation.mutate({
                    bank_transaction_id: txnId,
                    obligation_type: o.obligation_type,
                    obligation_id: o.obligation_id,
                  });
                  setDragTxnId(null);
                }}
              >
                <div className="text-xs uppercase text-[#6B7280]">{o.obligation_type.replace("_", " ")}</div>
                <div className="font-medium">{money(o.amount_cents)}</div>
                <div className="text-xs text-[#4B5563]">{formatDateUS(o.event_date)}</div>
                <EntityLink
                  kind={OBLIGATION_ENTITY_KIND[o.obligation_type]}
                  id={o.obligation_id}
                  label={o.label}
                  className="text-xs"
                />
              </div>
            ))}
            {obligations.length === 0 ? <p className="text-xs text-gray-500">No obligations loaded.</p> : null}
          </div>
        </section>
      </div>
    </div>
  );
}
