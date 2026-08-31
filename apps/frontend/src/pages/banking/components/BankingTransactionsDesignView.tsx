import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Download, MessageSquare, Paperclip, Printer, Settings } from "lucide-react";
import {
  categorizeBankTransaction,
  categorizeTransactionsBulk,
  getAllAccounts,
  getBankingSuggestions,
  getCoaAccounts,
  getMatchCandidates,
  getBankTransactionCategorizationLinks,
  getPlaidCompanyTransactions,
  isManualBankTransaction,
  skipBankTransactionInvestigation,
  supersedePlaidPendingTransaction,
  updateBankTransactionDate,
  uploadBankStatementCsv,
  type BankMatchCandidate,
  type BankMatchCandidateKind,
  type PlaidBankAccount,
  type PlaidBankTransaction,
} from "../../../api/banking";
import {
  buildRelayFuelBreakdown,
  formatRelayFuelBreakdownSummary,
} from "./relayFuelLineBreakdown";
import { PrintOrientationDialog } from "./PrintOrientationDialog";
import { printLetterHtml } from "../../../lib/openPrintableDocument";
import { BulkActionBar } from "../../../components/bulk/BulkActionBar";
import { ActionButton } from "../../../components/shared/ActionButton";
import { EntityLink, type EntityKind } from "../../../components/shared/EntityLink";
import { entityLabel, visibleDocumentLabel } from "../../../lib/entity-label";
import { Button } from "../../../components/Button";
import { ConfirmModal } from "../../../components/shared/ConfirmModal";
import { useBulkSelection } from "../../../hooks/useBulkSelection";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";
import { useToast } from "../../../components/Toast";
import { formatUsdCents } from "../../../lib/money";
import { DriverAutocomplete } from "../../../components/factoring/DriverAutocomplete";
import { UnitAutocomplete } from "../../../components/banking/UnitAutocomplete";
import { EntityPicker } from "../../../components/parity/EntityPicker";
import { listVendors, listCustomers } from "../../../api/mdata";
import { classesCatalogClient, itemsCatalogClient, type AccountingCatalogRow } from "../../../api/catalogs-accounting";
import { BankTransactionSplitModal } from "./BankTransactionSplitModal";
import { BankTransactionAttachmentsNotesModal } from "./BankTransactionAttachmentsNotesModal";
import { MatchDrawer } from "./MatchDrawer";
import { buildBankingTransactionsXlsx } from "./banking-transactions-xlsx";
import { RecordTransferModal } from "../RecordTransferModal";
import { RecordCCPaymentModal } from "../RecordCCPaymentModal";
import { ReferenceSelect } from "../../../components/parity/ReferenceSelect";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { useFeatureFlag } from "../../../hooks/useFeatureFlag";
import { DatePicker } from "../../../components/forms/DatePicker";
import {
  buildPagedBankTxnGroups,
  type BankTxnGroupMode,
  type BankTxnSort,
} from "./bankTxnSortGroup";
import { userFacingApiError } from "../../../lib/api-error-message";

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
  /** Deep-link from EntityLink bank_transaction — expand the matching row when present in the loaded page. */
  highlightTransactionId?: string | null;
};

