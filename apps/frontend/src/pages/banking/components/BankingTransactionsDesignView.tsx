import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronRight, Download, MessageSquare, Paperclip, Printer, Settings } from "lucide-react";
import {
  categorizeTransaction,
  getBankingSuggestions,
  getCoaAccounts,
  getPlaidCompanyTransactions,
  skipBankTransactionInvestigation,
  splitTransaction,
  uploadBankStatementCsv,
  type PlaidBankAccount,
  type PlaidBankTransaction,
} from "../../../api/banking";
import { ActionButton } from "../../../components/shared/ActionButton";
import { Button } from "../../../components/Button";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";
import { useToast } from "../../../components/Toast";

type Props = {
  companyId: string;
  accounts: PlaidBankAccount[];
  selectedAccountId: string | null;
  onSelectAccount: (accountId: string) => void;
  onManageConnections: () => void;
  onDataChanged: () => void;
};

type RowDetailDraft = {
  mode: "match" | "categorize";
  transactionType: string;
  fromTo: string;
  accountId: string;
  className: string;
  location: string;
  productService: string;
  customerProject: string;
  payee: string;
  checkNo: string;
  billable: boolean;
  tags: string;
  memo: string;
};

const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const COMPANY_TRANSACTIONS_PAGE_SIZE = 500;
const COMPANY_TRANSACTIONS_MAX_PAGES = 25;

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

async function fetchAllCompanyTransactions(operatingCompanyId: string) {
  const all: PlaidBankTransaction[] = [];
  for (let page = 0; page < COMPANY_TRANSACTIONS_MAX_PAGES; page += 1) {
    const offset = page * COMPANY_TRANSACTIONS_PAGE_SIZE;
    const response = await getPlaidCompanyTransactions(operatingCompanyId, {
      limit: COMPANY_TRANSACTIONS_PAGE_SIZE,
      offset,
      sort: "date_desc",
    });
    const batch = response.transactions ?? [];
    all.push(...batch);
    if (batch.length < COMPANY_TRANSACTIONS_PAGE_SIZE) break;
  }
  return all;
}

