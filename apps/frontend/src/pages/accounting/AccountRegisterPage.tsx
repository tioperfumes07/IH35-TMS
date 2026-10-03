import { formatDateUS } from "../../lib/formatDate";
import { formatUsdCents } from "../../lib/money";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { DatePicker } from "../../components/forms/DatePicker";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BankTieoutHeader } from "../../components/banking/BankTieoutHeader";

import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";
import { SelectCombobox } from "../../components/Combobox";
import { ListErrorState } from "../../components/ListErrorState";
import { useToast } from "../../components/Toast";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { listCoaAccountsForJe, listAccountingAuditTrail, type AccountingAuditTrailEvent } from "../../api/accounting";
import { getAllAccounts } from "../../api/banking";
import {
  getAccountRegister,
  toggleAccountRegisterCleared,
  type AccountRegisterReport,
  type AccountRegisterRow,
} from "../../api/account-register";
import { EntityLink } from "../../components/shared/EntityLink";
import { Button } from "../../components/Button";
import { entityLabel } from "../../lib/entity-label";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { useUrlSort } from "../../hooks/useUrlSort";
import { companyToday, monthBoundsIso } from "../../lib/businessDate";
import { ReferenceSelect, type ReferenceOption } from "../../components/parity/ReferenceSelect";
import { coaAccountReferenceOption } from "../../components/parity/referenceOptionLabels";
import { printLetterHtml } from "../../lib/openPrintableDocument";
import { formatAccountDisplayLabel } from "../../lib/show-account-numbers";
import { useShowAccountNumbers } from "../../lib/useShowAccountNumbers";
import { userFacingApiError } from "../../lib/api-error-message";
import { RegisterInlineEditPanel } from "./RegisterInlineEditPanel";

const fmtCents = (cents: number) => formatUsdCents(cents);

/** Bank row shape from GET /api/v1/banking/accounts/all (picker + QBO ?accountId= resolve). */
export type BankRegisterPickerRow = {
  id: string;
  ledger_account_id?: string | null;
  display_name?: string | null;
  account_name?: string | null;
  institution_name?: string | null;
  account_mask?: string | null;
};

/**
 * Resolve a deep-link id to the Cash/CC GL account the register query needs.
 * QBO uses ?accountId= for the bank; TMS banking accounts carry ledger_account_id.
 * If the id is already a CoA/GL id (or an unmapped bank), pass it through unchanged.
 */
export function resolveRegisterAccountId(
  requestedId: string | null | undefined,
  bankAccounts: BankRegisterPickerRow[]
): string {
  const raw = (requestedId ?? "").trim();
  if (!raw) return "";
  const bank = bankAccounts.find((a) => String(a.id) === raw);
  if (bank?.ledger_account_id) return String(bank.ledger_account_id);
  return raw;
}

function bankPickerLabel(a: BankRegisterPickerRow): string {
  const name = String(a.display_name ?? a.account_name ?? a.institution_name ?? "Bank").trim();
  const mask = a.account_mask ? ` ···${String(a.account_mask)}` : "";
  return `${name}${mask}`;
}

// Drill-through: map a register row's source transaction to its REAL detail/source route (all verified to
// exist in routes/manifest.tsx). invoice + customer_payment + bill have true per-id detail; the rest
// resolve to their source module. Falls back to the journal-entries surface for plain JEs / unmapped types.
//
// ACCT-REGISTER-SOURCEROUTE-UUID-REGRESSION: this MUST be called with the raw source_transaction_id
// UUID, never the (now human-readable, since ACCT-F5426) `reference` display field — every route
// below expects the entity's real id, not its bill_number/display_id.
function sourceRoute(
  type: string | null,
  sourceTransactionId: string | null,
  journalEntryId?: string | null,
  expensePaymentType?: string | null,
): string {
  const t = (type ?? "").toLowerCase();
  const reference = sourceTransactionId;
  if (t === "invoice" && reference) return `/accounting/invoices/${reference}`;
  if (t === "customer_payment" && reference) return `/accounting/payments/${reference}`;
  if (t === "bill" && reference) return `/accounting/bills/${reference}`;
  if (t === "bill_payment" && reference) return `/accounting/bill-payments/${reference}`;
  if (t === "bill_payment") return "/accounting/bill-payments";
  // B-1 ORDERS — Check is an expense with payment_type='check'; hop to the check face, not Expense.
  if (t === "expense" && reference && (expensePaymentType ?? "").toLowerCase() === "check") {
    return `/accounting/checks/${reference}`;
  }
  if (t === "expense" && reference) return `/accounting/expenses/${reference}`;
  if (t === "expense") return "/accounting/expenses/list";
  if (t === "bank_deposit" && reference) return `/banking/deposits/${reference}`;
  if (t === "bank_deposit") return "/banking/deposits";
  // B-1 — factoring advance original (EntityLink kind factoring_advance → /factoring/advances/:id).
  if (t === "factoring_advance" && reference) return `/factoring/advances/${reference}`;
  if (t === "factoring_advance") return "/factoring/advances";
  // B-1 — cash / driver advance → cash-advances surface (EntityLink kind cash_advance).
  if ((t === "cash_advance" || t === "driver_advance") && reference) {
    return `/cash-advances?advance_id=${reference}`;
  }
  if (t === "cash_advance" || t === "driver_advance") return "/cash-advances";
  if (t === "settlement" && reference) return `/driver-finance/settlements?settlement_id=${reference}`;
  if (t === "settlement") return "/driver-finance/settlements";
  // Law §9 transfer reverse: banking transfers list (QBO Transfer / fund move).
  if (t === "transfer" && reference) return `/banking/transfers?transfer_id=${reference}`;
  if (t === "transfer") return "/banking/transfers";
  // Law §9 bank reverse: bank_categorization source_transaction_id is the bank txn uuid.
  if (t === "bank_categorization" && reference) return `/banking/transactions?txn_id=${reference}`;
  if (t === "journal_entry" && reference) return `/accounting/journal-entries/${reference}`;
  if (journalEntryId) return `/accounting/journal-entries/${journalEntryId}`;
  return "/accounting/journal-entries";
}