type RowDetailDraft = {
  mode: "match" | "categorize";
  transactionType: string;
  fromTo: string;
  /** QBO Transfer: explicit From bank account id (inline picker). */
  fromAccountId: string;
  /** QBO Transfer: explicit To bank account id (inline picker). */
  toAccountId: string;
  accountId: string;
  // Class = QBO reporting DIMENSION (catalogs.classes). classId is the real catalog FK the inline
  // "+ Add new class" writes/links; className is the label kept for the table cell + export (mirrors the
  // payee/vendorId, customerProject/customerId, productService/itemId pattern).
  className: string;
  classId: string;
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
  /** none | recover (settlement deduction) | payable (driver advance / company owes driver) */
  driverMoneyTreatment: "none" | "recover" | "payable";
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

// Match candidates — EntityLink for every kind with a real detail route (Law §9).
const MATCH_CANDIDATE_ENTITY_KIND: Record<BankMatchCandidateKind, EntityKind> = {
  payment: "payment",
  bill_payment: "bill_payment",
  transfer: "transfer",
  je: "journal_entry",
  bill: "bill",
  expense: "expense",
};

type ReviewTabId = "for_review" | "categorized" | "excluded";
type AmountFilter = "all" | "spent" | "received";
type CategorizeBy = "category" | "item";

function hasPersistedMatch(tx: PlaidBankTransaction) {
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

type ViewSettings = {
  showCheckNo: boolean;
  showPayee: boolean;
  showClass: boolean;
  showLocation: boolean;
  /** Flat list (All dates). When true, groupMode is ignored. */
  turnOffGrouping: boolean;
  /** month | money — only applied when turnOffGrouping is false. */
  groupMode: Exclude<BankTxnGroupMode, "none">;
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

export function BankingTransactionsDesignView({
  companyId,
  accounts,
  selectedAccountId,
  onSelectAccount,
  onManageConnections,
  onDataChanged,
  initialTransactionType,
  highlightTransactionId,
}: Props) {
  const { pushToast } = useToast();
  // ACCT-F176 — the GL-posting honesty banner below MUST read this rather than assert a literal.
  // Resolved per entity: the flag's global default is false while every existing company carries an
  // override of true, so a banner written from the default is wrong for every real operator.
  const bankFeedGlFlag = useFeatureFlag("BANK_FEED_GL_POSTING_ENABLED", companyId);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  // DEFECT-7 — the expanded-row "Match candidates" pane. Clicking the Match button expands the row (so
  // matchCandidatesQuery runs) and scrolls this pane into view, surfacing the ranked candidates that were
  // previously only reachable by manually expanding the row.
  const matchPaneRef = useRef<HTMLDivElement | null>(null);
  const [activeReviewTab, setActiveReviewTab] = useState<ReviewTabId>("for_review");
  const [descriptionFilter, setDescriptionFilter] = useState("");
  const [amountFilter, setAmountFilter] = useState<AmountFilter>("all");
  const [selectedTransactionType, setSelectedTransactionType] = useState(initialTransactionType ?? "all");
  // Deep-link / KPI filter must apply after mount — BankingHome sets initialTransactionType via
  // ?type=uncategorized (and similar). Without this sync, the first paint sticks on "all".
  useEffect(() => {
    if (initialTransactionType) {
      setSelectedTransactionType(initialTransactionType);
    }
  }, [initialTransactionType]);
  const [categorizeBy, setCategorizeBy] = useState<CategorizeBy>("category");
  const [showDateFilterMenu, setShowDateFilterMenu] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [collapsedAllGroupings, setCollapsedAllGroupings] = useState(false);
  const [matchSearchAll, setMatchSearchAll] = useState(false);
  const [matchSearchQ, setMatchSearchQ] = useState("");
  const [matchDraftQ, setMatchDraftQ] = useState("");
  const [printDialogOpen, setPrintDialogOpen] = useState(false);
  const [collapsedMonths, setCollapsedMonths] = useState<Record<string, boolean>>({});
  const [viewSettingsOpen, setViewSettingsOpen] = useState(false);
  const [printExportMenuOpen, setPrintExportMenuOpen] = useState(false);
  const [expandedTxId, setExpandedTxId] = useState<string | null>(null);
  useEffect(() => {
    if (highlightTransactionId) setExpandedTxId(highlightTransactionId);
  }, [highlightTransactionId]);
  const [actionMenuTxId, setActionMenuTxId] = useState<string | null>(null);
  const [linkMenuOpen, setLinkMenuOpen] = useState(false);
  const [postingTxId, setPostingTxId] = useState<string | null>(null);
  const [excludingTxId, setExcludingTxId] = useState<string | null>(null);
  const [supersedePendingTx, setSupersedePendingTx] = useState<PlaidBankTransaction | null>(null);
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
  // ACCT-F5621 — the transaction whose attachments/notes drawer is currently open. Replaces the two
  // permanently-disabled paperclip/note icons now that bank_transaction is an attachable entity_type
  // and a real notes PATCH route exists (see BankTransactionAttachmentsNotesModal.tsx).
  const [attachNotesTx, setAttachNotesTx] = useState<PlaidBankTransaction | null>(null);
  // PLUS-DRIVER-MONEY: nested "+ Create driver" from the categorization row's Driver picker.
  // Bulk categorize-to-account (QBO parity): the operator multi-selects for-review rows, picks ONE GL
  // account, and the real POST /banking/transactions/categorize-bulk applies it. No new GL math — the
  // chosen COA account IS the category, exactly like the single-row Post.
  const [bulkCategorizeOpen, setBulkCategorizeOpen] = useState(false);
  const [bulkCategorizeAccountId, setBulkCategorizeAccountId] = useState<string>("");
  const [bulkCategorizeBusy, setBulkCategorizeBusy] = useState(false);

  const [viewSettings, setViewSettings] = useState<ViewSettings>({
    showCheckNo: false,
    showPayee: false,
    showClass: false,
    showLocation: false,
    turnOffGrouping: false,
    groupMode: "month",
    showAmountsInOneColumn: false,
    showTagsField: true,
    editableDateField: false,
    showBankDetails: true,
    copyBankDetailToMemo: false,
    enableSuggestedCategorization: true,
    pageSize: 50,
  });

  const isRelayWalletAccount = useMemo(() => {
    const a = accounts.find((x) => x.id === selectedAccountId);
    const name = (a?.account_name ?? "").trim().toLowerCase();
    return name === "relay fuel wallet";
  }, [accounts, selectedAccountId]);

  const transferAccountsQuery = useQuery({
    queryKey: ["banking", "accounts-all", companyId, "categorize-transfer"],
    queryFn: () => getAllAccounts(companyId),
    enabled: Boolean(companyId),
  });
  const transferBankOptions = useMemo(() => {
    const rows = transferAccountsQuery.data?.accounts ?? [];
    return rows
      .map((row) => {
        const id = String(row.id ?? "");
        const label =
          String(row.display_name ?? row.account_name ?? "").trim() ||
          [row.institution_name, row.account_mask].filter(Boolean).join(" · ") ||
          id;
        return { id, label };
      })
      .filter((r) => r.id.length > 0);
  }, [transferAccountsQuery.data?.accounts]);

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
    queryKey: ["banking", "tx-match-candidates", companyId, expandedTxId ?? "", matchSearchAll, matchSearchQ],
    queryFn: () =>
      getMatchCandidates(String(expandedTxId), companyId, {
        searchAll: matchSearchAll,
        q: matchSearchQ || undefined,
      }),
    enabled: Boolean(companyId && expandedTxId),
  });

  useEffect(() => {
    setMatchSearchAll(false);
    setMatchSearchQ("");
    setMatchDraftQ("");
  }, [expandedTxId]);

  // BLOCK-6b — FORWARD drill-through panel. API + client existed; this wire is the Law §9 surface.
  const categorizationLinksQuery = useQuery({
    queryKey: ["banking", "tx-categorization-links", companyId, expandedTxId ?? ""],
    queryFn: () => getBankTransactionCategorizationLinks(String(expandedTxId), companyId),
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

  // Catalog-linkage pickers (QBO parity). Server-side search + page size 200 — never load 1000/5000
  // into the browser and pretend the roster is complete. Typing refetches; empty query loads first page.
  const [vendorSearch, setVendorSearch] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const PICKER_PAGE = 200;
  const vendorsQuery = useQuery({
    queryKey: ["banking", "tx-vendors", companyId, vendorSearch],
    queryFn: () =>
      listVendors({
        operating_company_id: companyId,
        limit: PICKER_PAGE,
        search: vendorSearch.trim() || undefined,
      }).then((r) => r.vendors ?? []),
    enabled: Boolean(companyId),
    staleTime: 30_000,
  });
  const customersQuery = useQuery({
    queryKey: ["banking", "tx-customers", companyId, customerSearch],
    queryFn: () =>
      listCustomers({
        operating_company_id: companyId,
        limit: PICKER_PAGE,
        search: customerSearch.trim() || undefined,
      }).then((r) => r.customers ?? []),
    enabled: Boolean(companyId),
    staleTime: 30_000,
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
  // Class options for the inline "+ Add new class" ReferenceSelect — same canonical catalogs.classes source
  // (classesCatalogClient) the ItemEditorModal class picker reads, so a class created inline persists + reappears.
  const classesQuery = useQuery({
    queryKey: ["banking", "tx-classes", companyId],
    queryFn: () =>
      classesCatalogClient
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
        hasPersistedMatch(tx) ||
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

  const [sortBy, setSortBy] = useState<BankTxnSort>({ key: "date", dir: "desc" });
  const toggleSort = (key: BankTxnSort["key"]) =>
    setSortBy((prev) => (prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "date" ? "desc" : "asc" }));
  // Phase B (ParityTable swap): the page still OWNS the sort state (sortBy) and its asc/desc flip —
  // ParityTable runs in controlled + sortMode="external" mode, so header clicks land here and the
  // CI-guarded bankTxnSortGroup pipeline (sort FULL set → group → page) stays the single sorter.
  // Column drag-resize moved from the old TableHeaderCell/useTablePref pair onto ParityTable's
  // built-in enableColumnResize (default ON) with widths persisted under storageKey
  // "banking-transactions" (paritytable:banking-transactions in localStorage).
  const onToggleSortCol = (key: string) => toggleSort(key as BankTxnSort["key"]);

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
          return !tx.matched_kind && !hasPersistedMatch(tx);
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
      if (sortBy.key === "amount") {
        const { spent, received } = spentReceived(tx);
        return received - spent;
      }
      if (sortBy.key === "driver") return String(tx.categorization_driver_id ?? "").toLowerCase();
      if (sortBy.key === "truck") return String(tx.categorization_unit_id ?? "").toLowerCase();
      if (sortBy.key === "load") return String(tx.matched_load_id ?? tx.categorization_load_id ?? "").toLowerCase();
      if (sortBy.key === "fromTo" || sortBy.key === "payee") {
        const d = drafts[tx.id];
        return String(d?.payee || tx.merchant_name || tx.description || "").toLowerCase();
      }
      // Categorize drafts are the live operator fields for these columns (API does not yet
      // persist customer/product/check/location on bank_transactions — sort the draft overlay
      // honestly rather than pretending API fields exist).
      if (sortBy.key === "customer") {
        const d = drafts[tx.id];
        return String(d?.customerProject || d?.customerId || "").toLowerCase();
      }
      if (sortBy.key === "productService") {
        const d = drafts[tx.id];
        return String(d?.productService || "").toLowerCase();
      }
      if (sortBy.key === "checkNo") {
        const d = drafts[tx.id];
        return String(d?.checkNo || "").toLowerCase();
      }
      if (sortBy.key === "className") {
        const d = drafts[tx.id];
        return String(d?.className || tx.plaid_category?.[0] || "").toLowerCase();
      }
      if (sortBy.key === "location") {
        const d = drafts[tx.id];
        return String(d?.location || "").toLowerCase();
      }
      if (sortBy.key === "balance") return 0; // balance uses runningBalanceById post-map; date order preferred
      return tx.transaction_date ?? "";
    };
    return [...filtered].sort((a, b) => {
      const va = sortVal(a);
      const vb = sortVal(b);
      if (va < vb) return -1 * sortDir;
      if (va > vb) return 1 * sortDir;
      return 0;
    });
  }, [activeReviewTab, amountFilter, dateFrom, dateTo, drafts, reviewTabBuckets, selectedTransactionType, sortBy]);

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

  // Audit gap #5 — sort FULL set → group → page (never page-then-group). Month ASC follows date;
  // Money in/out grouping; non-date sort with month mode auto-flattens (group-off when sorting).
  const requestedGroupMode: BankTxnGroupMode = viewSettings.turnOffGrouping ? "none" : viewSettings.groupMode;
  const pagedGroups = useMemo(
    () =>
      buildPagedBankTxnGroups(
        tableRows,
        requestedGroupMode,
        sortBy,
        currentPage,
        viewSettings.pageSize
      ),
    [currentPage, requestedGroupMode, sortBy, tableRows, viewSettings.pageSize]
  );
  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(pagedGroups.totalRows / viewSettings.pageSize) || 1),
    [pagedGroups.totalRows, viewSettings.pageSize]
  );
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pageStartIndex = pagedGroups.pageStartIndex;

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const groupedRows = useMemo(
    () => pagedGroups.groups.map((g) => ({ monthKey: g.key, title: g.title, rows: g.rows })),
    [pagedGroups.groups]
  );
  const pagedRows = useMemo(() => groupedRows.flatMap((g) => g.rows), [groupedRows]);
  const showGroupHeaders = pagedGroups.effectiveMode !== "none";
  const pageRangeStart = pagedGroups.totalRows === 0 ? 0 : pageStartIndex + 1;
  const pageRangeEnd =
    pagedGroups.totalRows === 0 ? 0 : Math.min(pageStartIndex + viewSettings.pageSize, pagedGroups.totalRows);
  // Phase B (ParityTable groupBy wiring): the pipeline already computed each row's band on THIS page
  // (month key or money_in/money_out) — map row id → band key + band key → band title so ParityTable's
  // A2 groupBy can paint the same bands without re-deriving (rows arrive pre-ordered, never re-sorted).
  const rowGroupKeyById = useMemo(() => {
    const map = new Map<string, string>();
    for (const group of groupedRows) {
      for (const tx of group.rows) map.set(tx.id, group.monthKey);
    }
    return map;
  }, [groupedRows]);
  const groupTitleByKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const group of groupedRows) map.set(group.monthKey, group.title);
    return map;
  }, [groupedRows]);
  const bulkSelection = useBulkSelection({
    cap: 200,
    onCapExceeded: (error) => pushToast(error.message, "error"),
  });
  // A5 controlled selection: useBulkSelection stays the source of truth (200 cap + BulkActionBar);
  // ParityTable's checkboxes read/write it through selectedKeys/onSelectionChange.
  const paritySelectedKeys = useMemo(() => [...bulkSelection.selectedIds], [bulkSelection.selectedIds]);
  // A2 controlled collapse: derive the collapsed band-key set from the existing collapse state
  // (collapsedAllGroupings + per-band collapsedMonths) so "Collapse all groupings" keeps working.
  const parityCollapsedKeys = useMemo(
    () =>
      groupedRows
        .filter((group) => collapsedAllGroupings || collapsedMonths[group.monthKey] === true)
        .map((group) => group.monthKey),
    [collapsedAllGroupings, collapsedMonths, groupedRows]
  );

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
      // FIX-04 — do NOT seed From/To with the raw bank description (that was the defect: the column
      // just echoed the description and carried no account). From/To is derived from the REAL accounts
      // by computeFromTo() at render/export time; this field now only holds an explicit operator-typed
      // (or transfer/CC) From/To override.
      fromTo: "",
      fromAccountId: "",
      toAccountId: "",
      accountId: "",
      // 0441-mod8-tx-fields-captured-not-sent — hydrate the persisted capture fields (held migration
      // 202607690000) so a categorized row re-opens with what the operator saved, not blanks.
      className: tx.categorization_class_name ?? "",
      classId: tx.categorization_class_id ?? "",
      location: tx.categorization_location ?? "",
      productService: "",
      itemId: "",
      customerProject: "",
      customerId: "",
      payee: tx.merchant_name || "",
      vendorId: "",
      checkNo: tx.check_number ?? "",
      billable: Boolean(tx.is_billable),
      tags: tx.tags ?? "",
      memo: viewSettings.copyBankDetailToMemo ? description : tx.notes || "",
      driverId: tx.categorization_driver_id ?? "",
      driverName: tx.categorization_driver_name ?? "",
      unitId: tx.categorization_unit_id ?? "",
      unitName: tx.categorization_unit_number ?? "",
      trailerId: tx.categorization_trailer_id ?? "",
      trailerName: tx.categorization_trailer_number ?? "",
      loadId: tx.categorization_load_id ?? tx.matched_load_id ?? "",
      loadName: tx.categorization_load_number ?? "",
      recoverFromDriver: Boolean(tx.categorization_recover_from_driver),
      recoverDeductionType: tx.categorization_recover_deduction_type?.trim() || "fine",
      driverMoneyTreatment: tx.categorization_recover_from_driver ? "recover" : "none",
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

  // FIX-04 — the From/To column names the REAL accounts on each side (QBO register style), not the raw
  // bank description. FROM = the transaction's own bank/cash account (banking.bank_accounts). TO = the
  // categorize draft's chosen side, reusing the SAME draft fields the Category/Payee/Customer columns
  // use: the GL category account (draft.accountId → catalogs.accounts name), else the vendor (payee),
  // else the customer — else an explicit From/To the operator typed (or a transfer/CC target). Money-out
  // reads "BANK → target"; money-in reverses. While uncategorized we show the bank on its known side and
  // an honest "Uncategorized" open side — never a fabricated account. Derives from the draft so it
  // recomputes live as the operator categorizes.
  function bankAccountLabel(tx: PlaidBankTransaction): string {
    const acct = accounts.find((a) => a.id === tx.bank_account_id) ?? selectedAccount;
    return acct?.account_name?.trim() || "Bank account";
  }

  function computeFromTo(tx: PlaidBankTransaction, draft: RowDetailDraft): string {
    // An explicit From/To set by the Transfer / CC-Payment modal already names real accounts — respect it
    // verbatim. (Money-in/out categorization no longer has a free-text From/To input; it derives below.)
    const explicit = draft.fromTo.trim();
    if (explicit) return explicit;
    const bank = bankAccountLabel(tx);
    const glName = draft.accountId
      ? ((coaQuery.data?.accounts ?? []).find((a) => a.id === draft.accountId)?.account_name ?? "").trim()
      : "";
    const target =
      glName ||
      (draft.vendorId ? draft.payee.trim() : "") ||
      (draft.customerId ? draft.customerProject.trim() : "");
    const otherSide = target || "Uncategorized";
    const isMoneyIn = tx.is_credit || Number(tx.amount_cents ?? 0) < 0;
    return isMoneyIn ? `${otherSide} → ${bank}` : `${bank} → ${otherSide}`;
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
      (account?.account_name ? String(account.account_name) : "") ||
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
        // 0441-mod8-tx-fields-captured-not-sent — the panel captured Check no./Class/Location/Billable/
        // Tags but never sent them, so they evaporated on Post. Persisted now (held migration
        // 202607690000). class_id is the catalogs.classes FK the inline "+ Add new class" links.
        check_number: draft.checkNo || undefined,
        class_id: draft.classId || undefined,
        location: draft.location || undefined,
        // Always send the boolean — `|| undefined` would make un-checking Billable unpersistable
        // (backend COALESCE keeps the prior true).
        is_billable: draft.billable,
        tags: draft.tags || undefined,
      });
      pushToast("Transaction posted", "success");
      onDataChanged();
    } catch (error) {
      pushToast(userFacingApiError(error, "Post failed"), "error");
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
      pushToast(userFacingApiError(error, "Exclude failed"), "error");
    } finally {
      setExcludingTxId(null);
    }
  }

  /** 0441-mod8 — QBO parity: ▾ Create backdated check opens the inline categorize panel with check
   * fields + editable date (manual rows only) instead of a toast-only stub. */
  function openBackdatedCheckFlow(tx: PlaidBankTransaction) {
    setActionMenuTxId(null);
    setViewSettings((prev) => ({
      ...prev,
      editableDateField: true,
      showCheckNo: true,
    }));
    setDraft(tx, {
      mode: "categorize",
      transactionType: "Expense",
    });
    setExpandedTxId(tx.id);
  }

  // Shared Excel/CSV export (used by the Print/Export menu and the bulk bar). Called at click time,
  // so the memoized tableRows / runningBalanceById are already initialized.
  async function exportTransactionsToExcel(rows: PlaidBankTransaction[], filename: string) {
    const header = ["Date", "Description", "Spent", "Received", "Balance", "From/To", "Customer", "Product/Service"];
    const lines = rows.map((tx) => {
      const { spent, received } = spentReceived(tx);
      const draft = getDraft(tx);
      const bal = runningBalanceById.get(tx.id);
      return [
        formatBankTransactionDate(tx.transaction_date),
        transactionLabel(tx),
        spent > 0 ? spent / 100 : "",
        received > 0 ? received / 100 : "",
        bal == null ? "" : bal / 100,
        computeFromTo(tx, draft),
        draft.customerProject,
        draft.productService,
      ];
    });
    const buffer = await buildBankingTransactionsXlsx([header, ...lines]);
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
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

  // Bulk categorize (H3): real multi-select categorize-to-account via POST /banking/transactions/
  // categorize-bulk. Opens a picker instead of a fake toast; the chosen COA account IS the category.
  function openBulkCategorize() {
    if (selectedTableRows().length === 0) {
      pushToast("Select transactions to categorize.", "error");
      return;
    }
    setBulkCategorizeAccountId("");
    setBulkCategorizeOpen(true);
  }

  async function confirmBulkCategorize() {
    const rows = selectedTableRows();
    if (rows.length === 0) {
      pushToast("Select transactions to categorize.", "error");
      return;
    }
    const account = (coaQuery.data?.accounts ?? []).find((a) => a.id === bulkCategorizeAccountId);
    if (!account) {
      pushToast("Choose an account to categorize the selected transactions.", "error");
      return;
    }
    const categoryKind =
      (account.account_name ? String(account.account_name) : "") ||
      "Uncategorized";
    setBulkCategorizeBusy(true);
    try {
      const result = await categorizeTransactionsBulk(companyId, {
        transaction_ids: rows.map((tx) => tx.id),
        category_kind: categoryKind,
        gl_account_id: account.id,
      });
      const failed = result.errors?.length ?? 0;
      pushToast(
        failed === 0
          ? `Categorized ${result.categorized_count} transaction(s) to ${categoryKind}.`
          : `Categorized ${result.categorized_count} of ${rows.length}; ${failed} could not be categorized (no longer pending).`,
        result.categorized_count > 0 ? "success" : "error"
      );
      setBulkCategorizeOpen(false);
      bulkSelection.clearSelection();
      onDataChanged();
    } catch (error) {
      pushToast(userFacingApiError(error, "Bulk categorize failed"), "error");
    } finally {
      setBulkCategorizeBusy(false);
    }
  }

  function bulkExport() {
    const rows = selectedTableRows();
    if (rows.length === 0) {
      pushToast("Select transactions to export.", "error");
      return;
    }
    void exportTransactionsToExcel(rows, "banking-transactions-selected.xlsx");
  }

  // Phase B — ParityTable column defs. Sortable keys stay wired through controlled sort
  // (sortKey/sortDirection/onSortChange) + sortMode="external"; the bankTxnSortGroup pipeline
  // owns the actual order. Labels and visibility match the prior TableHeaderCell headers.
  const parityColumns = useMemo((): Array<ParityColumn<PlaidBankTransaction>> => {
    const cols: Array<ParityColumn<PlaidBankTransaction>> = [
      {
        key: "date",
        label: "Date",
        sortable: true,
        className: "font-semibold normal-case text-[10px] uppercase tracking-wide",
        render: (tx) => {
          const expanded = expandedTxId === tx.id;
          if (viewSettings.editableDateField && expanded) {
            return (
              <div onClick={(event: { stopPropagation(): void }) => event.stopPropagation()}>
                <DatePicker
                  value={tx.transaction_date.slice(0, 10)}
                  disabled={!isManualBankTransaction(tx)}
                  className="w-32"
                  onChange={(next) => {
                    if (!next || !isManualBankTransaction(tx) || next === tx.transaction_date.slice(0, 10)) return;
                    void updateBankTransactionDate(tx.id, companyId, next)
                      .then(() => {
                        pushToast("Transaction date updated", "success");
                        void transactionsQuery.refetch();
                      })
                      .catch((error: unknown) => {
                        pushToast(userFacingApiError(error, "Could not update date"), "error");
                      });
                  }}
                />
              </div>
            );
          }
          return formatBankTransactionDate(tx.transaction_date);
        },
      },
      {
        key: "description",
        label: "Full bank description",
        sortable: true,
        className: "font-semibold normal-case text-[10px] uppercase tracking-wide",
        render: (tx) => (
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-gray-900">{transactionLabel(tx)}</p>
              {tx.relay_fuel_lines && tx.relay_fuel_lines.length > 0 ? (
                <p
                  className="mt-0.5 truncate text-[11px] text-gray-500"
                  title={formatRelayFuelBreakdownSummary(tx.relay_fuel_lines, (c) => USD.format(c / 100))}
                >
                  {formatRelayFuelBreakdownSummary(tx.relay_fuel_lines, (c) => USD.format(c / 100))}
                </p>
              ) : null}
              {!isRelayWalletAccount &&
                (tx.categorization_unit_id ||
                  tx.categorization_driver_id ||
                  tx.categorization_load_id ||
                  hasPersistedMatch(tx) ||
                  tx.categorization_trailer_id) && (
                  <div
                    className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px]"
                    onClick={(e: { stopPropagation(): void }) => e.stopPropagation()}
                  >
                    {tx.categorization_unit_id ? (
                      <EntityLink
                        kind="unit"
                        id={tx.categorization_unit_id}
                        label={entityLabel(tx.categorization_unit_number, tx.categorization_unit_id, "Unit")}
                      />
                    ) : null}
                    {tx.categorization_trailer_id ? (
                      <EntityLink
                        kind="trailer"
                        id={tx.categorization_trailer_id}
                        label={entityLabel(tx.categorization_trailer_number, tx.categorization_trailer_id, "Trailer")}
                      />
                    ) : null}
                    {tx.categorization_driver_id ? (
                      <EntityLink
                        kind="driver"
                        id={tx.categorization_driver_id}
                        label={entityLabel(tx.categorization_driver_name, tx.categorization_driver_id, "Driver")}
                      />
                    ) : null}
                    {tx.resolved_load_id ? (
                      <EntityLink
                        kind="load"
                        id={tx.resolved_load_id}
                        label={entityLabel(tx.resolved_load_number, tx.resolved_load_id, "Load")}
                      />
                    ) : null}
                    {tx.matched_settlement_id ? (
                      <EntityLink
                        kind="settlement"
                        id={tx.matched_settlement_id}
                        label={entityLabel(tx.matched_settlement_display_id ?? null, tx.matched_settlement_id, "Settlement")}
                      />
                    ) : null}
                    {/* ACCT-F5153: matched_bill_id was selected server-side but never rendered — the
                        only matched-entity kind on this row with no drill-through at all. */}
                    {tx.matched_bill_id ? (
                      <EntityLink
                        kind="bill"
                        id={tx.matched_bill_id}
                        label={visibleDocumentLabel(tx.matched_bill_number, tx.matched_bill_id, "Bill")}
                      />
                    ) : null}
                    {tx.matched_transfer_id ? (
                      <EntityLink
                        kind="transfer"
                        id={tx.matched_transfer_id}
                        label={entityLabel(tx.matched_transfer_label, tx.matched_transfer_id, "Transfer")}
                      />
                    ) : null}
                    {/* BANK-F-MATCHED-EXPENSE-EMPTY-NUMBER: TEST/TMS expenses often have null
                        expense_number; entityLabel tombstoned a live matched row as "not visible". */}
                    {tx.matched_expense_id ? (
                      <EntityLink
                        kind="expense"
                        id={tx.matched_expense_id}
                        label={visibleDocumentLabel(tx.matched_expense_number, tx.matched_expense_id, "Expense")}
                      />
                    ) : null}
                  </div>
                )}
              {tx.matched_journal_entry_id ? (
                <div
                  className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px]"
                  onClick={(e: { stopPropagation(): void }) => e.stopPropagation()}
                >
                  <EntityLink
                    kind="journal_entry"
                    id={tx.matched_journal_entry_id}
                    label={entityLabel(tx.matched_journal_entry_memo ?? null, tx.matched_journal_entry_id, "Journal entry")}
                    data-testid="bank-txn-je-link"
                  />
                </div>
              ) : null}
            </div>
            <div
              className="inline-flex items-center gap-1 text-gray-500"
              onClick={(e: { stopPropagation(): void }) => e.stopPropagation()}
            >
              <button
                type="button"
                data-testid="bank-txn-attach"
                aria-label="Attachments"
                title="Attachments"
                className="rounded-sm p-1 hover:bg-gray-100"
                onClick={() => setAttachNotesTx(tx)}
              >
                <Paperclip className="h-4 w-4" />
              </button>
              <button
                type="button"
                data-testid="bank-txn-note"
                aria-label="Notes"
                title="Notes"
                className="rounded-sm p-1 hover:bg-gray-100"
                onClick={() => setAttachNotesTx(tx)}
              >
                <MessageSquare className="h-4 w-4" />
              </button>
            </div>
          </div>
        ),
      },
    ];

    if (isRelayWalletAccount) {
      cols.push(
        {
          key: "driver",
          label: "Driver",
          sortable: true,
          className: "font-semibold normal-case text-[10px] uppercase tracking-wide",
          cellClass: "truncate text-gray-700",
          render: (tx) =>
            tx.categorization_driver_id ? (
              <span onClick={(e: { stopPropagation(): void }) => e.stopPropagation()}>
                <EntityLink
                  kind="driver"
                  id={tx.categorization_driver_id}
                  label={entityLabel(tx.categorization_driver_name, tx.categorization_driver_id, "Driver")}
                />
              </span>
            ) : (
              "—"
            ),
        },
        {
          key: "truck",
          label: "Truck",
          sortable: true,
          className: "font-semibold normal-case text-[10px] uppercase tracking-wide",
          cellClass: "truncate text-gray-700",
          render: (tx) =>
            tx.categorization_unit_id ? (
              <span onClick={(e: { stopPropagation(): void }) => e.stopPropagation()}>
                <EntityLink
                  kind="unit"
                  id={tx.categorization_unit_id}
                  label={entityLabel(tx.categorization_unit_number, tx.categorization_unit_id, "Unit")}
                />
              </span>
            ) : (
              "—"
            ),
        },
        {
          key: "load",
          label: "Load",
          sortable: true,
          className: "font-semibold normal-case text-[10px] uppercase tracking-wide",
          cellClass: "truncate text-gray-700",
          render: (tx) =>
            tx.resolved_load_id ? (
              <span onClick={(e: { stopPropagation(): void }) => e.stopPropagation()}>
                <EntityLink
                  kind="load"
                  id={tx.resolved_load_id}
                  label={entityLabel(tx.resolved_load_number, tx.resolved_load_id, "Load")}
                />
              </span>
            ) : (
              "—"
            ),
        }
      );
    }

    if (viewSettings.showAmountsInOneColumn) {
      cols.push({
        key: "amount",
        label: "Amount",
        sortable: true,
        className: "font-semibold normal-case text-[10px] uppercase tracking-wide",
        render: (tx) => {
          const { spent, received } = spentReceived(tx);
          return (
            <span className={spent > 0 ? "text-red-700" : "text-slate-700"}>
              {spent > 0 ? `-${USD.format(spent / 100)}` : received > 0 ? USD.format(received / 100) : "—"}
            </span>
          );
        },
      });
    } else {
      cols.push(
        {
          key: "spent",
          label: "Spent",
          sortable: true,
          className: "font-semibold normal-case text-[10px] uppercase tracking-wide",
          cellClass: "text-red-700",
          render: (tx) => {
            const { spent } = spentReceived(tx);
            return spent > 0 ? USD.format(spent / 100) : "—";
          },
        },
        {
          key: "received",
          label: "Received",
          sortable: true,
          className: "font-semibold normal-case text-[10px] uppercase tracking-wide",
          cellClass: "text-slate-700",
          render: (tx) => {
            const { received } = spentReceived(tx);
            return received > 0 ? USD.format(received / 100) : "—";
          },
        }
      );
    }

    cols.push(
      {
        key: "balance",
        label: "Balance",
        sortable: true,
        className: `font-semibold normal-case text-[10px] uppercase tracking-wide ${sortBy.key !== "date" ? "text-gray-300" : ""}`,
        cellClass: "whitespace-nowrap text-right tabular-nums",
        render: (tx) => {
          const bal = runningBalanceById.get(tx.id);
          return (
            <span
              className={
                sortBy.key !== "date" ? "text-gray-300" : bal != null && bal < 0 ? "text-red-700" : "text-gray-900"
              }
            >
              {bal == null ? "—" : USD.format(bal / 100)}
            </span>
          );
        },
      },
      {
        key: "fromTo",
        label: "From/To",
        sortable: true,
        className: "font-semibold normal-case text-[10px] uppercase tracking-wide",
        cellClass: "truncate text-gray-700",
        render: (tx) => computeFromTo(tx, getDraft(tx)) || "—",
      },
      {
        key: "customer",
        label: "Customer",
        sortable: true,
        className: "font-semibold normal-case text-[10px] uppercase tracking-wide",
        cellClass: "truncate text-gray-700",
        render: (tx) => {
          const draft = getDraft(tx);
          return draft.customerId ? (
            <EntityLink
              kind="customer"
              id={draft.customerId}
              label={entityLabel(draft.customerProject, draft.customerId, "Customer")}
            />
          ) : (
            draft.customerProject || "—"
          );
        },
      },
      {
        key: "productService",
        label: "Product/Service",
        sortable: true,
        className: "font-semibold normal-case text-[10px] uppercase tracking-wide",
        cellClass: "truncate text-gray-700",
        render: (tx) => getDraft(tx).productService || "—",
      }
    );

    if (viewSettings.showCheckNo) {
      cols.push({
        key: "checkNo",
        label: "Check No.",
        sortable: true,
        className: "font-semibold normal-case text-[10px] uppercase tracking-wide",
        cellClass: "truncate text-gray-700",
        render: (tx) => getDraft(tx).checkNo || "—",
      });
    }
    if (viewSettings.showPayee) {
      cols.push({
        key: "payee",
        label: "Payee",
        sortable: true,
        className: "font-semibold normal-case text-[10px] uppercase tracking-wide",
        cellClass: "truncate text-gray-700",
        render: (tx) => {
          const draft = getDraft(tx);
          return draft.vendorId ? (
            <EntityLink
              kind="vendor"
              id={draft.vendorId}
              label={entityLabel(draft.payee, draft.vendorId, "Vendor")}
            />
          ) : (
            draft.payee || "—"
          );
        },
      });
    }
    if (viewSettings.showClass) {
      cols.push({
        key: "className",
        label: "Class",
        sortable: true,
        className: "font-semibold normal-case text-[10px] uppercase tracking-wide",
        cellClass: "truncate text-gray-700",
        render: (tx) => getDraft(tx).className || "—",
      });
    }
    if (viewSettings.showLocation) {
      cols.push({
        key: "location",
        label: "Location",
        sortable: true,
        className: "font-semibold normal-case text-[10px] uppercase tracking-wide",
        cellClass: "truncate text-gray-700",
        render: (tx) => getDraft(tx).location || "—",
      });
    }

    cols.push(
      {
        key: "matchCategorize",
        label: "Match/Categorize",
        sortable: true,
        className: "font-semibold normal-case text-[10px] uppercase tracking-wide",
        render: (tx) => (
          <span className="rounded-sm bg-gray-100 px-2 py-1 text-[11px] text-gray-700">
            {getDraft(tx).mode === "match" ? "Match" : "Categorize"}
          </span>
        ),
      },
      {
        key: "action",
        label: "Action",
        sortable: true,
        className: "font-semibold normal-case text-[10px] uppercase tracking-wide",
        render: (tx) => {
          const menuOpen = actionMenuTxId === tx.id;
          return (
            <div
              className="relative flex items-center justify-end gap-1"
              onClick={(e: { stopPropagation(): void }) => e.stopPropagation()}
            >
              <ActionButton
                className="h-7 px-2 text-[11px]"
                onClick={() => void postTransaction(tx)}
                disabled={postingTxId === tx.id}
              >
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
                    data-testid="action-create-backdated-check"
                    className="block w-full border-b border-gray-100 px-3 py-2 text-left text-xs hover:bg-gray-50"
                    onClick={() => openBackdatedCheckFlow(tx)}
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
                  {tx.source === "plaid" && tx.pending ? (
                    <button
                      type="button"
                      className="block w-full border-t border-gray-100 px-3 py-2 text-left text-xs text-red-700 hover:bg-red-50"
                      onClick={() => {
                        setActionMenuTxId(null);
                        setSupersedePendingTx(tx);
                      }}
                    >
                      Supersede pending duplicate
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        },
      }
    );

    return cols;
  }, [
    actionMenuTxId,
    companyId,
    excludingTxId,
    expandedTxId,
    isRelayWalletAccount,
    postingTxId,
    pushToast,
    runningBalanceById,
    sortBy.key,
    transactionsQuery,
    viewSettings.editableDateField,
    viewSettings.showAmountsInOneColumn,
    viewSettings.showCheckNo,
    viewSettings.showClass,
    viewSettings.showLocation,
    viewSettings.showPayee,
    drafts,
    coaQuery.data?.accounts,
    accounts,
    selectedAccount,
  ]);

  function renderExpandedRegisterRow(tx: PlaidBankTransaction) {
    const { spent, received } = spentReceived(tx);
    const draft = getDraft(tx);
    const links = categorizationLinksQuery.data;
    const matchedJournalEntryId = links?.matched_journal_entry_id ?? tx.matched_journal_entry_id ?? null;
    const hasPersistedLinks = Boolean(
      links &&
        (links.driver_id ||
          links.unit_id ||
          links.trailer_id ||
          links.load_id ||
          links.vendor_id ||
          links.customer_id ||
          links.item_id ||
          links.deduction_id ||
          matchedJournalEntryId)
    );
    return (
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2" data-testid="banking-categorize-expanded-panel">
        <div className="p-1">
          <p className="mb-2 text-xs font-semibold text-gray-900">{transactionLabel(tx)}</p>
          <div
            className="mb-2 rounded-sm border border-slate-200 bg-slate-50 px-2 py-1.5"
            data-testid="banking-tx-categorization-links-panel"
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-700">Linked to (persisted)</p>
            {categorizationLinksQuery.isLoading && expandedTxId === tx.id ? (
              <p className="mt-1 text-xs text-gray-500">Loading linkage…</p>
            ) : null}
            {categorizationLinksQuery.isError && expandedTxId === tx.id ? (
              <p className="mt-1 text-xs text-red-700">Could not load categorization links.</p>
            ) : null}
            {categorizationLinksQuery.isSuccess &&
            expandedTxId === tx.id &&
            !hasPersistedLinks ? (
              <p className="mt-1 text-xs text-slate-700">
                No persisted Driver / Unit / Load / Vendor / Customer / deduction tags on this row yet. Draft fields
                below are not Law §9 links until Post / Categorize commits them.
              </p>
            ) : null}
            {hasPersistedLinks && expandedTxId === tx.id ? (
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs" onClick={(e) => e.stopPropagation()}>
                {links?.driver_id ? (
                  <EntityLink kind="driver" id={links.driver_id} label={entityLabel(links.driver_name, links.driver_id, "Driver")} />
                ) : null}
                {links?.unit_id ? (
                  <EntityLink kind="unit" id={links.unit_id} label={entityLabel(links.unit_number, links.unit_id, "Unit")} />
                ) : null}
                {links?.trailer_id ? (
                  <EntityLink kind="trailer" id={links.trailer_id} label={entityLabel(links.trailer_number, links.trailer_id, "Trailer")} />
                ) : null}
                {links?.load_id ? (
                  <EntityLink kind="load" id={links.load_id} label={entityLabel(links.load_number, links.load_id, "Load")} />
                ) : null}
                {links?.vendor_id ? (
                  <EntityLink kind="vendor" id={links.vendor_id} label={entityLabel(links.vendor_name, links.vendor_id, "Vendor")} />
                ) : null}
                {links?.customer_id ? (
                  <EntityLink kind="customer" id={links.customer_id} label={entityLabel(links.customer_name, links.customer_id, "Customer")} />
                ) : null}
                {links?.item_id ? (
                  <span className="text-gray-700">
                    Item:{" "}
                    <EntityLink
                      kind="catalog_item"
                      id={links.item_id}
                      label={entityLabel(links.item_name, links.item_id, "Item")}
                    />
                  </span>
                ) : null}
                {links?.deduction_id ? (
                  <span className="text-gray-700" title={links.deduction_status ?? undefined}>
                    Deduction:{" "}
                    <EntityLink
                      kind="settlement_deduction"
                      id={links.deduction_id}
                      label={links.deduction_type?.trim() || "Driver deduction"}
                    />{" "}
                    {links.deduction_amount_cents != null
                      ? formatUsdCents(Math.abs(Number(links.deduction_amount_cents)))
                      : ""}
                    {links.deduction_load_id ? (
                      <>
                        {" "}
                        · <EntityLink
                          kind="load"
                          id={links.deduction_load_id}
                          label={entityLabel(links.deduction_load_number, links.deduction_load_id, "Load")}
                        />
                      </>
                    ) : null}
                  </span>
                ) : null}
                {matchedJournalEntryId ? (
                  <EntityLink
                    kind="journal_entry"
                    id={matchedJournalEntryId}
                    label={entityLabel(links?.matched_journal_entry_memo, matchedJournalEntryId, "Journal entry")}
                    data-testid="bank-tx-categorization-je-link"
                  />
                ) : null}
              </div>
            ) : null}
            {categorizationLinksQuery.isSuccess &&
            expandedTxId === tx.id &&
            hasPersistedLinks &&
            !matchedJournalEntryId ? (
              <p className="mt-1 text-xs text-slate-600">
                No <code className="text-[11px]">matched_journal_entry_id</code> on this row yet. That column is set by
                recon Match to an existing JE, or by the flag-gated bank-feed poster (BANK_FEED_GL_POSTING_ENABLED,
                default OFF) — absence is not by itself proof the flag blocked a post.
              </p>
            ) : null}
          </div>
          {viewSettings.showBankDetails ? (
            <div className="mb-2 grid grid-cols-1 gap-1 text-xs text-gray-600 md:grid-cols-2">
              <div>Date: {formatBankTransactionDate(tx.transaction_date)}</div>
              <div>Account: {selectedAccount?.account_name || "—"}</div>
              <div>Spent: {spent > 0 ? USD.format(spent / 100) : "—"}</div>
              <div>Received: {received > 0 ? USD.format(received / 100) : "—"}</div>
            </div>
          ) : null}
          {tx.relay_fuel_lines && tx.relay_fuel_lines.length > 0 ? (
            <div className="mb-2">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-700">
                Fuel breakdown (Relay)
              </p>
              <ul className="space-y-0.5 text-xs text-gray-800">
                {buildRelayFuelBreakdown(tx.relay_fuel_lines).map((row) => (
                  <li key={row.key} className="flex justify-between gap-3 tabular-nums">
                    <span>
                      {row.label}
                      {row.volume_label ? <span className="text-gray-500"> · {row.volume_label}</span> : null}
                    </span>
                    <span>{USD.format(row.amount_cents / 100)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="mb-2 flex items-center gap-2">
            <button
              type="button"
              className={`rounded-sm px-2 py-1 text-xs ${draft.mode === "match" ? "bg-slate-100 text-slate-700" : "bg-gray-100 text-gray-700"}`}
              onClick={() => {
                setDraft(tx, { mode: "match" });
                setExpandedTxId(tx.id);
                requestAnimationFrame(() =>
                  matchPaneRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })
                );
              }}
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
              <div className="mt-0.5" data-testid="banking-categorize-picker-vendor">
                <ReferenceSelect
                  value={draft.vendorId || null}
                  onChange={(vid) => {
                    const v = (vendorsQuery.data ?? []).find((x) => x.id === vid);
                    const vendorAcct =
                      typeof v?.default_expense_account_id === "string" ? v.default_expense_account_id : "";
                    setDraft(tx, {
                      vendorId: vid ?? "",
                      ...(v ? { payee: v.name } : {}),
                      // Option-B: pre-fill GL when empty (user can override before save).
                      accountId: draft.accountId || vendorAcct || "",
                    });
                  }}
                  options={(vendorsQuery.data ?? []).map((v) => ({ value: v.id, label: v.name }))}
                  createKind="vendor"
                  operatingCompanyId={companyId}
                  placeholder="Search payee (vendor)"
                  onSearch={setVendorSearch}
                  loading={vendorsQuery.isFetching}
                  onOptionCreated={(opt) => {
                    void vendorsQuery.refetch();
                    setDraft(tx, { payee: opt.label });
                  }}
                />
              </div>
            </label>
            <label className="text-xs text-gray-600">
              Check No.
              <input
                className="mt-0.5 w-full rounded-sm border border-gray-300 px-2 py-1 text-sm"
                value={draft.checkNo}
                onChange={(event) => setDraft(tx, { checkNo: event.target.value })}
              />
            </label>
            <label className="text-xs text-gray-600 md:col-span-2">
              From/To
              {draft.transactionType === "Transfer" ? (
                <div className="mt-0.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <SelectCombobox
                    className="w-full"
                    aria-label="Transfer from account"
                    value={draft.fromAccountId || selectedAccount?.id || ""}
                    onChange={(event) => {
                      const fromAccountId = event.target.value;
                      const fromLabel =
                        transferBankOptions.find((a) => a.id === fromAccountId)?.label ?? "From";
                      const toLabel =
                        transferBankOptions.find((a) => a.id === draft.toAccountId)?.label ?? "To";
                      setDraft(tx, {
                        fromAccountId,
                        fromTo: draft.toAccountId ? `${fromLabel} → ${toLabel}` : fromLabel,
                      });
                    }}
                  >
                    <option value="">From account…</option>
                    {transferBankOptions.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.label}
                      </option>
                    ))}
                  </SelectCombobox>
                  <SelectCombobox
                    className="w-full"
                    aria-label="Transfer to account"
                    value={draft.toAccountId}
                    onChange={(event) => {
                      const toAccountId = event.target.value;
                      const fromId = draft.fromAccountId || selectedAccount?.id || "";
                      const fromLabel =
                        transferBankOptions.find((a) => a.id === fromId)?.label ?? "From";
                      const toLabel =
                        transferBankOptions.find((a) => a.id === toAccountId)?.label ?? "To";
                      setDraft(tx, {
                        toAccountId,
                        fromTo: toAccountId ? `${fromLabel} → ${toLabel}` : fromLabel,
                      });
                    }}
                  >
                    <option value="">To account…</option>
                    {transferBankOptions
                      .filter((a) => a.id !== (draft.fromAccountId || selectedAccount?.id))
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.label}
                        </option>
                      ))}
                  </SelectCombobox>
                  <button
                    type="button"
                    className="text-left text-[11px] text-slate-600 underline sm:col-span-2"
                    onClick={() => setTransferModalTx(tx)}
                  >
                    Open full Transfer dialog (amount / memo / post)
                  </button>
                </div>
              ) : draft.transactionType === "CC Payment" ? (
                <button
                  type="button"
                  className="mt-0.5 block w-full rounded-sm border border-gray-300 px-2 py-1 text-left text-sm hover:bg-gray-50"
                  onClick={() => setCcPaymentModalTx(tx)}
                >
                  {draft.fromTo || "Select CC payment details…"}
                </button>
              ) : (
                <span
                  className="mt-0.5 block w-full px-2 py-1 text-sm text-gray-500"
                  title="Derived from the category / payee you select — not a free-text field."
                >
                  {computeFromTo(tx, draft) || "Auto — set by the category / payee"}
                </span>
              )}
            </label>
            <label className="text-xs text-gray-600">
              Category (Chart of Accounts)
              <div className="mt-0.5" data-testid="banking-categorize-picker-category">
                <ReferenceSelect
                  value={draft.accountId || null}
                  onChange={(v) => setDraft(tx, { accountId: v ?? "" })}
                  options={(coaQuery.data?.accounts ?? []).map((account) => ({
                    value: account.id,
                    label: account.account_name,
                    type: account.account_type ? String(account.account_type) : undefined,
                  }))}
                  createKind="category"
                  operatingCompanyId={companyId}
                  placeholder="Select category account"
                  onOptionCreated={() => void coaQuery.refetch()}
                />
              </div>
            </label>
            <label className="text-xs text-gray-600">
              Class
              <div className="mt-0.5" data-testid="banking-categorize-picker-class">
                <ReferenceSelect
                  value={draft.classId || null}
                  onChange={(cid) => {
                    const c = (classesQuery.data ?? []).find((x) => x.id === cid);
                    const label = String(c?.display_name ?? "").trim();
                    setDraft(tx, { classId: cid ?? "", ...(label ? { className: label } : {}) });
                  }}
                  options={(classesQuery.data ?? []).map((c: AccountingCatalogRow) => {
                    const label = String(c.display_name ?? "").trim();
                    // Never surface the row UUID as the human label (row 601 / picker law).
                    return {
                      value: c.id,
                      label: label && label !== c.id ? label : "Unnamed class",
                    };
                  })}
                  createKind="class"
                  addNewLabel="+ Add new class"
                  operatingCompanyId={companyId}
                  placeholder="Select class"
                  onOptionCreated={(opt) => {
                    void classesQuery.refetch();
                    setDraft(tx, { className: opt.label });
                  }}
                />
              </div>
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
              <div className="mt-0.5" data-testid="banking-categorize-picker-item">
                <ReferenceSelect
                  value={draft.itemId || null}
                  onChange={(iid) => {
                    const item = (itemsQuery.data ?? []).find((x) => x.id === iid);
                    const m = (item?.metadata ?? {}) as Record<string, unknown>;
                    const itemAccount =
                      (typeof m.default_expense_account_id === "string" && m.default_expense_account_id) ||
                      (typeof m.default_income_account_id === "string" && m.default_income_account_id) ||
                      "";
                    setDraft(tx, {
                      itemId: iid ?? "",
                      ...(item ? { productService: item.display_name ?? "" } : {}),
                      accountId: draft.accountId || (itemAccount as string) || "",
                    });
                  }}
                  options={(itemsQuery.data ?? []).map((it: AccountingCatalogRow) => ({
                    value: it.id,
                    label: it.display_name,
                  }))}
                  createKind="service"
                  addNewLabel="+ Add new product/service"
                  operatingCompanyId={companyId}
                  placeholder="Select item"
                  onOptionCreated={(opt) => {
                    void itemsQuery.refetch();
                    setDraft(tx, { productService: opt.label });
                  }}
                />
              </div>
            </label>
            <label className="text-xs text-gray-600">
              Customer/project
              <div className="mt-0.5" data-testid="banking-categorize-picker-customer">
                <ReferenceSelect
                  value={draft.customerId || null}
                  onChange={(cid) => {
                    const c = (customersQuery.data ?? []).find((x) => x.id === cid);
                    setDraft(tx, { customerId: cid ?? "", customerProject: c?.name ?? "" });
                  }}
                  options={(customersQuery.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
                  createKind="customer"
                  operatingCompanyId={companyId}
                  placeholder="Search customer"
                  onSearch={setCustomerSearch}
                  loading={customersQuery.isFetching}
                  onOptionCreated={(opt) => {
                    void customersQuery.refetch();
                    setDraft(tx, { customerProject: opt.label });
                  }}
                />
              </div>
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
          <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-4">
            <div className="text-xs text-gray-600">
              Driver
              <div className="mt-0.5">
                <DriverAutocomplete
                  companyId={companyId}
                  value={draft.driverId}
                  onChange={(driverId, driverName, meta) => {
                    const driverAcct =
                      typeof meta?.default_expense_account_id === "string"
                        ? meta.default_expense_account_id
                        : "";
                    setDraft(tx, {
                      driverId,
                      driverName: driverName ?? "",
                      // ACCT-F18 Option-B: pre-fill categorize account when empty (never auto-post).
                      accountId: draft.accountId || driverAcct || "",
                    });
                  }}
                  onRequestCreate={() => {}}
                />
              </div>
              {draft.driverId ? (
                <div className="mt-0.5 flex items-center gap-2 text-[11px]">
                  <EntityLink kind="driver" id={draft.driverId} label={entityLabel(draft.driverName, draft.driverId, "Driver")} />
                  <button
                    type="button"
                    className="text-slate-700 underline"
                    onClick={() =>
                      setDraft(tx, {
                        driverId: "",
                        driverName: "",
                        recoverFromDriver: false,
                        driverMoneyTreatment: "none",
                      })
                    }
                  >
                    Clear
                  </button>
                </div>
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
                <div className="mt-0.5 flex items-center gap-2 text-[11px]">
                  <EntityLink kind="unit" id={draft.unitId} label={entityLabel(draft.unitName, draft.unitId, "Unit")} />
                  <button
                    type="button"
                    className="text-slate-700 underline"
                    onClick={() => setDraft(tx, { unitId: "", unitName: "" })}
                  >
                    Clear
                  </button>
                </div>
              ) : null}
            </div>
            <div className="text-xs text-gray-600">
              Trailer
              <div className="mt-0.5">
                <EntityPicker
                  kind="trailer"
                  operatingCompanyId={companyId}
                  value={draft.trailerId || null}
                  onChange={(trailerId) => setDraft(tx, { trailerId: trailerId ?? "", trailerName: "" })}
                  placeholder="Search trailer (optional)"
                  allowClear
                />
              </div>
              {draft.trailerId ? (
                <div className="mt-0.5 flex items-center gap-2 text-[11px]">
                  <EntityLink kind="trailer" id={draft.trailerId} label={entityLabel(draft.trailerName, draft.trailerId, "Trailer")} />
                  <button
                    type="button"
                    className="text-slate-700 underline"
                    onClick={() => setDraft(tx, { trailerId: "", trailerName: "" })}
                  >
                    Clear
                  </button>
                </div>
              ) : null}
            </div>
            <div className="text-xs text-gray-600">
              Trip (load)
              <div className="mt-0.5">
                <EntityPicker
                  kind="load"
                  operatingCompanyId={companyId}
                  value={draft.loadId || null}
                  onChange={(loadId) => setDraft(tx, { loadId: loadId ?? "", loadName: "" })}
                  placeholder="Search trip / load (optional)"
                  allowClear
                />
              </div>
              {draft.loadId ? (
                <div className="mt-0.5 flex items-center gap-2 text-[11px]">
                  <EntityLink kind="load" id={draft.loadId} label={entityLabel(draft.loadName, draft.loadId, "Load")} />
                  <button
                    type="button"
                    className="text-slate-700 underline"
                    onClick={() => setDraft(tx, { loadId: "", loadName: "" })}
                  >
                    Clear
                  </button>
                </div>
              ) : null}
            </div>
          </div>
          {!tx.is_credit && draft.mode === "categorize" ? (
            <div
              className="mt-2 border-t border-slate-400 pt-2"
              data-testid="banking-driver-money-treatment"
            >
              <p className="text-xs font-semibold text-slate-900">Driver expense treatment</p>
              <p className="mt-0.5 text-[11px] text-slate-600">
                Paid a fine or cost for a driver without creating an expense first? Choose recoverable (deduct on
                settlement) or payable (company owes the driver — posts to Driver Advance / Employee Loan when
                enabled).
              </p>
              <div
                className="mt-2 rounded-sm border border-slate-300 bg-slate-50 px-2 py-1.5"
                data-testid="bank-categorize-recover-box"
              >
                <label className="flex items-start gap-2 text-xs text-gray-800">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={draft.recoverFromDriver}
                    disabled={!draft.driverId}
                    onChange={(event) =>
                      setDraft(tx, {
                        recoverFromDriver: event.target.checked,
                        driverMoneyTreatment: event.target.checked ? "recover" : "none",
                      })
                    }
                  />
                  <span>
                    <span className="font-semibold">Recover from driver</span> on settlement (deduction / liability)
                  </span>
                </label>
                {!draft.driverId ? (
                  <p className="mt-1 text-[11px] text-slate-700">Tag a driver above to enable recovery</p>
                ) : null}
              </div>
              <fieldset className="mt-2 space-y-1.5">
                <label className="flex items-start gap-2 text-xs text-gray-800">
                  <input
                    type="radio"
                    name={`driver-money-${tx.id}`}
                    className="mt-0.5"
                    checked={draft.driverMoneyTreatment === "none"}
                    onChange={() =>
                      setDraft(tx, { driverMoneyTreatment: "none", recoverFromDriver: false })
                    }
                  />
                  <span>Standard tag only — no recovery or advance</span>
                </label>
                <label className="flex items-start gap-2 text-xs text-gray-800">
                  <input
                    type="radio"
                    name={`driver-money-${tx.id}`}
                    className="mt-0.5"
                    checked={draft.driverMoneyTreatment === "recover"}
                    onChange={() =>
                      setDraft(tx, { driverMoneyTreatment: "recover", recoverFromDriver: true })
                    }
                  />
                  <span>
                    <span className="font-semibold">Recoverable</span> — auto-deduct from driver on settlement
                    (creates pending deduction / liability)
                  </span>
                </label>
                <label className="flex items-start gap-2 text-xs text-gray-800">
                  <input
                    type="radio"
                    name={`driver-money-${tx.id}`}
                    className="mt-0.5"
                    checked={draft.driverMoneyTreatment === "payable"}
                    onChange={() =>
                      setDraft(tx, { driverMoneyTreatment: "payable", recoverFromDriver: false })
                    }
                  />
                  <span>
                    <span className="font-semibold">Payable to driver</span> — company owes driver; select Driver
                    Advance or Employee Loan in Category above
                  </span>
                </label>
              </fieldset>
              {draft.driverMoneyTreatment === "recover" ? (
                <label className="mt-2 block text-xs text-gray-600">
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
              {!draft.driverId ? (
                <p className="mt-1.5 text-[11px] text-slate-700">
                  Select a driver above before Post — recovery and payable paths require a driver tag.
                </p>
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
          <div className="mt-2 flex items-center justify-between gap-2">
            <Button type="button" variant="secondary" onClick={() => setSplitTx(tx)}>
              Split
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={() => setExpandedTxId(null)}>
                Cancel
              </Button>
              <Button type="button" onClick={() => void postTransaction(tx)} disabled={postingTxId === tx.id}>
                {postingTxId === tx.id ? "Posting..." : "Post"}
              </Button>
            </div>
          </div>
        </div>

        <div ref={matchPaneRef} className="border-t border-gray-200 pt-2 lg:border-t-0 lg:border-l lg:pl-3 lg:pt-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Match candidates</p>
          <p className="mt-0.5 text-[11px] text-gray-500">
            Recommended matches (±7 days) from live ledger data. If none fit, Search all like QuickBooks.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <input
              type="search"
              value={matchDraftQ}
              onChange={(e) => setMatchDraftQ(e.target.value)}
              placeholder="Search payee, memo, ref…"
              className="h-7 min-w-[140px] flex-1 rounded-sm border border-gray-300 px-2 text-xs"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setMatchSearchQ(matchDraftQ.trim());
                  setMatchSearchAll(true);
                }
              }}
            />
            <button
              type="button"
              data-testid="inline-match-search-all"
              className={`rounded-sm border px-2 py-1 text-[11px] ${matchSearchAll ? "border-slate-800 bg-slate-900 text-white" : "border-gray-300 text-gray-700"}`}
              onClick={() => {
                setMatchSearchQ(matchDraftQ.trim());
                setMatchSearchAll(true);
              }}
            >
              Search all
            </button>
            <button
              type="button"
              className="rounded-sm border border-gray-300 px-2 py-1 text-[11px] text-gray-700"
              onClick={() => setMatchDrawerTxId(tx.id)}
            >
              Open match drawer
            </button>
          </div>
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
                      <EntityLink
                        kind={MATCH_CANDIDATE_ENTITY_KIND[candidate.ledger_entry_kind]}
                        id={candidate.ledger_entry_id}
                        label={MATCH_CANDIDATE_KIND_LABELS[candidate.ledger_entry_kind]}
                        className="inline-flex items-center rounded-sm border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700 hover:underline"
                      />
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
                      .catch((error) => pushToast(userFacingApiError(error, "Match failed"), "error"));
                  }}
                >
                  {String(suggestion.category ?? suggestion.kind ?? "candidate")} ·{" "}
                  {entityLabel(suggestion.description, suggestion.id, "Transaction")}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {transactionsQuery.isSuccess ? (
        <>
          <div
            className="border-l-4 border-slate-400 bg-slate-100 px-3 py-2 text-xs text-slate-700"
            data-testid="banking-bank-feed-gl-posting-honesty-banner"
          >
            {/*
              ACCT-F176 — this banner used to be a hardcoded <p> asserting the flag "stays OFF by
              default" and that categorizing "does not post a balanced TMS JE". Both sentences were
              literals; the banner never read the flag. Measured on prod 2026-08-07,
              BANK_FEED_GL_POSTING_ENABLED has default_enabled=false but a per-entity override of TRUE
              for USMCA, TRANSP and TRK — i.e. ON in every entity that exists. Categorizing one row
              ($918.00) produced a new balanced JE whose own memo read "Bank categorization … posting".
              An operator trusting the banner and working the queue would have posted a JE per row into
              a live ledger.

              It now reads the resolved per-entity flag and states what is actually true. The three
              branches are deliberate: while the value is unknown it asserts NEITHER direction, because
              a confident wrong answer is what caused this.
            */}
            {bankFeedGlFlag.loading || bankFeedGlFlag.error ? (
              <>
                <p className="font-semibold">
                  Checking whether categorizing posts a journal entry for this company…
                </p>
                <p className="mt-1">
                  <code className="text-[11px]">BANK_FEED_GL_POSTING_ENABLED</code> is resolved per entity and has not
                  been read yet
                  {bankFeedGlFlag.error ? " (the lookup failed)" : ""}. Until it is,{" "}
                  <strong>treat categorizing as if it DOES post</strong> — that is the assumption that cannot cost you
                  an unintended entry.
                </p>
              </>
            ) : bankFeedGlFlag.enabled ? (
              <>
                <p className="font-semibold">
                  Categorizing DOES post a journal entry — <code className="text-[11px]">BANK_FEED_GL_POSTING_ENABLED</code>{" "}
                  is ON for this company
                </p>
                <p className="mt-1">
                  Each row you categorize and post writes a balanced TMS journal entry to the live ledger, stamps{" "}
                  <code className="text-[11px]">matched_journal_entry_id</code> and sets{" "}
                  <code className="text-[11px]">review_state = &apos;matched&apos;</code>. Work the queue deliberately:
                  categorizing every remaining row posts one entry per row. Reverse drill: JE detail Source maps{" "}
                  <code className="text-[11px]">bank_categorization</code> → Banking Transactions.
                </p>
              </>
            ) : (
              <>
                <p className="font-semibold">
                  Categorize tags are not ledger posts —{" "}
                  <code className="text-[11px]">BANK_FEED_GL_POSTING_ENABLED</code> is OFF for this company
                </p>
                <p className="mt-1">
                  Categorize persists driver/unit/load/vendor fields immediately; with the flag off that alone does not
                  post a balanced TMS JE. <code className="text-[11px]">matched_journal_entry_id</code> is{" "}
                  <strong>not</strong> proof that bank-feed GL posting is live — recon Match can also stamp it when{" "}
                  <code className="text-[11px]">ledger_entry_kind = &apos;je&apos;</code> (see{" "}
                  <code className="text-[11px]">match.service.ts</code>), and the flag-gated bank-feed poster is a
                  separate path. A JE link with the flag OFF is a match/link, not “posting is on.” Reverse drill: JE
                  detail Source maps <code className="text-[11px]">bank_categorization</code> → Banking Transactions.
                </p>
              </>
            )}
          </div>
        </>
      ) : null}
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
                  // QBO parity: register?accountId=… pre-bound. Pass the bank account id; AccountRegisterPage
                  // resolves it to Cash/CC GL via GET /banking/accounts/all → ledger_account_id.
                  to={
                    selectedAccount
                      ? `/accounting/account-register?accountId=${encodeURIComponent(selectedAccount.id)}`
                      : "/accounting/account-register"
                  }
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
                .catch((error) => pushToast(userFacingApiError(error, "Upload failed"), "error"));
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
              data-testid="bank-date-filter-button"
            >
              {!dateFrom && !dateTo
                ? "All dates"
                : dateFrom && dateTo
                  ? `${dateFrom} → ${dateTo}`
                  : dateFrom
                    ? `From ${dateFrom}`
                    : `To ${dateTo}`}
            </button>
            {showDateFilterMenu ? (
              <div className="absolute left-0 z-20 mt-1 w-72 rounded-sm border border-gray-200 bg-white p-2 shadow-sm">
                <div className="mb-2 flex flex-wrap gap-1">
                  {(
                    [
                      ["All", () => { setDateFrom(""); setDateTo(""); }],
                      ["Today", () => {
                        const d = new Date();
                        const iso = d.toISOString().slice(0, 10);
                        setDateFrom(iso); setDateTo(iso);
                      }],
                      ["This week", () => {
                        const d = new Date();
                        const day = d.getDay();
                        const start = new Date(d); start.setDate(d.getDate() - ((day + 6) % 7));
                        const end = new Date(start); end.setDate(start.getDate() + 6);
                        setDateFrom(start.toISOString().slice(0, 10));
                        setDateTo(end.toISOString().slice(0, 10));
                      }],
                      ["This month", () => {
                        const d = new Date();
                        const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
                        const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
                        setDateFrom(start.toISOString().slice(0, 10));
                        setDateTo(end.toISOString().slice(0, 10));
                      }],
                      ["Last month", () => {
                        const d = new Date();
                        const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1));
                        const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 0));
                        setDateFrom(start.toISOString().slice(0, 10));
                        setDateTo(end.toISOString().slice(0, 10));
                      }],
                    ] as Array<[string, () => void]>
                  ).map(([label, apply]) => (
                    <button
                      key={label}
                      type="button"
                      className="rounded-sm border border-gray-300 px-1.5 py-0.5 text-[10px] text-gray-700 hover:bg-gray-50"
                      onClick={() => { apply(); setShowDateFilterMenu(false); }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div>
                  <label htmlFor="tx-date-from" className="text-[10px] font-semibold uppercase tracking-[0.4px] text-gray-500">
                    From
                  </label>
                  <DatePicker id="tx-date-from" value={dateFrom} onChange={setDateFrom} className="mt-0.5 w-full" />
                </div>
                <div className="mt-1">
                  <label htmlFor="tx-date-to" className="block text-[10px] font-semibold uppercase tracking-[0.4px] text-gray-500">
                    To
                  </label>
                  <DatePicker id="tx-date-to" value={dateTo} onChange={setDateTo} className="mt-0.5 w-full" />
                </div>
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
          {/* DEFECT-9b + audit gap #5 — QBO grouping: By month | Money in/out | All dates (flat).
          Pipeline sorts the full set, then groups, then pages. Month bands follow date ASC/DESC.
          turnOffGrouping remains the flat-list switch (settings + All dates). */}
          <div className="inline-flex overflow-hidden rounded-sm border border-gray-300 bg-white text-xs">
            <button
              type="button"
              className={`px-2.5 py-1 ${!viewSettings.turnOffGrouping && viewSettings.groupMode === "month" ? "bg-[#1f2a44] text-white" : "text-gray-700"}`}
              onClick={() => setViewSettings((prev) => ({ ...prev, turnOffGrouping: false, groupMode: "month" }))}
            >
              By month
            </button>
            <button
              type="button"
              className={`border-l border-gray-300 px-2.5 py-1 ${!viewSettings.turnOffGrouping && viewSettings.groupMode === "money" ? "bg-[#1f2a44] text-white" : "text-gray-700"}`}
              onClick={() => setViewSettings((prev) => ({ ...prev, turnOffGrouping: false, groupMode: "money" }))}
            >
              Money in/out
            </button>
            <button
              type="button"
              className={`border-l border-gray-300 px-2.5 py-1 ${viewSettings.turnOffGrouping ? "bg-[#1f2a44] text-white" : "text-gray-700"}`}
              onClick={() => setViewSettings((prev) => ({ ...prev, turnOffGrouping: true }))}
            >
              All dates
            </button>
          </div>
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
              {pageRangeStart > 0
                ? `${pageRangeStart}-${pageRangeEnd} of ${pagedGroups.totalRows}`
                : `0 of ${pagedGroups.totalRows}`}
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
                  <ToggleLine
                    label="Turn off grouping"
                    checked={viewSettings.turnOffGrouping}
                    onChange={(checked) =>
                      setViewSettings((prev) => ({
                        ...prev,
                        turnOffGrouping: checked,
                        groupMode: checked ? prev.groupMode : prev.groupMode === "money" ? "money" : "month",
                      }))
                    }
                  />
                  {!viewSettings.turnOffGrouping ? (
                    <div className="mt-1 flex flex-wrap gap-1 text-xs">
                      <button
                        type="button"
                        className={`rounded-sm border px-2 py-0.5 ${viewSettings.groupMode === "month" ? "border-[#1f2a44] bg-[#1f2a44] text-white" : "border-gray-300 text-gray-700"}`}
                        onClick={() => setViewSettings((prev) => ({ ...prev, groupMode: "month" }))}
                      >
                        By month
                      </button>
                      <button
                        type="button"
                        className={`rounded-sm border px-2 py-0.5 ${viewSettings.groupMode === "money" ? "border-[#1f2a44] bg-[#1f2a44] text-white" : "border-gray-300 text-gray-700"}`}
                        onClick={() => setViewSettings((prev) => ({ ...prev, groupMode: "money" }))}
                      >
                        Money in/out
                      </button>
                    </div>
                  ) : null}
                  <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.4px] text-gray-500">Automation review</p>
                  <label
                    className="inline-flex items-center gap-2 text-xs text-gray-500"
                    data-testid="banking-add-new-vendors-automation-not-wired"
                    title="Bank-feed auto-vendor review automation is not wired yet. Inline + Add new vendor on each categorize row still works via ReferenceSelect."
                  >
                    <input type="checkbox" checked={false} disabled readOnly aria-disabled="true" />
                    Add new vendors (automation — not wired)
                  </label>
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
                      setPrintDialogOpen(true);
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
                      void exportTransactionsToExcel(tableRows, "banking-transactions.xlsx");
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
          {
            id: "categorize",
            label: "Categorize",
            // Categorize-to-account only applies to still-pending (for-review) rows. On the
            // Categorized / Excluded tabs it is honestly disabled with the reason, never a fake action.
            disabled: activeReviewTab !== "for_review",
            title:
              activeReviewTab !== "for_review"
                ? "Bulk categorize applies to for-review transactions only."
                : "Categorize the selected transactions to one account",
            onClick: () => openBulkCategorize(),
          },
          { id: "exclude", label: "Exclude", onClick: () => void bulkExclude() },
          { id: "export", label: "Export Selected", onClick: () => bulkExport() },
        ])}
      />

      <ParityTable
        tableTestId="banking-transactions-parity-table"
        columns={parityColumns}
        rows={pagedRows}
        rowKey={(tx) => tx.id}
        loading={transactionsQuery.isLoading}
        emptyText="No transactions for selected account and filters."
        storageKey="banking-transactions"
        enableColumnResize
        stickyHeader
        selectable
        maxSelectable={200}
        onSelectionCapExceeded={() =>
          pushToast(
            "You can select up to 200 items at a time. Clear some selections and try again.",
            "error"
          )
        }
        selectedKeys={paritySelectedKeys}
        onSelectionChange={(keys) => bulkSelection.setSelectedIds(new Set(keys))}
        sortKey={sortBy.key}
        sortDirection={sortBy.dir}
        onSortChange={(key, direction) => {
          // Preserve the register's date-default (first click on a non-date column starts ASC;
          // first click on date starts DESC) — ParityTable's default toggle is always ASC-first,
          // so when the key changes we re-apply the register convention via toggleSort.
          if (key === sortBy.key) {
            setSortBy({ key: key as BankTxnSort["key"], dir: direction });
          } else {
            onToggleSortCol(key);
          }
        }}
        sortMode="external"
        page={safeCurrentPage}
        onPageChange={setCurrentPage}
        pageSize={pagedRows.length || viewSettings.pageSize}
        hidePager
        expandedKeys={expandedTxId ? [expandedTxId] : []}
        onExpandedChange={(keys) => setExpandedTxId(keys[0] ?? null)}
        expandMode="single"
        renderExpanded={renderExpandedRegisterRow}
        onRowClick={(tx) => setExpandedTxId((cur) => (cur === tx.id ? null : tx.id))}
        groupBy={
          showGroupHeaders
            ? {
                getKey: (tx) => rowGroupKeyById.get(tx.id) ?? "all",
                renderHeader: (key, rows) => (
                  <span className="text-xs font-semibold text-gray-700">
                    {groupTitleByKey.get(key) ?? key} ({rows.length})
                  </span>
                ),
                collapsible: true,
                collapsedKeys: parityCollapsedKeys,
                onCollapsedChange: (keys) => {
                  const next: Record<string, boolean> = {};
                  for (const key of keys) next[key] = true;
                  setCollapsedMonths(next);
                  setCollapsedAllGroupings(
                    groupedRows.length > 0 && keys.length >= groupedRows.length
                  );
                },
              }
            : undefined
        }
      />

      <ConfirmModal
        open={Boolean(supersedePendingTx)}
        title="Supersede Plaid pending duplicate"
        message="This preserves the pending row as voided evidence and links it to the one exact posted Plaid candidate on the same account, amount, direction, and seven-day window. It fails without exactly one safe candidate."
        confirmLabel="Supersede pending row"
        danger
        onClose={() => setSupersedePendingTx(null)}
        onConfirm={async () => {
          if (!supersedePendingTx) return;
          try {
            await supersedePlaidPendingTransaction(supersedePendingTx.id, companyId);
            pushToast("Pending Plaid duplicate superseded", "success");
            onDataChanged();
          } catch (error) {
            pushToast(userFacingApiError(error, "Could not supersede pending duplicate"), "error");
            throw error;
          }
        }}
      />

      <BankTransactionSplitModal
        open={Boolean(splitTx)}
        companyId={companyId}
        transaction={splitTx ? { id: splitTx.id, amount_cents: splitTx.amount_cents, is_credit: splitTx.is_credit, description: transactionLabel(splitTx) } : null}
        onClose={() => setSplitTx(null)}
        onSaved={() => onDataChanged()}
      />
      {/* HELD financial-actions wiring — reuses the orphaned MatchDrawer (getMatchCandidates +
      acceptBankReconMatch, already gated) instead of inventing a second match/accept flow. */}
      <PrintOrientationDialog
        open={printDialogOpen}
        title="Print bank transactions"
        onCancel={() => setPrintDialogOpen(false)}
        onConfirm={(orientation) => {
          setPrintDialogOpen(false);
          const esc = (v: unknown) =>
            String(v ?? "—")
              .replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;")
              .replace(/"/g, "&quot;");
          const rowsHtml = tableRows
            .map((tx) => {
              const { spent, received } = spentReceived(tx);
              return `<tr>
                <td>${esc(formatBankTransactionDate(tx.transaction_date))}</td>
                <td>${esc(transactionLabel(tx))}</td>
                <td style="text-align:right">${esc(spent > 0 ? formatUsdCents(spent) : "")}</td>
                <td style="text-align:right">${esc(received > 0 ? formatUsdCents(received) : "")}</td>
              </tr>`;
            })
            .join("");
          printLetterHtml({
            title: `Bank transactions — ${selectedAccount?.account_name ?? "all accounts"}`,
            orientation,
            bodyHtml: `
              <h1>Bank transactions</h1>
              <div class="meta">${esc(selectedAccount?.account_name ?? "All accounts")} · tab ${esc(
                activeReviewTab,
              )} · ${esc(orientation)} · printed ${esc(new Date().toLocaleString())}</div>
              <table>
                <thead>
                  <tr>
                    <th>Date</th><th>Description</th>
                    <th style="text-align:right">Spent</th>
                    <th style="text-align:right">Received</th>
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
      <MatchDrawer
        open={Boolean(matchDrawerTxId)}
        bankTransactionId={matchDrawerTxId}
        bankTransactionLabel={(() => {
          const sourceTransaction = scopedRows.find((tx) => tx.id === matchDrawerTxId);
          return sourceTransaction ? transactionLabel(sourceTransaction) : null;
        })()}
        operatingCompanyId={companyId}
        onClose={() => setMatchDrawerTxId(null)}
        onAccepted={() => onDataChanged()}
      />
      {/* Bulk categorize-to-account modal — real POST /banking/transactions/categorize-bulk (no new GL
      math; the chosen COA account IS the category, same as the single-row Post). */}
      {bulkCategorizeOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Bulk categorize transactions"
        >
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-md bg-white p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">
                Categorize {bulkSelection.selectedIds.size} transaction(s)
              </h2>
              <button
                type="button"
                aria-label="Close"
                className="rounded-sm px-2 py-1 text-gray-500 hover:bg-gray-100"
                onClick={() => setBulkCategorizeOpen(false)}
              >
                ✕
              </button>
            </div>
            <label className="text-xs text-gray-600">
              Category (Chart of Accounts)
              <div className="mt-1">
                <ReferenceSelect
                  value={bulkCategorizeAccountId || null}
                  onChange={(v) => setBulkCategorizeAccountId(v ?? "")}
                  options={(coaQuery.data?.accounts ?? []).map((account) => ({
                    value: account.id,
                    label: account.account_name,
                    type: account.account_type ? String(account.account_type) : undefined,
                  }))}
                  createKind="category"
                  operatingCompanyId={companyId}
                  placeholder="Select category account"
                  onOptionCreated={() => void coaQuery.refetch()}
                />
              </div>
            </label>
            <p className="mt-2 text-[11px] text-gray-500">
              Applies to for-review transactions only. GL posting stays governed by the accounting posting
              flags — this only assigns the category account.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setBulkCategorizeOpen(false)} disabled={bulkCategorizeBusy}>
                Cancel
              </Button>
              <Button
                onClick={() => void confirmBulkCategorize()}
                disabled={bulkCategorizeBusy || !bulkCategorizeAccountId}
              >
                {bulkCategorizeBusy ? "Categorizing..." : "Categorize"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
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
        linkBankTransactionLabel={transferModalTx ? transactionLabel(transferModalTx) : null}
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
        linkBankTransactionLabel={ccPaymentModalTx ? transactionLabel(ccPaymentModalTx) : null}
        onClose={() => setCcPaymentModalTx(null)}
        onSaved={() => {
          setCcPaymentModalTx(null);
          onDataChanged();
        }}
      />
      <BankTransactionAttachmentsNotesModal
        open={Boolean(attachNotesTx)}
        operatingCompanyId={companyId}
        tx={attachNotesTx}
        onClose={() => setAttachNotesTx(null)}
        onNoteSaved={() => {
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
