import { formatDateUS } from "../../lib/formatDate";
import { formatUsdCents } from "../../lib/money";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { DatePicker } from "../../components/forms/DatePicker";
import { useQuery } from "@tanstack/react-query";

import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";
import { SelectCombobox } from "../../components/shared/SelectCombobox";
import { ListErrorState } from "../../components/ListErrorState";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { listCoaAccountsForJe, listAccountingAuditTrail, type AccountingAuditTrailEvent } from "../../api/accounting";
import { getAllAccounts } from "../../api/banking";
import { getAccountRegister, type AccountRegisterReport, type AccountRegisterRow } from "../../api/account-register";
import { EntityLink } from "../../components/shared/EntityLink";
import { entityLabel } from "../../lib/entity-label";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { useUrlSort } from "../../hooks/useUrlSort";
import { companyToday, monthBoundsIso } from "../../lib/businessDate";
import { ReferenceSelect, type ReferenceOption } from "../../components/parity/ReferenceSelect";
import { coaAccountReferenceOption } from "../../components/parity/referenceOptionLabels";
import { printLetterHtml } from "../../lib/openPrintableDocument";

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
function sourceRoute(type: string | null, sourceTransactionId: string | null): string {
  const t = (type ?? "").toLowerCase();
  const reference = sourceTransactionId;
  if (t === "invoice" && reference) return `/accounting/invoices/${reference}`;
  if (t === "customer_payment" && reference) return `/accounting/payments/${reference}`;
  if (t === "bill" && reference) return `/accounting/bills/${reference}`;
  if (t === "bill_payment" && reference) return `/accounting/bill-payments/${reference}`;
  if (t === "bill_payment") return "/accounting/bill-payments";
  if (t === "expense" && reference) return `/accounting/expenses/${reference}`;
  if (t === "expense") return "/accounting/expenses/list";
  if (t === "settlement" && reference) return `/driver-finance/settlements?settlement_id=${reference}`;
  if (t === "settlement") return "/driver-finance/settlements";
  // Law §9 transfer reverse: banking transfers list (QBO Transfer / fund move).
  if (t === "transfer") return "/banking/transfers";
  // Law §9 bank reverse: bank_categorization source_transaction_id is the bank txn uuid.
  if (t === "bank_categorization" && reference) return `/banking/transactions?txn_id=${reference}`;
  return "/accounting/journal-entries";
}

const TRANSACTION_TYPES = ["Invoice", "Invoice Payment", "Bill", "Bill Payment", "Expense", "Journal Entry", "Settlement", "Transfer"];
// Map the display label back to the stored source_transaction_type the backend filters on.
const TYPE_TO_SOURCE: Record<string, string> = {
  Invoice: "invoice",
  "Invoice Payment": "customer_payment",
  Bill: "bill",
  "Bill Payment": "bill_payment",
  Expense: "expense",
  Settlement: "settlement",
  Transfer: "transfer",
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
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="text-lg font-semibold text-gray-900">{value}</p>
      <p className="text-xs text-gray-500">{sublabel}</p>
    </div>
  );
}

const inputCls = "h-9 rounded-sm border border-gray-300 px-2 text-[13px]";

