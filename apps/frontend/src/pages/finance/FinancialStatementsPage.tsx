import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { DatePicker } from "../../components/forms/DatePicker";
import { Button } from "../../components/Button";
import { ListErrorState } from "../../components/ListErrorState";
import { DrillKpiCard } from "../../components/layout/DrillKpiCard";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { CollapsedListFilters, useStagedListFilters } from "../../components/table";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useFeatureFlag } from "../../hooks/useFeatureFlag";
import { BasisSelector, type AccountingBasis } from "../../components/accounting/BasisSelector";
import { FinanceModuleTabs } from "./FinanceModuleTabs";
import { PageHeader } from "../../components/layout/PageHeader";
import { FINANCE_STATEMENTS_UI_FLAG } from "../../api/financeStatements";
import {
  getProfitLossReport,
  getBalanceSheetReport,
  getTrialBalanceReport,
  type AccountingProfitLossLine,
  type AccountingBalanceSheetLine,
  type AccountingTrialBalanceRow,
} from "../../api/reports";
import { formatAccountTypeLabel } from "../../lib/formatAccountTypeLabel";
import { formatDateUS } from "../../lib/formatDate";
import { printLetterHtml } from "../../lib/openPrintableDocument";
import { getShowAccountNumbers } from "../../lib/show-account-numbers";
import { useShowAccountNumbers } from "../../lib/useShowAccountNumbers";

// FIN-19 — Finance-Hub financial statements (P&L / Balance Sheet / Trial Balance).
// READ-ONLY: every fetch is a GET against the existing accounting report endpoints; nothing
// here writes, posts, or mutates. Per-entity only (one operating_company_id at a time) — no
// cross-entity totals. Gated behind flag FINANCE_STATEMENTS_UI_ENABLED — default_enabled=true in
// lib.feature_flags (resolves ON unless a per-entity/user override disables it); read-only, no
// money posting.

type ReportTab = "pl" | "bs" | "tb";

const REPORT_TAB_IDS = new Set<string>(["pl", "bs", "tb"]);

export function parseFinancialStatementsTab(raw: string | null): ReportTab {
  if (raw && REPORT_TAB_IDS.has(raw)) return raw as ReportTab;
  return "pl";
}

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
}

function currentMonthRange() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function sortByCode<T extends { account_code: string }>(lines: T[]) {
  return [...lines].sort((a, b) => String(a.account_code || "").localeCompare(String(b.account_code || "")));
}

