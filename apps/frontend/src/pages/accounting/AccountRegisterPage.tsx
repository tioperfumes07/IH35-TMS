import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { DatePicker } from "../../components/forms/DatePicker";
import { useQuery } from "@tanstack/react-query";

import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";
import { SelectCombobox } from "../../components/shared/SelectCombobox";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { listCoaAccountsForJe, listAccountingAuditTrail } from "../../api/accounting";
import { getAccountRegister, type AccountRegisterReport } from "../../api/account-register";

const fmtCents = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((cents ?? 0) / 100);

// Drill-through: map a register row's source transaction to its REAL detail/source route (all verified to
// exist in routes/manifest.tsx). invoice + customer_payment have true per-id detail; the rest resolve to
// their source module. Falls back to the journal-entries surface for plain JEs / unmapped types.
function sourceRoute(type: string | null, reference: string | null): string {
  const t = (type ?? "").toLowerCase();
  if (t === "invoice" && reference) return `/accounting/invoices/${reference}`;
  if (t === "customer_payment" && reference) return `/accounting/payments/${reference}`;
  if (t === "bill") return "/accounting/bills";
  if (t === "bill_payment") return "/accounting/bill-payments";
  if (t === "expense") return "/accounting/expenses";
  if (t === "settlement") return "/driver-finance/settlements";
  return "/accounting/journal-entries";
}

// Density toggle per the qbo-parity table grammar (Regular / Compact / Ultra-compact).
const DENSITY: Record<string, string> = { regular: "px-3 py-2", compact: "px-2 py-1", ultra: "px-2 py-0.5" };

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

function monthBounds(d: Date): { from: string; to: string } {
  const y = d.getFullYear();
  const m = d.getMonth();
  const from = new Date(y, m, 1).toISOString().slice(0, 10);
  const to = new Date(y, m + 1, 0).toISOString().slice(0, 10);
  return { from, to };
}

