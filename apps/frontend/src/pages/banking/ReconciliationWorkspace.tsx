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
  type ReconciliationGlLine,
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

/** Unified reconcile grid row — bank feed OR JE line on the bank GL (B-2 LEFT). */
type ReconGridRow = {
  id: string;
  row_kind: "bank" | "gl_line";
  transaction_date: string;
  posted_date: string | null;
  amount_cents: number;
  is_credit: boolean;
  description: string | null;
  merchant_name: string | null;
  reconciliation_cleared: boolean;
  /** ORDERS §6 grid: TYPE | REF NO. | ACCOUNT | PAYEE | MEMO */
  type_label: string;
  ref: string | null;
  payee: string | null;
  memo: string | null;
  split_account: string | null;
  journal_entry_id?: string | null;
  posting_id?: string | null;
  // bank-only match fields (optional)
  matched_load_id?: string | null;
  matched_bill_id?: string | null;
  matched_settlement_id?: string | null;
  matched_expense_id?: string | null;
  matched_transfer_id?: string | null;
  matched_journal_entry_id?: string | null;
  matched_load_number?: string | null;
  matched_bill_number?: string | null;
  matched_settlement_display_id?: string | null;
  matched_expense_number?: string | null;
  matched_transfer_label?: string | null;
  matched_journal_entry_memo?: string | null;
};

/** Derive QBO-style TYPE for a bank-feed row from its live match FKs. */
function bankTxTypeLabel(tx: PlaidBankTransaction): string {
  if (tx.check_number) return "Check";
  if (tx.matched_expense_id) return "Expense";
  if (tx.matched_bill_id) return "Bill";
  if (tx.matched_settlement_id) return "Settlement";
  if (tx.matched_transfer_id) return "Transfer";
  if (tx.matched_journal_entry_id) return "Journal";
  if (tx.matched_load_id) return "Load";
  return "Bank";
}

function bankTxRef(tx: PlaidBankTransaction): string | null {
  return (
    tx.check_number ||
    tx.matched_expense_number ||
    tx.matched_bill_number ||
    tx.matched_settlement_display_id ||
    tx.matched_load_number ||
    tx.matched_transfer_label ||
    tx.source_ref ||
    null
  );
}

function bankTxToGridRow(tx: PlaidBankTransaction): ReconGridRow {
  return {
    id: tx.id,
    row_kind: "bank",
    transaction_date: tx.transaction_date,
    posted_date: tx.posted_date ?? null,
    amount_cents: Number(tx.amount_cents ?? 0),
    is_credit: Boolean(tx.is_credit),
    description: tx.description ?? null,
    merchant_name: tx.merchant_name ?? null,
    reconciliation_cleared: Boolean(tx.reconciliation_cleared),
    type_label: bankTxTypeLabel(tx),
    ref: bankTxRef(tx),
    payee: tx.merchant_name ?? null,
    memo: tx.description ?? tx.notes ?? null,
    split_account: tx.category ?? null,
    matched_load_id: tx.matched_load_id,
    matched_bill_id: tx.matched_bill_id,
    matched_settlement_id: tx.matched_settlement_id,
    matched_expense_id: tx.matched_expense_id,
    matched_transfer_id: tx.matched_transfer_id,
    matched_journal_entry_id: tx.matched_journal_entry_id,
    matched_load_number: tx.matched_load_number,
    matched_bill_number: tx.matched_bill_number,
    matched_settlement_display_id: tx.matched_settlement_display_id,
    matched_expense_number: tx.matched_expense_number,
    matched_transfer_label: tx.matched_transfer_label,
    matched_journal_entry_memo: tx.matched_journal_entry_memo,
  };
}