function downloadCsv(fileName: string, rows: string[][]) {
  const escape = (value: string) => {
    const v = value ?? "";
    return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  };
  const csv = rows.map((row) => row.map(escape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

// Drill-through: each account routes to its OWN GL account register row (same surface/pattern
// ProfitLossPage.tsx already uses — see registerHref there), not a generic unfiltered list. The
// account_id was already on every line (StatementLine.account_id / AccountingTrialBalanceRow's
// account_code-keyed row) but was never read here, so every row linked to the same page — a
// dead-end drill-through, not a canonical one.
function registerHref(accountId: string, fromDate: string, toDate: string, basis: string) {
  const params = new URLSearchParams({ from_date: fromDate, to_date: toDate, basis });
  return `/accounting/chart-of-accounts/register/${accountId}?${params}`;
}

function AccountCell({
  code,
  name,
  accountId,
  fromDate,
  toDate,
  basis,
}: {
  code: string;
  name: string;
  accountId?: string;
  fromDate: string;
  toDate: string;
  basis: string;
}) {
  const display = name || code || "—";
  if (!accountId) return <span>{display}</span>;
  return (
    <Link
      to={registerHref(accountId, fromDate, toDate, basis)}
      className="text-slate-700 underline-offset-2 hover:underline"
      title="View ledger detail"
    >
      {display}
    </Link>
  );
}

// Both AccountingProfitLossLine and AccountingBalanceSheetLine share this shape.
type StatementLine = {
  account_id?: string;
  account_code: string;
  account_name: string;
  account_type: string;
  amount: number;
};

function statementColumns(
  showType: boolean,
  fromDate: string,
  toDate: string,
  basis: string,
  showCodes: boolean,
): Array<ParityColumn<StatementLine>> {
  const columns: Array<ParityColumn<StatementLine>> = [];
  if (showCodes) {
    columns.push({
      key: "account_code",
      label: "Account #",
      sortable: true,
      render: (line) => <span className="font-medium text-slate-900">{line.account_code || "—"}</span>,
    });
  }
  columns.push({
      key: "account_name",
      label: "Account",
      sortable: true,
      render: (line) => (
        <AccountCell code={line.account_code} name={line.account_name} accountId={line.account_id} fromDate={fromDate} toDate={toDate} basis={basis} />
      ),
    });
  if (showType) {
    columns.push({
      key: "account_type",
      label: "Type",
      sortable: true,
      render: (line) => line.account_type || "—",
    });
  }
  columns.push({
    key: "amount",
    label: "Amount",
    sortable: true,
    className: "text-right",
    cellClass: "text-right",
    render: (line) => money(line.amount),
  });
  return columns;
}

function trialBalanceColumns(
  fromDate: string,
  toDate: string,
  basis: string,
  showCodes: boolean,
): Array<ParityColumn<AccountingTrialBalanceRow>> {
  const columns: Array<ParityColumn<AccountingTrialBalanceRow>> = [];
  if (showCodes) {
    columns.push({
      key: "account_code",
      label: "Account #",
      sortable: true,
      render: (row) => <span className="font-medium text-slate-900">{row.account_code || "—"}</span>,
    });
  }
  columns.push(
    {
      key: "account_name",
      label: "Account",
      sortable: true,
      render: (row) => (
        <AccountCell code={row.account_code} name={row.account_name} accountId={row.account_id} fromDate={fromDate} toDate={toDate} basis={basis} />
      ),
    },
    { key: "account_type", label: "Type", sortable: true, render: (row) => row.account_type || "—" },
    {
      key: "total_debits",
      label: "Debits",
      sortable: true,
      className: "text-right",
      cellClass: "text-right",
      render: (row) => money(row.total_debits),
    },
    {
      key: "total_credits",
      label: "Credits",
      sortable: true,
      className: "text-right",
      cellClass: "text-right",
      render: (row) => money(row.total_credits),
    },
    {
      key: "net_balance",
      label: "Net",
      sortable: true,
      className: "text-right",
      cellClass: "text-right",
      render: (row) => <span className={row.net_balance < 0 ? "text-rose-700" : "text-slate-900"}>{money(row.net_balance)}</span>,
    },
  );
  return columns;
}

export function FinancialStatementsPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const { enabled, loading: flagLoading } = useFeatureFlag(FINANCE_STATEMENTS_UI_FLAG, companyId);
  const [showCodes] = useShowAccountNumbers();

  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parseFinancialStatementsTab(searchParams.get("tab"));
  const setTab = (next: ReportTab) => {
    const params = new URLSearchParams(searchParams);
    if (next === "pl") params.delete("tab");
    else params.set("tab", next);
    setSearchParams(params, { replace: true });
  };
  // CLS-FINANCE-READONLY-FILTER-APPLY-CANCEL-RESET — Basis + dates share one staged Filters draft.
  type StatementsFilter = {
    basis: AccountingBasis;
    start: string;
    end: string;
    asOf: string;
  };
  const defaults = useMemo((): StatementsFilter => {
    const range = currentMonthRange();
    return { basis: "accrual", start: range.start, end: range.end, asOf: todayIso() };
  }, []);
  const [appliedFilter, setAppliedFilter] = useState<StatementsFilter>(defaults);
  const staged = useStagedListFilters({
    applied: appliedFilter,
    empty: defaults,
    onApply: (next) => {
      if (next.start > next.end) return;
      setAppliedFilter(next);
    },
  });
  const draftInvalid = staged.draft.start > staged.draft.end;
  const basis = appliedFilter.basis;
  const applied = { start: appliedFilter.start, end: appliedFilter.end };
  const appliedAsOf = appliedFilter.asOf;
  const activeFilterCount =
    (appliedFilter.basis !== "accrual" ? 1 : 0) +
    (appliedFilter.start !== defaults.start || appliedFilter.end !== defaults.end ? 1 : 0) +
    (appliedFilter.asOf !== defaults.asOf ? 1 : 0);

  const active = enabled && Boolean(companyId);

  const plQuery = useQuery({
    queryKey: ["fin19", "profit-loss", companyId, applied.start, applied.end, basis],
    queryFn: () => getProfitLossReport({ operating_company_id: companyId, from_date: applied.start, to_date: applied.end, basis }),
    enabled: active && tab === "pl",
    retry: false,
  });

  const bsQuery = useQuery({
    queryKey: ["fin19", "balance-sheet", companyId, appliedAsOf, basis],
    queryFn: () => getBalanceSheetReport({ operating_company_id: companyId, as_of_date: appliedAsOf, basis }),
    enabled: active && tab === "bs",
    retry: false,
  });

  const tbQuery = useQuery({
    queryKey: ["fin19", "trial-balance", companyId, applied.start, applied.end, basis],
    queryFn: () => getTrialBalanceReport({ operating_company_id: companyId, from_date: applied.start, to_date: applied.end, basis }),
    enabled: active && tab === "tb",
    retry: false,
  });

  const plRevenue = useMemo(() => sortByCode(plQuery.data?.revenue.lines ?? []), [plQuery.data?.revenue.lines]);
  const plCogs = useMemo(() => sortByCode(plQuery.data?.cogs.lines ?? []), [plQuery.data?.cogs.lines]);
  const plExpenses = useMemo(() => sortByCode(plQuery.data?.operating_expenses.lines ?? []), [plQuery.data?.operating_expenses.lines]);
  const bsAssets = useMemo(() => sortByCode(bsQuery.data?.assets.lines ?? []), [bsQuery.data?.assets.lines]);
  const bsLiabilities = useMemo(() => sortByCode(bsQuery.data?.liabilities.lines ?? []), [bsQuery.data?.liabilities.lines]);
  const bsEquity = useMemo(() => sortByCode(bsQuery.data?.equity.lines ?? []), [bsQuery.data?.equity.lines]);
  const tbRows = useMemo(() => sortByCode(tbQuery.data?.rows ?? []), [tbQuery.data?.rows]);

  const header = <PageHeader backHref="/finance/overview" title="Financial statements" subtitle="Profit & loss, balance sheet, and trial balance for the selected entity. Read-only — nothing is posted." />;

  if (flagLoading) {
    return (
      <div className="p-6">
        <FinanceModuleTabs />
        {header}
        <p className="text-sm text-slate-500">Loading…</p>
      </div>
    );
  }

  if (!enabled) {
    return (
      <div className="p-6">
        <FinanceModuleTabs />
        {header}
        <div className="rounded-sm border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          Financial statements are not yet enabled for this company. (Feature flag <code>{FINANCE_STATEMENTS_UI_FLAG}</code> is off.)
        </div>
      </div>
    );
  }

  const usesRange = tab === "pl" || tab === "tb";

  function printLetter() {
    const esc = (v: unknown) =>
      String(v ?? "—")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    const showCodes = getShowAccountNumbers();
    const basisLabel = basis === "cash" ? "Cash" : "Accrual";
    const printed = new Date().toLocaleString();

    if (tab === "pl") {
      const data = plQuery.data;
      if (!data) return;
      const sectionHtml = (title: string, lines: AccountingProfitLossLine[], total: number) => {
        const rows = lines
          .map(
            (line) => `<tr>
            ${showCodes ? `<td>${esc(line.account_code || "—")}</td>` : ""}
            <td>${esc(line.account_name || "—")}</td>
            <td>${esc(formatAccountTypeLabel(line.account_type))}</td>
            <td style="text-align:right">${esc(money(line.amount))}</td>
          </tr>`,
          )
          .join("");
        const colSpan = showCodes ? 3 : 2;
        return `
        <h1 style="margin-top:16px">${esc(title)}</h1>
        <table>
          <thead><tr>${showCodes ? "<th>Account #</th>" : ""}<th>Account</th><th>Type</th><th style="text-align:right">Amount</th></tr></thead>
          <tbody>
            ${rows || `<tr><td colspan="${showCodes ? 4 : 3}">No rows</td></tr>`}
            <tr><th colspan="${colSpan}">Total</th><td style="text-align:right">${esc(money(total))}</td></tr>
          </tbody>
        </table>`;
      };
      printLetterHtml({
        title: `Profit & loss ${applied.start}_${applied.end}`,
        bodyHtml: `
        <h1>Profit &amp; loss</h1>
        <div class="meta">${esc(formatDateUS(applied.start))} → ${esc(formatDateUS(applied.end))} · ${esc(
          basisLabel,
        )} · printed ${esc(printed)}</div>
        <table>
          <tbody>
            <tr><th>Revenue total</th><td>${esc(money(data.revenue.total))}</td></tr>
            <tr><th>Gross profit</th><td>${esc(money(data.gross_profit))}</td></tr>
            <tr><th>Net income</th><td>${esc(money(data.net_income))}</td></tr>
          </tbody>
        </table>
        ${sectionHtml("Revenue", plRevenue, data.revenue.total)}
        ${sectionHtml("Cost of goods sold", plCogs, data.cogs.total)}
        ${sectionHtml("Operating expenses", plExpenses, data.operating_expenses.total)}
      `,
      });
      return;
    }

    if (tab === "bs") {
      const data = bsQuery.data;
      if (!data) return;
      const sectionHtml = (title: string, lines: AccountingBalanceSheetLine[], total: number) => {
        const rows = lines
          .map(
            (line) => `<tr>
            ${showCodes ? `<td>${esc(line.account_code || "—")}</td>` : ""}
            <td>${esc(line.account_name || "—")}</td>
            <td style="text-align:right">${esc(money(line.amount))}</td>
          </tr>`,
          )
          .join("");
        const colSpan = showCodes ? 2 : 1;
        return `
        <h1 style="margin-top:16px">${esc(title)}</h1>
        <table>
          <thead><tr>${showCodes ? "<th>Account #</th>" : ""}<th>Account</th><th style="text-align:right">Amount</th></tr></thead>
          <tbody>
            ${rows || `<tr><td colspan="${showCodes ? 3 : 2}">No rows</td></tr>`}
            <tr><th colspan="${colSpan}">Total</th><td style="text-align:right">${esc(money(total))}</td></tr>
          </tbody>
        </table>`;
      };
      printLetterHtml({
        title: `Balance sheet as of ${appliedAsOf}`,
        bodyHtml: `
        <h1>Balance sheet</h1>
        <div class="meta">As of ${esc(formatDateUS(appliedAsOf))} · ${esc(basisLabel)} · printed ${esc(printed)}</div>
        <table>
          <tbody>
            <tr><th>Total assets</th><td>${esc(money(data.assets.total))}</td></tr>
            <tr><th>Total liabilities &amp; equity</th><td>${esc(money(data.total_liabilities_and_equity))}</td></tr>
            <tr><th>Status</th><td>${esc(data.balanced ? "Balanced" : "Out of balance")}</td></tr>
          </tbody>
        </table>
        ${sectionHtml("Assets", bsAssets, data.assets.total)}
        ${sectionHtml("Liabilities", bsLiabilities, data.liabilities.total)}
        ${sectionHtml("Equity", bsEquity, data.equity.total)}
        <table>
          <tbody>
            <tr><th>Current year earnings</th><td>${esc(money(data.equity.current_year_earnings))}</td></tr>
          </tbody>
        </table>
      `,
      });
      return;
    }

    const data = tbQuery.data;
    if (!data) return;
    const rowsHtml = tbRows
      .map(
        (row) => `<tr>
          ${showCodes ? `<td>${esc(row.account_code || "—")}</td>` : ""}
          <td>${esc(row.account_name || "—")}</td>
          <td>${esc(formatAccountTypeLabel(row.account_type))}</td>
          <td style="text-align:right">${esc(money(row.total_debits))}</td>
          <td style="text-align:right">${esc(money(row.total_credits))}</td>
          <td style="text-align:right">${esc(money(row.net_balance))}</td>
        </tr>`,
      )
      .join("");
    const s = data.summary;
    printLetterHtml({
      title: `Trial balance ${applied.start}_${applied.end}`,
      bodyHtml: `
        <h1>Trial balance</h1>
        <div class="meta">${esc(formatDateUS(applied.start))} → ${esc(formatDateUS(applied.end))} · ${esc(
          basisLabel,
        )} · printed ${esc(printed)}</div>
        <table>
          <tbody>
            <tr><th>Total debits</th><td>${esc(money(s?.grand_total_debits ?? 0))}</td></tr>
            <tr><th>Total credits</th><td>${esc(money(s?.grand_total_credits ?? 0))}</td></tr>
            <tr><th>Status</th><td>${esc(s?.balanced ? "Balanced" : "Out of balance")}</td></tr>
          </tbody>
        </table>
        <h1 style="margin-top:20px">Accounts</h1>
        <table>
          <thead>
            <tr>
              <th>${showCodes ? "Account #</th><th>" : ""}Account</th><th>Type</th>
              <th style="text-align:right">Debits</th>
              <th style="text-align:right">Credits</th>
              <th style="text-align:right">Net</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml || `<tr><td colspan="${showCodes ? 6 : 5}">No rows</td></tr>`}
          </tbody>
        </table>
      `,
    });
  }

  function exportCurrentCsv() {
    if (tab === "pl" && plQuery.data) {
      const rows: string[][] = showCodes
        ? [["Section", "Account #", "Account", "Type", "Amount (USD)"]]
        : [["Section", "Account", "Type", "Amount (USD)"]];
      const push = (section: string, lines: AccountingProfitLossLine[]) =>
        lines.forEach((l) =>
          rows.push(
            showCodes
              ? [section, l.account_code, l.account_name, l.account_type, (l.amount / 100).toFixed(2)]
              : [section, l.account_name, l.account_type, (l.amount / 100).toFixed(2)],
          ),
        );
      push("Revenue", plRevenue);
      push("COGS", plCogs);
      push("Operating expenses", plExpenses);
      rows.push(["Net income", "", "", "", (plQuery.data.net_income / 100).toFixed(2)]);
      downloadCsv(`profit-loss-${applied.start}_${applied.end}-${basis}.csv`, rows);
      return;
    }
    if (tab === "bs" && bsQuery.data) {
      const rows: string[][] = showCodes
        ? [["Section", "Account #", "Account", "Type", "Amount (USD)"]]
        : [["Section", "Account", "Type", "Amount (USD)"]];
      const push = (section: string, lines: AccountingBalanceSheetLine[]) =>
        lines.forEach((l) =>
          rows.push(
            showCodes
              ? [section, l.account_code, l.account_name, l.account_type, (l.amount / 100).toFixed(2)]
              : [section, l.account_name, l.account_type, (l.amount / 100).toFixed(2)],
          ),
        );
      push("Assets", bsAssets);
      push("Liabilities", bsLiabilities);
      push("Equity", bsEquity);
      rows.push(["Equity", "", "Current year earnings", "Equity", (bsQuery.data.equity.current_year_earnings / 100).toFixed(2)]);
      rows.push(["Total liabilities + equity", "", "", "", (bsQuery.data.total_liabilities_and_equity / 100).toFixed(2)]);
      downloadCsv(`balance-sheet-${appliedAsOf}-${basis}.csv`, rows);
      return;
    }
    if (tab === "tb" && tbQuery.data) {
      const rows: string[][] = showCodes
        ? [["Account #", "Account", "Type", "Debits (USD)", "Credits (USD)", "Net (USD)"]]
        : [["Account", "Type", "Debits (USD)", "Credits (USD)", "Net (USD)"]];
      tbRows.forEach((r: AccountingTrialBalanceRow) =>
        rows.push(
          showCodes
            ? [
                r.account_code,
                r.account_name,
                r.account_type,
                (r.total_debits / 100).toFixed(2),
                (r.total_credits / 100).toFixed(2),
                (r.net_balance / 100).toFixed(2),
              ]
            : [
                r.account_name,
                r.account_type,
                (r.total_debits / 100).toFixed(2),
                (r.total_credits / 100).toFixed(2),
                (r.net_balance / 100).toFixed(2),
              ],
        ),
      );
      rows.push([
        "Grand total",
        "",
        "",
        (tbQuery.data.summary.grand_total_debits / 100).toFixed(2),
        (tbQuery.data.summary.grand_total_credits / 100).toFixed(2),
        "",
      ]);
      downloadCsv(`trial-balance-${applied.start}_${applied.end}-${basis}.csv`, rows);
    }
  }

  const tabs: Array<{ id: ReportTab; label: string }> = [
    { id: "pl", label: "Profit & loss" },
    { id: "bs", label: "Balance sheet" },
    { id: "tb", label: "Trial balance" },
  ];

  return (
    <div className="p-6 print:p-0">
      <style>{`@media print { .no-print { display: none !important; } body { background: white; } }`}</style>
      <div className="no-print">
        <FinanceModuleTabs />
      </div>
      {header}

      {!companyId ? <p className="mb-3 text-sm text-red-600">Select an operating company.</p> : null}

      <div className="no-print mb-4 flex flex-wrap items-center gap-2 border-b border-slate-200">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={[
              "whitespace-nowrap border-b-2 px-1 py-2 text-sm font-medium",
              tab === t.id ? "border-slate-800 text-slate-900" : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700",
            ].join(" ")}
            aria-pressed={tab === t.id}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="no-print mb-4 flex flex-wrap items-start gap-3">
        <CollapsedListFilters
          activeFilterCount={activeFilterCount}
          onApply={staged.apply}
          onReset={staged.reset}
          onCancel={staged.cancel}
          applyDisabled={!staged.dirty || draftInvalid}
          testIdPrefix="finance-statements"
          className="min-w-[18rem] flex-1 rounded-sm border border-slate-200 bg-white p-2"
        >
          <div className="flex flex-wrap items-end gap-3">
            <BasisSelector
              value={staged.draft.basis}
              onChange={(next) => staged.setDraft({ ...staged.draft, basis: next })}
            />
            {usesRange ? (
              <>
                <label className="text-xs text-slate-600">
                  From
                  <DatePicker
                    className="mt-1 block h-9"
                    value={staged.draft.start}
                    onChange={(next) => staged.setDraft({ ...staged.draft, start: next })}
                  />
                </label>
                <label className="text-xs text-slate-600">
                  To
                  <DatePicker
                    className="mt-1 block h-9"
                    value={staged.draft.end}
                    onChange={(next) => staged.setDraft({ ...staged.draft, end: next })}
                  />
                </label>
              </>
            ) : (
              <label className="text-xs text-slate-600">
                As-of date
                <DatePicker
                  className="mt-1 block h-9"
                  value={staged.draft.asOf}
                  onChange={(next) => staged.setDraft({ ...staged.draft, asOf: next })}
                />
              </label>
            )}
          </div>
          {draftInvalid && (
            <p className="mt-2 text-xs text-red-600">From date must be before or equal to To date.</p>
          )}
        </CollapsedListFilters>
        <div className="ml-auto flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={exportCurrentCsv}
            disabled={
              (tab === "pl" && !plQuery.data) || (tab === "bs" && !bsQuery.data) || (tab === "tb" && !tbQuery.data)
            }
          >
            Export CSV
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={printLetter}
            disabled={
              (tab === "pl" && !plQuery.data) || (tab === "bs" && !bsQuery.data) || (tab === "tb" && !tbQuery.data)
            }
          >
            Print
          </Button>
        </div>
      </div>

      {/* PROFIT & LOSS */}
      {tab === "pl" ? (
        <div className="space-y-3">
          {plQuery.isError ? (
            <ListErrorState
              title="Could not load profit & loss."
              status={0}
              message={(plQuery.error as Error)?.message}
              onRetry={() => void plQuery.refetch()}
            />
          ) : null}
          {plQuery.isLoading ? <p className="text-sm text-slate-500">Loading…</p> : null}
          {plQuery.data ? (
            <>
              <div className="grid gap-2 md:grid-cols-3">
                <SummaryCard label="Revenue total" value={money(plQuery.data.revenue.total)} to="/accounting/all-transactions" />
                <SummaryCard label="Gross profit" value={money(plQuery.data.gross_profit)} to="/accounting/all-transactions" />
                <SummaryCard
                  label="Net income"
                  value={money(plQuery.data.net_income)}
                  tone={plQuery.data.net_income < 0 ? "negative" : "positive"}
                  to="/accounting/all-transactions"
                />
              </div>
              {[
                { key: "revenue", title: "Revenue", lines: plRevenue, total: plQuery.data.revenue.total, storageKey: "fin19-pl-revenue" },
                { key: "cogs", title: "Cost of goods sold", lines: plCogs, total: plQuery.data.cogs.total, storageKey: "fin19-pl-cogs" },
                { key: "expenses", title: "Operating expenses", lines: plExpenses, total: plQuery.data.operating_expenses.total, storageKey: "fin19-pl-expenses" },
              ].map((section) => (
                <StatementSection
                  key={section.key}
                  title={section.title}
                  storageKey={section.storageKey}
                  tableTestId={`fin19-pl-${section.key}-table`}
                  showType
                  lines={section.lines}
                  footerRows={[{ label: "Section total", value: money(section.total) }]}
                  fromDate={applied.start}
                  toDate={applied.end}
                  basis={basis}
                />
              ))}
              <section className="overflow-hidden rounded-sm border border-slate-200 bg-white">
                <div className="flex items-center justify-between px-3 py-2 text-sm font-semibold">
                  <span>Net income</span>
                  <span className={plQuery.data.net_income < 0 ? "text-rose-700" : "text-slate-700"}>{money(plQuery.data.net_income)}</span>
                </div>
              </section>
            </>
          ) : null}
        </div>
      ) : null}

      {/* BALANCE SHEET */}
      {tab === "bs" ? (
        <div className="space-y-3">
          {bsQuery.isError ? (
            <ListErrorState
              title="Could not load balance sheet."
              status={0}
              message={(bsQuery.error as Error)?.message}
              onRetry={() => void bsQuery.refetch()}
            />
          ) : null}
          {bsQuery.isLoading ? <p className="text-sm text-slate-500">Loading…</p> : null}
          {bsQuery.data ? (
            <>
              <div className="grid gap-2 md:grid-cols-3">
                <SummaryCard label="Total assets" value={money(bsQuery.data.assets.total)} to="/accounting/account-register" />
                <SummaryCard label="Liabilities + equity" value={money(bsQuery.data.total_liabilities_and_equity)} to="/accounting/account-register" />
                <SummaryCard
                  label="A = L + E"
                  value={bsQuery.data.balanced ? "Balanced" : "Out of balance"}
                  tone={bsQuery.data.balanced ? "positive" : "negative"}
                  to="/accounting/account-register"
                />
              </div>
              <StatementSection
                title="Assets"
                storageKey="fin19-bs-assets"
                tableTestId="fin19-bs-assets-table"
                showType={false}
                lines={bsAssets}
                footerRows={[{ label: "Total assets", value: money(bsQuery.data.assets.total) }]}
                fromDate={appliedAsOf}
                toDate={appliedAsOf}
                basis={basis}
              />
              <StatementSection
                title="Liabilities"
                storageKey="fin19-bs-liabilities"
                tableTestId="fin19-bs-liabilities-table"
                showType={false}
                lines={bsLiabilities}
                footerRows={[{ label: "Total liabilities", value: money(bsQuery.data.liabilities.total) }]}
                fromDate={appliedAsOf}
                toDate={appliedAsOf}
                basis={basis}
              />
              <StatementSection
                title="Equity"
                storageKey="fin19-bs-equity"
                tableTestId="fin19-bs-equity-table"
                showType={false}
                lines={bsEquity}
                fromDate={appliedAsOf}
                toDate={appliedAsOf}
                basis={basis}
                footerRows={[
                  { label: "Current year earnings", value: money(bsQuery.data.equity.current_year_earnings) },
                  { label: "Total equity", value: money(bsQuery.data.equity.total) },
                ]}
              />
            </>
          ) : null}
        </div>
      ) : null}

      {/* TRIAL BALANCE */}
      {tab === "tb" ? (
        <div className="space-y-3">
          {tbQuery.isError ? (
            <ListErrorState
              title="Could not load trial balance."
              status={0}
              message={(tbQuery.error as Error)?.message}
              onRetry={() => void tbQuery.refetch()}
            />
          ) : null}
          {tbQuery.data?.summary ? (
            <div className="grid gap-2 md:grid-cols-3">
              <SummaryCard label="Grand total debits" value={money(tbQuery.data.summary.grand_total_debits)} to="/accounting/journal-entries" />
              <SummaryCard label="Grand total credits" value={money(tbQuery.data.summary.grand_total_credits)} to="/accounting/journal-entries" />
              <SummaryCard
                label="Debits = credits"
                value={tbQuery.data.summary.balanced ? "Balanced" : "Out of balance"}
                tone={tbQuery.data.summary.balanced ? "positive" : "negative"}
                to="/accounting/journal-entries"
              />
            </div>
          ) : null}
          <section className="overflow-hidden rounded-sm border border-slate-200 bg-white">
            <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800">Trial balance</div>
            <ParityTable
              embedded
              columns={trialBalanceColumns(applied.start, applied.end, basis, showCodes)}
              rows={tbRows}
              rowKey={(row) => row.account_id}
              loading={tbQuery.isLoading}
              emptyText="No rows"
              storageKey="fin19-trial-balance"
              tableTestId="fin19-trial-balance-table"
              initialPageSize={300}
            />
            {tbQuery.data?.summary ? (
              <div className="flex items-center justify-end gap-6 border-t border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">
                <span>Grand total</span>
                <span>Debits {money(tbQuery.data.summary.grand_total_debits)}</span>
                <span>Credits {money(tbQuery.data.summary.grand_total_credits)}</span>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
    </div>
  );
}

// C8: `to` is REQUIRED — a statement headline opens the ledger it was rolled up from. The two
// balance ASSERTIONS drill too: "Out of balance" is exactly when an accountant needs the entries.
function SummaryCard({
  label,
  value,
  tone,
  to,
}: {
  label: string;
  value: string;
  tone?: "positive" | "negative";
  to: string;
}) {
  return (
    <DrillKpiCard size="md" label={label} value={value} valueTone={tone === "negative" ? "critical" : "default"} to={to} />
  );
}

// Display-only ParityTable wrapper for one statement section: title strip + ParityTable +
// the pre-migration total/footer rows preserved 1:1 (same labels, same money() values).
function StatementSection({
  title,
  storageKey,
  tableTestId,
  showType,
  lines,
  footerRows,
  fromDate,
  toDate,
  basis,
}: {
  title: string;
  storageKey: string;
  tableTestId: string;
  showType: boolean;
  lines: StatementLine[];
  footerRows: Array<{ label: string; value: string }>;
  fromDate: string;
  toDate: string;
  basis: string;
}) {
  const [showCodes] = useShowAccountNumbers();
  const columns = useMemo(
    () => statementColumns(showType, fromDate, toDate, basis, showCodes),
    [showType, fromDate, toDate, basis, showCodes],
  );
  return (
    <section className="overflow-hidden rounded-sm border border-slate-200 bg-white">
      <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800">{title}</div>
      <ParityTable
        embedded
        columns={columns}
        rows={lines}
        rowKey={(line) => `${line.account_code}-${line.account_name}`}
        emptyText="No rows"
        storageKey={storageKey}
        tableTestId={tableTestId}
        initialPageSize={300}
      />
      {footerRows.map((row) => (
        <div
          key={row.label}
          className="flex items-center justify-end gap-6 border-t border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700"
        >
          <span>{row.label}</span>
          <span>{row.value}</span>
        </div>
      ))}
    </section>
  );
}