function applyPreset(preset: string): { from: string; to: string } | null {
  const now = new Date();
  switch (preset) {
    case "this_month":
      return monthBounds(now);
    case "last_month":
      return monthBounds(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    case "this_quarter": {
      const q = Math.floor(now.getMonth() / 3);
      return {
        from: new Date(now.getFullYear(), q * 3, 1).toISOString().slice(0, 10),
        to: new Date(now.getFullYear(), q * 3 + 3, 0).toISOString().slice(0, 10),
      };
    }
    case "this_year":
      return { from: `${now.getFullYear()}-01-01`, to: `${now.getFullYear()}-12-31` };
    case "ytd":
      return { from: `${now.getFullYear()}-01-01`, to: now.toISOString().slice(0, 10) };
    default:
      return null;
  }
}

function kpiCard(label: string, value: string, sublabel: string) {
  return (
    <div className="rounded border border-gray-200 bg-white px-3 py-2 border-l-4 border-l-slate-300">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="text-lg font-semibold text-gray-900">{value}</p>
      <p className="text-xs text-gray-500">{sublabel}</p>
    </div>
  );
}

const inputCls = "h-9 rounded border border-gray-300 px-2 text-[13px]";

export function AccountRegisterPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const navigate = useNavigate();
  // Deep-link: the Chart of Accounts "View register" link routes to
  // /accounting/chart-of-accounts/register/:accountId — preselect that account here.
  const { accountId: routeAccountId } = useParams<{ accountId?: string }>();

  const initial = monthBounds(new Date());
  const [density, setDensity] = useState<"regular" | "compact" | "ultra">("regular");
  const [accountId, setAccountId] = useState(routeAccountId ?? "");
  const [fromDate, setFromDate] = useState(initial.from);
  const [toDate, setToDate] = useState(initial.to);
  const [preset, setPreset] = useState("this_month");
  const [view, setView] = useState<"register" | "audit">("register");

  useEffect(() => {
    if (routeAccountId) setAccountId(routeAccountId);
  }, [routeAccountId]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [typeLabel, setTypeLabel] = useState("");

  const accountsQuery = useQuery({
    queryKey: ["coa-accounts", companyId],
    queryFn: () => listCoaAccountsForJe(),
    enabled: Boolean(companyId),
  });

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
  const normalLabel = report ? (report.account.normal_balance === "debit" ? "Dr" : "Cr") : "";
  const normal: "debit" | "credit" = report?.account.normal_balance ?? "debit";
  const cell = DENSITY[density];

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
        <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
          Account
          <SelectCombobox value={accountId} onChange={(e) => setAccountId(e.target.value)} className={`${inputCls} min-w-[16rem]`}>
            <option value="">Select an account…</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.account_number} · {a.account_name}
              </option>
            ))}
          </SelectCombobox>
        </label>
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
            className="h-9 rounded border border-gray-300 bg-white px-3 text-[13px] font-semibold text-gray-700 hover:bg-gray-50"
          >
            Filter{activeChips.length ? ` (${activeChips.length})` : ""}
          </button>
          {filterOpen ? (
            <div className="absolute left-0 top-10 z-20 w-72 rounded border border-gray-200 bg-white p-3 shadow-lg">
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
                <button type="button" onClick={() => setFilterOpen(false)} className="text-[12px] font-semibold text-green-700">
                  Done
                </button>
              </div>
            </div>
          ) : null}
        </div>
        <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
          Density
          <SelectCombobox value={density} onChange={(e) => setDensity(e.target.value as "regular" | "compact" | "ultra")} className={inputCls}>
            <option value="regular">Regular</option>
            <option value="compact">Compact</option>
            <option value="ultra">Ultra-compact</option>
          </SelectCombobox>
        </label>
        <button
          type="button"
          onClick={exportCsv}
          disabled={!report || report.rows.length === 0}
          className="h-9 rounded border border-gray-300 bg-white px-3 text-[13px] font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40"
        >
          Export CSV
        </button>
      </div>

      {activeChips.length ? (
        <div className="mb-3 flex flex-wrap gap-2">
          {activeChips.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={c.clear}
              className="rounded-full border border-gray-300 bg-gray-50 px-2 py-0.5 text-[11px] text-gray-700 hover:bg-gray-100"
            >
              {c.label} ✕
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
            className={`px-3 py-1.5 font-semibold ${view === v ? "border-b-2 border-green-600 text-gray-900" : "text-gray-500"}`}
          >
            {v === "register" ? "Register" : "Audit history"}
          </button>
        ))}
      </div>

      {!accountId ? (
        <p className="rounded border border-gray-200 bg-white px-3 py-6 text-center text-sm text-gray-500">
          Select an account to view its register.
        </p>
      ) : view === "register" && registerQuery.isError ? (
        /* CHAIN-02: a rejected register request (e.g. 400/404) must not leave the table silently blank —
           surface it so the user can correct the account or date range instead of seeing an empty grid. */
        <p className="rounded border border-red-200 bg-red-50 px-3 py-6 text-center text-sm text-red-700">
          Couldn't load the register for this account and date range. Check the selected account and the
          From/To dates, then try again.
        </p>
      ) : view === "register" ? (
        <>
        {/* C/R (cleared/reconciled) is a bank-reconciliation concept; the GL posting model carries no
            cleared state and no posting→bank_transaction link exists (verified). Show an honest banner
            instead of a fake checkmark — bank reconciliation surfaces it once that linkage is built. */}
        <div className="mb-2 rounded border border-amber-200 bg-amber-50 px-3 py-1.5 text-[12px] text-amber-800">
          Reconciliation not yet available — the C/R column reflects GL postings, which carry no cleared/reconciled state yet.
        </div>
        <div className="overflow-x-auto rounded border border-gray-200 bg-white">
          <table className="min-w-full text-left text-xs">
            <thead className="border-b border-gray-200 bg-gray-50 text-[11px] font-semibold uppercase tracking-wide text-gray-600">
              <tr>
                <th className={cell}>Date</th>
                <th className={cell}>Type</th>
                <th className={cell}>Ref</th>
                <th className={cell}>Payee</th>
                <th className={cell}>Memo</th>
                <th className={cell}>Account</th>
                <th className={cell}>Class</th>
                <th className={cell}>Location</th>
                <th className={cell}>C/R</th>
                <th className={`${cell} text-right`}>Increase</th>
                <th className={`${cell} text-right`}>Decrease</th>
                <th className={`${cell} text-right`}>Running balance</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-100 bg-gray-50/40 text-gray-600">
                <td className={cell} colSpan={11}>
                  Opening balance ({normal === "debit" ? "Dr" : "Cr"})
                </td>
                <td className={`${cell} text-right font-medium`}>{report ? fmtCents(report.opening_balance_cents) : "—"}</td>
              </tr>
              {report?.rows.map((r) => {
                // QBO labels amounts by the account's normal balance: increase = the natural side.
                const increase = normal === "debit" ? r.debit_cents : r.credit_cents;
                const decrease = normal === "debit" ? r.credit_cents : r.debit_cents;
                return (
                  <tr
                    key={r.posting_id}
                    onClick={() => navigate(sourceRoute(r.source_transaction_type, r.reference))}
                    title="Open source transaction"
                    className="cursor-pointer border-b border-gray-100 hover:bg-gray-50"
                  >
                    <td className={`${cell} whitespace-nowrap`}>{r.entry_date}</td>
                    <td className={cell}>{r.type}</td>
                    <td className={cell}>{r.reference ?? "—"}</td>
                    <td className={cell}>{r.payee ?? "—"}</td>
                    <td className={cell}>{r.memo ?? r.description ?? "—"}</td>
                    <td className={cell}>{r.split_account ?? "—"}</td>
                    <td className={cell}>{r.class_name ?? "—"}</td>
                    {/* Location + C/R are bank-register concepts; the GL posting model carries neither
                        (verified) → honest "—", never fabricated. */}
                    <td className={cell}>—</td>
                    <td className={cell}>—</td>
                    <td className={`${cell} text-right tabular-nums`}>{increase ? fmtCents(increase) : ""}</td>
                    <td className={`${cell} text-right tabular-nums`}>{decrease ? fmtCents(decrease) : ""}</td>
                    <td className={`${cell} text-right font-medium tabular-nums`}>{fmtCents(r.running_balance_cents)}</td>
                  </tr>
                );
              })}
              {report && report.rows.length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-center text-gray-500" colSpan={12}>
                    {registerQuery.isLoading ? "Loading…" : "No transactions in this range."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        </>
      ) : (
        <div className="overflow-x-auto rounded border border-gray-200 bg-white">
          <table className="min-w-full text-left text-xs">
            <thead className="border-b border-gray-200 bg-gray-50 text-[11px] font-semibold uppercase tracking-wide text-gray-600">
              <tr>
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">Action</th>
                <th className="px-3 py-2">Journal entry</th>
                <th className="px-3 py-2">Dr/Cr</th>
                <th className="px-3 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {(auditQuery.data?.events ?? []).map((e) => (
                <tr key={e.id} className="border-b border-gray-100">
                  <td className="px-3 py-2 whitespace-nowrap">{new Date(e.occurred_at).toLocaleString()}</td>
                  <td className="px-3 py-2">{e.event_class.replace("accounting.", "")}</td>
                  <td className="px-3 py-2">{e.journal_entry_id.slice(0, 8)}</td>
                  <td className="px-3 py-2">{e.debit_or_credit}</td>
                  <td className="px-3 py-2 text-right">{fmtCents(e.amount_cents)}</td>
                </tr>
              ))}
              {auditQuery.data && auditQuery.data.events.length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-center text-gray-500" colSpan={5}>
                    {auditQuery.isLoading ? "Loading…" : "No audit events for this account."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
    </AccountingSubNavWrapper>
  );
}