export function BankingTransactionsDesignView({
  companyId,
  accounts,
  selectedAccountId,
  onSelectAccount,
  onManageConnections,
  onDataChanged,
}: Props) {
  const { pushToast } = useToast();
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const [activeReviewTab, setActiveReviewTab] = useState<ReviewTabId>("for_review");
  const [descriptionFilter, setDescriptionFilter] = useState("");
  const [amountFilter, setAmountFilter] = useState<AmountFilter>("all");
  const [selectedTransactionType, setSelectedTransactionType] = useState("all");
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
    queryKey: ["banking", "transactions-design", companyId],
    queryFn: () => fetchAllCompanyTransactions(companyId),
    enabled: Boolean(companyId),
  });

  const suggestionsQuery = useQuery({
    queryKey: ["banking", "tx-suggestions", companyId, expandedTxId ?? ""],
    queryFn: () => getBankingSuggestions(String(expandedTxId), companyId),
    enabled: Boolean(companyId && expandedTxId),
  });

  const coaQuery = useQuery({
    queryKey: ["banking", "tx-coa", companyId],
    queryFn: () => getCoaAccounts(),
    enabled: Boolean(companyId),
    staleTime: 120_000,
  });

  const scopedRows = useMemo(() => {
    const rows = transactionsQuery.data ?? [];
    if (!selectedAccount?.id) return rows;
    return rows.filter((tx) => tx.bank_account_id === selectedAccount.id);
  }, [transactionsQuery.data, selectedAccount?.id]);

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

  const tableRows = useMemo(() => {
    const source = reviewTabBuckets[activeReviewTab];
    return source.filter((tx) => {
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
      if (descriptionFilter.trim()) {
        const haystack = `${transactionLabel(tx)} ${tx.notes ?? ""}`.toLowerCase();
        if (!haystack.includes(descriptionFilter.trim().toLowerCase())) return false;
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
  }, [activeReviewTab, amountFilter, dateFrom, dateTo, descriptionFilter, reviewTabBuckets, selectedTransactionType]);

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
      customerProject: "",
      payee: tx.merchant_name || "",
      checkNo: "",
      billable: false,
      tags: "",
      memo: viewSettings.copyBankDetailToMemo ? description : tx.notes || "",
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
    setPostingTxId(tx.id);
    try {
      await categorizeTransaction(tx.id, companyId, {
        action_type: "create_expense",
        payload: {
          memo: draft.memo || undefined,
          account_id: draft.accountId || undefined,
          class_name: draft.className || undefined,
          location: draft.location || undefined,
          product_service: draft.productService || undefined,
          customer_project: draft.customerProject || undefined,
          billable: draft.billable,
          mode: draft.mode,
          categorize_by: categorizeBy,
          from_to: draft.fromTo || undefined,
          transaction_type: draft.transactionType || undefined,
          payee: draft.payee || undefined,
          check_no: draft.checkNo || undefined,
          tags: draft.tags || undefined,
          add_new_vendors: viewSettings.addNewVendors,
        },
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

  return (
    <div className="space-y-3">
      <div className="rounded border border-gray-200 bg-white p-3">
        <div className="flex flex-wrap items-start gap-2">
          {accounts.map((account) => (
            <button
              key={account.id}
              type="button"
              className={`rounded border px-2 py-1 text-left text-xs transition ${
                account.id === selectedAccount?.id
                  ? "border-[#1A1F36] bg-[#1A1F36] text-white"
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
              className="rounded border border-gray-300 px-2 py-1 text-sm font-medium text-gray-800 hover:bg-gray-50"
              onClick={() => setLinkMenuOpen((v) => !v)}
            >
              Link account ▾
            </button>
            {linkMenuOpen ? (
              <div className="absolute right-0 z-20 mt-1 min-w-[220px] rounded border border-gray-200 bg-white shadow-md">
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

      <div className="rounded border border-gray-200 bg-white p-3">
        <div className="mb-2 flex flex-wrap items-center gap-1.5 border-b border-gray-100 pb-2">
          {BANKING_REVIEW_TABS.map((tab) => {
            const count = reviewTabBuckets[tab.id as ReviewTabId]?.length ?? 0;
            const active = activeReviewTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                className={`rounded px-2 py-1 text-xs font-semibold ${
                  active ? "bg-[#1A1F36] text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
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
            className="h-8 min-w-[260px] rounded border border-gray-300 px-2 text-sm"
          />
          <div className="inline-flex overflow-hidden rounded border border-gray-300 bg-white text-xs">
            {(["all", "spent", "received"] as const).map((option) => (
              <button
                key={option}
                type="button"
                className={`px-2.5 py-1 ${option !== "all" ? "border-l border-gray-300" : ""} ${
                  amountFilter === option ? "bg-[#1A1F36] text-white" : "text-gray-700"
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
              className="h-8 rounded border border-gray-300 px-2 text-xs text-gray-700"
              onClick={() => setShowDateFilterMenu((open) => !open)}
            >
              All dates
            </button>
            {showDateFilterMenu ? (
              <div className="absolute left-0 z-20 mt-1 w-64 rounded border border-gray-200 bg-white p-2 shadow">
                <label className="text-[10px] font-semibold uppercase tracking-[0.4px] text-gray-500">
                  From
                  <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="mt-0.5 h-8 w-full rounded border border-gray-300 px-2 text-xs" />
                </label>
                <label className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.4px] text-gray-500">
                  To
                  <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="mt-0.5 h-8 w-full rounded border border-gray-300 px-2 text-xs" />
                </label>
                <button
                  type="button"
                  className="mt-2 rounded border border-gray-300 px-2 py-1 text-xs"
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
            className="h-8 rounded border border-gray-300 px-2 text-xs text-gray-700"
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
            className="h-8 rounded border border-gray-300 px-2 text-xs"
          >
            {TRANSACTION_TYPE_FILTER_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </SelectCombobox>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.4px] text-gray-500">Categorize by</span>
            <div className="inline-flex overflow-hidden rounded border border-gray-300 bg-white text-xs">
              {(["category", "item"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`px-2.5 py-1 ${option === "item" ? "border-l border-gray-300" : ""} ${
                    categorizeBy === option ? "bg-[#1A1F36] text-white" : "text-gray-700"
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
            <div className="inline-flex items-center gap-1 rounded border border-gray-300 bg-white px-1 py-0.5 text-xs text-gray-700">
              <button
                type="button"
                className="rounded px-1.5 py-0.5 hover:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-400"
                disabled={safeCurrentPage <= 1}
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              >
                Previous
              </button>
              <span className="px-1 text-gray-500">{`Page ${safeCurrentPage} of ${totalPages}`}</span>
              <button
                type="button"
                className="rounded px-1.5 py-0.5 hover:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-400"
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
                className="h-8 rounded border border-gray-300 px-2 text-gray-700"
                onClick={() => setViewSettingsOpen((open) => !open)}
              >
                <Settings className="h-4 w-4" />
              </button>
              {viewSettingsOpen ? (
                <div className="absolute right-0 z-20 mt-1 w-[360px] rounded border border-gray-200 bg-white p-3 shadow">
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
                        className={`rounded border px-2 py-1 text-xs ${viewSettings.pageSize === size ? "border-[#1A1F36] bg-[#1A1F36] text-white" : "border-gray-300 text-gray-700"}`}
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
                className="h-8 rounded border border-gray-300 px-2 text-gray-700"
                onClick={() => setPrintExportMenuOpen((open) => !open)}
              >
                <Download className="h-4 w-4" />
              </button>
              {printExportMenuOpen ? (
                <div className="absolute right-0 z-20 mt-1 w-44 rounded border border-gray-200 bg-white p-1 shadow">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-gray-50"
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
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-gray-50"
                    onClick={() => {
                      setPrintExportMenuOpen(false);
                      const header = ["Date", "Description", "Spent", "Received", "From/To", "Customer", "Product/Service"];
                      const lines = tableRows.map((tx) => {
                        const { spent, received } = spentReceived(tx);
                        const draft = getDraft(tx);
                        return [
                          formatBankTransactionDate(tx.transaction_date),
                          transactionLabel(tx),
                          spent > 0 ? (spent / 100).toFixed(2) : "",
                          received > 0 ? (received / 100).toFixed(2) : "",
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
                      anchor.download = "banking-transactions.xls";
                      anchor.click();
                      URL.revokeObjectURL(href);
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

      <div className="overflow-x-auto rounded border border-gray-200 bg-white">
        <table className="min-w-[1900px] w-full text-left">
          <thead className="bg-gray-50 text-[10px] font-semibold uppercase tracking-wide text-gray-600">
            <tr>
              <th className="px-2 py-2">☐</th>
              <th className="px-2 py-2">Date</th>
              <th className="px-2 py-2">Full bank description</th>
              {viewSettings.showAmountsInOneColumn ? <th className="px-2 py-2">Amount</th> : <>
                <th className="px-2 py-2">Spent</th>
                <th className="px-2 py-2">Received</th>
              </>}
              <th className="px-2 py-2">From/To</th>
              <th className="px-2 py-2">Customer</th>
              <th className="px-2 py-2">Product/Service</th>
              {viewSettings.showCheckNo ? <th className="px-2 py-2">Check No.</th> : null}
              {viewSettings.showPayee ? <th className="px-2 py-2">Payee</th> : null}
              {viewSettings.showClass ? <th className="px-2 py-2">Class</th> : null}
              {viewSettings.showLocation ? <th className="px-2 py-2">Location</th> : null}
              <th className="px-2 py-2">Match/Categorize</th>
              <th className="px-2 py-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {transactionsQuery.isLoading ? (
              <tr>
                <td className="px-3 py-4 text-sm text-gray-500" colSpan={15}>
                  Loading Plaid transactions...
                </td>
              </tr>
            ) : null}
            {!transactionsQuery.isLoading && pagedRows.length === 0 ? (
              <tr>
                <td className="px-3 py-4 text-sm text-gray-500" colSpan={15}>
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
                      <td colSpan={15} className="px-2 py-1.5">
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
                    <td className="px-2 py-2 align-top">
                      <input type="checkbox" onClick={(e) => e.stopPropagation()} />
                    </td>
                    <td className="px-2 py-2 align-top text-gray-700">
                      {viewSettings.editableDateField && expanded ? (
                        <input
                          type="date"
                          className="h-7 rounded border border-gray-300 px-2 text-xs"
                          value={tx.transaction_date.slice(0, 10)}
                          onClick={(event) => event.stopPropagation()}
                          readOnly
                        />
                      ) : (
                        formatBankTransactionDate(tx.transaction_date)
                      )}
                    </td>
                    <td className="max-w-[760px] px-2 py-2 align-top">
                      <div className="flex items-start justify-between gap-2">
                        <p className="truncate whitespace-nowrap text-gray-900">{transactionLabel(tx)}</p>
                        <div className="inline-flex items-center gap-1 text-gray-500">
                          <Paperclip className="h-4 w-4" />
                          <MessageSquare className="h-4 w-4" />
                        </div>
                      </div>
                    </td>
                    {viewSettings.showAmountsInOneColumn ? (
                      <td className={`px-2 py-2 align-top ${spent > 0 ? "text-red-700" : "text-emerald-700"}`}>
                        {spent > 0 ? `-${USD.format(spent / 100)}` : received > 0 ? USD.format(received / 100) : "—"}
                      </td>
                    ) : (
                      <>
                        <td className="px-2 py-2 align-top text-red-700">{spent > 0 ? USD.format(spent / 100) : "—"}</td>
                        <td className="px-2 py-2 align-top text-emerald-700">{received > 0 ? USD.format(received / 100) : "—"}</td>
                      </>
                    )}
                    <td className="px-2 py-2 align-top text-gray-700">{draft.fromTo || "—"}</td>
                    <td className="px-2 py-2 align-top text-gray-700">{draft.customerProject || "—"}</td>
                    <td className="px-2 py-2 align-top text-gray-700">{draft.productService || "—"}</td>
                    {viewSettings.showCheckNo ? <td className="px-2 py-2 align-top text-gray-700">{draft.checkNo || "—"}</td> : null}
                    {viewSettings.showPayee ? <td className="px-2 py-2 align-top text-gray-700">{draft.payee || "—"}</td> : null}
                    {viewSettings.showClass ? <td className="px-2 py-2 align-top text-gray-700">{draft.className || "—"}</td> : null}
                    {viewSettings.showLocation ? <td className="px-2 py-2 align-top text-gray-700">{draft.location || "—"}</td> : null}
                    <td className="px-2 py-2 align-top">
                      <span className="rounded bg-gray-100 px-2 py-1 text-[11px] text-gray-700">
                        {draft.mode === "match" ? "Match" : "Categorize"}
                      </span>
                    </td>
                    <td className="px-2 py-2 align-top" onClick={(e) => e.stopPropagation()}>
                      <div className="relative flex items-center gap-1">
                        <ActionButton onClick={() => void postTransaction(tx)} disabled={postingTxId === tx.id}>
                          {postingTxId === tx.id ? "Posting..." : "Post"}
                        </ActionButton>
                        <button
                          type="button"
                          className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                          onClick={() => setActionMenuTxId((cur) => (cur === tx.id ? null : tx.id))}
                        >
                          ▾
                        </button>
                        {menuOpen ? (
                          <div className="absolute right-0 top-7 z-20 min-w-[220px] rounded border border-gray-200 bg-white shadow-md">
                            <button
                              type="button"
                              className="block w-full border-b border-gray-100 px-3 py-2 text-left text-xs hover:bg-gray-50"
                              onClick={() => {
                                setActionMenuTxId(null);
                                void splitTransaction(tx.id, companyId, [{ category: "split", amount: Number((tx.amount_cents / 100).toFixed(2)) }])
                                  .then(() => {
                                    pushToast("Split posted as single-line placeholder", "success");
                                    onDataChanged();
                                  })
                                  .catch((error) => pushToast(String((error as Error).message || "Split failed"), "error"));
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
                      <td className="px-3 py-3" colSpan={15}>
                        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                          <div className="rounded border border-gray-200 bg-white p-2">
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
                                className={`rounded px-2 py-1 text-xs ${draft.mode === "match" ? "bg-blue-100 text-blue-900" : "bg-gray-100 text-gray-700"}`}
                                  onClick={() => setDraft(tx, { mode: "match" })}
                              >
                                Match
                              </button>
                              <button
                                type="button"
                                className={`rounded px-2 py-1 text-xs ${draft.mode === "categorize" ? "bg-blue-100 text-blue-900" : "bg-gray-100 text-gray-700"}`}
                                  onClick={() => setDraft(tx, { mode: "categorize" })}
                              >
                                Categorize
                              </button>
                            </div>
                            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                              <label className="text-xs text-gray-600">
                                Transaction type
                                <SelectCombobox className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-sm" value={draft.transactionType} onChange={(event) => setDraft(tx, { transactionType: event.target.value })}>
                                  <option value="Money in">Money in</option>
                                  <option value="Money out">Money out</option>
                                  <option value="Transfer">Transfer</option>
                                  <option value="Expense">Expense</option>
                                </SelectCombobox>
                              </label>
                              <label className="text-xs text-gray-600">
                                Payee
                                <input
                                  className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                                  value={draft.payee}
                                  onChange={(event) => setDraft(tx, { payee: event.target.value })}
                                />
                              </label>
                              <label className="text-xs text-gray-600">
                                Check No.
                                <input
                                  className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                                  value={draft.checkNo}
                                  onChange={(event) => setDraft(tx, { checkNo: event.target.value })}
                                />
                              </label>
                              <label className="text-xs text-gray-600">
                                From/To
                                <input
                                  className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                                  value={draft.fromTo}
                                  onChange={(event) => setDraft(tx, { fromTo: event.target.value })}
                                />
                              </label>
                              <label className="text-xs text-gray-600">
                                Account
                                <SelectCombobox
                                  className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                                  value={draft.accountId}
                                  onChange={(event) => setDraft(tx, { accountId: event.target.value })}
                                >
                                  <option value="">Select account</option>
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
                                  className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                                  value={draft.className}
                                  onChange={(event) => setDraft(tx, { className: event.target.value })}
                                />
                              </label>
                              <label className="text-xs text-gray-600">
                                Location
                                <input
                                  className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                                  value={draft.location}
                                  onChange={(event) => setDraft(tx, { location: event.target.value })}
                                />
                              </label>
                              <label className="text-xs text-gray-600">
                                Product/Service
                                <input
                                  className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                                  value={draft.productService}
                                  onChange={(event) => setDraft(tx, { productService: event.target.value })}
                                />
                              </label>
                              <label className="text-xs text-gray-600">
                                Customer/project
                                <input
                                  className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                                  value={draft.customerProject}
                                  onChange={(event) => setDraft(tx, { customerProject: event.target.value })}
                                />
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
                            <label className="mt-2 block text-xs text-gray-600">
                              Memo
                              <textarea
                                className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                                rows={3}
                                value={draft.memo}
                                onChange={(event) => setDraft(tx, { memo: event.target.value })}
                              />
                            </label>
                            {viewSettings.showTagsField ? (
                              <label className="mt-2 block text-xs text-gray-600">
                                Tags
                                <input
                                  className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                                  value={draft.tags}
                                  onChange={(event) => setDraft(tx, { tags: event.target.value })}
                                />
                              </label>
                            ) : null}
                            <div className="mt-2 rounded border border-dashed border-gray-300 bg-gray-50 px-3 py-4 text-center text-xs text-gray-500">
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

                          <div className="rounded border border-gray-200 bg-white p-2">
                            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Match candidates</p>
                            {!viewSettings.enableSuggestedCategorization ? (
                              <p className="mt-2 text-sm text-gray-500">Suggested categorization disabled in view settings.</p>
                            ) : null}
                            {viewSettings.enableSuggestedCategorization && suggestionsQuery.isLoading ? <p className="mt-2 text-sm text-gray-500">Loading suggestions...</p> : null}
                            {viewSettings.enableSuggestedCategorization && !suggestionsQuery.isLoading && (suggestionsQuery.data?.suggestions ?? []).length === 0 ? (
                              <p className="mt-2 text-sm text-gray-500">No match candidates returned.</p>
                            ) : null}
                            <div className="mt-2 space-y-1">
                              {(suggestionsQuery.data?.suggestions ?? []).slice(0, 6).map((suggestion, index) => (
                                <button
                                  key={`${tx.id}-s-${index}`}
                                  type="button"
                                  className="block w-full rounded border border-gray-100 px-2 py-1 text-left text-xs hover:bg-gray-50"
                                  onClick={() => {
                                    void categorizeTransaction(tx.id, companyId, {
                                      action_type: "match",
                                      linked_entity_id: String(suggestion.id ?? ""),
                                      payload: { source: "suggestion" },
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