const TRANSACTION_TYPES = [
  "Invoice",
  "Invoice Payment",
  "Bill",
  "Bill Payment",
  "Expense",
  "Check",
  "Journal Entry",
  "Settlement",
  "Transfer",
  "Deposit",
  "Bank Categorization",
  "Cash Advance",
  "Driver Advance",
  "Factoring Advance",
];
// Map the display label back to the stored source_transaction_type the backend filters on.
const TYPE_TO_SOURCE: Record<string, string> = {
  Invoice: "invoice",
  "Invoice Payment": "customer_payment",
  Bill: "bill",
  "Bill Payment": "bill_payment",
  Expense: "expense",
  // B-1 ORDERS — Check filter → BE expense + payment_type='check' (not a separate JE source type).
  Check: "check",
  "Journal Entry": "journal_entry",
  Settlement: "settlement",
  Transfer: "transfer",
  Deposit: "bank_deposit",
  "Bank Categorization": "bank_categorization",
  "Cash Advance": "cash_advance",
  "Driver Advance": "driver_advance",
  "Factoring Advance": "factoring_advance",
};

function applyPreset(preset: string): { from: string; to: string } | null {
  // Company-TZ calendar (America/Chicago) — never UTC toISOString().slice(0,10).
  const today = companyToday();
  const [y, m] = today.split("-").map(Number); // m is 1-based
  switch (preset) {
    case "this_month": {
      const b = monthBoundsIso(today);
      return { from: b.start, to: b.end };
    }
    case "last_month": {
      const ly = m === 1 ? y - 1 : y;
      const lm = m === 1 ? 12 : m - 1;
      const b = monthBoundsIso(`${ly}-${String(lm).padStart(2, "0")}-01`);
      return { from: b.start, to: b.end };
    }
    case "this_quarter": {
      const qStartMonth = Math.floor((m - 1) / 3) * 3 + 1;
      const qEndMonth = qStartMonth + 2;
      const from = `${y}-${String(qStartMonth).padStart(2, "0")}-01`;
      const end = monthBoundsIso(`${y}-${String(qEndMonth).padStart(2, "0")}-01`).end;
      return { from, to: end };
    }
    case "this_year":
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    case "ytd":
      return { from: `${y}-01-01`, to: today };
    default:
      return null;
  }
}

function kpiCard(label: string, value: string, sublabel: string) {
  return (
    <div className="rounded-sm border border-gray-200 bg-white px-3 py-2 border-l-4 border-l-slate-300">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="text-page-title font-semibold text-gray-900">{value}</p>
      <p className="text-xs text-gray-500">{sublabel}</p>
    </div>
  );
}

const inputCls = "h-9 rounded-sm border border-gray-300 px-2 text-xs";

