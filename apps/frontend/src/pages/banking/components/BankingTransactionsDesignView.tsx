import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronRight, Download, MessageSquare, Paperclip, Printer, Settings } from "lucide-react";
import {
  categorizeBankTransaction,
  getBankingSuggestions,
  getCoaAccounts,
  getMatchCandidates,
  getPlaidCompanyTransactions,
  skipBankTransactionInvestigation,
  uploadBankStatementCsv,
  type BankMatchCandidate,
  type BankMatchCandidateKind,
  type PlaidBankAccount,
  type PlaidBankTransaction,
} from "../../../api/banking";
import { BulkActionBar } from "../../../components/bulk/BulkActionBar";
import { TableSelectionHeader } from "../../../components/bulk/TableSelection";
import { ActionButton } from "../../../components/shared/ActionButton";
import { Button } from "../../../components/Button";
import { useBulkSelection } from "../../../hooks/useBulkSelection";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";
import { useToast } from "../../../components/Toast";
import { formatUsdCents } from "../../../lib/money";
import { DriverAutocomplete } from "../../../components/factoring/DriverAutocomplete";
import { UnitAutocomplete } from "../../../components/banking/UnitAutocomplete";
import { TrailerAutocomplete } from "../../../components/banking/TrailerAutocomplete";
import { LoadAutocomplete } from "../../../components/banking/LoadAutocomplete";
import { listVendors, listCustomers } from "../../../api/mdata";
import { itemsCatalogClient, type AccountingCatalogRow } from "../../../api/catalogs-accounting";
import { BankTransactionSplitModal } from "./BankTransactionSplitModal";
import { MatchDrawer } from "./MatchDrawer";
import { RecordTransferModal } from "../RecordTransferModal";
import { RecordCCPaymentModal } from "../RecordCCPaymentModal";

// BLOCK-6b — recoverable-expense bucket types a bank-categorized driver expense can charge (a fine/toll
// the company paid on the driver's behalf → recovered from settlement). Mirrors the backend allow-list.
const RECOVER_DEDUCTION_TYPES = ["fine", "toll", "citation", "damage", "equipment", "fuel", "other"] as const;

type Props = {
  companyId: string;
  accounts: PlaidBankAccount[];
  selectedAccountId: string | null;
  onSelectAccount: (accountId: string) => void;
  onManageConnections: () => void;
  onDataChanged: () => void;
  // Optional initial value for the Transaction type filter (e.g. "uncategorized") so a caller — the
  // Banking Home "Uncategorized" KPI tile — can land on this tab pre-filtered instead of losing the
  // filter on tab switch. Defaults to "all" (unfiltered), matching prior behavior.
  initialTransactionType?: string;
};

type RowDetailDraft = {
  mode: "match" | "categorize";
  transactionType: string;
  fromTo: string;
  accountId: string;
  className: string;
  location: string;
  // Catalog-linkage: the free-text label is kept for the table cell + export; the *_id is the real catalog
  // FK the transaction links to (forward + reverse). Payee→vendor, Customer/project→customer, Product/
  // Service (Item)→catalogs.items — DISTINCT from the Account (Category → Chart of Accounts).
  productService: string;
  itemId: string;
  customerProject: string;
  customerId: string;
  payee: string;
  vendorId: string;
  checkNo: string;
  billable: boolean;
  tags: string;
  memo: string;
  // BLOCK-6b dimensions + driver auto-deduction.
  driverId: string;
  driverName: string;
  unitId: string;
  unitName: string;
  // BANK-SPLIT-1 (Part 1 linkage): Trailer is the 4th dimension alongside Driver/Unit/Trip — trailers are
  // mdata.equipment, NEVER mdata.loads.trailer_id (no such column exists).
  trailerId: string;
  trailerName: string;
  loadId: string;
  loadName: string;
  recoverFromDriver: boolean;
  recoverDeductionType: string;
};

const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const COMPANY_TRANSACTIONS_PAGE_SIZE = 500;

// Match candidates panel — real ranked-match engine (GET .../match-candidates), same rendering idiom as
// the orphaned MatchDrawer.tsx (kind badge, amount, date gap, score). DISPLAY ONLY here: the accept/
// confirm-match action is financial (reconcile-commit) and ships in a separate HELD PR.
const MATCH_CANDIDATE_KIND_LABELS: Record<BankMatchCandidateKind, string> = {
  payment: "Payment",
  bill_payment: "Bill Payment",
  transfer: "Transfer",
  je: "Journal Entry",
  bill: "Bill",
  expense: "Expense",
};

type ReviewTabId = "for_review" | "categorized" | "excluded";
type AmountFilter = "all" | "spent" | "received";
type CategorizeBy = "category" | "item";

type ViewSettings = {
  showCheckNo: boolean;
  showPayee: boolean;
  showClass: boolean;
  showLocation: boolean;
  turnOffGrouping: boolean;
  addNewVendors: boolean;
  showAmountsInOneColumn: boolean;
  showTagsField: boolean;
  editableDateField: boolean;
  showBankDetails: boolean;
  copyBankDetailToMemo: boolean;
  enableSuggestedCategorization: boolean;
  pageSize: 50 | 75 | 100 | 200 | 300;
};

export const BANKING_REVIEW_TABS = [
  { id: "for_review", label: "For review" },
  { id: "categorized", label: "Categorized" },
  { id: "excluded", label: "Excluded" },
] as const;

export const TRANSACTION_TYPE_FILTER_OPTIONS = [
  { id: "all", label: "All transaction types" },
  { id: "money_in", label: "Money in" },
  { id: "money_out", label: "Money out" },
  { id: "ready_to_post", label: "Ready to post" },
  { id: "suggested_matches", label: "Suggested matches" },
  { id: "transfers", label: "Transfers" },
  { id: "rules", label: "Rules" },
  { id: "missing_from_to", label: "Missing From/To" },
  { id: "uncategorized", label: "Uncategorized" },
  { id: "requests_waiting_reply", label: "Requests: Waiting For Reply" },
  { id: "requests_reply_received", label: "Requests: Reply Received" },
  { id: "requests_completed", label: "Requests: Completed" },
] as const;

export const VIEW_SETTINGS_LOCK_LABELS = [
  { label: "Columns: Check No." },
  { label: "Columns: Payee" },
  { label: "Columns: Class" },
  { label: "Columns: Location" },
  { label: "Groups: Turn off grouping" },
  { label: "Automation review: Add new vendors" },
  { label: "Transaction details: Show amounts in 1 column" },
  { label: "Transaction details: Show tags field" },
  { label: "Transaction details: Editable date field" },
  { label: "Transaction details: Show bank details" },
  { label: "Transaction details: Copy bank detail to memo" },
  { label: "Transaction details: Enable suggested categorization" },
  { label: "Page size: 50" },
  { label: "Page size: 75" },
  { label: "Page size: 100" },
  { label: "Page size: 200" },
  { label: "Page size: 300" },
] as const;

export const PRINT_EXPORT_CONTROL_LABELS = [
  { label: "Print" },
  { label: "Export to Excel" },
] as const;

export function formatBankTransactionDate(rawDate: string | null | undefined) {
  if (!rawDate) return "—";
  const dateMatch = rawDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dateMatch) return `${dateMatch[2]}/${dateMatch[3]}/${dateMatch[1]}`;
  const dt = new Date(rawDate);
  if (Number.isNaN(dt.getTime())) return rawDate;
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  const yyyy = String(dt.getUTCFullYear());
  return `${mm}/${dd}/${yyyy}`;
}

export function spentReceived(tx: PlaidBankTransaction) {
  const amount = Math.abs(Number(tx.amount_cents ?? 0));
  if (amount <= 0) return { spent: 0, received: 0 };
  const isMoneyIn = tx.is_credit || Number(tx.amount_cents ?? 0) < 0;
  if (isMoneyIn) return { spent: 0, received: amount };
  return { spent: amount, received: 0 };
}

function transactionLabel(tx: PlaidBankTransaction) {
  return tx.description || tx.merchant_name || "—";
}