export function AccountRegisterPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const navigate = useNavigate();
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
    setFilterOpen(false);
  };

  const activeChips = useMemo(() => {
    const chips: Array<{ key: string; label: string; clear: () => void }> = [];
    if (typeLabel) chips.push({ key: "type", label: `Type: ${typeLabel}`, clear: () => setTypeLabel("") });
    if (search.trim()) chips.push({ key: "search", label: `Search: ${search.trim()}`, clear: () => setSearch("") });
    return chips;
  }, [typeLabel, search]);

  const exportCsv = () => {
    if (!report) return;
    const nb = report.account.normal_balance;
    const header = ["Date", "Type", "Ref", "Payee", "Memo", "Account", "Class", "Increase", "Decrease", "Running balance"];
    const lines = report.rows.map((r) => {
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
    a.download = `account-register-${report.account.account_code}-${fromDate}_${toDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const accounts = accountsQuery.data?.accounts ?? [];
  // Ledger ids already offered as Bank accounts (avoid duplicate options in the CoA group).
  const bankLedgerIds = useMemo(() => new Set(bankPickerRows.map((b) => String(b.ledger_account_id))), [bankPickerRows]);
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

  // QBO register column grammar (approved design: docs/approved-screens/preview-register-qbo.html).
  // Payment/Deposit derive from normal_balance; sort via sortValue on the account-correct side.
  const columns: Array<ParityColumn<AccountRegisterRow>> = [
    {
      key: "entry_date",
      label: "Date",
      sortable: true,
      cellClass: "whitespace-nowrap",
      render: (r) => formatDateUS(r.entry_date),
    },
    // LV-REPORTS-BALANCE-SHEET-GL-JE-DRILL: every register row already carries a real
    // journal_entry_id (the row IS a posting on this account's own JE) — it just was never
    // rendered as a link, so Ref No. dead-ended on plain reference text with no way back to the
    // GL entry that produced it. The data was already there; only the render was missing.
    {
      key: "reference",
      label: "Ref No.",
      sortable: true,
      render: (r) =>
        r.journal_entry_id ? (
          <EntityLink
            kind="journal_entry"
            id={r.journal_entry_id}
            label={r.reference?.trim() ? r.reference.trim() : "—"}
          />
        ) : (
          r.reference ?? "—"
        ),
    },
    { key: "payee", label: "Payee", sortable: true, render: (r) => r.payee ?? "—" },
    { key: "memo", label: "Memo", sortable: true, render: (r) => r.memo ?? r.description ?? "—" },
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
      key: "running_balance_cents",
      label: "Balance",
      sortable: true,
      className: "text-right",
      cellClass: "text-right font-medium tabular-nums",
      render: (r) => fmtCents(r.running_balance_cents),
    },
    { key: "type", label: "Type", sortable: true, render: (r) => r.type },
    { key: "split_account", label: "Account", sortable: true, render: (r) => r.split_account ?? "—" },
    // Location + C/R are bank-register concepts; the GL posting model carries neither (verified) →
    // honest "—", never fabricated. Kept as columns (hideable via the gear) to match the QBO grammar.
    { key: "location", label: "Location", sortable: true, sortValue: () => "", render: () => "—" },
    { key: "cr", label: "C/R", sortable: true, sortValue: () => "", render: () => "—" },
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
    const acctLabel = `${acct.account_code ?? ""} ${acct.account_name ?? ""}`.trim() || accountId;
    const nb = acct.normal_balance;
    const rowsHtml = report.rows
      .map((r) => {
        const increase = nb === "debit" ? r.debit_cents : r.credit_cents;
        const decrease = nb === "debit" ? r.credit_cents : r.debit_cents;
        return `<tr>
          <td>${esc(formatDateUS(r.entry_date))}</td>
          <td>${esc(r.type)}</td>
          <td>${esc(r.reference ?? "—")}</td>
          <td>${esc(r.payee ?? "—")}</td>
          <td>${esc(r.memo ?? r.description ?? "—")}</td>
          <td style="text-align:right">${esc(increase ? fmtCents(increase) : "")}</td>
          <td style="text-align:right">${esc(decrease ? fmtCents(decrease) : "")}</td>
          <td style="text-align:right">${esc(fmtCents(r.running_balance_cents))}</td>
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
            <tr><th>Opening balance</th><td>${esc(fmtCents(report.opening_balance_cents))}</td></tr>
            <tr><th>Closing balance</th><td>${esc(fmtCents(report.closing_balance_cents))}</td></tr>
            <tr><th>Debits (period)</th><td>${esc(fmtCents(report.total_debit_cents))}</td></tr>
            <tr><th>Credits (period)</th><td>${esc(fmtCents(report.total_credit_cents))}</td></tr>
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
    <div className="grid gap-2 md:grid-cols-4">
      {kpiCard("Balance", `${fmtCents(report.closing_balance_cents)} ${normalLabel}`, `as of ${report.to_date}`)}
      {kpiCard("Debits (period)", fmtCents(report.total_debit_cents), "in range")}
      {kpiCard("Credits (period)", fmtCents(report.total_credit_cents), "in range")}
      {kpiCard("# Transactions", String(report.transaction_count), "in range")}
    </div>
  ) : undefined;

  return (
    <AccountingSubNavWrapper title="Account Register" subtitle="Running-balance ledger over the chart of accounts" kpiStrip={kpiStrip}>
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
          <button
            type="button"
            onClick={() => setFilterOpen((o) => !o)}
            className="h-9 rounded-sm border border-gray-300 bg-white px-3 text-[13px] font-semibold text-gray-700 hover:bg-gray-50"
          >
            Filter{activeChips.length ? ` (${activeChips.length})` : ""}
          </button>
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
              <div className="flex justify-between">
                <button type="button" onClick={resetFilters} className="text-[12px] font-medium text-gray-500 underline">
                  Reset
                </button>
                <button type="button" onClick={() => setFilterOpen(false)} className="text-[12px] font-semibold text-slate-700">
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
      <div className="mb-2 flex gap-1 border-b border-gray-200 text-[13px]">
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
        <p className="rounded-sm border border-gray-200 bg-white px-3 py-6 text-center text-sm text-gray-500">
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
        {/* C/R (cleared/reconciled) is a bank-reconciliation concept; the GL posting model carries no
            cleared state and no posting→bank_transaction link exists (verified). Show an honest banner
            instead of a fake checkmark — bank reconciliation surfaces it once that linkage is built. */}
        <div className="mb-2 rounded-sm border border-slate-200 bg-slate-50 px-3 py-1.5 text-[12px] text-slate-700">
          Reconciliation not yet available — the C/R column reflects GL postings, which carry no cleared/reconciled state yet.
        </div>
        {/* Opening balance is a running summary, not a paginated row — kept pinned above the table
            (QBO shows it as the first register line; ParityTable's rows are page-sliced, so a summary
            row belongs outside it to stay visible on every page). */}
        <div className="mb-0 flex items-center justify-between rounded-t-md border border-b-0 border-gray-200 bg-gray-50/60 px-2 py-1.5 text-[12px] text-gray-600">
          <span>Opening balance ({normal === "debit" ? "Dr" : "Cr"})</span>
          <span className="font-medium tabular-nums">{report ? fmtCents(report.opening_balance_cents) : "—"}</span>
        </div>
        <ParityTable
          columns={columns}
          rows={report?.rows ?? []}
          rowKey={(r) => r.posting_id}
          loading={registerQuery.isLoading}
          onRowClick={(r) => navigate(sourceRoute(r.source_transaction_type, r.source_transaction_id))}
          emptyText="No transactions in this range."
          storageKey="account-register"
          pageSizeOptions={[50, 75, 100, 200, 300]}
          initialPageSize={50}
          sortKey={sortKey}
          sortDirection={sortDirection}
          onSortChange={onSortChange}
          // ACCT-F3498: server-bound memo/ref search above — suppress ParityTable toolbar Search.
          suppressToolbarSearch
          toolbar={
            <>
              <button
                type="button"
                onClick={exportCsv}
                disabled={!report || report.rows.length === 0}
                title="Export to Excel"
                className="min-h-11 rounded-sm border border-gray-300 px-2 py-1 text-[12px] text-gray-700 hover:bg-gray-50 disabled:opacity-40 sm:min-h-0"
              >
                Export to Excel
              </button>
              <button
                type="button"
                onClick={printList}
                disabled={!report || report.rows.length === 0}
                title="Print list"
                className="min-h-11 rounded-sm border border-gray-300 px-2 py-1 text-[12px] text-gray-700 hover:bg-gray-50 disabled:opacity-40 sm:min-h-0"
              >
                Print list
              </button>
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