export function AccountRegisterPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [searchParams] = useSearchParams();
  // BANK-SORT-ROLLOUT-ACCT: register column sort persists in URL (?sort=&dir=).
  const { sortKey, sortDirection, onSortChange } = useUrlSort();
  // Deep-link (QBO parity):
  // - CoA "View register" → /accounting/chart-of-accounts/register/:accountId (GL id)
  // - Banking → /accounting/account-register?accountId=<bankAccountId> (resolved via banking API → ledger_account_id)
  // Report drilldowns also pass ?from_date=&to_date=&basis= as query params.
  const { accountId: routeAccountId } = useParams<{ accountId?: string }>();
  const queryAccountId = searchParams.get("accountId");
  const deepLinkAccountId = (routeAccountId ?? queryAccountId ?? "").trim();

  const initial = monthBoundsIso(companyToday());
  const paramFrom = searchParams.get("from_date");
  const paramTo = searchParams.get("to_date");
  const [accountId, setAccountId] = useState(deepLinkAccountId);
  const [fromDate, setFromDate] = useState(paramFrom ?? initial.start);
  const [toDate, setToDate] = useState(paramTo ?? initial.end);
  const [preset, setPreset] = useState(paramFrom ? "custom" : "this_month");
  const [view, setView] = useState<"register" | "audit">("register");

  const [filterOpen, setFilterOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [typeLabel, setTypeLabel] = useState("");
  // B-1 ORDERS filter chips: status (✓ blank/C/R) + payee — client-side on the period report.
  const [payeeFilter, setPayeeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "blank" | "C" | "R">("");
  // B-1c — controlled expand so Cancel can collapse the inline edit panel.
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  // ROUND 83 RULING 1 (owner, verbatim: "I DO NOT LIKE TO SEE THE ACCOUNT NUMBERS SHOWING
  // ANYWHERE... IN FILTERS ADD OPTION TO SHOW") — default OFF, global toggle shared with Chart of
  // Accounts via the same localStorage key (lib/show-account-numbers.ts).
  const [showAccountNumbers, setShowAccountNumbers] = useShowAccountNumbers();

  const bankAccountsQuery = useQuery({
    queryKey: ["banking", "accounts-all", companyId, "register-picker"],
    queryFn: () => getAllAccounts(companyId),
    enabled: Boolean(companyId),
  });

  const accountsQuery = useQuery({
    queryKey: ["coa-accounts", companyId],
    queryFn: () => listCoaAccountsForJe(companyId, { postableOnly: true }),
    enabled: Boolean(companyId),
  });

  const bankPickerRows = useMemo((): BankRegisterPickerRow[] => {
    return (bankAccountsQuery.data?.accounts ?? [])
      .map((row) => {
        const r = row as Record<string, unknown>;
        return {
          id: String(r.id ?? ""),
          ledger_account_id: r.ledger_account_id != null ? String(r.ledger_account_id) : null,
          display_name: r.display_name != null ? String(r.display_name) : null,
          account_name: r.account_name != null ? String(r.account_name) : null,
          institution_name: r.institution_name != null ? String(r.institution_name) : null,
          account_mask: r.account_mask != null ? String(r.account_mask) : null,
        };
      })
      .filter((a) => a.id && a.ledger_account_id);
  }, [bankAccountsQuery.data?.accounts]);

  // Bind deep link (route param or ?accountId=) to the GL id the register API expects.
  useEffect(() => {
    if (!deepLinkAccountId) return;
    const resolved = resolveRegisterAccountId(deepLinkAccountId, bankPickerRows);
    setAccountId(resolved);
  }, [deepLinkAccountId, bankPickerRows]);

  const registerQuery = useQuery({
    queryKey: ["account-register", companyId, accountId, fromDate, toDate, search, typeLabel],
    queryFn: () =>
      getAccountRegister({
        operating_company_id: companyId,
        account_id: accountId,
        from_date: fromDate,
        to_date: toDate,
        search: search.trim() || undefined,
        type: typeLabel ? TYPE_TO_SOURCE[typeLabel] : undefined,
      }),
    enabled: Boolean(companyId && accountId),
  });

  const toggleClearedMutation = useMutation({
    mutationFn: (input: { posting_id: string; cleared: boolean }) =>
      toggleAccountRegisterCleared({
        operating_company_id: companyId,
        posting_id: input.posting_id,
        cleared: input.cleared,
      }),
    onSuccess: (result) => {
      pushToast(result.reconcile_status === "C" ? "Marked cleared (C)" : "Cleared mark removed", "success");
      void queryClient.invalidateQueries({ queryKey: ["account-register", companyId, accountId] });
    },
    onError: (error) => {
      const code = String((error as { body?: { error?: string } })?.body?.error ?? "");
      if (code === "reconcile_status_locked") {
        pushToast("Reconciled (R) is locked — reopen the reconciliation report to change it", "error");
        return;
      }
      if (code === "unmatch_bank_first") {
        pushToast("Unmatch this row in Bank Transactions first", "error");
        return;
      }
      pushToast(userFacingApiError(error, "Could not update cleared mark"), "error");
    },
  });

  const auditQuery = useQuery({
    queryKey: ["account-register-audit", companyId, accountId],
    queryFn: () => listAccountingAuditTrail(companyId, { account_id: accountId, limit: 100 }),
    enabled: Boolean(companyId && accountId && view === "audit"),
  });

  const report: AccountRegisterReport | undefined = registerQuery.data;

  const onPreset = (value: string) => {
    setPreset(value);
    const bounds = applyPreset(value);
    if (bounds) {
      setFromDate(bounds.from);
      setToDate(bounds.to);
    }
  };

  const resetFilters = () => {
    setSearch("");
    setTypeLabel("");
    setPayeeFilter("");
    setStatusFilter("");
    setFilterOpen(false);
  };

  const activeChips = useMemo(() => {
    const chips: Array<{ key: string; label: string; clear: () => void }> = [];
    if (typeLabel) chips.push({ key: "type", label: `Type: ${typeLabel}`, clear: () => setTypeLabel("") });
    if (search.trim()) chips.push({ key: "search", label: `Search: ${search.trim()}`, clear: () => setSearch("") });
    if (payeeFilter.trim()) chips.push({ key: "payee", label: `Payee: ${payeeFilter.trim()}`, clear: () => setPayeeFilter("") });
    if (statusFilter === "blank") chips.push({ key: "status", label: "✓: blank", clear: () => setStatusFilter("") });
    else if (statusFilter === "C" || statusFilter === "R") {
      chips.push({ key: "status", label: `✓: ${statusFilter}`, clear: () => setStatusFilter("") });
    }
    return chips;
  }, [typeLabel, search, payeeFilter, statusFilter]);

  const filteredRows = useMemo(() => {
    const rows = report?.rows ?? [];
    const payeeQ = payeeFilter.trim().toLowerCase();
    return rows.filter((r) => {
      if (payeeQ && !(r.payee ?? "").toLowerCase().includes(payeeQ)) return false;
      if (statusFilter === "blank" && (r.reconcile_status === "C" || r.reconcile_status === "R")) return false;
      if (statusFilter === "C" && r.reconcile_status !== "C") return false;
      if (statusFilter === "R" && r.reconcile_status !== "R") return false;
      return true;
    });
  }, [report?.rows, payeeFilter, statusFilter]);

  const exportCsv = () => {
    if (!report) return;
    const nb = report.account.normal_balance;
    const header = ["Date", "Type", "Ref", "Payee", "Memo", "Account", "Class", "Increase", "Decrease", "Running balance"];
    const lines = filteredRows.map((r) => {
      const increase = nb === "debit" ? r.debit_cents : r.credit_cents;
      const decrease = nb === "debit" ? r.credit_cents : r.debit_cents;
      return [
        r.entry_date,
        r.type,
        r.reference ?? "",
        (r.payee ?? "").replace(/"/g, '""'),
        (r.memo ?? r.description ?? "").replace(/"/g, '""'),
        (r.split_account ?? "").replace(/"/g, '""'),
        (r.class_name ?? "").replace(/"/g, '""'),
        increase ? (increase / 100).toFixed(2) : "",
        decrease ? (decrease / 100).toFixed(2) : "",
        (r.running_balance_cents / 100).toFixed(2),
      ]
        .map((c) => `"${c}"`)
        .join(",");
    });
    const csv = [
      header.join(","),
      `"Opening balance","","","","","","","","","${(report.opening_balance_cents / 100).toFixed(2)}"`,
      ...lines,
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    // ROUND 83 RULING 1 — exports are a named surface; the filename must not leak the account
    // code by default. Name-slug is stable and unambiguous (duplicate account NAMES are now a
    // defect per the same ruling), and respects the toggle same as the on-screen/printed label.
    const fileAcctLabel = showAccountNumbers
      ? report.account.account_code
      : report.account.account_name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    a.download = `account-register-${fileAcctLabel}-${fromDate}_${toDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const accounts = accountsQuery.data?.accounts ?? [];
  // Ledger ids already offered as Bank accounts (avoid duplicate options in the CoA group).
  const bankLedgerIds = useMemo(() => new Set(bankPickerRows.map((b) => String(b.ledger_account_id))), [bankPickerRows]);
  const tieoutBankAccountId = useMemo(() => bankPickerRows.find((b) => String(b.ledger_account_id) === accountId)?.id ?? null, [bankPickerRows, accountId]);
  const coaPickerAccounts = useMemo(
    () => accounts.filter((a) => !bankLedgerIds.has(String(a.id))),
    [accounts, bankLedgerIds]
  );
  const accountOptions = useMemo<ReferenceOption[]>(
    () => [
      ...bankPickerRows.map((account) => ({
        value: String(account.ledger_account_id),
        label: bankPickerLabel(account),
        type: "Bank",
      })),
      ...coaPickerAccounts.map(coaAccountReferenceOption),
    ],
    [bankPickerRows, coaPickerAccounts],
  );
  const normalLabel = report ? (report.account.normal_balance === "debit" ? "Dr" : "Cr") : "";
  const normal: "debit" | "credit" = report?.account.normal_balance ?? "debit";

  // B-1 / QBO register: two visual lines per row — DATE/REF/PAYEE/CLASS/PAYMENT/DEPOSIT/✓/📎/BALANCE
  // over TYPE/ACCOUNT/LOCATION. Line-2 fields also stay as defaultHidden gear columns (guard + chooser).
  // Payment/Deposit derive from normal_balance; running balance is "n/a" when not sorted by date.
  const balanceInDateOrder = !sortKey || sortKey === "entry_date";
  const line2 = (top: ReactNode, bottom: ReactNode) => (
    <div className="flex flex-col gap-0.5 leading-tight" data-b1-two-line="1">
      <div>{top}</div>
      <div className="text-[11px] text-[#6B7280]">{bottom}</div>
    </div>
  );
  const columns: Array<ParityColumn<AccountRegisterRow>> = [
    {
      key: "entry_date",
      label: "Date",
      sortable: true,
      allowWrap: true,
      cellClass: "whitespace-nowrap",
      render: (r) => line2(formatDateUS(r.entry_date), r.type || "—"),
    },
    // LV-REPORTS-BALANCE-SHEET-GL-JE-DRILL: every register row already carries a real
    // journal_entry_id (the row IS a posting on this account's own JE) — it just was never
    // rendered as a link, so Ref No. dead-ended on plain reference text with no way back to the
    // GL entry that produced it. The data was already there; only the render was missing.
    {
      key: "reference",
      label: "Ref No.",
      sortable: true,
      allowWrap: true,
      render: (r) =>
        line2(
          r.journal_entry_id ? (
            <EntityLink
              kind="journal_entry"
              id={r.journal_entry_id}
              label={r.reference?.trim() ? r.reference.trim() : "—"}
            />
          ) : (
            r.reference ?? "—"
          ),
          r.split_account ?? "—"
        ),
    },
    {
      key: "payee",
      label: "Payee",
      sortable: true,
      allowWrap: true,
      // B-1 / QBO §B-1: LOCATION under PAYEE on line 2 (honest "—" when absent).
      render: (r) => line2(r.payee ?? "—", r.location?.trim() || "—"),
    },
    { key: "memo", label: "Memo", sortable: true, defaultHidden: true, render: (r) => r.memo ?? r.description ?? "—" },
    { key: "class_name", label: "Class", sortable: true, render: (r) => r.class_name ?? "—" },
    {
      key: "payment",
      label: "Payment",
      sortable: true,
      className: "text-right",
      cellClass: "text-right tabular-nums",
      sortValue: (r) => (normal === "debit" ? r.debit_cents : r.credit_cents),
      render: (r) => {
        const increase = normal === "debit" ? r.debit_cents : r.credit_cents;
        return increase ? fmtCents(increase) : "";
      },
    },
    {
      key: "deposit",
      label: "Deposit",
      sortable: true,
      className: "text-right",
      cellClass: "text-right tabular-nums",
      sortValue: (r) => (normal === "debit" ? r.credit_cents : r.debit_cents),
      render: (r) => {
        const decrease = normal === "debit" ? r.credit_cents : r.debit_cents;
        return decrease ? fmtCents(decrease) : "";
      },
    },
    {
      key: "cr",
      label: "C/R",
      sortable: true,
      className: "text-center",
      cellClass: "text-center tabular-nums",
      sortValue: (r) => r.reconcile_status || "",
      headerTitle: "✓ blank = unmatched · C = cleared (bank match or manual) · R = reconciled (locked). Click toggles blank↔C.",
      render: (r) => {
        const status = r.reconcile_status || "";
        const busy = toggleClearedMutation.isPending && toggleClearedMutation.variables?.posting_id === r.posting_id;
        return (
          <button
            type="button"
            data-testid="b1-reconcile-toggle"
            data-b1-reconcile-status={status || "blank"}
            data-b1-cleared-by-match={r.cleared_by_bank_match ? "1" : "0"}
            disabled={busy || status === "R"}
            title={
              status === "R"
                ? "Reconciled — locked by a closed reconciliation"
                : status === "C"
                  ? r.cleared_by_bank_match
                    ? "Cleared via bank match — unmatch in Bank Transactions to blank"
                    : "Cleared — click to remove mark"
                  : "Not cleared — click to mark C"
            }
            className={`min-w-[1.5rem] rounded-sm px-1 text-center tabular-nums ${
              status === "R"
                ? "cursor-not-allowed font-semibold text-slate-800"
                : status === "C"
                  ? "text-slate-700 hover:bg-slate-100"
                  : "text-gray-400 hover:bg-slate-100 hover:text-slate-700"
            }`}
            onClick={(e) => {
              e.stopPropagation();
              if (status === "R") {
                pushToast("Reconciled (R) is locked — reopen the reconciliation report to change it", "error");
                return;
              }
              if (status === "C" && r.cleared_by_bank_match) {
                pushToast("Unmatch this row in Bank Transactions first", "error");
                return;
              }
              toggleClearedMutation.mutate({ posting_id: r.posting_id, cleared: status !== "C" });
            }}
          >
            {status || "\u00a0"}
          </button>
        );
      },
    },
    {
      key: "attachment_count",
      label: "📎",
      sortable: true,
      className: "text-center",
      cellClass: "text-center tabular-nums",
      sortValue: (r) => r.attachment_count ?? 0,
      render: (r) => (r.attachment_count > 0 ? String(r.attachment_count) : ""),
    },
    {
      key: "running_balance_cents",
      label: "Balance",
      sortable: true,
      className: "text-right",
      cellClass: "text-right font-medium tabular-nums",
      render: (r) => (balanceInDateOrder ? fmtCents(r.running_balance_cents) : "n/a"),
    },
    { key: "type", label: "Type", sortable: true, defaultHidden: true, render: (r) => r.type },
    { key: "split_account", label: "Account", sortable: true, defaultHidden: true, render: (r) => r.split_account ?? "—" },
    // Location from bank categorization when present — honest "—" otherwise (no fabricated place).
    {
      key: "location",
      label: "Location",
      sortable: true,
      defaultHidden: true,
      sortValue: (r) => r.location ?? "",
      render: (r) => r.location?.trim() || "—",
    },
  ];

  // Audit-history view — display-only ledger audit stream (same shape as the former hand-rolled
  // table markup: When / Action / Journal entry / Dr/Cr / Amount, renderers preserved 1:1).
  const auditColumns: Array<ParityColumn<AccountingAuditTrailEvent>> = [
    {
      key: "occurred_at",
      label: "When",
      cellClass: "whitespace-nowrap",
      render: (e) => new Date(e.occurred_at).toLocaleString(),
    },
    { key: "event_class", label: "Action", render: (e) => e.event_class.replace("accounting.", "") },
    {
      key: "journal_entry_id",
      label: "Journal entry",
      render: (e) => (
        <EntityLink
          kind="journal_entry"
          id={e.journal_entry_id}
          label={entityLabel(e.memo, e.journal_entry_id, "Journal entry")}
        />
      ),
    },
    { key: "debit_or_credit", label: "Dr/Cr", render: (e) => e.debit_or_credit },
    {
      key: "amount_cents",
      label: "Amount",
      className: "text-right",
      cellClass: "text-right tabular-nums",
      render: (e) => fmtCents(e.amount_cents),
    },
  ];

  const printList = () => {
    if (!report) return;
    const esc = (v: unknown) =>
      String(v ?? "—")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    const acct = report.account;
    // ROUND 83 RULING 1 — the printed register is a named surface ("printed documents"); the
    // account CODE must not appear unless the user has the toggle on, same as the on-screen page.
    // account_register.ts's field is `account_code`, not `account_number` -- the helper's shape.
    const acctLabel =
      formatAccountDisplayLabel(
        { account_name: acct.account_name, account_number: acct.account_code },
        { showNumber: showAccountNumbers }
      ) || accountId;
    const nb = acct.normal_balance;
    const rowsHtml = filteredRows
      .map((r) => {
        const increase = nb === "debit" ? r.debit_cents : r.credit_cents;
        const decrease = nb === "debit" ? r.credit_cents : r.debit_cents;
        return `<tr>
          <td>${esc(formatDateUS(r.entry_date))}</td>
          <td>${esc(r.type)}</td>
          <td>${esc(r.reference ?? "—")}</td>
          <td>${esc(r.payee ?? "—")}</td>
          <td>${esc(r.memo ?? r.description ?? "—")}</td>
          <td className="text-right tabular-nums" style="text-align:right">${esc(increase ? fmtCents(increase) : "")}</td>
          <td className="text-right tabular-nums" style="text-align:right">${esc(decrease ? fmtCents(decrease) : "")}</td>
          <td className="text-right tabular-nums" style="text-align:right">${esc(fmtCents(r.running_balance_cents))}</td>
        </tr>`;
      })
      .join("");
    printLetterHtml({
      title: `Account register ${acctLabel}`,
      bodyHtml: `
        <h1>Account register</h1>
        <div class="meta">${esc(acctLabel)} · ${esc(fromDate)} → ${esc(toDate)} · printed ${esc(new Date().toLocaleString())}</div>
        <table>
          <tbody>
            <tr><th>Opening balance</th><td className="text-right tabular-nums">${esc(fmtCents(report.opening_balance_cents))}</td></tr>
            <tr><th>Closing balance</th><td className="text-right tabular-nums">${esc(fmtCents(report.closing_balance_cents))}</td></tr>
            <tr><th>Debits (period)</th><td className="text-right tabular-nums">${esc(fmtCents(report.total_debit_cents))}</td></tr>
            <tr><th>Credits (period)</th><td className="text-right tabular-nums">${esc(fmtCents(report.total_credit_cents))}</td></tr>
          </tbody>
        </table>
        <h1 style="margin-top:20px">Transactions</h1>
        <table>
          <thead>
            <tr>
              <th>Date</th><th>Type</th><th>Ref</th><th>Payee</th><th>Memo</th>
              <th style="text-align:right">Increase</th><th style="text-align:right">Decrease</th>
              <th style="text-align:right">Balance</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      `,
    });
  };

  const kpiStrip = report ? (
    <div className="grid gap-2 md:grid-cols-4" data-b1-register-header="1">
      {kpiCard(
        "Bank balance",
        report.bank_balance_cents != null ? fmtCents(report.bank_balance_cents) : "—",
        "feed (bank connection)"
      )}
      {kpiCard("Ending balance", `${fmtCents(report.closing_balance_cents)} ${normalLabel}`, `book · as of ${report.to_date}`)}
      {kpiCard(
        "Reconciled through",
        report.reconciled_through ? formatDateUS(report.reconciled_through) : "—",
        "last closed statement"
      )}
      {kpiCard("# Transactions", String(report.transaction_count), "in range")}
    </div>
  ) : undefined;

  return (
    <AccountingSubNavWrapper title="Account Register" subtitle="Running-balance ledger over the chart of accounts" kpiStrip={kpiStrip}>
      {/* ROUND 313 BANK-TIEOUT-01: a bank account's GL register leads with its feed-vs-GL tie-out. */}
      {tieoutBankAccountId ? <BankTieoutHeader companyId={companyId} bankAccountId={tieoutBankAccountId} /> : null}
      {/* Primary controls + on-demand filter (collapsed by default) */}
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <div className="flex min-w-[16rem] flex-col gap-1 text-xs font-semibold text-gray-600">
          <span>Account</span>
          <ReferenceSelect
            value={accountId || null}
            onChange={(next) => setAccountId(next ?? "")}
            options={accountOptions}
            createKind="account"
            operatingCompanyId={companyId}
            placeholder="Select an account…"
            disabled={!companyId}
            loading={accountsQuery.isLoading || bankAccountsQuery.isLoading}
            onOptionCreated={() => void accountsQuery.refetch()}
          />
        </div>
        <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
          Period
          <SelectCombobox value={preset} onChange={(e) => onPreset(e.target.value)} className={inputCls}>
            <option value="this_month">This Month</option>
            <option value="last_month">Last Month</option>
            <option value="this_quarter">This Quarter</option>
            <option value="this_year">This Year</option>
            <option value="ytd">Year to Date</option>
            <option value="custom">Custom</option>
          </SelectCombobox>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
          From
          <DatePicker value={fromDate} onChange={(next) => { setFromDate(next); setPreset("custom"); }} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
          To
          <DatePicker value={toDate} onChange={(next) => { setToDate(next); setPreset("custom"); }} className={inputCls} />
        </label>
        <div className="relative">
          {/* UI CONTROL LAW — was a hand-rolled h-9, 13px-text button; already matched the token
              values but bypassed the shared primitive. Now the real Button. */}
          <Button type="button" variant="secondary" size="md" onClick={() => setFilterOpen((o) => !o)}>
            Filter{activeChips.length ? ` (${activeChips.length})` : ""}
          </Button>
          {filterOpen ? (
            <div className="absolute left-0 top-10 z-20 w-72 rounded-sm border border-gray-200 bg-white p-3 shadow-lg">
              <label className="mb-2 flex flex-col gap-1 text-xs font-semibold text-gray-600">
                Transaction type
                <SelectCombobox value={typeLabel} onChange={(e) => setTypeLabel(e.target.value)} className={inputCls}>
                  <option value="">All types</option>
                  {TRANSACTION_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </SelectCombobox>
              </label>
              <label className="mb-2 flex flex-col gap-1 text-xs font-semibold text-gray-600">
                Search memo / reference
                <input value={search} onChange={(e) => setSearch(e.target.value)} className={inputCls} placeholder="memo, description, or ref" />
              </label>
              <label className="mb-2 flex flex-col gap-1 text-xs font-semibold text-gray-600" data-b1-filter-payee="1">
                Payee
                <input
                  value={payeeFilter}
                  onChange={(e) => setPayeeFilter(e.target.value)}
                  className={inputCls}
                  placeholder="vendor, customer, driver…"
                  data-testid="b1-register-filter-payee"
                />
              </label>
              <label className="mb-2 flex flex-col gap-1 text-xs font-semibold text-gray-600" data-b1-filter-status="1">
                ✓ status
                <SelectCombobox
                  value={statusFilter}
                  onChange={(e) => setStatusFilter((e.target.value || "") as "" | "blank" | "C" | "R")}
                  className={inputCls}
                  data-testid="b1-register-filter-status"
                >
                  <option value="">All</option>
                  <option value="blank">Blank</option>
                  <option value="C">C (cleared)</option>
                  <option value="R">R (reconciled)</option>
                </SelectCombobox>
              </label>
              {/* ROUND 83 RULING 1 (owner, verbatim: "IN FILTERS ADD OPTION TO SHOW") — same
                  global toggle as Chart of Accounts, exposed locally too. */}
              <label
                className="mb-2 flex cursor-pointer items-center gap-1.5 rounded-sm border border-gray-300 px-2 py-1 text-xs text-gray-700"
                data-testid="account-register-show-account-numbers-toggle"
                title="Show account numbers in this register (off by default — owner ruling, Round 83)"
              >
                <input
                  type="checkbox"
                  className="rounded-sm border-gray-300"
                  checked={showAccountNumbers}
                  onChange={(event) => setShowAccountNumbers(event.target.checked)}
                />
                Show account numbers
              </label>
              <div className="flex justify-between">
                <button type="button" onClick={resetFilters} className="text-xs font-medium text-gray-500 underline">
                  Reset
                </button>
                <button type="button" onClick={() => setFilterOpen(false)} className="text-xs font-semibold text-slate-700">
                  Done
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {activeChips.length ? (
        <div className="mb-3 flex flex-wrap gap-2">
          {activeChips.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={c.clear}
              aria-label={`Clear ${c.label} filter`}
              className="inline-flex items-center gap-1 rounded-full border border-gray-300 bg-gray-50 px-2 py-0.5 text-[11px] text-gray-700 hover:bg-gray-100"
            >
              {c.label}
              <svg aria-hidden="true" viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3l6 6M9 3l-6 6" strokeLinecap="round" /></svg>
            </button>
          ))}
        </div>
      ) : null}

      {/* Register / Audit tabs */}
      <div className="mb-2 flex gap-1 border-b border-gray-200 text-xs">
        {(["register", "audit"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            className={`px-3 py-1.5 font-semibold ${view === v ? "border-b-2 border-slate-600 text-gray-900" : "text-gray-500"}`}
          >
            {v === "register" ? "Register" : "Audit history"}
          </button>
        ))}
      </div>

      {!accountId ? (
        <p className="rounded-sm border border-gray-200 bg-white px-3 py-6 text-center text-xs text-gray-500">
          Select an account to view its register.
        </p>
      ) : view === "register" && registerQuery.isError ? (
        /* CHAIN-02: a rejected register request (e.g. 400/404) must not leave the table silently blank —
           surface it so the user can correct the account or date range instead of seeing an empty grid. */
        <ListErrorState
          title="Couldn't load the register for this account and date range"
          status={0}
          message="Check the selected account and the From/To dates, then try again."
          onRetry={() => void registerQuery.refetch()}
        />
      ) : view === "register" ? (
        <>
        {/* B-1 — Bank transactions / Reconcile entry points beside the register (QBO header buttons). */}
        <div className="mb-2 flex flex-wrap items-center gap-2" data-b1-register-actions="1">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            data-testid="b1-account-register-bank-transactions"
            onClick={() =>
              navigate(
                report?.bank_account_id
                  ? `/banking/accounts/${report.bank_account_id}`
                  : "/banking/transactions"
              )
            }
          >
            Bank transactions
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            data-testid="b1-account-register-reconcile"
            onClick={() =>
              navigate(
                report?.bank_account_id
                  ? `/banking?tab=reconciliation&accountId=${encodeURIComponent(report.bank_account_id)}&start=1`
                  : "/banking?tab=reconciliation"
              )
            }
          >
            Reconcile
          </Button>
          <span className="text-[11px] text-[#6B7280]">
            ✓ = blank / C / R · Balance runs in date order only (shows n/a when sorted otherwise) · 100 rows/page
          </span>
        </div>
        {/* Opening balance is a running summary, not a paginated row — kept pinned above the table
            (QBO shows it as the first register line; ParityTable's rows are page-sliced, so a summary
            row belongs outside it to stay visible on every page). */}
        <div className="mb-0 flex items-center justify-between rounded-t-md border border-b-0 border-gray-200 bg-gray-50/60 px-2 py-1.5 text-xs text-gray-600">
          <span>Opening balance ({normal === "debit" ? "Dr" : "Cr"})</span>
          <span className="font-medium tabular-nums">{report ? fmtCents(report.opening_balance_cents) : "—"}</span>
        </div>
        <ParityTable
          columns={columns}
          rows={filteredRows}
          rowKey={(r) => r.posting_id}
          loading={registerQuery.isLoading}
          emptyText="No transactions in this range."
          storageKey="account-register"
          pageSizeOptions={[50, 75, 100, 200, 300]}
          initialPageSize={100}
          sortKey={sortKey}
          sortDirection={sortDirection}
          onSortChange={onSortChange}
          // ACCT-F3498: server-bound memo/ref search above — suppress ParityTable toolbar Search.
          suppressToolbarSearch
          tableTestId="b1-account-register"
          // BANK-F91053 — ORDERS §B-1 print/export/gear (column chooser). ParityTable already
          // exposes Memo/Type/Account/Location as defaultHidden gear columns; name the gear so
          // the ORDERS chrome is assertable and clickable beside Export/Print.
          gearButtonTestId="b1-account-register-gear"
          expandOnRowClick
          expandMode="single"
          expandedKeys={expandedKeys}
          onExpandedChange={setExpandedKeys}
          renderExpanded={(r) => (
            <RegisterInlineEditPanel
              row={r}
              companyId={companyId}
              onEditOriginal={() =>
                navigate(
                  sourceRoute(
                    r.source_transaction_type,
                    r.source_transaction_id,
                    r.journal_entry_id,
                    r.expense_payment_type,
                  ),
                )
              }
              onCancel={() => setExpandedKeys((keys) => keys.filter((k) => k !== r.posting_id))}
              onVoided={() => setExpandedKeys((keys) => keys.filter((k) => k !== r.posting_id))}
            />
          )}
          toolbar={
            <>
              {/* BANK-F91054 — ORDERS §B-1 print / export / gear. Labels match the ORDERS chrome
                  ("Export" · "Print"); titles keep the Excel/list affordance. Named for assertability
                  beside gearButtonTestId="b1-account-register-gear". */}
              <Button
                type="button"
                variant="tertiary"
                size="sm"
                onClick={exportCsv}
                disabled={!report || filteredRows.length === 0}
                title="Export to Excel"
                data-testid="b1-account-register-export"
              >
                Export
              </Button>
              <Button
                type="button"
                variant="tertiary"
                size="sm"
                onClick={printList}
                disabled={!report || filteredRows.length === 0}
                title="Print list"
                data-testid="b1-account-register-print"
              >
                Print
              </Button>
            </>
          }
        />
        </>
      ) : auditQuery.isError ? (
        <ListErrorState
          title="Couldn't load audit history"
          status={0}
          message={(auditQuery.error as Error)?.message}
          onRetry={() => void auditQuery.refetch()}
        />
      ) : (
        <ParityTable
          columns={auditColumns}
          rows={auditQuery.data?.events ?? []}
          rowKey={(e) => e.id}
          loading={auditQuery.isLoading}
          emptyText="No audit events for this account."
          storageKey="account-register-audit"
          suppressToolbarSearch
        />
      )}
    </AccountingSubNavWrapper>
  );
}