function glLineToGridRow(line: ReconciliationGlLine): ReconGridRow {
  return {
    id: `gl:${line.posting_id}`,
    row_kind: "gl_line",
    transaction_date: line.entry_date,
    posted_date: null,
    amount_cents: line.amount_cents,
    is_credit: line.is_credit,
    description: line.memo ?? line.description,
    merchant_name: line.payee ?? line.type_label,
    reconciliation_cleared: line.register_cleared,
    type_label: line.type_label || "Journal",
    ref: line.ref,
    payee: line.payee,
    memo: line.memo ?? line.description,
    split_account: line.split_account,
    journal_entry_id: line.journal_entry_id,
    posting_id: line.posting_id,
    matched_journal_entry_id: line.journal_entry_id,
    matched_journal_entry_memo: line.memo,
  };
}

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

function transactionIsMatched(tx: ReconGridRow) {
  if (tx.row_kind === "gl_line") return true; // JE line is already a book row
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
function transactionIsCleared(tx: ReconGridRow, anyExplicitCleared: boolean) {
  if (tx.row_kind === "gl_line") return Boolean(tx.reconciliation_cleared);
  if (anyExplicitCleared) return Boolean(tx.reconciliation_cleared);
  return Boolean(tx.reconciliation_cleared) || transactionIsMatched(tx);
}

function countCleared(transactions: ReconGridRow[]) {
  // Only bank-feed explicit clears flip the match-fallback gate — a JE register_cleared
  // must not make matched-but-uncleared bank rows look uncleared (same as foldGlLinesIntoSummary).
  const anyExplicit = transactions.some((t) => t.row_kind === "bank" && Boolean(t.reconciliation_cleared));
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
  /** B-2 ORDERS §6 — Filter popover (Find / Cleared / Type / Payee / Date / amount). Draft → Apply. */
  const [filterOpen, setFilterOpen] = useState(false);
  const [draftFind, setDraftFind] = useState("");
  const [draftPayee, setDraftPayee] = useState("");
  const [draftCleared, setDraftCleared] = useState<"all" | "cleared" | "uncleared">("all");
  const [draftTxnType, setDraftTxnType] = useState<"all" | "bank" | "journal">("all");
  const [draftDateFrom, setDraftDateFrom] = useState("");
  const [draftDateTo, setDraftDateTo] = useState("");
  const [draftAmtMode, setDraftAmtMode] = useState<"any" | "eq" | "gt" | "lt">("any");
  const [draftAmtDollars, setDraftAmtDollars] = useState<number | null>(null);
  const [appliedFind, setAppliedFind] = useState("");
  const [appliedPayee, setAppliedPayee] = useState("");
  const [appliedCleared, setAppliedCleared] = useState<"all" | "cleared" | "uncleared">("all");
  const [appliedTxnType, setAppliedTxnType] = useState<"all" | "bank" | "journal">("all");
  const [appliedDateFrom, setAppliedDateFrom] = useState("");
  const [appliedDateTo, setAppliedDateTo] = useState("");
  const [appliedAmtMode, setAppliedAmtMode] = useState<"any" | "eq" | "gt" | "lt">("any");
  const [appliedAmtDollars, setAppliedAmtDollars] = useState<number | null>(null);
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
  const [localTransactions, setLocalTransactions] = useState<ReconGridRow[]>([]);
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
    const glLines = workspaceQuery.data?.gl_lines ?? [];
    setLocalTransactions([
      ...matched.map(bankTxToGridRow),
      ...unmatched.map(bankTxToGridRow),
      ...glLines.map(glLineToGridRow),
    ]);
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

    const findQ = appliedFind.trim().toLowerCase();
    const payeeQ = appliedPayee.trim().toLowerCase();
    const amtCents =
      appliedAmtMode !== "any" && appliedAmtDollars != null && Number.isFinite(appliedAmtDollars)
        ? Math.round(Number(appliedAmtDollars) * 100)
        : null;
    const anyExplicit = localTransactions.some((t) => Boolean(t.reconciliation_cleared));

    filtered = filtered.filter((tx) => {
      if (appliedTxnType === "bank" && tx.row_kind !== "bank") return false;
      if (appliedTxnType === "journal" && tx.row_kind !== "gl_line") return false;
      if (appliedCleared === "cleared" && !transactionIsCleared(tx, anyExplicit)) return false;
      if (appliedCleared === "uncleared" && transactionIsCleared(tx, anyExplicit)) return false;
      if (appliedDateFrom && String(tx.transaction_date ?? "") < appliedDateFrom) return false;
      if (appliedDateTo && String(tx.transaction_date ?? "") > appliedDateTo) return false;
      if (payeeQ) {
        const payee = `${tx.payee ?? ""} ${tx.merchant_name ?? ""} ${tx.description ?? ""}`.toLowerCase();
        if (!payee.includes(payeeQ)) return false;
      }
      if (findQ) {
        const hay =
          `${tx.payee ?? ""} ${tx.memo ?? ""} ${tx.merchant_name ?? ""} ${tx.description ?? ""} ${tx.type_label ?? ""} ${tx.ref ?? ""} ${tx.split_account ?? ""}`.toLowerCase();
        if (!hay.includes(findQ)) return false;
      }
      if (amtCents != null && Number.isFinite(amtCents)) {
        const abs = Math.abs(Number(tx.amount_cents ?? 0));
        if (appliedAmtMode === "eq" && abs !== amtCents) return false;
        if (appliedAmtMode === "gt" && !(abs > amtCents)) return false;
        if (appliedAmtMode === "lt" && !(abs < amtCents)) return false;
      }
      return true;
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
  }, [
    directionTab,
    filterMode,
    localTransactions,
    txnSort,
    appliedFind,
    appliedPayee,
    appliedCleared,
    appliedTxnType,
    appliedDateFrom,
    appliedDateTo,
    appliedAmtMode,
    appliedAmtDollars,
  ]);

  const applyReconFilters = () => {
    setAppliedFind(draftFind);
    setAppliedPayee(draftPayee);
    setAppliedCleared(draftCleared);
    setAppliedTxnType(draftTxnType);
    setAppliedDateFrom(draftDateFrom);
    setAppliedDateTo(draftDateTo);
    setAppliedAmtMode(draftAmtMode);
    setAppliedAmtDollars(draftAmtDollars);
    setFilterOpen(false);
  };

  const resetReconFilters = () => {
    setDraftFind("");
    setDraftPayee("");
    setDraftCleared("all");
    setDraftTxnType("all");
    setDraftDateFrom("");
    setDraftDateTo("");
    setDraftAmtMode("any");
    setDraftAmtDollars(null);
    setAppliedFind("");
    setAppliedPayee("");
    setAppliedCleared("all");
    setAppliedTxnType("all");
    setAppliedDateFrom("");
    setAppliedDateTo("");
    setAppliedAmtMode("any");
    setAppliedAmtDollars(null);
  };

  const reconFilterActiveCount = useMemo(() => {
    let n = 0;
    if (appliedFind.trim()) n += 1;
    if (appliedPayee.trim()) n += 1;
    if (appliedCleared !== "all") n += 1;
    if (appliedTxnType !== "all") n += 1;
    if (appliedDateFrom || appliedDateTo) n += 1;
    if (appliedAmtMode !== "any" && appliedAmtDollars != null) n += 1;
    return n;
  }, [appliedFind, appliedPayee, appliedCleared, appliedTxnType, appliedDateFrom, appliedDateTo, appliedAmtMode, appliedAmtDollars]);

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
  /** ORDERS §6 — completed session reopen is a read-only report (beginning / cleared / ending / uncleared). */
  const isReportMode = session?.status === "reconciled";
  const unclearedReportRows = useMemo(() => {
    if (!isReportMode) return [] as ReconGridRow[];
    const anyExplicit = localTransactions.some((t) => Boolean(t.reconciliation_cleared));
    return localTransactions.filter((tx) => !transactionIsCleared(tx, anyExplicit));
  }, [isReportMode, localTransactions]);
  const canOpenAutoMatchSuggestions = Boolean(
    sessionId &&
      companyId &&
      session?.bank_account_id &&
      session?.period_start &&
      session?.period_end &&
      !isReportMode
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
        title={isReportMode ? "Reconciliation report" : "Reconciliation Workspace"}
        subtitle={
          effectiveBankAccountId
            ? `${bankAccountLabel}${isReportMode && session?.reconciled_at ? ` · Reconciled ${formatReconciledDate(session.reconciled_at)}` : ""}`
            : ""
        }
        actions={
          <div className="flex items-center gap-2">
            {sessionId && !isReportMode ? (
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
            {!isReportMode ? (
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
            ) : null}
          </div>
        }
      />

      {sessionId && workspaceQuery.data && isReportMode ? (
        <div
          className="rounded-sm border border-[#E5E7EB] bg-white px-4 py-3"
          data-testid="recon-completed-report"
          data-b2-recon-report="1"
        >
          <p className="text-section-header font-bold uppercase tracking-wide text-[#4B5563]">
            Reconciliation report
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <div className="text-center">
              <p className="font-bold uppercase tracking-wide text-[#4B5563]">Beginning</p>
              <p className="mt-0.5 font-semibold tabular-nums text-[#0F1219]">{money(summary.beginningCents)}</p>
            </div>
            <div className="text-center">
              <p className="font-bold uppercase tracking-wide text-[#4B5563]">Cleared payments</p>
              <p className="mt-0.5 font-semibold tabular-nums text-[#0F1219]">
                {summary.paymentCount} · {money(summary.paymentCents)}
              </p>
            </div>
            <div className="text-center">
              <p className="font-bold uppercase tracking-wide text-[#4B5563]">Cleared deposits</p>
              <p className="mt-0.5 font-semibold tabular-nums text-[#0F1219]">
                {summary.depositCount} · {money(summary.depositCents)}
              </p>
            </div>
            <div className="text-center">
              <p className="font-bold uppercase tracking-wide text-[#4B5563]">Ending</p>
              <p className="mt-0.5 font-semibold tabular-nums text-[#0F1219]">{money(summary.statementBalanceCents)}</p>
            </div>
          </div>
          <p className="mt-2 text-center text-xs text-[#6B7280]">
            Uncleared as of {session?.period_end ? formatDateUS(session.period_end) : "—"}:{" "}
            <span className="font-semibold tabular-nums text-[#0F1219]">{unclearedReportRows.length}</span>
          </p>
          {unclearedReportRows.length > 0 ? (
            <ul className="mt-2 max-h-40 space-y-1 overflow-auto border-t border-gray-100 pt-2" data-testid="recon-report-uncleared">
              {unclearedReportRows.map((tx) => {
                const abs = Math.abs(Number(tx.amount_cents ?? 0));
                return (
                  <li key={tx.id} className="flex justify-between gap-2 text-xs text-gray-700">
                    <span className="min-w-0 truncate">
                      {formatDateUS(tx.transaction_date)} · {tx.type_label} · {tx.payee || tx.merchant_name || "—"}
                    </span>
                    <span className="shrink-0 tabular-nums">{money(abs)}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-[#16A34A]">No uncleared items as of statement date.</p>
          )}
        </div>
      ) : null}
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
              const abs = Math.abs(Number(tx.amount_cents ?? 0));
              return `<tr>
                <td>${esc(tx.transaction_date ? formatDateUS(tx.transaction_date) : "—")}</td>
                <td>${esc(tx.posted_date ? formatDateUS(tx.posted_date) : "—")}</td>
                <td>${esc(tx.type_label || "—")}</td>
                <td>${esc(tx.ref || "—")}</td>
                <td>${esc(tx.split_account || "—")}</td>
                <td>${esc(tx.payee || tx.merchant_name || "—")}</td>
                <td>${esc(tx.memo || tx.description || "—")}</td>
                <td style="text-align:right">${esc(!tx.is_credit ? money(abs) : "")}</td>
                <td style="text-align:right">${esc(tx.is_credit ? money(abs) : "")}</td>
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
                    <th>Date</th><th>Cleared date</th><th>Type</th><th>Ref no.</th>
                    <th>Account</th><th>Payee</th><th>Memo</th>
                    <th style="text-align:right">Payment</th>
                    <th style="text-align:right">Deposit</th>
                  </tr>
                </thead>
                <tbody>
                  ${rowsHtml || `<tr><td colspan="9">No rows</td></tr>`}
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
                <div className="relative" data-b2-recon-filter="1">
                  <button
                    type="button"
                    className="h-7 rounded-sm border border-gray-300 bg-white px-2 text-xs text-[#1F2A44] hover:bg-[#F7F8FA]"
                    data-testid="recon-filter-open"
                    onClick={() => setFilterOpen((o) => !o)}
                  >
                    Filter{reconFilterActiveCount ? ` (${reconFilterActiveCount})` : ""}
                  </button>
                  {filterOpen ? (
                    <div
                      className="absolute right-0 top-8 z-30 w-80 rounded-sm border border-[#E5E7EB] bg-white p-3 shadow-lg"
                      data-testid="recon-filter-popover"
                      data-b2-recon-filter-popover="1"
                    >
                      <label className="mb-2 flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-[#4B5563]">
                        Find (memo, ref, payee)
                        <input
                          value={draftFind}
                          onChange={(e) => setDraftFind(e.target.value)}
                          className="h-7 rounded-sm border border-gray-300 px-2 font-normal normal-case tracking-normal text-[#0F1219]"
                          placeholder="memo, description, ref…"
                          data-testid="recon-filter-find"
                        />
                      </label>
                      <label className="mb-2 flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-[#4B5563]">
                        Payee
                        <input
                          value={draftPayee}
                          onChange={(e) => setDraftPayee(e.target.value)}
                          className="h-7 rounded-sm border border-gray-300 px-2 font-normal normal-case tracking-normal text-[#0F1219]"
                          placeholder="merchant / payee"
                          data-testid="recon-filter-payee"
                        />
                      </label>
                      <label className="mb-2 flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-[#4B5563]">
                        Cleared status
                        <SelectCombobox
                          value={draftCleared}
                          onChange={(e) => setDraftCleared(e.target.value as "all" | "cleared" | "uncleared")}
                          className="h-7 rounded-sm border border-gray-300 px-2 font-normal normal-case tracking-normal text-[#0F1219]"
                          data-testid="recon-filter-cleared"
                        >
                          <option value="all">All</option>
                          <option value="cleared">Cleared</option>
                          <option value="uncleared">Uncleared</option>
                        </SelectCombobox>
                      </label>
                      <label className="mb-2 flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-[#4B5563]">
                        Transaction type
                        <SelectCombobox
                          value={draftTxnType}
                          onChange={(e) => setDraftTxnType(e.target.value as "all" | "bank" | "journal")}
                          className="h-7 rounded-sm border border-gray-300 px-2 font-normal normal-case tracking-normal text-[#0F1219]"
                          data-testid="recon-filter-type"
                        >
                          <option value="all">All</option>
                          <option value="bank">Bank feed</option>
                          <option value="journal">Journal line</option>
                        </SelectCombobox>
                      </label>
                      <div className="mb-2 grid grid-cols-2 gap-2">
                        <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-[#4B5563]">
                          Date from
                          <DatePicker value={draftDateFrom} onChange={setDraftDateFrom} />
                        </label>
                        <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-[#4B5563]">
                          Date to
                          <DatePicker value={draftDateTo} onChange={setDraftDateTo} />
                        </label>
                      </div>
                      <div className="mb-3 grid grid-cols-[7rem_1fr] gap-2">
                        <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-[#4B5563]">
                          Amount
                          <SelectCombobox
                            value={draftAmtMode}
                            onChange={(e) => setDraftAmtMode(e.target.value as "any" | "eq" | "gt" | "lt")}
                            className="h-7 rounded-sm border border-gray-300 px-2 font-normal normal-case tracking-normal text-[#0F1219]"
                            data-testid="recon-filter-amt-mode"
                          >
                            <option value="any">Any</option>
                            <option value="eq">= $amt</option>
                            <option value="gt">&gt; $amt</option>
                            <option value="lt">&lt; $amt</option>
                          </SelectCombobox>
                        </label>
                        <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-[#4B5563]">
                          $
                          <MoneyInput
                            valueDollars={draftAmtDollars}
                            onChangeDollars={setDraftAmtDollars}
                            disabled={draftAmtMode === "any"}
                            className="h-7"
                            placeholder="0.00"
                            ariaLabel="Filter amount dollars"
                          />
                          <span className="sr-only" data-testid="recon-filter-amt">
                            amount filter
                          </span>
                        </label>
                      </div>
                      <div className="flex justify-between gap-2">
                        <button
                          type="button"
                          className="text-xs font-medium text-gray-500 underline"
                          data-testid="recon-filter-reset"
                          onClick={() => {
                            resetReconFilters();
                            setFilterOpen(false);
                          }}
                        >
                          Reset
                        </button>
                        <button
                          type="button"
                          className="h-7 rounded-sm border border-[#14314F] bg-[#14314F] px-3 text-xs text-white"
                          data-testid="recon-filter-apply"
                          onClick={applyReconFilters}
                        >
                          Apply
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
            <div
              data-b2-recon-grid="1"
              className="mb-1 grid grid-cols-[4.25rem_4.25rem_3.25rem_3.5rem_4.5rem_minmax(4.5rem,1fr)_minmax(4.5rem,1fr)_4.25rem_4.25rem_1.75rem] gap-1 border-b border-gray-200 px-2 pb-1 text-section-header font-bold uppercase tracking-wide text-[#4B5563]"
            >
              <span className="text-center">Date</span>
              <span className="text-center">Cleared date</span>
              <span className="text-center">Type</span>
              <span className="text-center">Ref no.</span>
              <span className="text-center">Account</span>
              <span className="text-center">Payee</span>
              <span className="text-center">Memo</span>
              <span className="text-center">Payment</span>
              <span className="text-center">Deposit</span>
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
                    <div className="grid grid-cols-[4.25rem_4.25rem_3.25rem_3.5rem_4.5rem_minmax(4.5rem,1fr)_minmax(4.5rem,1fr)_4.25rem_4.25rem_1.75rem] items-start gap-1">
                      <button
                        type="button"
                        onClick={() => setSelectedTransactionId(tx.id)}
                        className="text-center text-xs text-gray-600"
                      >
                        {formatDateUS(tx.transaction_date)}
                      </button>
                      <span className="text-center text-xs text-gray-600">
                        {tx.posted_date ? formatDateUS(tx.posted_date) : "—"}
                      </span>
                      <button
                        type="button"
                        onClick={() => setSelectedTransactionId(tx.id)}
                        className="truncate text-center text-xs text-gray-800"
                        title={tx.type_label}
                      >
                        {tx.type_label}
                      </button>
                      <span className="truncate text-center text-xs tabular-nums text-gray-800" title={tx.ref ?? undefined}>
                        {tx.ref || "—"}
                      </span>
                      <span
                        className="truncate text-center text-xs text-gray-800"
                        title={tx.split_account ?? undefined}
                      >
                        {tx.split_account || "—"}
                      </span>
                      <button
                        type="button"
                        onClick={() => setSelectedTransactionId(tx.id)}
                        className="min-w-0 truncate text-center text-xs font-medium text-gray-900"
                        title={tx.payee || tx.merchant_name || undefined}
                      >
                        {tx.payee || tx.merchant_name || "—"}
                      </button>
                      <span
                        className="min-w-0 truncate text-center text-xs text-gray-600"
                        title={tx.memo || tx.description || undefined}
                      >
                        {tx.memo || tx.description || "—"}
                      </span>
                      <span className="text-center text-xs tabular-nums text-gray-800">
                        {!tx.is_credit ? money(abs) : ""}
                      </span>
                      <span className="text-center text-xs tabular-nums text-gray-800">
                        {tx.is_credit ? money(abs) : ""}
                      </span>
                      <button
                        type="button"
                        title={cleared ? "Cleared — click to uncleared" : "Click to clear"}
                        disabled={!sessionId || !companyId || clearingId === tx.id || isReportMode}
                        data-testid={`recon-clear-${tx.id}`}
                        className={`mx-auto mt-0.5 flex h-7 w-7 items-center justify-center rounded-full border text-xs ${
                          cleared
                            ? "border-[#14314F] bg-[#14314F] text-white"
                            : "border-gray-400 bg-white text-transparent"
                        } ${isReportMode ? "cursor-default opacity-80" : ""}`}
                        onClick={() => {
                          if (isReportMode || !sessionId || !companyId) return;
                          const next = !cleared;
                          setClearingId(tx.id);
                          const payload =
                            tx.row_kind === "gl_line" && tx.posting_id
                              ? { posting_id: tx.posting_id, cleared: next }
                              : { transaction_id: tx.id, cleared: next };
                          void clearReconciliationTransaction(sessionId, companyId, payload)
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
                        {tx.row_kind === "gl_line" && tx.journal_entry_id ? (
                          <EntityLink
                            kind="journal_entry"
                            id={tx.journal_entry_id}
                            label={entityLabel(tx.matched_journal_entry_memo, tx.journal_entry_id, "Journal entry")}
                          />
                        ) : null}
                        {tx.row_kind === "bank" && tx.matched_load_id ? (
                          <EntityLink
                            kind="load"
                            id={tx.matched_load_id}
                            label={entityLabel(tx.matched_load_number ?? null, tx.matched_load_id, "Load")}
                          />
                        ) : null}
                        {tx.row_kind === "bank" && tx.matched_bill_id ? (
                          <EntityLink
                            kind="bill"
                            id={tx.matched_bill_id}
                            label={visibleDocumentLabel(tx.matched_bill_number ?? null, tx.matched_bill_id, "Bill")}
                          />
                        ) : null}
                        {tx.row_kind === "bank" && tx.matched_settlement_id ? (
                          <EntityLink
                            kind="settlement"
                            id={tx.matched_settlement_id}
                            label={entityLabel(tx.matched_settlement_display_id ?? null, tx.matched_settlement_id, "Settlement")}
                          />
                        ) : null}
                        {tx.row_kind === "bank" && tx.matched_expense_id ? (
                          <EntityLink
                            kind="expense"
                            id={tx.matched_expense_id}
                            label={visibleDocumentLabel(tx.matched_expense_number ?? null, tx.matched_expense_id, "Expense")}
                          />
                        ) : null}
                        {tx.row_kind === "bank" && tx.matched_transfer_id ? (
                          <EntityLink kind="transfer" id={tx.matched_transfer_id} label={entityLabel(tx.matched_transfer_label, tx.matched_transfer_id, "Transfer")} />
                        ) : null}
                        {tx.row_kind === "bank" && tx.matched_journal_entry_id ? (
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
                disabled={!selectedTransaction || selectedTransaction.row_kind !== "bank" || !selectedCandidateId}
                onClick={() => {
                  if (!selectedTransaction || selectedTransaction.row_kind !== "bank" || !selectedCandidateId || !sessionId || !companyId) return;
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
                disabled={!selectedTransaction || selectedTransaction.row_kind !== "bank"}
                onClick={() => {
                  if (!selectedTransaction || selectedTransaction.row_kind !== "bank" || !sessionId || !companyId) return;
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
                  isReportMode ||
                  !canComplete ||
                  completing ||
                  serviceChargeIncomplete ||
                  interestEarnedIncomplete ||
                  (needsForceComplete && (!isOwner || !forceReason.trim()))
                }
                onClick={() => {
                  if (isReportMode || !sessionId || !companyId) return;
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
                {completing ? "Saving..." : isReportMode ? "Already reconciled" : "Mark Reconciled"}
              </ActionButton>
              {isReportMode ? (
                <p className="mt-1 text-xs text-[#6B7280]" data-testid="recon-report-readonly-note">
                  This session is closed. Clear toggles and Finish are locked — print or return to Banking.
                </p>
              ) : null}
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
