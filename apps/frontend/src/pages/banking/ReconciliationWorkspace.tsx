import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  completeReconciliationSession,
  getReconciliationWorkspace,
  matchReconciliationTransaction,
  startReconciliationSession,
  unmatchReconciliationTransaction,
  type PlaidBankTransaction,
} from "../../api/banking";
import { useAuth } from "../../auth/useAuth";
import { PageHeader } from "../../components/layout/PageHeader";
import { ActionButton } from "../../components/shared/ActionButton";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { useToast } from "../../components/Toast";
import { StatementUpload } from "../../components/banking/StatementUpload";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { SelectCombobox } from "../../components/shared/SelectCombobox";

type CandidateEvent = { id: string; event_date: string; event_type: "load" | "bill" | "settlement" };

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
}

function computeSummary(transactions: PlaidBankTransaction[], statementBalanceCents: number) {
  let matchedCredits = 0;
  let matchedDebits = 0;
  for (const tx of transactions) {
    const isMatched = Boolean(tx.matched_load_id || tx.matched_bill_id || tx.matched_settlement_id);
    if (!isMatched) continue;
    const amountAbs = Math.abs(Number(tx.amount_cents ?? 0));
    if (tx.is_credit) matchedCredits += amountAbs;
    else matchedDebits += amountAbs;
  }
  const bookBalance = matchedCredits - matchedDebits;
  const variance = Number(statementBalanceCents) - bookBalance;
  return {
    matchedCreditsCents: matchedCredits,
    matchedDebitsCents: matchedDebits,
    bookBalanceCents: bookBalance,
    varianceCents: variance,
  };
}

function varianceClass(varianceCents: number) {
  const abs = Math.abs(varianceCents);
  if (abs === 0) return "text-green-700";
  if (abs < 1000) return "text-amber-700";
  return "text-red-700";
}

