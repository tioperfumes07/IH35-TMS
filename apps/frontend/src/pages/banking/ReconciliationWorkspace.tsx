import { useEffect, useMemo, useState } from "react";
import { formatDateUS } from "../../lib/formatDate";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { EntityLink } from "../../components/shared/EntityLink";
import { entityLabel } from "../../lib/entity-label";
import {
  completeReconciliationSession,
  getReconciliationSessions,
  getReconciliationWorkspace,
  matchReconciliationTransaction,
  startReconciliationSession,
  unmatchReconciliationTransaction,
  type PlaidBankTransaction,
  type ReconciliationSession,
} from "../../api/banking";
import { useAuth } from "../../auth/useAuth";
import { PageHeader } from "../../components/layout/PageHeader";
import { ActionButton } from "../../components/shared/ActionButton";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { useToast } from "../../components/Toast";
import { StatementUpload } from "../../components/banking/StatementUpload";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { SelectCombobox } from "../../components/shared/SelectCombobox";
import { MoneyInput } from "../../components/forms/MoneyInput";
import { DatePicker } from "../../components/forms/DatePicker";
import { PrintOrientationDialog } from "./components/PrintOrientationDialog";
import { printLetterHtml } from "../../lib/openPrintableDocument";
import { ChevronDown, ChevronUp } from "lucide-react";
import { userFacingApiError } from "../../lib/api-error-message";

type CandidateEvent = { id: string; event_date: string; event_type: "load" | "bill" | "settlement" };

function candidateEntityKind(eventType: CandidateEvent["event_type"]) {
  switch (eventType) {
    case "load":
      return "load" as const;
    case "bill":
      return "bill" as const;
    case "settlement":
      return "settlement" as const;
  }
}

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
}

function formatReconciledDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

/** Prior closed session for this account — beginning = its statement_balance_cents (QBO carry). */
function priorReconciledSession(
  completed: ReconciliationSession[],
  bankAccountId: string,
  periodStart: string | null | undefined
): ReconciliationSession | null {
  const forAccount = completed.filter((s) => s.bank_account_id === bankAccountId);
  const beforePeriod = periodStart
    ? forAccount.filter((s) => String(s.period_end ?? "") < String(periodStart))
    : forAccount;
  const pool = beforePeriod.length > 0 ? beforePeriod : forAccount;
  if (pool.length === 0) return null;
  return [...pool].sort((a, b) => {
    const ta = a.reconciled_at ? Date.parse(a.reconciled_at) : 0;
    const tb = b.reconciled_at ? Date.parse(b.reconciled_at) : 0;
    if (tb !== ta) return tb - ta;
    return String(b.period_end ?? "").localeCompare(String(a.period_end ?? ""));
  })[0] ?? null;
}