function monthKeyFromDate(rawDate: string) {
  const dt = new Date(rawDate);
  if (Number.isNaN(dt.getTime())) return "Unknown";
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthTitleFromKey(monthKey: string) {
  const [yearRaw, monthRaw] = monthKey.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return "Unknown";
  const dt = new Date(Date.UTC(year, month - 1, 1));
  return dt.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

function toExcelValue(value: string) {
  return value.includes(",") || value.includes('"') || value.includes("\n") ? `"${value.replace(/"/g, '""')}"` : value;
}

export function BankingTransactionsDesignView({
  companyId,
  accounts,
  selectedAccountId,
  onSelectAccount,
  onManageConnections,
  onDataChanged,
  initialTransactionType,
}: Props) {
  const { pushToast } = useToast();
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const [activeReviewTab, setActiveReviewTab] = useState<ReviewTabId>("for_review");
  const [descriptionFilter, setDescriptionFilter] = useState("");
  const [amountFilter, setAmountFilter] = useState<AmountFilter>("all");
  const [selectedTransactionType, setSelectedTransactionType] = useState(initialTransactionType ?? "all");
  const [categorizeBy, setCategorizeBy] = useState<CategorizeBy>("category");
  const [showDateFilterMenu, setShowDateFilterMenu] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [collapsedAllGroupings, setCollapsedAllGroupings] = useState(false);
  const [collapsedMonths, setCollapsedMonths] = useState<Record<string, boolean>>({});
  const [viewSettingsOpen, setViewSettingsOpen] = useState(false);
  const [printExportMenuOpen, setPrintExportMenuOpen] = useState(false);
  const [expandedTxId, setExpandedTxId] = useState<string | null>(null);
  const [actionMenuTxId, setActionMenuTxId] = useState<string | null>(null);
  const [linkMenuOpen, setLinkMenuOpen] = useState(false);
  const [postingTxId, setPostingTxId] = useState<string | null>(null);
  const [excludingTxId, setExcludingTxId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, RowDetailDraft>>({});
  const [currentPage, setCurrentPage] = useState(1);
  // BANK-SPLIT-1 — the transaction currently open in the Split-transaction popup (real, persisted; HELD).
  const [splitTx, setSplitTx] = useState<PlaidBankTransaction | null>(null);
  // HELD financial-actions wiring (banking Categorize panel): the transaction whose reconcile Match
  // drawer / Transfer modal / CC Payment modal is currently open. Reuses the EXISTING, already-gated
  // posters (acceptBankReconMatch, createTransfer, recordCcPayment) — no new GL math.
  const [matchDrawerTxId, setMatchDrawerTxId] = useState<string | null>(null);
  const [transferModalTx, setTransferModalTx] = useState<PlaidBankTransaction | null>(null);
  const [ccPaymentModalTx, setCcPaymentModalTx] = useState<PlaidBankTransaction | null>(null);

  const [viewSettings, setViewSettings] = useState<ViewSettings>({
    showCheckNo: false,
    showPayee: false,
    showClass: false,
    showLocation: false,
    turnOffGrouping: false,
    addNewVendors: false,
    showAmountsInOneColumn: false,
    showTagsField: true,
    editableDateField: false,
    showBankDetails: true,
    copyBankDetailToMemo: false,
    enableSuggestedCategorization: true,
    pageSize: 50,
  });

  const selectedAccount = useMemo(() => {
    if (selectedAccountId) {
      const exact = accounts.find((a) => a.id === selectedAccountId);
      if (exact) return exact;
    }
    return accounts[0] ?? null;
  }, [accounts, selectedAccountId]);

  const transactionsQuery = useQuery({
    queryKey: ["banking", "transactions-design", companyId, selectedAccount?.id ?? "", descriptionFilter],
    queryFn: async () => {
      const merged: PlaidBankTransaction[] = [];
      let offset = 0;
      while (true) {
        const page = await getPlaidCompanyTransactions(companyId, {
          limit: COMPANY_TRANSACTIONS_PAGE_SIZE,
          offset,
          bank_account_id: selectedAccount?.id ?? undefined,
          q: descriptionFilter.trim() || undefined,
          sort: "date_desc",
        });
        const rows = page.transactions ?? [];
        merged.push(...rows);
        if (rows.length < COMPANY_TRANSACTIONS_PAGE_SIZE) break;
        offset += COMPANY_TRANSACTIONS_PAGE_SIZE;
      }
      return { transactions: merged };
    },
    enabled: Boolean(companyId),
  });

  // PRIMARY match panel — the real ranked-match engine (match.service.ts findCandidates), NOT the
  // "similar past categorizations" suggestions endpoint below (that one was wrongly bound here before —
  // it answers a different question and always came back empty for a first-time transaction).
  const matchCandidatesQuery = useQuery({
    queryKey: ["banking", "tx-match-candidates", companyId, expandedTxId ?? ""],
    queryFn: () => getMatchCandidates(String(expandedTxId), companyId),
    enabled: Boolean(companyId && expandedTxId),
  });

  // Secondary panel — "similar past categorizations" (kept, additive-only; not the primary match source).
  const suggestionsQuery = useQuery({
    queryKey: ["banking", "tx-suggestions", companyId, expandedTxId ?? ""],
    queryFn: () => getBankingSuggestions(String(expandedTxId), companyId),
    enabled: Boolean(companyId && expandedTxId),
  });

  const coaQuery = useQuery({
    queryKey: ["banking", "tx-coa", companyId],
    queryFn: () => getCoaAccounts(companyId),
    enabled: Boolean(companyId),
    staleTime: 120_000,
  });

  // Catalog-linkage pickers (QBO parity). limit:200 dodges the endpoint 50-caps so the FULL roster is
  // selectable. Payee→vendors, Customer/project→customers, Product/Service (Item)→Products & Services.
  const vendorsQuery = useQuery({
    queryKey: ["banking", "tx-vendors", companyId],
    queryFn: () => listVendors({ operating_company_id: companyId, limit: 200 }).then((r) => r.vendors ?? []),
    enabled: Boolean(companyId),
    staleTime: 120_000,
  });
  const customersQuery = useQuery({
    queryKey: ["banking", "tx-customers", companyId],
    queryFn: () => listCustomers({ operating_company_id: companyId, limit: 200 }).then((r) => r.customers ?? []),
    enabled: Boolean(companyId),
    staleTime: 120_000,
  });
  const itemsQuery = useQuery({
    queryKey: ["banking", "tx-items", companyId],
    queryFn: () =>
      itemsCatalogClient
        .list({ operating_company_id: companyId, is_active: "true", limit: 200, offset: 0 })
        .then((r) => r.rows ?? []),
    enabled: Boolean(companyId),
    staleTime: 120_000,
  });

  const scopedRows = useMemo(() => {
    const rows = transactionsQuery.data?.transactions ?? [];
    if (!selectedAccount?.id) return rows;
    return rows.filter((tx) => !tx.bank_account_id || tx.bank_account_id === selectedAccount.id);
  }, [transactionsQuery.data?.transactions, selectedAccount?.id]);

  const reviewTabBuckets = useMemo(() => {
    const out: Record<ReviewTabId, PlaidBankTransaction[]> = {
      for_review: [],
      categorized: [],
      excluded: [],
    };
    for (const tx of scopedRows) {
      const looksExcluded =
        String(tx.matched_kind ?? "").toLowerCase() === "excluded" ||
        String(tx.notes ?? "").toLowerCase().includes("excluded from banking transactions view");
      const looksCategorized =
        Boolean(tx.matched_load_id || tx.matched_bill_id || tx.matched_settlement_id) ||
        (tx.matched_kind != null && String(tx.matched_kind).toLowerCase() !== "excluded");
      if (looksExcluded) {
        out.excluded.push(tx);
      } else if (looksCategorized) {
        out.categorized.push(tx);
      } else {
        out.for_review.push(tx);
      }
    }
    return out;
  }, [scopedRows]);

  const [sortBy, setSortBy] = useState<{ key: "date" | "description" | "spent" | "received"; dir: "asc" | "desc" }>({ key: "date", dir: "desc" });
  const toggleSort = (key: "date" | "description" | "spent" | "received") =>
    setSortBy((prev) => (prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "date" ? "desc" : "asc" }));
  const sortCaret = (key: "date" | "description" | "spent" | "received") => (sortBy.key === key ? (sortBy.dir === "asc" ? " ▲" : " ▼") : "");

  const tableRows = useMemo(() => {
    const source = reviewTabBuckets[activeReviewTab];
    const filtered = source.filter((tx) => {
      const { spent, received } = spentReceived(tx);
      const txDate = tx.transaction_date ? new Date(tx.transaction_date) : null;
      if (amountFilter === "spent" && spent <= 0) return false;
      if (amountFilter === "received" && received <= 0) return false;
      if (dateFrom) {
        const from = new Date(`${dateFrom}T00:00:00`);
        if (!txDate || Number.isNaN(txDate.getTime()) || txDate < from) return false;
      }
      if (dateTo) {
        const to = new Date(`${dateTo}T23:59:59`);
        if (!txDate || Number.isNaN(txDate.getTime()) || txDate > to) return false;
      }
      switch (selectedTransactionType) {
        case "money_in":
          return received > 0;
        case "money_out":
          return spent > 0;
        case "ready_to_post":
          return !tx.pending;
        case "suggested_matches":
          return Boolean(tx.matched_kind);
        case "transfers":
          return tx.plaid_category.some((category) => category.toLowerCase().includes("transfer"));
        case "rules":
          return tx.plaid_category.length > 0;
        case "missing_from_to":
          return !String(tx.merchant_name ?? tx.description ?? "").trim();
        case "uncategorized":
          return !tx.matched_kind && !tx.matched_bill_id && !tx.matched_load_id && !tx.matched_settlement_id;
        case "requests_waiting_reply":
          return String(tx.notes ?? "").toLowerCase().includes("waiting for reply");
        case "requests_reply_received":
          return String(tx.notes ?? "").toLowerCase().includes("reply received");
        case "requests_completed":
          return String(tx.notes ?? "").toLowerCase().includes("request completed");
        default:
          return true;
      }
    });
    const sortDir = sortBy.dir === "asc" ? 1 : -1;
    const sortVal = (tx: PlaidBankTransaction): string | number => {
      if (sortBy.key === "description") return (tx.description ?? tx.merchant_name ?? "").toLowerCase();
      if (sortBy.key === "spent") return spentReceived(tx).spent;
      if (sortBy.key === "received") return spentReceived(tx).received;
      return tx.transaction_date ?? "";
    };
    return [...filtered].sort((a, b) => {
      const va = sortVal(a);
      const vb = sortVal(b);
      if (va < vb) return -1 * sortDir;
      if (va > vb) return 1 * sortDir;
      return 0;
    });
  }, [activeReviewTab, amountFilter, dateFrom, dateTo, reviewTabBuckets, selectedTransactionType, sortBy]);

  useEffect(() => {
    setCurrentPage(1);
  }, [
    activeReviewTab,
    amountFilter,
    dateFrom,
    dateTo,
    descriptionFilter,
    selectedAccount?.id,
    selectedTransactionType,
    viewSettings.pageSize,
  ]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(tableRows.length / viewSettings.pageSize)), [tableRows.length, viewSettings.pageSize]);
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pageStartIndex = (safeCurrentPage - 1) * viewSettings.pageSize;

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const pagedRows = useMemo(
    () => tableRows.slice(pageStartIndex, pageStartIndex + viewSettings.pageSize),
    [pageStartIndex, tableRows, viewSettings.pageSize]
  );
  const pageRangeStart = tableRows.length === 0 ? 0 : pageStartIndex + 1;
  const pageRangeEnd = tableRows.length === 0 ? 0 : Math.min(pageStartIndex + viewSettings.pageSize, tableRows.length);
  const pageRowIds = useMemo(() => pagedRows.map((tx) => tx.id), [pagedRows]);
  const bulkSelection = useBulkSelection({
    cap: 200,
    onCapExceeded: (error) => pushToast(error.message, "error"),
  });

  const groupedRows = useMemo(() => {
    if (viewSettings.turnOffGrouping) return [{ monthKey: "all", title: "All transactions", rows: pagedRows }];
    const bucket = new Map<string, PlaidBankTransaction[]>();
    for (const tx of pagedRows) {
      const key = monthKeyFromDate(tx.transaction_date);
      const arr = bucket.get(key) ?? [];
      arr.push(tx);
      bucket.set(key, arr);
    }
    return [...bucket.entries()]
      .sort(([a], [b]) => (a < b ? 1 : -1))
      .map(([monthKey, rows]) => ({ monthKey, title: monthTitleFromKey(monthKey), rows }));
  }, [pagedRows, viewSettings.turnOffGrouping]);

  // Running balance ("Balance" column), computed over the FULL account ledger — not the visible page —
  // so each row shows its true post-transaction balance even when the view is filtered or paginated.
  // Anchor = the account's current balance (balance AFTER the newest transaction); we walk newest->oldest:
  //   balanceAfter(newest) = currentBalance; balanceAfter(older) = balanceAfter(newer) - signed(newer).
  // signed = received - spent (cents). This is only meaningful in date order (the default sort) and when the
  // full history is present (post-reconnect it is) — matching how a QuickBooks/bank register behaves.
  const runningBalanceById = useMemo(() => {
    const map = new Map<string, number>();
    if (!selectedAccount) return map;
    let running = Number(selectedAccount.current_balance_cents ?? 0);
    const ordered = [...scopedRows].sort((a, b) => {
      const da = a.transaction_date ?? "";
      const db = b.transaction_date ?? "";
      if (da === db) return 0;
      return da < db ? 1 : -1; // date descending (newest first)
    });
    for (const tx of ordered) {
      map.set(tx.id, running);
      const { spent, received } = spentReceived(tx);
      running -= received - spent;
    }
    return map;
  }, [scopedRows, selectedAccount]);

  function makeDefaultDraft(tx: PlaidBankTransaction): RowDetailDraft {
    const description = tx.description || tx.merchant_name || "";
    return {
      mode: "categorize",
      transactionType: tx.is_credit ? "Money in" : "Money out",
      fromTo: description,
      accountId: "",
      className: "",
      location: "",
      productService: "",
      itemId: "",
      customerProject: "",
      customerId: "",
      payee: tx.merchant_name || "",
      vendorId: "",
      checkNo: "",
      billable: false,
      tags: "",
      memo: viewSettings.copyBankDetailToMemo ? description : tx.notes || "",
      driverId: "",
      driverName: "",
      unitId: "",
      unitName: "",
      trailerId: "",
      trailerName: "",
      loadId: "",
      loadName: "",
      recoverFromDriver: false,
      recoverDeductionType: "fine",
    };
  }

  function getDraft(tx: PlaidBankTransaction): RowDetailDraft {
    const existing = drafts[tx.id];
    if (existing) return existing;
    return makeDefaultDraft(tx);
  }

  function setDraft(tx: PlaidBankTransaction, patch: Partial<RowDetailDraft>) {
    setDrafts((prev) => ({ ...prev, [tx.id]: { ...(prev[tx.id] ?? makeDefaultDraft(tx)), ...patch } }));
  }

  async function postTransaction(tx: PlaidBankTransaction) {
    const draft = getDraft(tx);
    // Contract fix (C1): the backend /categorize route requires `category_kind` + reads
    // `gl_account_id`. It never accepted the old `{action_type, payload:{account_id}}` shape,
    // so every Post 400'd and none of the pending-categorization transactions could be cleared.
    // Categorizing = choosing the COA account the transaction belongs to; that account IS the
    // category. Posting to the GL stays behind the OFF-by-default flag on the backend.
    if (!draft.accountId) {
      pushToast("Choose an account to categorize this transaction.", "error");
      return;
    }
    const account = (coaQuery.data?.accounts ?? []).find((a) => a.id === draft.accountId);
    const categoryKind =
      account?.account_name ||
      (account?.account_number ? String(account.account_number) : "") ||
      "Uncategorized";
    setPostingTxId(tx.id);
    try {
      await categorizeBankTransaction(tx.id, companyId, {
        category_kind: categoryKind,
        gl_account_id: draft.accountId,
        // Catalog-linkage (each selection LINKS the expense to that entity, forward + reverse).
        vendor_id: draft.vendorId || undefined,
        customer_id: draft.customerId || undefined,
        item_id: draft.itemId || undefined,
        // BLOCK-6b dimensions + driver auto-deduction (recover flags only sent when a driver is tagged).
        driver_id: draft.driverId || undefined,
        unit_id: draft.unitId || undefined,
        trailer_id: draft.trailerId || undefined,
        load_id: draft.loadId || undefined,
        recover_from_driver: draft.driverId ? draft.recoverFromDriver : undefined,
        recover_deduction_type:
          draft.driverId && draft.recoverFromDriver ? draft.recoverDeductionType || undefined : undefined,
        memo: draft.memo || undefined,
      });
      pushToast("Transaction posted", "success");
      onDataChanged();
    } catch (error) {
      pushToast(String((error as Error).message || "Post failed"), "error");
    } finally {
      setPostingTxId(null);
    }
  }

  async function excludeTransaction(tx: PlaidBankTransaction) {
    setExcludingTxId(tx.id);
    try {
      await skipBankTransactionInvestigation(tx.id, companyId, { note: "Excluded from Banking transactions view." });
      pushToast("Transaction excluded", "success");
      onDataChanged();
    } catch (error) {
      pushToast(String((error as Error).message || "Exclude failed"), "error");
    } finally {
      setExcludingTxId(null);
    }
  }

  // Shared Excel/CSV export (used by the Print/Export menu and the bulk bar). Called at click time,
  // so the memoized tableRows / runningBalanceById are already initialized.
  function exportTransactionsToExcel(rows: PlaidBankTransaction[], filename: string) {
    const header = ["Date", "Description", "Spent", "Received", "Balance", "From/To", "Customer", "Product/Service"];
    const lines = rows.map((tx) => {
      const { spent, received } = spentReceived(tx);
      const draft = getDraft(tx);
      const bal = runningBalanceById.get(tx.id);
      return [
        formatBankTransactionDate(tx.transaction_date),
        transactionLabel(tx),
        spent > 0 ? (spent / 100).toFixed(2) : "",
        received > 0 ? (received / 100).toFixed(2) : "",
        bal == null ? "" : (bal / 100).toFixed(2),
        draft.fromTo,
        draft.customerProject,
        draft.productService,
      ];
    });
    const csv = [header, ...lines].map((row) => row.map((cell) => toExcelValue(String(cell ?? ""))).join(",")).join("\n");
    const blob = new Blob([csv], { type: "application/vnd.ms-excel;charset=utf-8;" });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(href);
  }

  // Bulk-bar handlers (H3). The bar previously fired fake success toasts with no action.
  const selectedTableRows = () => tableRows.filter((tx) => bulkSelection.selectedIds.has(tx.id));

  async function bulkExclude() {
    const rows = selectedTableRows();
    if (rows.length === 0) {
      pushToast("Select transactions to exclude.", "error");
      return;
    }
    let ok = 0;
    for (const tx of rows) {
      try {
        await skipBankTransactionInvestigation(tx.id, companyId, { note: "Bulk-excluded from Banking transactions view." });
        ok += 1;
      } catch {
        // continue; report the count that succeeded
      }
    }
    pushToast(ok === rows.length ? `Excluded ${ok} transaction(s).` : `Excluded ${ok} of ${rows.length}; some failed.`, ok > 0 ? "success" : "error");
    bulkSelection.clearSelection();
    onDataChanged();
  }

  function bulkExport() {
    const rows = selectedTableRows();
    if (rows.length === 0) {
      pushToast("Select transactions to export.", "error");
      return;
    }
    exportTransactionsToExcel(rows, "banking-transactions-selected.xls");
  }

  return (
    <div className="space-y-3">
      <div className="rounded-sm border border-gray-200 bg-white p-3">
        <div className="flex flex-wrap items-start gap-2">
          {accounts.map((account) => (
            <button
              key={account.id}
              type="button"
              className={`rounded border px-2 py-1 text-left text-xs transition ${
                account.id === selectedAccount?.id
                  ? "border-[#1f2a44] bg-[#1f2a44] text-white"
                  : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
              }`}
              onClick={() => onSelectAccount(account.id)}
            >
              <div>{account.account_name || "Account"} {account.account_mask ? `••••${account.account_mask}` : ""}</div>
              <div className={`mt-0.5 text-[11px] ${account.id === selectedAccount?.id ? "text-white/90" : "text-gray-500"}`}>
                {USD.format(Number(account.current_balance_cents ?? 0) / 100)}
              </div>
            </button>
          ))}
          <div className="relative ml-auto">
            <button
              type="button"
              className="rounded-sm border border-gray-300 px-2 py-1 text-sm font-medium text-gray-800 hover:bg-gray-50"
              onClick={() => setLinkMenuOpen((v) => !v)}
            >
              Link account ▾
            </button>
            {linkMenuOpen ? (
              <div className="absolute right-0 z-20 mt-1 min-w-[220px] rounded-sm border border-gray-200 bg-white shadow-md">
                <button
                  type="button"
                  className="block w-full border-b border-gray-100 px-3 py-2 text-left text-sm hover:bg-gray-50"
                  onClick={() => {
                    setLinkMenuOpen(false);
                    uploadInputRef.current?.click();
                  }}
                >
                  Upload from file
                </button>
                <button
                  type="button"
                  className="block w-full border-b border-gray-100 px-3 py-2 text-left text-sm hover:bg-gray-50"
                  onClick={() => {
                    setLinkMenuOpen(false);
                    onManageConnections();
                  }}
                >
                  Manage connections
                </button>
                <Link
                  to={selectedAccount ? `/banking/accounts/${selectedAccount.id}` : "/banking"}
                  className="block px-3 py-2 text-sm hover:bg-gray-50"
                  onClick={() => setLinkMenuOpen(false)}
                >
                  Go to bank register
                </Link>
              </div>
            ) : null}
          </div>
          <input
            ref={uploadInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file || !selectedAccount) return;
              void uploadBankStatementCsv(file, selectedAccount.id)
                .then(() => {
                  pushToast("Statement uploaded", "success");
                  onDataChanged();
                })
                .catch((error) => pushToast(String((error as Error).message || "Upload failed"), "error"));
            }}
          />
        </div>
      </div>

      <div className="rounded-sm border border-gray-200 bg-white p-3">
        <div className="mb-2 flex flex-wrap items-center gap-1.5 border-b border-gray-100 pb-2">
          {BANKING_REVIEW_TABS.map((tab) => {
            const count = reviewTabBuckets[tab.id as ReviewTabId]?.length ?? 0;
            const active = activeReviewTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                className={`rounded px-2 py-1 text-xs font-semibold ${
                  active ? "bg-[#1f2a44] text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
                onClick={() => setActiveReviewTab(tab.id as ReviewTabId)}
              >
                {tab.label} · {count}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={descriptionFilter}
            onChange={(event) => setDescriptionFilter(event.target.value)}
            placeholder="Filter by description"
            className="h-8 min-w-[260px] rounded-sm border border-gray-300 px-2 text-sm"
          />
          <div className="inline-flex overflow-hidden rounded-sm border border-gray-300 bg-white text-xs">
            {(["all", "spent", "received"] as const).map((option) => (
              <button
                key={option}
                type="button"
                className={`px-2.5 py-1 ${option !== "all" ? "border-l border-gray-300" : ""} ${
                  amountFilter === option ? "bg-[#1f2a44] text-white" : "text-gray-700"
                }`}
                onClick={() => setAmountFilter(option)}
              >
                {option === "all" ? "All" : option === "spent" ? "Spent" : "Received"}
              </button>
            ))}
          </div>
          <div className="relative">
            <button
              type="button"
              className="h-8 rounded-sm border border-gray-300 px-2 text-xs text-gray-700"
              onClick={() => setShowDateFilterMenu((open) => !open)}
            >
              All dates
            </button>
            {showDateFilterMenu ? (
              <div className="absolute left-0 z-20 mt-1 w-64 rounded-sm border border-gray-200 bg-white p-2 shadow-sm">
                <label className="text-[10px] font-semibold uppercase tracking-[0.4px] text-gray-500">
                  From
                  <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="mt-0.5 h-8 w-full rounded-sm border border-gray-300 px-2 text-xs" />
                </label>
                <label className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.4px] text-gray-500">
                  To
                  <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="mt-0.5 h-8 w-full rounded-sm border border-gray-300 px-2 text-xs" />
                </label>
                <button
                  type="button"
                  className="mt-2 rounded-sm border border-gray-300 px-2 py-1 text-xs"
                  onClick={() => {
                    setDateFrom("");
                    setDateTo("");
                  }}
                >
                  Clear range
                </button>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className="h-8 rounded-sm border border-gray-300 px-2 text-xs text-gray-700"
            onClick={() => {
              const next = !collapsedAllGroupings;
              setCollapsedAllGroupings(next);
              if (next) {
                const all: Record<string, boolean> = {};
                for (const group of groupedRows) all[group.monthKey] = true;
                setCollapsedMonths(all);
              } else {
                setCollapsedMonths({});
              }
            }}
          >
            Collapse all groupings
          </button>
          <SelectCombobox
            value={selectedTransactionType}
            onChange={(event) => setSelectedTransactionType(event.target.value)}
            className="w-48 text-xs"
          >
            {TRANSACTION_TYPE_FILTER_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </SelectCombobox>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.4px] text-gray-500">Categorize by</span>
            <div className="inline-flex overflow-hidden rounded-sm border border-gray-300 bg-white text-xs">
              {(["category", "item"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`px-2.5 py-1 ${option === "item" ? "border-l border-gray-300" : ""} ${
                    categorizeBy === option ? "bg-[#1f2a44] text-white" : "text-gray-700"
                  }`}
                  onClick={() => setCategorizeBy(option)}
                >
                  {option === "category" ? "Category" : "Item"}
                </button>
              ))}
            </div>
            <span className="text-xs text-gray-500">
              {pageRangeStart > 0 ? `${pageRangeStart}-${pageRangeEnd} of ${tableRows.length}` : `0 of ${tableRows.length}`}
            </span>
            <div className="inline-flex items-center gap-1 rounded-sm border border-gray-300 bg-white px-1 py-0.5 text-xs text-gray-700">
              <button
                type="button"
                className="rounded-sm px-1.5 py-0.5 hover:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-400"
                disabled={safeCurrentPage <= 1}
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              >
                Previous
              </button>
              <span className="px-1 text-gray-500">{`Page ${safeCurrentPage} of ${totalPages}`}</span>
              <button
                type="button"
                className="rounded-sm px-1.5 py-0.5 hover:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-400"
                disabled={safeCurrentPage >= totalPages}
                onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              >
                Next
              </button>
            </div>
            <div className="relative">
              <button
                type="button"
                aria-label="View settings"
                className="h-8 rounded-sm border border-gray-300 px-2 text-gray-700"
                onClick={() => setViewSettingsOpen((open) => !open)}
              >
                <Settings className="h-4 w-4" />
              </button>
              {viewSettingsOpen ? (
                <div className="absolute right-0 z-20 mt-1 w-[360px] rounded-sm border border-gray-200 bg-white p-3 shadow-sm">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.4px] text-gray-500">Columns</p>
                  <div className="mt-1 grid grid-cols-2 gap-1 text-xs">
                    <ToggleLine label="Check No." checked={viewSettings.showCheckNo} onChange={(checked) => setViewSettings((prev) => ({ ...prev, showCheckNo: checked }))} />
                    <ToggleLine label="Payee" checked={viewSettings.showPayee} onChange={(checked) => setViewSettings((prev) => ({ ...prev, showPayee: checked }))} />
                    <ToggleLine label="Class" checked={viewSettings.showClass} onChange={(checked) => setViewSettings((prev) => ({ ...prev, showClass: checked }))} />
                    <ToggleLine label="Location" checked={viewSettings.showLocation} onChange={(checked) => setViewSettings((prev) => ({ ...prev, showLocation: checked }))} />
                  </div>
                  <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.4px] text-gray-500">Groups</p>
                  <ToggleLine label="Turn off grouping" checked={viewSettings.turnOffGrouping} onChange={(checked) => setViewSettings((prev) => ({ ...prev, turnOffGrouping: checked }))} />
                  <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.4px] text-gray-500">Automation review</p>
                  <ToggleLine label="Add new vendors" checked={viewSettings.addNewVendors} onChange={(checked) => setViewSettings((prev) => ({ ...prev, addNewVendors: checked }))} />
                  <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.4px] text-gray-500">Transaction details</p>
                  <div className="grid grid-cols-1 gap-1 text-xs">
                    <ToggleLine label="Show amounts in 1 column" checked={viewSettings.showAmountsInOneColumn} onChange={(checked) => setViewSettings((prev) => ({ ...prev, showAmountsInOneColumn: checked }))} />
                    <ToggleLine label="Show tags field" checked={viewSettings.showTagsField} onChange={(checked) => setViewSettings((prev) => ({ ...prev, showTagsField: checked }))} />
                    <ToggleLine label="Editable date field" checked={viewSettings.editableDateField} onChange={(checked) => setViewSettings((prev) => ({ ...prev, editableDateField: checked }))} />
                    <ToggleLine label="Show bank details" checked={viewSettings.showBankDetails} onChange={(checked) => setViewSettings((prev) => ({ ...prev, showBankDetails: checked }))} />
                    <ToggleLine label="Copy bank detail to memo" checked={viewSettings.copyBankDetailToMemo} onChange={(checked) => setViewSettings((prev) => ({ ...prev, copyBankDetailToMemo: checked }))} />
                    <ToggleLine label="Enable suggested categorization" checked={viewSettings.enableSuggestedCategorization} onChange={(checked) => setViewSettings((prev) => ({ ...prev, enableSuggestedCategorization: checked }))} />
                  </div>
                  <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.4px] text-gray-500">Page size</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {([50, 75, 100, 200, 300] as const).map((size) => (
                      <button
                        key={size}
                        type="button"
                        className={`rounded-sm border px-2 py-1 text-xs ${viewSettings.pageSize === size ? "border-[#1f2a44] bg-[#1f2a44] text-white" : "border-gray-300 text-gray-700"}`}
                        onClick={() => setViewSettings((prev) => ({ ...prev, pageSize: size }))}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
            <div className="relative">
              <button
                type="button"
                className="h-8 rounded-sm border border-gray-300 px-2 text-gray-700"
                onClick={() => setPrintExportMenuOpen((open) => !open)}
              >
                <Download className="h-4 w-4" />
              </button>
              {printExportMenuOpen ? (
                <div className="absolute right-0 z-20 mt-1 w-44 rounded-sm border border-gray-200 bg-white p-1 shadow-sm">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-gray-50"
                    onClick={() => {
                      setPrintExportMenuOpen(false);
                      window.print();
                    }}
                  >
                    <Printer className="h-3.5 w-3.5" />
                    Print
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-gray-50"
                    onClick={() => {
                      setPrintExportMenuOpen(false);
                      exportTransactionsToExcel(tableRows, "banking-transactions.xls");
                    }}
                  >
                    <Download className="h-3.5 w-3.5" />
                    Export to Excel
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <BulkActionBar
        {...bulkSelection.bulkActionBarProps([
          { id: "categorize", label: "Categorize", onClick: () => pushToast("Open a transaction and choose its account to categorize. Bulk categorize-by-account is coming next.", "info") },
          { id: "exclude", label: "Exclude", onClick: () => void bulkExclude() },
          { id: "export", label: "Export Selected", onClick: () => bulkExport() },
        ])}
      />

      <div className="overflow-x-auto rounded-sm border border-gray-200 bg-white">
        <table className="min-w-[1150px] w-full table-fixed text-left text-[12px]">
          <thead className="bg-gray-50 text-[10px] font-semibold uppercase tracking-wide text-gray-600">
            <tr>
              <th className="w-[3%] px-1 py-2">
                <TableSelectionHeader
                  selectedIds={bulkSelection.selectedIds}
                  pageRowIds={pageRowIds}
                  onSelectionChange={bulkSelection.setSelectedIds}
                  cap={bulkSelection.cap}
                />
              </th>
              <th className="w-[7%] cursor-pointer select-none px-1 py-2 hover:bg-gray-100" onClick={() => toggleSort("date")}>Date{sortCaret("date")}</th>
              <th className="w-[17%] cursor-pointer select-none px-1 py-2 hover:bg-gray-100" onClick={() => toggleSort("description")}>Full bank description{sortCaret("description")}</th>
              {viewSettings.showAmountsInOneColumn ? <th className="px-2 py-2">Amount</th> : <>
                <th className="w-[6%] cursor-pointer select-none px-1 py-2 hover:bg-gray-100" onClick={() => toggleSort("spent")}>Spent{sortCaret("spent")}</th>
                <th className="w-[6%] cursor-pointer select-none px-1 py-2 hover:bg-gray-100" onClick={() => toggleSort("received")}>Received{sortCaret("received")}</th>
              </>}
              <th className={`w-[8%] px-1 py-2 text-right ${sortBy.key !== "date" ? "text-gray-300" : ""}`} title={sortBy.key !== "date" ? "Running balance is only meaningful when sorted by date" : undefined}>Balance</th>
              <th className="w-[12%] px-1 py-2">From/To</th>
              <th className="w-[10%] px-1 py-2">Customer</th>
              <th className="w-[10%] px-1 py-2">Product/Service</th>
              {viewSettings.showCheckNo ? <th className="px-2 py-2">Check No.</th> : null}
              {viewSettings.showPayee ? <th className="px-2 py-2">Payee</th> : null}
              {viewSettings.showClass ? <th className="px-2 py-2">Class</th> : null}
              {viewSettings.showLocation ? <th className="px-2 py-2">Location</th> : null}
              <th className="w-[9%] px-1 py-2">Match/Categorize</th>
              <th className="w-[13%] px-1 py-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {transactionsQuery.isLoading ? (
              <tr>
                <td className="px-3 py-4 text-sm text-gray-500" colSpan={16}>
                  Loading Plaid transactions...
                </td>
              </tr>
            ) : null}
            {!transactionsQuery.isLoading && pagedRows.length === 0 ? (
              <tr>
                <td className="px-3 py-4 text-sm text-gray-500" colSpan={16}>
                  No transactions for selected account and filters.
                </td>
              </tr>
            ) : null}
            {groupedRows.map((group) => {
              const isGroupCollapsed = collapsedAllGroupings || collapsedMonths[group.monthKey] === true;
              return (
                <Fragment key={group.monthKey}>
                  {!viewSettings.turnOffGrouping ? (
                    <tr className="border-t border-gray-200 bg-[#F8F8F4]">
                      <td colSpan={16} className="px-2 py-1.5">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 text-xs font-semibold text-gray-700"
                          onClick={() => setCollapsedMonths((prev) => ({ ...prev, [group.monthKey]: !prev[group.monthKey] }))}
                        >
                          {isGroupCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                          {group.title} ({group.rows.length})
                        </button>
                      </td>
                    </tr>
                  ) : null}
                  {isGroupCollapsed
                    ? null
                    : group.rows.map((tx) => {
                        const { spent, received } = spentReceived(tx);
                        const expanded = expandedTxId === tx.id;
                        const menuOpen = actionMenuTxId === tx.id;
                        const draft = getDraft(tx);
                        return (
                          <Fragment key={tx.id}>
                  <tr
                    className="cursor-pointer border-t border-gray-100 text-sm hover:bg-gray-50"
                    onClick={() => setExpandedTxId((cur) => (cur === tx.id ? null : tx.id))}
                  >
                    <td className="px-1 py-2 align-top" onClick={(e: { stopPropagation(): void }) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={bulkSelection.isSelected(tx.id)}
                        onChange={() => bulkSelection.toggleRow(tx.id)}
                        aria-label={`Select transaction ${tx.id}`}
                      />
                    </td>
                    <td className="px-1 py-2 align-top text-gray-700">
                      {viewSettings.editableDateField && expanded ? (
                        <input
                          type="date"
                          className="h-7 rounded-sm border border-gray-300 px-2 text-xs"
                          value={tx.transaction_date.slice(0, 10)}
                          onClick={(event: { stopPropagation(): void }) => event.stopPropagation()}
                          readOnly
                        />
                      ) : (
                        formatBankTransactionDate(tx.transaction_date)
                      )}
                    </td>
                    <td className="px-1 py-2 align-top">
                      <div className="flex items-start justify-between gap-2">
                        <p className="truncate text-gray-900">{transactionLabel(tx)}</p>
                        <div className="inline-flex items-center gap-1 text-gray-500">
                          <Paperclip className="h-4 w-4" />
                          <MessageSquare className="h-4 w-4" />
                        </div>
                      </div>
                    </td>
                    {viewSettings.showAmountsInOneColumn ? (
                      <td className={`px-1 py-2 align-top ${spent > 0 ? "text-red-700" : "text-emerald-700"}`}>
                        {spent > 0 ? `-${USD.format(spent / 100)}` : received > 0 ? USD.format(received / 100) : "—"}
                      </td>
                    ) : (
                      <>
                        <td className="px-1 py-2 align-top text-red-700">{spent > 0 ? USD.format(spent / 100) : "—"}</td>
                        <td className="px-1 py-2 align-top text-emerald-700">{received > 0 ? USD.format(received / 100) : "—"}</td>
                      </>
                    )}
                    {(() => {
                      const bal = runningBalanceById.get(tx.id);
                      return (
                        <td className={`whitespace-nowrap px-1 py-2 text-right align-top tabular-nums ${sortBy.key !== "date" ? "text-gray-300" : bal != null && bal < 0 ? "text-red-700" : "text-gray-900"}`}>
                          {bal == null ? "—" : USD.format(bal / 100)}
                        </td>
                      );
                    })()}
                    <td className="truncate px-1 py-2 align-top text-gray-700">{draft.fromTo || "—"}</td>
                    <td className="truncate px-1 py-2 align-top text-gray-700">{draft.customerProject || "—"}</td>
                    <td className="truncate px-1 py-2 align-top text-gray-700">{draft.productService || "—"}</td>
                    {viewSettings.showCheckNo ? <td className="truncate px-1 py-2 align-top text-gray-700">{draft.checkNo || "—"}</td> : null}
                    {viewSettings.showPayee ? <td className="truncate px-1 py-2 align-top text-gray-700">{draft.payee || "—"}</td> : null}
                    {viewSettings.showClass ? <td className="truncate px-1 py-2 align-top text-gray-700">{draft.className || "—"}</td> : null}
                    {viewSettings.showLocation ? <td className="truncate px-1 py-2 align-top text-gray-700">{draft.location || "—"}</td> : null}
                    <td className="px-1 py-2 align-top">
                      <span className="rounded-sm bg-gray-100 px-2 py-1 text-[11px] text-gray-700">
                        {draft.mode === "match" ? "Match" : "Categorize"}
                      </span>
                    </td>
                    <td className="px-1 py-2 align-top" onClick={(e: { stopPropagation(): void }) => e.stopPropagation()}>
                      <div className="relative flex items-center justify-end gap-1">
                        <ActionButton className="h-7 px-2 text-[11px]" onClick={() => void postTransaction(tx)} disabled={postingTxId === tx.id}>
                          {postingTxId === tx.id ? "Posting..." : "Post"}
                        </ActionButton>
                        <button
                          type="button"
                          className="rounded-sm border border-gray-300 px-1.5 py-1 text-xs text-gray-700 hover:bg-gray-50"
                          onClick={() => setActionMenuTxId((cur) => (cur === tx.id ? null : tx.id))}
                        >
                          ▾
                        </button>
                        {menuOpen ? (
                          <div className="absolute right-0 top-7 z-20 min-w-[220px] rounded-sm border border-gray-200 bg-white shadow-md">
                            {/* HELD financial-actions wiring: reuses the orphaned MatchDrawer (already-built
                            getMatchCandidates + acceptBankReconMatch, reconcile-commit — link-and-clear for
                            an exact-amount match, or a balanced variance JE via acceptMatchWithResolveDifference;
                            both gated, no new GL math here). */}
                            <button
                              type="button"
                              className="block w-full border-b border-gray-100 px-3 py-2 text-left text-xs hover:bg-gray-50"
                              onClick={() => {
                                setActionMenuTxId(null);
                                setMatchDrawerTxId(tx.id);
                              }}
                            >
                              Accept match (reconcile)
                            </button>
                            {/* BANK-SPLIT-1: the real, persisted, balanced N-line split (banking.bank_transaction_splits,
                            migration 202607110100, HELD). Opens the QBO-style Split transaction popup. */}
                            <button
                              type="button"
                              className="block w-full border-b border-gray-100 px-3 py-2 text-left text-xs hover:bg-gray-50"
                              onClick={() => {
                                setActionMenuTxId(null);
                                setSplitTx(tx);
                              }}
                            >
                              Split
                            </button>
                            <button
                              type="button"
                              className="block w-full border-b border-gray-100 px-3 py-2 text-left text-xs hover:bg-gray-50"
                              onClick={() => {
                                setActionMenuTxId(null);
                                pushToast("backdated check is available via detailed categorization flow", "info");
                              }}
                            >
                              Create backdated check
                            </button>
                            <Link
                              to="/banking/categorization-rules"
                              className="block border-b border-gray-100 px-3 py-2 text-xs hover:bg-gray-50"
                              onClick={() => setActionMenuTxId(null)}
                            >
                              Create rule
                            </Link>
                            <button
                              type="button"
                              className="block w-full px-3 py-2 text-left text-xs text-red-700 hover:bg-red-50"
                              onClick={() => {
                                setActionMenuTxId(null);
                                void excludeTransaction(tx);
                              }}
                              disabled={excludingTxId === tx.id}
                            >
                              {excludingTxId === tx.id ? "excluding..." : "Exclude"}
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                  {expanded ? (
                    <tr key={`${tx.id}-expanded`} className="border-t border-gray-100 bg-gray-50">
                      <td className="px-3 py-3" colSpan={16}>
                        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                          <div className="rounded-sm border border-gray-200 bg-white p-2">
                            <p className="mb-2 text-xs font-semibold text-gray-900">{transactionLabel(tx)}</p>
                            {viewSettings.showBankDetails ? (
                              <div className="mb-2 grid grid-cols-1 gap-1 text-xs text-gray-600 md:grid-cols-2">
                                <div>Date: {formatBankTransactionDate(tx.transaction_date)}</div>
                                <div>Account: {selectedAccount?.account_name || "—"}</div>
                                <div>Spent: {spent > 0 ? USD.format(spent / 100) : "—"}</div>
                                <div>Received: {received > 0 ? USD.format(received / 100) : "—"}</div>
                              </div>
                            ) : null}
                            <div className="mb-2 flex items-center gap-2">
                              <button
                                type="button"
                                className={`rounded-sm px-2 py-1 text-xs ${draft.mode === "match" ? "bg-slate-100 text-slate-700" : "bg-gray-100 text-gray-700"}`}
                                  onClick={() => setDraft(tx, { mode: "match" })}
                              >
                                Match
                              </button>
                              <button
                                type="button"
                                className={`rounded-sm px-2 py-1 text-xs ${draft.mode === "categorize" ? "bg-slate-100 text-slate-700" : "bg-gray-100 text-gray-700"}`}
                                  onClick={() => setDraft(tx, { mode: "categorize" })}
                              >
                                Categorize
                              </button>
                            </div>
                            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                              <label className="text-xs text-gray-600">
                                Transaction type
                                <SelectCombobox
                                  className="mt-0.5 w-full"
                                  value={draft.transactionType}
                                  onChange={(event) => {
                                    const value = event.target.value;
                                    setDraft(tx, { transactionType: value });
                                    // HELD financial-actions wiring: Transfer/CC Payment open the existing,
                                    // fully-built RecordTransferModal / RecordCCPaymentModal (gated posters —
                                    // createTransfer / recordCcPayment) pre-seeded from this row, instead of
                                    // duplicating a third transfer/CC-payment picker inline.
                                    if (value === "Transfer") setTransferModalTx(tx);
                                    if (value === "CC Payment") setCcPaymentModalTx(tx);
                                  }}
                                >
                                  <option value="Money in">Money in</option>
                                  <option value="Money out">Money out</option>
                                  <option value="Transfer">Transfer</option>
                                  <option value="CC Payment">CC Payment</option>
                                  <option value="Expense">Expense</option>
                                </SelectCombobox>
                              </label>
                              <label className="text-xs text-gray-600">
                                Payee (vendor)
                                <SelectCombobox
                                  className="mt-0.5 w-full"
                                  value={draft.vendorId}
                                  onChange={(event) => {
                                    const vid = event.target.value;
                                    const v = (vendorsQuery.data ?? []).find((x) => x.id === vid);
                                    setDraft(tx, { vendorId: vid, payee: v?.name ?? "" });
                                  }}
                                >
                                  <option value="">Select payee (vendor)</option>
                                  {(vendorsQuery.data ?? []).map((v) => (
                                    <option key={v.id} value={v.id}>
                                      {v.name}
                                    </option>
                                  ))}
                                </SelectCombobox>
                              </label>
                              <label className="text-xs text-gray-600">
                                Check No.
                                <input
                                  className="mt-0.5 w-full rounded-sm border border-gray-300 px-2 py-1 text-sm"
                                  value={draft.checkNo}
                                  onChange={(event) => setDraft(tx, { checkNo: event.target.value })}
                                />
                              </label>
                              <label className="text-xs text-gray-600">
                                From/To
                                {draft.transactionType === "Transfer" ? (
                                  <button
                                    type="button"
                                    className="mt-0.5 block w-full rounded-sm border border-gray-300 px-2 py-1 text-left text-sm hover:bg-gray-50"
                                    onClick={() => setTransferModalTx(tx)}
                                  >
                                    {draft.fromTo || "Select From/To accounts…"}
                                  </button>
                                ) : draft.transactionType === "CC Payment" ? (
                                  <button
                                    type="button"
                                    className="mt-0.5 block w-full rounded-sm border border-gray-300 px-2 py-1 text-left text-sm hover:bg-gray-50"
                                    onClick={() => setCcPaymentModalTx(tx)}
                                  >
                                    {draft.fromTo || "Select CC payment details…"}
                                  </button>
                                ) : (
                                  <input
                                    className="mt-0.5 w-full rounded-sm border border-gray-300 px-2 py-1 text-sm"
                                    value={draft.fromTo}
                                    onChange={(event) => setDraft(tx, { fromTo: event.target.value })}
                                  />
                                )}
                              </label>
                              <label className="text-xs text-gray-600">
                                Category (Chart of Accounts)
                                <SelectCombobox
                                  className="mt-0.5 w-full"
                                  value={draft.accountId}
                                  onChange={(event) => setDraft(tx, { accountId: event.target.value })}
                                >
                                  <option value="">Select category account</option>
                                  {(coaQuery.data?.accounts ?? []).map((account) => (
                                    <option key={account.id} value={account.id}>
                                      {account.account_number ? `${account.account_number} · ` : ""}
                                      {account.account_name}
                                    </option>
                                  ))}
                                </SelectCombobox>
                              </label>
                              <label className="text-xs text-gray-600">
                                Class
                                <input
                                  className="mt-0.5 w-full rounded-sm border border-gray-300 px-2 py-1 text-sm"
                                  value={draft.className}
                                  onChange={(event) => setDraft(tx, { className: event.target.value })}
                                />
                              </label>
                              <label className="text-xs text-gray-600">
                                Location
                                <input
                                  className="mt-0.5 w-full rounded-sm border border-gray-300 px-2 py-1 text-sm"
                                  value={draft.location}
                                  onChange={(event) => setDraft(tx, { location: event.target.value })}
                                />
                              </label>
                              <label className="text-xs text-gray-600">
                                Item (Products &amp; Services)
                                <SelectCombobox
                                  className="mt-0.5 w-full"
                                  value={draft.itemId}
                                  onChange={(event) => {
                                    const iid = event.target.value;
                                    const item = (itemsQuery.data ?? []).find((x) => x.id === iid);
                                    // An Item carries its own account mapping (PR #1716): default the Category
                                    // account from the item's expense/income account when none is chosen yet, so
                                    // an item line still posts to the right account without re-picking it.
                                    const m = (item?.metadata ?? {}) as Record<string, unknown>;
                                    const itemAccount =
                                      (typeof m.default_expense_account_id === "string" && m.default_expense_account_id) ||
                                      (typeof m.default_income_account_id === "string" && m.default_income_account_id) ||
                                      "";
                                    setDraft(tx, {
                                      itemId: iid,
                                      productService: item?.display_name ?? "",
                                      accountId: draft.accountId || (itemAccount as string) || "",
                                    });
                                  }}
                                >
                                  <option value="">Select item</option>
                                  {(itemsQuery.data ?? []).map((it: AccountingCatalogRow) => (
                                    <option key={it.id} value={it.id}>
                                      {it.display_name}
                                    </option>
                                  ))}
                                </SelectCombobox>
                              </label>
                              <label className="text-xs text-gray-600">
                                Customer/project
                                <SelectCombobox
                                  className="mt-0.5 w-full"
                                  value={draft.customerId}
                                  onChange={(event) => {
                                    const cid = event.target.value;
                                    const c = (customersQuery.data ?? []).find((x) => x.id === cid);
                                    setDraft(tx, { customerId: cid, customerProject: c?.name ?? "" });
                                  }}
                                >
                                  <option value="">Select customer</option>
                                  {(customersQuery.data ?? []).map((c) => (
                                    <option key={c.id} value={c.id}>
                                      {c.name}
                                    </option>
                                  ))}
                                </SelectCombobox>
                              </label>
                              <label className="flex items-center gap-2 text-xs text-gray-700">
                                <input
                                  type="checkbox"
                                  checked={draft.billable}
                                  onChange={(event) => setDraft(tx, { billable: event.target.checked })}
                                />
                                Billable
                              </label>
                            </div>
                            {/* BLOCK-6b dimensions: Driver + Unit (truck) + Trip (load) the transaction belongs
                                to — tags for full cross-module linkage + drill-through (forward: this txn shows
                                them; reverse: each shows this expense). */}
                            <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-4">
                              <div className="text-xs text-gray-600">
                                Driver
                                <div className="mt-0.5">
                                  <DriverAutocomplete
                                    companyId={companyId}
                                    value={draft.driverId}
                                    limit={200}
                                    onChange={(driverId, driverName) =>
                                      setDraft(tx, { driverId, driverName: driverName ?? "" })
                                    }
                                  />
                                </div>
                                {draft.driverId ? (
                                  <button
                                    type="button"
                                    className="mt-0.5 text-[11px] text-slate-700 underline"
                                    onClick={() => setDraft(tx, { driverId: "", driverName: "", recoverFromDriver: false })}
                                  >
                                    Clear driver{draft.driverName ? ` (${draft.driverName})` : ""}
                                  </button>
                                ) : null}
                              </div>
                              <div className="text-xs text-gray-600">
                                Unit (truck)
                                <div className="mt-0.5">
                                  <UnitAutocomplete
                                    companyId={companyId}
                                    value={draft.unitId}
                                    onChange={(unitId, unitName) => setDraft(tx, { unitId, unitName })}
                                  />
                                </div>
                                {draft.unitId ? (
                                  <button
                                    type="button"
                                    className="mt-0.5 text-[11px] text-slate-700 underline"
                                    onClick={() => setDraft(tx, { unitId: "", unitName: "" })}
                                  >
                                    Clear unit{draft.unitName ? ` (${draft.unitName})` : ""}
                                  </button>
                                ) : null}
                              </div>
                              <div className="text-xs text-gray-600">
                                Trailer
                                <div className="mt-0.5">
                                  <TrailerAutocomplete
                                    companyId={companyId}
                                    value={draft.trailerId}
                                    onChange={(trailerId, trailerName) => setDraft(tx, { trailerId, trailerName })}
                                  />
                                </div>
                                {draft.trailerId ? (
                                  <button
                                    type="button"
                                    className="mt-0.5 text-[11px] text-slate-700 underline"
                                    onClick={() => setDraft(tx, { trailerId: "", trailerName: "" })}
                                  >
                                    Clear trailer{draft.trailerName ? ` (${draft.trailerName})` : ""}
                                  </button>
                                ) : null}
                              </div>
                              <div className="text-xs text-gray-600">
                                Trip (load)
                                <div className="mt-0.5">
                                  <LoadAutocomplete
                                    companyId={companyId}
                                    value={draft.loadId}
                                    onChange={(loadId, loadName) => setDraft(tx, { loadId, loadName })}
                                  />
                                </div>
                                {draft.loadId ? (
                                  <button
                                    type="button"
                                    className="mt-0.5 text-[11px] text-slate-700 underline"
                                    onClick={() => setDraft(tx, { loadId: "", loadName: "" })}
                                  >
                                    Clear trip{draft.loadName ? ` (${draft.loadName})` : ""}
                                  </button>
                                ) : null}
                              </div>
                            </div>
                            {/* BLOCK-6b driver AUTO-DEDUCTION: when the paid expense BELONGS to the tagged driver
                                (e.g. a fine the company paid), recover it from the driver's settlement. Creates a
                                recoverable driver_settlement_deductions row behind the OFF-by-default
                                BANK_DRIVER_EXPENSE_DEDUCTION_ENABLED flag (consent-gated, load_id direct). Only
                                offered once a driver is tagged. */}
                            {draft.driverId ? (
                              <div className="mt-2 rounded-sm border border-gray-200 bg-gray-50 px-2 py-1.5">
                                <label className="flex items-center gap-2 text-xs font-medium text-gray-700">
                                  <input
                                    type="checkbox"
                                    checked={draft.recoverFromDriver}
                                    onChange={(event) => setDraft(tx, { recoverFromDriver: event.target.checked })}
                                  />
                                  Recover from driver (auto-deduction on settlement)
                                </label>
                                {draft.recoverFromDriver ? (
                                  <label className="mt-1.5 block text-xs text-gray-600">
                                    Recovery type
                                    <SelectCombobox
                                      className="mt-0.5 w-full"
                                      value={draft.recoverDeductionType}
                                      onChange={(event) => setDraft(tx, { recoverDeductionType: event.target.value })}
                                    >
                                      {RECOVER_DEDUCTION_TYPES.map((t) => (
                                        <option key={t} value={t}>
                                          {t}
                                        </option>
                                      ))}
                                    </SelectCombobox>
                                  </label>
                                ) : null}
                              </div>
                            ) : null}
                            <label className="mt-2 block text-xs text-gray-600">
                              Memo
                              <textarea
                                className="mt-0.5 w-full rounded-sm border border-gray-300 px-2 py-1 text-sm"
                                rows={3}
                                value={draft.memo}
                                onChange={(event) => setDraft(tx, { memo: event.target.value })}
                              />
                            </label>
                            {viewSettings.showTagsField ? (
                              <label className="mt-2 block text-xs text-gray-600">
                                Tags
                                <input
                                  className="mt-0.5 w-full rounded-sm border border-gray-300 px-2 py-1 text-sm"
                                  value={draft.tags}
                                  onChange={(event) => setDraft(tx, { tags: event.target.value })}
                                />
                              </label>
                            ) : null}
                            <div className="mt-2 rounded-sm border border-dashed border-gray-300 bg-gray-50 px-3 py-4 text-center text-xs text-gray-500">
                              Files drag/drop area
                            </div>
                            <div className="mt-2 flex justify-end gap-2">
                              <Button type="button" variant="secondary" onClick={() => setExpandedTxId(null)}>
                                Cancel
                              </Button>
                              <Button type="button" onClick={() => void postTransaction(tx)} disabled={postingTxId === tx.id}>
                                {postingTxId === tx.id ? "Posting..." : "Post"}
                              </Button>
                            </div>
                          </div>

                          <div className="rounded-sm border border-gray-200 bg-white p-2">
                            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Match candidates</p>
                            <p className="mt-0.5 text-[11px] text-gray-500">
                              Ranked matchable ledger records (amount, date, memo) from the reconciliation match
                              engine, best match first.
                            </p>
                            {matchCandidatesQuery.isLoading ? <p className="mt-2 text-sm text-gray-500">Loading match candidates...</p> : null}
                            {matchCandidatesQuery.isError ? (
                              <p className="mt-2 text-sm text-red-700">Could not load match candidates.</p>
                            ) : null}
                            {!matchCandidatesQuery.isLoading &&
                            !matchCandidatesQuery.isError &&
                            (matchCandidatesQuery.data?.candidates ?? []).length === 0 ? (
                              <p className="mt-2 text-sm text-gray-500">No match candidates found for this transaction.</p>
                            ) : null}
                            <div className="mt-2 space-y-1.5">
                              {[...(matchCandidatesQuery.data?.candidates ?? [])]
                                .sort((a, b) => b.match_score - a.match_score)
                                .map((candidate: BankMatchCandidate) => (
                                  <div
                                    key={`${tx.id}-mc-${candidate.ledger_entry_kind}-${candidate.ledger_entry_id}`}
                                    className="rounded-sm border border-gray-100 px-2 py-1.5 text-xs"
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="flex items-center gap-1.5">
                                        <span className="inline-flex items-center rounded-sm border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700">
                                          {MATCH_CANDIDATE_KIND_LABELS[candidate.ledger_entry_kind]}
                                        </span>
                                        {candidate.auto_match ? (
                                          <span className="inline-flex items-center rounded-sm bg-slate-800 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white">
                                            Best match
                                          </span>
                                        ) : null}
                                      </div>
                                      <span className="shrink-0 font-semibold text-gray-900">
                                        {formatUsdCents(Math.abs(Number(candidate.amount_cents ?? 0)))}
                                      </span>
                                    </div>
                                    <div className="mt-1 truncate text-gray-700" title={candidate.memo}>
                                      {candidate.memo?.trim() ? candidate.memo : "—"}
                                    </div>
                                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-gray-500">
                                      <span>Date: {String(candidate.event_date ?? "").slice(0, 10) || "—"}</span>
                                      <span>Amount gap: {formatUsdCents(Math.abs(Number(candidate.amount_gap_cents ?? 0)))}</span>
                                      <span>Date gap: {candidate.date_gap_days}d</span>
                                      <span>Score: {candidate.match_score.toFixed(3)}</span>
                                    </div>
                                  </div>
                                ))}
                            </div>

                            <div className="mt-3 border-t border-gray-100 pt-2">
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                                Similar past categorizations
                              </p>
                              {!viewSettings.enableSuggestedCategorization ? (
                                <p className="mt-1 text-xs text-gray-500">Suggested categorization disabled in view settings.</p>
                              ) : null}
                              {viewSettings.enableSuggestedCategorization && suggestionsQuery.isLoading ? (
                                <p className="mt-1 text-xs text-gray-500">Loading suggestions...</p>
                              ) : null}
                              {viewSettings.enableSuggestedCategorization &&
                              !suggestionsQuery.isLoading &&
                              (suggestionsQuery.data?.suggestions ?? []).length === 0 ? (
                                <p className="mt-1 text-xs text-gray-500">No similar past categorizations found.</p>
                              ) : null}
                              <div className="mt-1 space-y-1">
                                {(suggestionsQuery.data?.suggestions ?? []).slice(0, 6).map((suggestion, index) => (
                                  <button
                                    key={`${tx.id}-s-${index}`}
                                    type="button"
                                    className="block w-full rounded-sm border border-gray-100 px-2 py-1 text-left text-xs hover:bg-gray-50"
                                    onClick={() => {
                                      // Contract fix (C1): apply the suggested category through the
                                      // real /categorize contract (category_kind + gl_account_id) —
                                      // the old {action_type:"match"} body 400'd. The suggestion
                                      // carries its prior category + account; reuse them.
                                      const suggestedKind = String(suggestion.category ?? suggestion.kind ?? "").trim();
                                      const suggestedAccountId = String(
                                        suggestion.gl_account_id ?? suggestion.coa_account_id ?? suggestion.account_id ?? ""
                                      );
                                      if (!suggestedKind && !suggestedAccountId) {
                                        pushToast("This suggestion has no category to apply.", "error");
                                        return;
                                      }
                                      void categorizeBankTransaction(tx.id, companyId, {
                                        category_kind: suggestedKind || "Matched",
                                        gl_account_id: suggestedAccountId || undefined,
                                      })
                                        .then(() => {
                                          pushToast("Transaction matched", "success");
                                          onDataChanged();
                                        })
                                        .catch((error) => pushToast(String((error as Error).message || "Match failed"), "error"));
                                    }}
                                  >
                                    {String(suggestion.category ?? suggestion.kind ?? "candidate")} · {String(suggestion.id ?? "")}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                          </Fragment>
                        );
                      })}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <BankTransactionSplitModal
        open={Boolean(splitTx)}
        companyId={companyId}
        transaction={splitTx ? { id: splitTx.id, amount_cents: splitTx.amount_cents, is_credit: splitTx.is_credit, description: transactionLabel(splitTx) } : null}
        onClose={() => setSplitTx(null)}
        onSaved={() => onDataChanged()}
      />
      {/* HELD financial-actions wiring — reuses the orphaned MatchDrawer (getMatchCandidates +
      acceptBankReconMatch, already gated) instead of inventing a second match/accept flow. */}
      <MatchDrawer
        open={Boolean(matchDrawerTxId)}
        bankTransactionId={matchDrawerTxId}
        operatingCompanyId={companyId}
        onClose={() => setMatchDrawerTxId(null)}
        onAccepted={() => onDataChanged()}
      />
      {/* HELD financial-actions wiring — the fully-built RecordTransferModal (createTransfer, gated),
      pre-seeded from the row's amount/date + this account as one leg. */}
      <RecordTransferModal
        open={Boolean(transferModalTx)}
        operatingCompanyId={companyId}
        defaultTransferType="bank_to_bank"
        prefillAmountCents={transferModalTx ? Math.abs(Number(transferModalTx.amount_cents ?? 0)) : undefined}
        prefillDate={transferModalTx?.transaction_date?.slice(0, 10)}
        prefillMemo={transferModalTx ? transactionLabel(transferModalTx) : undefined}
        seedAccountId={selectedAccount?.id}
        seedAccountSide={transferModalTx?.is_credit ? "to" : "from"}
        linkBankTransactionId={transferModalTx?.id ?? null}
        onClose={() => setTransferModalTx(null)}
        onSaved={() => {
          setTransferModalTx(null);
          onDataChanged();
        }}
      />
      {/* HELD financial-actions wiring — the RecordCCPaymentModal already mounted at BankingHome.tsx
      (recordCcPayment, gated), reused here pre-seeded from the row. */}
      <RecordCCPaymentModal
        open={Boolean(ccPaymentModalTx)}
        operatingCompanyId={companyId}
        prefillAmountCents={ccPaymentModalTx ? Math.abs(Number(ccPaymentModalTx.amount_cents ?? 0)) : undefined}
        prefillDate={ccPaymentModalTx?.transaction_date?.slice(0, 10)}
        prefillMemo={ccPaymentModalTx ? transactionLabel(ccPaymentModalTx) : undefined}
        prefillFromBankId={selectedAccount?.id}
        linkBankTransactionId={ccPaymentModalTx?.id ?? null}
        onClose={() => setCcPaymentModalTx(null)}
        onSaved={() => {
          setCcPaymentModalTx(null);
          onDataChanged();
        }}
      />
    </div>
  );
}

function ToggleLine({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="inline-flex items-center gap-2 text-xs text-gray-700">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}