export function ReconciliationWorkspacePage() {
  const { bankAccountId = "" } = useParams<{ bankAccountId?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const sessionId = searchParams.get("session_id") ?? "";
  const bankAccountHint = searchParams.get("bank_account_hint") ?? "";
  const effectiveBankAccountId = bankAccountId || bankAccountHint;
  const { selectedCompanyId } = useCompanyContext();
  const auth = useAuth();
  const companyId = selectedCompanyId ?? "";
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [statementBalanceInput, setStatementBalanceInput] = useState("");
  const [startLoading, setStartLoading] = useState(false);
  const [filterMode, setFilterMode] = useState<"all" | "matched" | "unmatched">("all");
  const [eventFilter, setEventFilter] = useState<"all" | "load" | "bill" | "settlement">("all");
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  const [forceReason, setForceReason] = useState("");
  const [localTransactions, setLocalTransactions] = useState<PlaidBankTransaction[]>([]);

  const workspaceQuery = useQuery({
    queryKey: ["banking", "reconciliation-workspace", sessionId, companyId],
    queryFn: () => getReconciliationWorkspace(sessionId, companyId),
    enabled: Boolean(sessionId && companyId),
  });

  useEffect(() => {
    const matched = workspaceQuery.data?.matched_transactions ?? [];
    const unmatched = workspaceQuery.data?.unmatched_transactions ?? [];
    setLocalTransactions([...matched, ...unmatched]);
    setSelectedTransactionId(null);
    setSelectedCandidateId(null);
  }, [workspaceQuery.data]);

  const selectedTransaction = useMemo(
    () => localTransactions.find((tx) => tx.id === selectedTransactionId) ?? null,
    [localTransactions, selectedTransactionId]
  );

  const allCandidates = useMemo<CandidateEvent[]>(() => {
    const candidates = workspaceQuery.data?.candidates;
    if (!candidates) return [];
    return [...candidates.loads, ...candidates.bills, ...candidates.settlements];
  }, [workspaceQuery.data]);

  const visibleTransactions = useMemo(() => {
    if (filterMode === "all") return localTransactions;
    return localTransactions.filter((tx) => {
      const matched = Boolean(tx.matched_load_id || tx.matched_bill_id || tx.matched_settlement_id);
      return filterMode === "matched" ? matched : !matched;
    });
  }, [filterMode, localTransactions]);

  const visibleCandidates = useMemo(() => {
    const byType = eventFilter === "all" ? allCandidates : allCandidates.filter((event) => event.event_type === eventFilter);
    return byType;
  }, [allCandidates, eventFilter]);

  const summary = useMemo(() => {
    const statementBalance = Number(workspaceQuery.data?.summary.statement_balance_cents ?? 0);
    return computeSummary(localTransactions, statementBalance);
  }, [workspaceQuery.data?.summary.statement_balance_cents, localTransactions]);

  const canComplete = auth.user?.role === "Owner" || auth.user?.role === "Administrator" || auth.user?.role === "Accountant";
  const isOwner = auth.user?.role === "Owner";
  const absVariance = Math.abs(summary.varianceCents);
  const needsForceComplete = absVariance >= 1000;

  return (
    <div className="space-y-4">
      <PageHeader
        backHref="/banking"
        title="Reconciliation Workspace"
        subtitle={effectiveBankAccountId ? `Account ${effectiveBankAccountId.slice(0, 8)}...` : ""}
        actions={
          <ActionButton disabled>
            Auto-Match Suggestions (Phase 6)
          </ActionButton>
        }
      />

      {!sessionId ? (
        <div className="rounded border border-gray-200 bg-white p-4">
          <p className="mb-2 text-sm font-semibold text-gray-900">Start reconciliation</p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <input
              type="date"
              value={periodStart}
              onChange={(event) => setPeriodStart(event.target.value)}
              className="rounded border border-gray-300 px-2 py-1 text-sm"
            />
            <input
              type="date"
              value={periodEnd}
              onChange={(event) => setPeriodEnd(event.target.value)}
              className="rounded border border-gray-300 px-2 py-1 text-sm"
            />
            <input
              type="number"
              step="0.01"
              value={statementBalanceInput}
              onChange={(event) => setStatementBalanceInput(event.target.value)}
              placeholder="Statement balance (USD)"
              className="rounded border border-gray-300 px-2 py-1 text-sm"
            />
            <ActionButton
              disabled={!companyId || !effectiveBankAccountId || !periodStart || !periodEnd || !statementBalanceInput || startLoading}
              onClick={() => {
                setStartLoading(true);
                const statementBalanceCents = Math.round(Number(statementBalanceInput) * 100);
                void startReconciliationSession({
                  bank_account_id: effectiveBankAccountId,
                  period_start: periodStart,
                  period_end: periodEnd,
                  statement_balance_cents: statementBalanceCents,
                })
                  .then((res) => {
                    setSearchParams({ session_id: res.session_id, bank_account_hint: effectiveBankAccountId });
                    pushToast("Reconciliation session started", "success");
                    void queryClient.invalidateQueries({ queryKey: ["banking", "reconciliation-sessions"] });
                  })
                  .catch((error) => pushToast(String((error as Error).message || "Failed to start reconciliation"), "error"))
                  .finally(() => setStartLoading(false));
              }}
            >
              {startLoading ? "Starting..." : "Create Session"}
            </ActionButton>
          </div>
        </div>
      ) : null}

      {workspaceQuery.isError ? <ListErrorBanner onRetry={() => void workspaceQuery.refetch()} /> : null}

      {sessionId && workspaceQuery.data ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-10">
          <div className="rounded border border-gray-200 bg-white p-3 lg:col-span-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-900">Bank transactions</p>
              <SelectCombobox
                value={filterMode}
                onChange={(event) => setFilterMode(event.target.value as "all" | "matched" | "unmatched")}
                className="rounded border border-gray-300 px-2 py-1 text-xs"
              >
                <option value="all">All</option>
                <option value="matched">Matched</option>
                <option value="unmatched">Unmatched</option>
              </SelectCombobox>
            </div>
            <div className="max-h-[560px] space-y-1 overflow-auto">
              {visibleTransactions.map((tx) => {
                const matched = Boolean(tx.matched_load_id || tx.matched_bill_id || tx.matched_settlement_id);
                return (
                  <button
                    key={tx.id}
                    type="button"
                    onClick={() => setSelectedTransactionId(tx.id)}
                    className={`w-full rounded border px-2 py-2 text-left ${
                      selectedTransactionId === tx.id ? "border-blue-400 bg-blue-50" : "border-gray-100 bg-white"
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs text-gray-600">
                      <span>{tx.transaction_date}</span>
                      <span className={matched ? "text-green-700" : "text-gray-500"}>{matched ? "Matched" : "Unmatched"}</span>
                    </div>
                    <div className="truncate text-sm font-medium text-gray-900">{tx.description || "Bank transaction"}</div>
                    <div className="text-sm text-gray-700">{money(Number(tx.amount_cents))}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded border border-gray-200 bg-white p-3 lg:col-span-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-900">TMS candidate events</p>
              <SelectCombobox
                value={eventFilter}
                onChange={(event) => setEventFilter(event.target.value as "all" | "load" | "bill" | "settlement")}
                className="rounded border border-gray-300 px-2 py-1 text-xs"
              >
                <option value="all">All</option>
                <option value="load">Loads</option>
                <option value="bill">Bills</option>
                <option value="settlement">Settlements</option>
              </SelectCombobox>
            </div>
            <div className="max-h-[500px] space-y-1 overflow-auto">
              {visibleCandidates.map((event) => (
                <button
                  key={`${event.event_type}-${event.id}`}
                  type="button"
                  onClick={() => setSelectedCandidateId(`${event.event_type}:${event.id}`)}
                  className={`w-full rounded border px-2 py-2 text-left ${
                    selectedCandidateId === `${event.event_type}:${event.id}` ? "border-blue-400 bg-blue-50" : "border-gray-100 bg-white"
                  }`}
                >
                  <div className="text-xs uppercase tracking-wide text-gray-500">{event.event_type}</div>
                  <div className="truncate text-sm font-medium text-gray-900">{event.id}</div>
                  <div className="text-xs text-gray-600">{event.event_date}</div>
                </button>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <ActionButton
                disabled={!selectedTransaction || !selectedCandidateId}
                onClick={() => {
                  if (!selectedTransaction || !selectedCandidateId || !sessionId || !companyId) return;
                  const [matchedEventType, matchedEventId] = selectedCandidateId.split(":");
                  void matchReconciliationTransaction(sessionId, companyId, {
                    transaction_id: selectedTransaction.id,
                    matched_event_type: matchedEventType as "load" | "bill" | "settlement",
                    matched_event_id: matchedEventId,
                  })
                    .then(() => {
                      setLocalTransactions((prev) =>
                        prev.map((tx) =>
                          tx.id === selectedTransaction.id
                            ? {
                                ...tx,
                                matched_load_id: matchedEventType === "load" ? matchedEventId : null,
                                matched_bill_id: matchedEventType === "bill" ? matchedEventId : null,
                                matched_settlement_id: matchedEventType === "settlement" ? matchedEventId : null,
                              }
                            : tx
                        )
                      );
                      pushToast("Transaction matched", "success");
                    })
                    .catch((error) => pushToast(String((error as Error).message || "Match failed"), "error"));
                }}
              >
                Match selected
              </ActionButton>
              <ActionButton
                disabled={!selectedTransaction}
                onClick={() => {
                  if (!selectedTransaction || !sessionId || !companyId) return;
                  void unmatchReconciliationTransaction(sessionId, companyId, { transaction_id: selectedTransaction.id })
                    .then(() => {
                      setLocalTransactions((prev) =>
                        prev.map((tx) =>
                          tx.id === selectedTransaction.id
                            ? { ...tx, matched_load_id: null, matched_bill_id: null, matched_settlement_id: null }
                            : tx
                        )
                      );
                      pushToast("Transaction unmatched", "success");
                    })
                    .catch((error) => pushToast(String((error as Error).message || "Unmatch failed"), "error"));
                }}
              >
                Unmatch selected
              </ActionButton>
            </div>
          </div>

          <div className="space-y-3 lg:col-span-2">
            <div className="rounded border border-gray-200 bg-white p-3">
              <p className="text-sm font-semibold text-gray-900">Variance summary</p>
              <div className="mt-2 space-y-1 text-sm">
                <div className="flex justify-between"><span>Statement</span><span>{money(Number(workspaceQuery.data.summary.statement_balance_cents))}</span></div>
                <div className="flex justify-between"><span>Matched credits</span><span>{money(summary.matchedCreditsCents)}</span></div>
                <div className="flex justify-between"><span>Matched debits</span><span>{money(summary.matchedDebitsCents)}</span></div>
                <div className="flex justify-between"><span>Book balance</span><span>{money(summary.bookBalanceCents)}</span></div>
                <div className={`flex justify-between font-semibold ${varianceClass(summary.varianceCents)}`}>
                  <span>Variance</span><span>{money(summary.varianceCents)}</span>
                </div>
              </div>
              {needsForceComplete ? (
                <textarea
                  value={forceReason}
                  onChange={(event) => setForceReason(event.target.value)}
                  placeholder="Force-complete reason (Owner only)"
                  className="mt-2 w-full rounded border border-gray-300 px-2 py-1 text-xs"
                  rows={3}
                />
              ) : null}
              <ActionButton
                disabled={!canComplete || completing || (needsForceComplete && (!isOwner || !forceReason.trim()))}
                onClick={() => {
                  if (!sessionId || !companyId) return;
                  setCompleting(true);
                  void completeReconciliationSession(sessionId, companyId, {
                    force_complete: needsForceComplete,
                    reason: needsForceComplete ? forceReason.trim() : undefined,
                  })
                    .then(() => {
                      pushToast("Session marked reconciled", "success");
                      void queryClient.invalidateQueries({ queryKey: ["banking", "reconciliation-sessions"] });
                      navigate("/banking");
                    })
                    .catch((error) => pushToast(String((error as Error).message || "Failed to complete reconciliation"), "error"))
                    .finally(() => setCompleting(false));
                }}
              >
                {completing ? "Saving..." : "Mark Reconciled"}
              </ActionButton>
            </div>
            <StatementUpload
              bankAccountId={effectiveBankAccountId}
              onUploaded={() => {
                void workspaceQuery.refetch();
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

