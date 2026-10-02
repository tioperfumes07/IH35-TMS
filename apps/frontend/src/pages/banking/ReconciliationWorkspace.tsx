import { useEffect, useMemo, useState } from "react";
import { formatDateUS } from "../../lib/formatDate";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { EntityLink } from "../../components/shared/EntityLink";
import { entityLabel, visibleDocumentLabel } from "../../lib/entity-label";
import {
  clearReconciliationTransaction,
  completeReconciliationSession,
  getBankingTiles,
  getPlaidBankAccounts,
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
import { filterBankingTilesForCompany } from "../../lib/banking-company-filter";
import { SelectCombobox } from "../../components/Combobox";
import { MoneyInput } from "../../components/forms/MoneyInput";
import { DatePicker } from "../../components/forms/DatePicker";
import { ReferenceSelect } from "../../components/parity/ReferenceSelect";
import { getCoaAccounts } from "../../api/banking";
import { PrintOrientationDialog } from "./components/PrintOrientationDialog";
import { printLetterHtml } from "../../lib/openPrintableDocument";
import { ChevronDown, ChevronUp } from "lucide-react";
import { userFacingApiError } from "../../lib/api-error-message";

type CandidateEvent = { id: string; event_date: string; event_type: "load" | "bill" | "settlement"; display_label: string };

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

import { formatUsdCents } from "../../lib/money";

// GLB-05 -- delegates to the canonical formatter instead of reimplementing an identical
// local currency formatter (same shape lib/money.ts already covers).
function money(cents: number) {
  return formatUsdCents(cents);
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

/** B-2 / BANK-DOM-03 — cleared for this session (●), falling back to matched until any row is cleared. */
function transactionIsCleared(tx: PlaidBankTransaction, anyExplicitCleared: boolean) {
  if (anyExplicitCleared) return Boolean(tx.reconciliation_cleared);
  return Boolean(tx.reconciliation_cleared) || transactionIsMatched(tx);
}

function countCleared(transactions: PlaidBankTransaction[]) {
  const anyExplicit = transactions.some((t) => Boolean(t.reconciliation_cleared));
  let paymentCount = 0;
  let depositCount = 0;
  let paymentCents = 0;
  let depositCents = 0;
  for (const tx of transactions) {
    if (!transactionIsCleared(tx, anyExplicit)) continue;
    const abs = Math.abs(Number(tx.amount_cents ?? 0));
    if (tx.is_credit) {
      depositCount += 1;
      depositCents += abs;
    } else {
      paymentCount += 1;
      paymentCents += abs;
    }
  }
  return { paymentCount, depositCount, paymentCents, depositCents, anyExplicit };
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
  const [pickedBankAccountId, setPickedBankAccountId] = useState("");
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
  /** B-2 QBO Reconcile tabs: Payments (money out) | Deposits (money in) | All. */
  const [directionTab, setDirectionTab] = useState<"payments" | "deposits" | "all">("all");
  const [eventFilter, setEventFilter] = useState<"all" | "load" | "bill" | "settlement">("all");
  const [clearingId, setClearingId] = useState<string | null>(null);
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);

  // ROUND 313 BANK-ECON-04 — Service charge / Interest earned persist on the session and post
  // through the canonical JE poster on Finish (migration 202615141200). Local state is the
  // working draft; complete sends cents/date/account so the server posts Dr/Cr and stamps JE FKs.
  const [serviceChargeInput, setServiceChargeInput] = useState<number | null>(null);
  const [serviceChargeDate, setServiceChargeDate] = useState("");
  const [serviceChargeAccountId, setServiceChargeAccountId] = useState<string | null>(null);
  const [interestEarnedInput, setInterestEarnedInput] = useState<number | null>(null);
  const [interestEarnedDate, setInterestEarnedDate] = useState("");
  const [interestEarnedAccountId, setInterestEarnedAccountId] = useState<string | null>(null);

  const coaQuery = useQuery({
    queryKey: ["banking", "recon-coa", companyId],
    queryFn: () => getCoaAccounts(companyId),
    enabled: Boolean(companyId),
    staleTime: 120_000,
  });
  const coaOptions = useMemo(
    () => (coaQuery.data?.accounts ?? []).map((a) => ({ value: a.id, label: a.account_name })),
    [coaQuery.data?.accounts],
  );
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

  const tilesQuery = useQuery({
    queryKey: ["banking", "tiles", companyId],
    queryFn: () => getBankingTiles(companyId),
    enabled: Boolean(companyId) && !sessionId,
  });
  const plaidAccountsQuery = useQuery({
    queryKey: ["banking", "plaid-accounts", companyId],
    queryFn: () => getPlaidBankAccounts(companyId),
    enabled: Boolean(companyId) && !sessionId,
  });
  const reconAccountOptions = useMemo(() => {
    const tiles = filterBankingTilesForCompany(tilesQuery.data?.tiles ?? [], companyId);
    const realTiles = tiles.filter((tile) => String(tile.tile_kind) === "real");
    if (realTiles.length > 0) {
      return realTiles.map((tile) => ({ id: tile.id, label: tile.display_name }));
    }
    return (plaidAccountsQuery.data?.accounts ?? []).map((account) => ({
      id: account.id,
      label: entityLabel(account.account_name, account.id, "Account"),
    }));
  }, [companyId, plaidAccountsQuery.data?.accounts, tilesQuery.data?.tiles]);
  const effectiveBankAccountId = bankAccountId || bankAccountHint || pickedBankAccountId;

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
    let filtered =
      filterMode === "all"
        ? localTransactions
        : localTransactions.filter((tx) => {
            const matched = transactionIsMatched(tx);
            return filterMode === "matched" ? matched : !matched;
          });
    if (directionTab === "payments") filtered = filtered.filter((tx) => !tx.is_credit);
    else if (directionTab === "deposits") filtered = filtered.filter((tx) => tx.is_credit);
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
  }, [directionTab, filterMode, localTransactions, txnSort]);

  const toggleTxnSort = (key: "date" | "description" | "amount") =>
    setTxnSort((prev) => (prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "date" ? "desc" : "asc" }));

  const visibleCandidates = useMemo(() => {
    const byType = eventFilter === "all" ? allCandidates : allCandidates.filter((event) => event.event_type === eventFilter);
    return byType;
  }, [allCandidates, eventFilter]);

  const serviceChargeCents = serviceChargeInput != null ? Math.round(Number(serviceChargeInput) * 100) : 0;
  const interestEarnedCents = interestEarnedInput != null ? Math.round(Number(interestEarnedInput) * 100) : 0;

  const clearedCounts = useMemo(() => countCleared(localTransactions), [localTransactions]);

  const clearedSummary = useMemo(() => {
    const server = workspaceQuery.data?.summary;
    const statementBalance = Number(server?.statement_balance_cents ?? 0);
    const depositCents =
      clearedCounts.depositCents || Number(server?.cleared_credits_cents ?? server?.matched_credits_cents ?? 0);
    const paymentCents =
      clearedCounts.paymentCents || Number(server?.cleared_debits_cents ?? server?.matched_debits_cents ?? 0);
    return {
      statementBalanceCents: statementBalance,
      depositCents,
      paymentCents,
      paymentCount: clearedCounts.paymentCount,
      depositCount: clearedCounts.depositCount,
      matchedCreditsCents: depositCents,
      matchedDebitsCents: paymentCents,
    };
  }, [workspaceQuery.data?.summary, clearedCounts]);

  const canComplete = auth.user?.role === "Owner" || auth.user?.role === "Administrator" || auth.user?.role === "Accountant";
  const isOwner = auth.user?.role === "Owner";
  // A service charge / interest earned amount with no date or account is an incomplete entry —
  // it already moved the Difference, but there's nowhere real to post it. Block Finish until
  // both are filled, same as any other money line this app blocks on an incomplete wizard step.
  const serviceChargeIncomplete = serviceChargeCents !== 0 && (!serviceChargeDate || !serviceChargeAccountId);
  const interestEarnedIncomplete = interestEarnedCents !== 0 && (!interestEarnedDate || !interestEarnedAccountId);

  // 0441-mod8: wire Auto-Match → existing bank-recon auto_matched_candidates worklist
  // (BankReconciliationPage accept/reject). No new scoring/GL — session period + account only.
  const session = workspaceQuery.data?.session;
  const bankAccountLabel = workspaceQuery.data?.bank_account_label || "Bank account";
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

  // Beginning = prior closed session statement ending (QBO). Never invent a beginning-balance column.
  const summary = useMemo(() => {
    const beginning = Number(balanceHeader?.beginningCents ?? 0);
    const clearedBalanceCents =
      beginning - clearedSummary.paymentCents + clearedSummary.depositCents - serviceChargeCents + interestEarnedCents;
    return {
      ...clearedSummary,
      beginningCents: beginning,
      clearedBalanceCents,
      bookBalanceCents: clearedBalanceCents,
      varianceCents: clearedSummary.statementBalanceCents - clearedBalanceCents,
    };
  }, [clearedSummary, balanceHeader?.beginningCents, serviceChargeCents, interestEarnedCents]);

  // Reconciliation is ordinary-complete only at exactly $0.00. Any non-zero difference needs an
  // Owner's explicit, reasoned override; never silently certify an under-$10 variance.
  const needsForceComplete = summary.varianceCents !== 0;

  return (
    <div className="space-y-4">
      <PageHeader
        backHref="/banking"
        title="Reconciliation Workspace"
        subtitle={effectiveBankAccountId ? bankAccountLabel : ""}
        actions={
          <div className="flex items-center gap-2">
            {sessionId ? (
              <ActionButton
                data-testid="recon-save-for-later"
                onClick={() => {
                  pushToast("Session saved — reopen from Reconciliation to continue", "success");
                  navigate("/banking/reconciliation");
                }}
              >
                Save for later
              </ActionButton>
            ) : null}
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

      {sessionId && workspaceQuery.data ? (
        <div
          className="rounded-sm border border-[#E5E7EB] bg-white px-4 py-3"
          data-testid="recon-qbo-arithmetic"
          data-b2-reconcile-arithmetic="1"
        >
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-[#4B5563]">
                {bankAccountLabel}
                {session?.period_end ? ` · Statement ending ${formatDateUS(session.period_end)}` : ""}
              </p>
              <p className="mt-1 text-xs text-[#6B7280]">
                Beginning {money(summary.beginningCents)} − {summary.paymentCount} payments{" "}
                {money(summary.paymentCents)} + {summary.depositCount} deposits {money(summary.depositCents)}
                {serviceChargeCents ? ` − service charge ${money(serviceChargeCents)}` : ""}
                {interestEarnedCents ? ` + interest ${money(interestEarnedCents)}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-center text-xs">
              <div>
                <p className="font-bold uppercase tracking-wide text-[#4B5563]">Statement ending</p>
                <p className="mt-0.5 font-semibold tabular-nums text-[#0F1219]">{money(summary.statementBalanceCents)}</p>
              </div>
              <span className="text-[#6B7280]">−</span>
              <div>
                <p className="font-bold uppercase tracking-wide text-[#4B5563]">Cleared</p>
                <p className="mt-0.5 font-semibold tabular-nums text-[#0F1219]">{money(summary.clearedBalanceCents)}</p>
              </div>
              <span className="text-[#6B7280]">=</span>
              <div>
                <p className="font-bold uppercase tracking-wide text-[#4B5563]">Difference</p>
                <p
                  className={`mt-0.5 font-semibold tabular-nums ${
                    summary.varianceCents === 0 ? "text-[#16A34A]" : "text-red-700"
                  }`}
                  data-testid="recon-difference"
                >
                  {money(summary.varianceCents)}
                </p>
              </div>
            </div>
          </div>
          {summary.varianceCents !== 0 ? (
            <p className="mt-2 text-xs text-red-700">
              Selected transactions do not match the statement yet. Finish stays disabled until Difference is $0.00
              (Owner force-complete only with a written reason).
            </p>
          ) : (
            <p className="mt-2 text-xs text-[#16A34A]">Difference is $0.00 — Finish is enabled.</p>
          )}
        </div>
      ) : balanceHeader ? (
        <div
          className="grid grid-cols-1 gap-3 rounded-sm border border-gray-200 bg-white px-4 py-3 sm:grid-cols-3"
          data-testid="recon-balance-header"
        >
          <div>
            <div className="text-[11px] uppercase tracking-wide text-gray-500">Beginning balance</div>
            <div className="text-xs font-semibold text-gray-900">{money(balanceHeader.beginningCents)}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-gray-500">Ending balance</div>
            <div className="text-xs font-semibold text-gray-900">
              {balanceHeader.endingCents != null ? money(balanceHeader.endingCents) : "—"}
            </div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-gray-500">Last reconciled</div>
            <div className="text-xs font-semibold text-gray-900">
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
              <div class="meta">${esc(bankAccountLabel)} · ${esc(
                session?.period_start ? formatDateUS(session.period_start) : "—",
              )} → ${esc(session?.period_end ? formatDateUS(session.period_end) : "—")} · ${esc(
                orientation,
              )} · printed ${esc(new Date().toLocaleString())}</div>
              <table className="tabular-nums">
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
              <table className="tabular-nums">
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
          <p className="mb-2 text-xs font-semibold text-gray-900">Start reconciliation</p>
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
          <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
            <SelectCombobox
              value={effectiveBankAccountId}
              onChange={(event) => setPickedBankAccountId(event.target.value)}
              className="text-xs"
              data-testid="banking-recon-workspace-account"
            >
              <option value="">Select bank account</option>
              {reconAccountOptions.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.label}
                </option>
              ))}
            </SelectCombobox>
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
              className="text-xs"
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
              <p className="text-xs font-semibold text-gray-900">Statement lines</p>
              <div className="flex flex-wrap items-center gap-2">
                <div
                  className="inline-flex overflow-hidden rounded-sm border border-gray-300 text-xs"
                  data-testid="recon-direction-tabs"
                  data-b2-reconcile-tabs="1"
                >
                  {(
                    [
                      ["payments", "Payments"],
                      ["deposits", "Deposits"],
                      ["all", "All"],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      className={`px-2 py-1 ${directionTab === id ? "bg-[#14314F] text-white" : "text-gray-700"} ${
                        id !== "payments" ? "border-l border-gray-300" : ""
                      }`}
                      onClick={() => setDirectionTab(id)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="inline-flex overflow-hidden rounded-sm border border-gray-300 text-xs">
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
                  <option value="all">All match states</option>
                  <option value="matched">Matched</option>
                  <option value="unmatched">Unmatched</option>
                </SelectCombobox>
              </div>
            </div>
            <div className="mb-1 grid grid-cols-[4.5rem_4.5rem_1fr_4.5rem_4.5rem_1.75rem] gap-1 border-b border-gray-200 px-2 pb-1 text-xs font-bold uppercase tracking-wide text-[#4B5563]">
              <span>Date</span>
              <span>Cleared</span>
              <span>Payee / memo</span>
              <span className="text-right">Payment</span>
              <span className="text-right">Deposit</span>
              <span className="text-center">●</span>
            </div>
            <div className="max-h-[560px] space-y-1 overflow-auto">
              {visibleTransactions.map((tx) => {
                const matched = transactionIsMatched(tx);
                const cleared = transactionIsCleared(tx, clearedCounts.anyExplicit);
                const abs = Math.abs(Number(tx.amount_cents ?? 0));
                return (
                  <div
                    key={tx.id}
                    className={`w-full px-2 py-2 text-left ${
                      selectedTransactionId === tx.id ? "bg-slate-100" : "bg-white hover:bg-gray-50"
                    } border-b border-gray-100`}
                  >
                    <div className="grid grid-cols-[4.5rem_4.5rem_1fr_4.5rem_4.5rem_1.75rem] items-start gap-1">
                      <button
                        type="button"
                        onClick={() => setSelectedTransactionId(tx.id)}
                        className="text-left text-xs text-gray-600"
                      >
                        {formatDateUS(tx.transaction_date)}
                      </button>
                      <span className="text-xs text-gray-600">
                        {tx.posted_date ? formatDateUS(tx.posted_date) : "—"}
                      </span>
                      <button
                        type="button"
                        onClick={() => setSelectedTransactionId(tx.id)}
                        className="min-w-0 text-left"
                      >
                        <span className="block truncate text-xs font-medium text-gray-900">
                          {tx.merchant_name || tx.description || "Bank transaction"}
                        </span>
                        <span className="block truncate text-xs text-gray-500">
                          {matched ? "Matched" : "Unmatched"}
                          {tx.description && tx.merchant_name ? ` · ${tx.description}` : ""}
                        </span>
                      </button>
                      <span className="text-right text-xs tabular-nums text-gray-800">
                        {!tx.is_credit ? money(abs) : ""}
                      </span>
                      <span className="text-right text-xs tabular-nums text-gray-800">
                        {tx.is_credit ? money(abs) : ""}
                      </span>
                      <button
                        type="button"
                        title={cleared ? "Cleared — click to uncleared" : "Click to clear"}
                        disabled={!sessionId || !companyId || clearingId === tx.id}
                        data-testid={`recon-clear-${tx.id}`}
                        className={`mx-auto mt-0.5 flex h-7 w-7 items-center justify-center rounded-full border text-xs ${
                          cleared
                            ? "border-[#14314F] bg-[#14314F] text-white"
                            : "border-gray-400 bg-white text-transparent"
                        }`}
                        onClick={() => {
                          if (!sessionId || !companyId) return;
                          const next = !cleared;
                          setClearingId(tx.id);
                          void clearReconciliationTransaction(sessionId, companyId, {
                            transaction_id: tx.id,
                            cleared: next,
                          })
                            .then(() => {
                              setLocalTransactions((prev) =>
                                prev.map((row) =>
                                  row.id === tx.id ? { ...row, reconciliation_cleared: next } : row,
                                ),
                              );
                              void workspaceQuery.refetch();
                            })
                            .catch((error) =>
                              pushToast(userFacingApiError(error, "Clear toggle failed"), "error"),
                            )
                            .finally(() => setClearingId(null));
                        }}
                      >
                        ●
                      </button>
                    </div>
                    {matched ? (
                      <div className="mt-1 flex flex-wrap gap-2 text-xs">
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
                            label={visibleDocumentLabel(tx.matched_bill_number ?? null, tx.matched_bill_id, "Bill")}
                          />
                        ) : null}
                        {tx.matched_settlement_id ? (
                          <EntityLink
                            kind="settlement"
                            id={tx.matched_settlement_id}
                            label={entityLabel(tx.matched_settlement_display_id ?? null, tx.matched_settlement_id, "Settlement")}
                          />
                        ) : null}
                        {tx.matched_expense_id ? (
                          <EntityLink
                            kind="expense"
                            id={tx.matched_expense_id}
                            label={visibleDocumentLabel(tx.matched_expense_number ?? null, tx.matched_expense_id, "Expense")}
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
                  </div>
                );
              })}
            </div>
          </div>

          <div className="border-l border-gray-200 bg-white p-3 lg:col-span-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-900">TMS candidate events</p>
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
                  <div className="truncate text-xs font-medium text-gray-900">
                    <EntityLink
                      kind={candidateEntityKind(event.event_type)}
                      id={event.id}
                      label={entityLabel(event.display_label, event.id, event.event_type === "load" ? "Load" : event.event_type === "bill" ? "Bill" : "Settlement")}
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
              <p className="text-xs font-semibold text-gray-900">Variance summary</p>
              <div className="mt-2 space-y-1 text-xs">
                <div className="flex justify-between"><span>Statement</span><span>{money(summary.statementBalanceCents)}</span></div>
                <div className="flex justify-between"><span>Cleared deposits</span><span>{money(summary.depositCents)}</span></div>
                <div className="flex justify-between"><span>Cleared payments</span><span>{money(summary.paymentCents)}</span></div>
                <div className="flex justify-between"><span>Cleared balance</span><span>{money(summary.clearedBalanceCents)}</span></div>
                {serviceChargeCents !== 0 ? (
                  <div className="flex justify-between"><span>Less: service charge</span><span>-{money(serviceChargeCents)}</span></div>
                ) : null}
                {interestEarnedCents !== 0 ? (
                  <div className="flex justify-between"><span>Plus: interest earned</span><span>+{money(interestEarnedCents)}</span></div>
                ) : null}
                <div className={`flex justify-between font-semibold ${varianceClass(summary.varianceCents)}`}>
                  <span>Difference</span><span>{money(summary.varianceCents)}</span>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-2 border-t border-gray-100 pt-2 sm:grid-cols-2">
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Service charge</label>
                  <MoneyInput
                    valueDollars={serviceChargeInput}
                    onChangeDollars={setServiceChargeInput}
                    ariaLabel="Service charge (USD)"
                    placeholder="Service charge (USD)"
                    className="mt-0.5"
                  />
                  <DatePicker
                    value={serviceChargeDate}
                    onChange={setServiceChargeDate}
                    className="mt-1 h-7 w-full"
                  />
                  <div className="mt-1" data-testid="recon-service-charge-account">
                    <ReferenceSelect
                      value={serviceChargeAccountId}
                      onChange={setServiceChargeAccountId}
                      options={coaOptions}
                      createKind="category"
                      operatingCompanyId={companyId}
                      placeholder="Bank fee account"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Interest earned</label>
                  <MoneyInput
                    valueDollars={interestEarnedInput}
                    onChangeDollars={setInterestEarnedInput}
                    ariaLabel="Interest earned (USD)"
                    placeholder="Interest earned (USD)"
                    className="mt-0.5"
                  />
                  <DatePicker
                    value={interestEarnedDate}
                    onChange={setInterestEarnedDate}
                    className="mt-1 h-7 w-full"
                  />
                  <div className="mt-1" data-testid="recon-interest-earned-account">
                    <ReferenceSelect
                      value={interestEarnedAccountId}
                      onChange={setInterestEarnedAccountId}
                      options={coaOptions}
                      createKind="category"
                      operatingCompanyId={companyId}
                      placeholder="Interest income account"
                    />
                  </div>
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
                disabled={
                  !canComplete ||
                  completing ||
                  serviceChargeIncomplete ||
                  interestEarnedIncomplete ||
                  (needsForceComplete && (!isOwner || !forceReason.trim()))
                }
                onClick={() => {
                  if (!sessionId || !companyId) return;
                  setCompleting(true);
                  void completeReconciliationSession(sessionId, companyId, {
                    force_complete: needsForceComplete,
                    reason: needsForceComplete ? forceReason.trim() : undefined,
                    service_charge_cents: serviceChargeCents,
                    service_charge_date: serviceChargeCents ? serviceChargeDate || null : null,
                    service_charge_account_id: serviceChargeCents ? serviceChargeAccountId : null,
                    interest_earned_cents: interestEarnedCents,
                    interest_earned_date: interestEarnedCents ? interestEarnedDate || null : null,
                    interest_earned_account_id: interestEarnedCents ? interestEarnedAccountId : null,
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