function computeSummary(transactions: PlaidBankTransaction[], statementBalanceCents: number) {
  let matchedCredits = 0;
  let matchedDebits = 0;
  for (const tx of transactions) {
    const isMatched = transactionIsMatched(tx);
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

function transactionIsMatched(tx: PlaidBankTransaction) {
  if (typeof tx.is_matched === "boolean") return tx.is_matched;
  return Boolean(
    tx.matched_load_id ||
      tx.matched_bill_id ||
      tx.matched_settlement_id ||
      tx.matched_expense_id ||
      tx.matched_transfer_id ||
      tx.matched_journal_entry_id,
  );
}

function varianceClass(varianceCents: number) {
  const abs = Math.abs(varianceCents);
  if (abs === 0) return "text-slate-700";
  if (abs < 1000) return "text-slate-700";
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
  const [statementBalanceInput, setStatementBalanceInput] = useState<number | null>(null);
  const [startLoading, setStartLoading] = useState(false);
  const [filterMode, setFilterMode] = useState<"all" | "matched" | "unmatched">("all");
  const [eventFilter, setEventFilter] = useState<"all" | "load" | "bill" | "settlement">("all");
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  const [forceReason, setForceReason] = useState("");
  const [localTransactions, setLocalTransactions] = useState<PlaidBankTransaction[]>([]);
  const [txnSort, setTxnSort] = useState<{ key: "date" | "description" | "amount"; dir: "asc" | "desc" }>({
    key: "date",
    dir: "desc",
  });
  const [printDialogOpen, setPrintDialogOpen] = useState(false);

  const workspaceQuery = useQuery({
    queryKey: ["banking", "reconciliation-workspace", sessionId, companyId],
    queryFn: () => getReconciliationWorkspace(sessionId, companyId),
    enabled: Boolean(sessionId && companyId),
  });

  // bnk-03: prior closed session supplies beginning balance + last-reconciled date
  // (carry prior statement_balance_cents — no dedicated beginning column on sessions).
  const sessionsQuery = useQuery({
    queryKey: ["banking", "reconciliation-sessions", companyId],
    queryFn: () => getReconciliationSessions(companyId),
    enabled: Boolean(companyId),
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
    const filtered =
      filterMode === "all"
        ? localTransactions
        : localTransactions.filter((tx) => {
            const matched = transactionIsMatched(tx);
            return filterMode === "matched" ? matched : !matched;
          });
    const dir = txnSort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      let va: string | number = a.transaction_date ?? "";
      let vb: string | number = b.transaction_date ?? "";
      if (txnSort.key === "description") {
        va = (a.description ?? "").toLowerCase();
        vb = (b.description ?? "").toLowerCase();
      } else if (txnSort.key === "amount") {
        va = Math.abs(Number(a.amount_cents ?? 0));
        vb = Math.abs(Number(b.amount_cents ?? 0));
      }
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
  }, [filterMode, localTransactions, txnSort]);

  const toggleTxnSort = (key: "date" | "description" | "amount") =>
    setTxnSort((prev) => (prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "date" ? "desc" : "asc" }));

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
  // Reconciliation is ordinary-complete only at exactly $0.00. Any non-zero difference needs an
  // Owner's explicit, reasoned override; never silently certify an under-$10 variance.
  const needsForceComplete = summary.varianceCents !== 0;

  // 0441-mod8: wire Auto-Match → existing bank-recon auto_matched_candidates worklist
  // (BankReconciliationPage accept/reject). No new scoring/GL — session period + account only.
  const session = workspaceQuery.data?.session;
  const canOpenAutoMatchSuggestions = Boolean(
    sessionId &&
      companyId &&
      session?.bank_account_id &&
      session?.period_start &&
      session?.period_end
  );

  const balanceHeader = useMemo(() => {
    const bankId = session?.bank_account_id || effectiveBankAccountId;
    if (!bankId) return null;
    const prior = priorReconciledSession(
      sessionsQuery.data?.completed_sessions ?? [],
      bankId,
      session?.period_start ?? (periodStart || undefined)
    );
    const endingCents =
      session?.statement_balance_cents != null
        ? Number(session.statement_balance_cents)
        : statementBalanceInput != null
          ? Math.round(Number(statementBalanceInput) * 100)
          : null;
    return {
      beginningCents: prior?.statement_balance_cents != null ? Number(prior.statement_balance_cents) : 0,
      endingCents,
      lastReconciledAt: prior?.reconciled_at ?? null,
    };
  }, [
    session?.bank_account_id,
    session?.period_start,
    session?.statement_balance_cents,
    effectiveBankAccountId,
    sessionsQuery.data?.completed_sessions,
    periodStart,
    statementBalanceInput,
  ]);

  return (
    <div className="space-y-4">
      <PageHeader
        backHref="/banking"
        title="Reconciliation Workspace"
        subtitle={effectiveBankAccountId ? entityLabel(null, effectiveBankAccountId, "Bank account") : ""}
        actions={
          <div className="flex items-center gap-2">
            <ActionButton
              onClick={() => setPrintDialogOpen(true)}
            >
              Print
            </ActionButton>
            <ActionButton
              disabled={!canOpenAutoMatchSuggestions}
              onClick={() => {
                if (!session?.bank_account_id || !session.period_start || !session.period_end) return;
                const qs = new URLSearchParams({
                  account_id: session.bank_account_id,
                  period_start: session.period_start,
                  period_end: session.period_end,
                });
                navigate(`/banking/reconciliation?${qs.toString()}`);
              }}
            >
              Auto-Match Suggestions
            </ActionButton>
          </div>
        }
      />

      {balanceHeader ? (
        <div
          className="grid grid-cols-1 gap-3 rounded-sm border border-gray-200 bg-white px-4 py-3 sm:grid-cols-3"
          data-testid="recon-balance-header"
        >
          <div>
            <div className="text-[11px] uppercase tracking-wide text-gray-500">Beginning balance</div>
            <div className="text-sm font-semibold text-gray-900">{money(balanceHeader.beginningCents)}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-gray-500">Ending balance</div>
            <div className="text-sm font-semibold text-gray-900">
              {balanceHeader.endingCents != null ? money(balanceHeader.endingCents) : "—"}
            </div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-gray-500">Last reconciled</div>
            <div className="text-sm font-semibold text-gray-900">
              {formatReconciledDate(balanceHeader.lastReconciledAt)}
            </div>
          </div>
        </div>
      ) : null}

      <PrintOrientationDialog
        open={printDialogOpen}
        title="Print reconciliation"
        onCancel={() => setPrintDialogOpen(false)}
        onConfirm={(orientation) => {
          setPrintDialogOpen(false);
          const esc = (v: unknown) =>
            String(v ?? "—")
              .replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;")
              .replace(/"/g, "&quot;");
          const rowsHtml = visibleTransactions
            .map((tx) => {
              const matched = transactionIsMatched(tx);
              return `<tr>
                <td>${esc(tx.transaction_date ? formatDateUS(tx.transaction_date) : "—")}</td>
                <td>${esc(tx.description || "Bank transaction")}</td>
                <td style="text-align:right">${esc(money(Number(tx.amount_cents ?? 0)))}</td>
                <td>${esc(matched ? "Matched" : "Unmatched")}</td>
              </tr>`;
            })
            .join("");
          printLetterHtml({
            title: `Reconciliation ${session?.period_start ?? ""}–${session?.period_end ?? ""}`,
            orientation,
            bodyHtml: `
              <h1>Bank reconciliation</h1>
              <div class="meta">${esc(entityLabel(null, effectiveBankAccountId, "Bank account"))} · ${esc(
                session?.period_start ? formatDateUS(session.period_start) : "—",
              )} → ${esc(session?.period_end ? formatDateUS(session.period_end) : "—")} · ${esc(
                orientation,
              )} · printed ${esc(new Date().toLocaleString())}</div>
              <table>
                <tbody>
                  <tr><th>Beginning balance</th><td>${esc(
                    balanceHeader ? money(balanceHeader.beginningCents) : "—",
                  )}</td></tr>
                  <tr><th>Ending balance</th><td>${esc(
                    balanceHeader?.endingCents != null ? money(balanceHeader.endingCents) : "—",
                  )}</td></tr>
                  <tr><th>Last reconciled</th><td>${esc(
                    balanceHeader ? formatReconciledDate(balanceHeader.lastReconciledAt) : "—",
                  )}</td></tr>
                  <tr><th>Book (matched)</th><td>${esc(money(summary.bookBalanceCents))}</td></tr>
                  <tr><th>Variance</th><td>${esc(money(summary.varianceCents))}</td></tr>
                </tbody>
              </table>
              <h1 style="margin-top:20px">Transactions (${esc(visibleTransactions.length)})</h1>
              <table>
                <thead>
                  <tr>
                    <th>Date</th><th>Description</th>
                    <th style="text-align:right">Amount</th><th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  ${rowsHtml || `<tr><td colspan="4">No rows</td></tr>`}
                </tbody>
              </table>
            `,
          });
        }}
      />

      {!sessionId ? (
        <div className="bg-white p-4">
          <p className="mb-2 text-sm font-semibold text-gray-900">Start reconciliation</p>
          <div className="mb-2 flex flex-wrap gap-1">
            {(
              [
                ["This month", () => {
                  const d = new Date();
                  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
                  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
                  setPeriodStart(start.toISOString().slice(0, 10));
                  setPeriodEnd(end.toISOString().slice(0, 10));
                }],
                ["Last month", () => {
                  const d = new Date();
                  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1));
                  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 0));
                  setPeriodStart(start.toISOString().slice(0, 10));
                  setPeriodEnd(end.toISOString().slice(0, 10));
                }],
              ] as Array<[string, () => void]>
            ).map(([label, apply]) => (
              <button
                key={label}
                type="button"
                className="rounded-sm border border-gray-300 px-2 py-0.5 text-[11px] text-gray-700 hover:bg-gray-50"
                onClick={apply}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <DatePicker
              value={periodStart}
              onChange={setPeriodStart}
              className=""
            />
            <DatePicker
              value={periodEnd}
              onChange={setPeriodEnd}
              className=""
            />
            {/* M-1: dollars-mode QBO money entry; balance stays a DOLLAR number → *_cents byte-for-byte. */}
            <MoneyInput
              valueDollars={statementBalanceInput}
              onChangeDollars={setStatementBalanceInput}
              ariaLabel="Statement balance (USD)"
              placeholder="Statement balance (USD)"
              className="text-sm"
            />
            <ActionButton
              disabled={!companyId || !effectiveBankAccountId || !periodStart || !periodEnd || statementBalanceInput == null || startLoading}
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
                  .catch((error) => pushToast(userFacingApiError(error, "Failed to start reconciliation"), "error"))
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
          <div className="bg-white p-3 lg:col-span-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-gray-900">Bank transactions</p>
              <div className="flex items-center gap-2">
                <div className="inline-flex overflow-hidden rounded-sm border border-gray-300 text-[10px]">
                  {(
                    [
                      ["date", "Date"],
                      ["description", "Desc"],
                      ["amount", "Amt"],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      className={`inline-flex items-center gap-0.5 px-2 py-1 ${txnSort.key === key ? "bg-[#1f2a44] text-white" : "text-gray-700"} ${key !== "date" ? "border-l border-gray-300" : ""}`}
                      onClick={() => toggleTxnSort(key)}
                    >
                      {label}
                      {txnSort.key === key ? (txnSort.dir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : null}
                    </button>
                  ))}
                </div>
                <SelectCombobox
                  value={filterMode}
                  onChange={(event) => setFilterMode(event.target.value as "all" | "matched" | "unmatched")}
                  className="rounded-sm border border-gray-300 px-2 py-1 text-xs"
                >
                  <option value="all">All</option>
                  <option value="matched">Matched</option>
                  <option value="unmatched">Unmatched</option>
                </SelectCombobox>
              </div>
            </div>
            <div className="max-h-[560px] space-y-1 overflow-auto">
              {visibleTransactions.map((tx) => {
                const matched = transactionIsMatched(tx);
                return (
                  <button
                    key={tx.id}
                    type="button"
                    onClick={() => setSelectedTransactionId(tx.id)}
                    className={`w-full px-2 py-2 text-left ${
                      selectedTransactionId === tx.id ? "bg-slate-100" : "bg-white hover:bg-gray-50"
                    } border-b border-gray-100`}
                  >
                    <div className="flex items-center justify-between text-xs text-gray-600">
                      <span>{formatDateUS(tx.transaction_date)}</span>
                      <span className={matched ? "text-slate-700" : "text-gray-500"}>{matched ? "Matched" : "Unmatched"}</span>
                    </div>
                    <div className="truncate text-sm font-medium text-gray-900">{tx.description || "Bank transaction"}</div>
                    <div className="text-sm text-gray-700">{money(Number(tx.amount_cents))}</div>
                    {matched ? (
                      <div className="mt-1 flex flex-wrap gap-2 text-xs">
                        {/* BANK-F5744 — plaid/link.routes.ts already joins matched_load_number/
                            matched_bill_number/matched_settlement_display_id/matched_expense_number
                            alongside every matched_*_id (BANK-F5662/ACCT-F5153/EXPENSE column-wave
                            comments on the type), but this render hardcoded entityLabel(null, ...),
                            structurally discarding the human label it already had in hand. */}
                        {tx.matched_load_id ? (
                          <EntityLink
                            kind="load"
                            id={tx.matched_load_id}
                            label={entityLabel(tx.matched_load_number ?? null, tx.matched_load_id, "Load")}
                          />
                        ) : null}
                        {tx.matched_bill_id ? (
                          <EntityLink
                            kind="bill"
                            id={tx.matched_bill_id}
                            label={entityLabel(tx.matched_bill_number ?? null, tx.matched_bill_id, "Bill")}
                          />
                        ) : null}
                        {tx.matched_settlement_id ? (
                          <EntityLink
                            kind="settlement"
                            id={tx.matched_settlement_id}
                            label={entityLabel(tx.matched_settlement_display_id ?? null, tx.matched_settlement_id, "Settlement")}
                          />
                        ) : null}
                        {/* EXPENSE column-wave: bank-transaction-splits.service.ts (and the
                            accounting-side bank-recon accept flow) genuinely stamp matched_expense_id;
                            this workspace never rendered it, so an expense-matched transaction looked
                            unmatched here even though ExpenseDetailPage.tsx already showed the reverse
                            link correctly. */}
                        {tx.matched_expense_id ? (
                          <EntityLink
                            kind="expense"
                            id={tx.matched_expense_id}
                            label={entityLabel(tx.matched_expense_number ?? null, tx.matched_expense_id, "Expense")}
                          />
                        ) : null}
                        {tx.matched_transfer_id ? (
                          <EntityLink kind="transfer" id={tx.matched_transfer_id} label={entityLabel(tx.matched_transfer_label, tx.matched_transfer_id, "Transfer")} />
                        ) : null}
                        {tx.matched_journal_entry_id ? (
                          <EntityLink kind="journal_entry" id={tx.matched_journal_entry_id} label={entityLabel(tx.matched_journal_entry_memo, tx.matched_journal_entry_id, "Journal entry")} />
                        ) : null}
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="border-l border-gray-200 bg-white p-3 lg:col-span-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-900">TMS candidate events</p>
              <SelectCombobox
                value={eventFilter}
                onChange={(event) => setEventFilter(event.target.value as "all" | "load" | "bill" | "settlement")}
                className="rounded-sm border border-gray-300 px-2 py-1 text-xs"
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
                  className={`w-full border-b border-gray-100 px-2 py-2 text-left ${
                    selectedCandidateId === `${event.event_type}:${event.id}` ? "bg-slate-100" : "bg-white hover:bg-gray-50"
                  }`}
                >
                  <div className="text-xs uppercase tracking-wide text-gray-500">{event.event_type}</div>
                  <div className="truncate text-sm font-medium text-gray-900">
                    <EntityLink
                      kind={candidateEntityKind(event.event_type)}
                      id={event.id}
                      label={entityLabel(null, event.id, event.event_type === "load" ? "Load" : event.event_type === "bill" ? "Bill" : "Settlement")}
                    />
                  </div>
                  <div className="text-xs text-gray-600">{formatDateUS(event.event_date)}</div>
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
                      // Refetch workspace so variance summary / candidates stay server-synced
                      // (local patch alone drifts when server-side matched sets differ).
                      void workspaceQuery.refetch();
                      pushToast("Transaction matched", "success");
                    })
                    .catch((error) => pushToast(userFacingApiError(error, "Match failed"), "error"));
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
                      void workspaceQuery.refetch();
                      pushToast("Transaction unmatched", "success");
                    })
                    .catch((error) => pushToast(userFacingApiError(error, "Unmatch failed"), "error"));
                }}
              >
                Unmatch selected
              </ActionButton>
            </div>
          </div>

          <div className="space-y-3 lg:col-span-2">
            <div className="rounded-sm border border-gray-200 bg-white p-3">
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
                  className="mt-2 w-full rounded-sm border border-gray-300 px-2 py-1 text-xs"
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
                    .catch((error) => pushToast(userFacingApiError(error, "Failed to complete reconciliation"), "error"))
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
