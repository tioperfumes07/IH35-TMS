import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { DatePicker } from "../../components/forms/DatePicker";
import { Button } from "../../components/Button";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useFeatureFlag } from "../../hooks/useFeatureFlag";
import { BasisSelector, type AccountingBasis } from "../../components/accounting/BasisSelector";
import { FinanceModuleTabs } from "./FinanceModuleTabs";
import { FINANCE_STATEMENTS_UI_FLAG } from "../../api/financeStatements";
import {
  getProfitLossReport,
  getBalanceSheetReport,
  getTrialBalanceReport,
  type AccountingProfitLossLine,
  type AccountingBalanceSheetLine,
  type AccountingTrialBalanceRow,
} from "../../api/reports";

// FIN-19 — Finance-Hub financial statements (P&L / Balance Sheet / Trial Balance).
// READ-ONLY: every fetch is a GET against the existing accounting report endpoints; nothing
// here writes, posts, or mutates. Per-entity only (one operating_company_id at a time) — no
// cross-entity totals. Gated behind the OFF-by-default flag FINANCE_STATEMENTS_UI_ENABLED.

type ReportTab = "pl" | "bs" | "tb";

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

// Drill-through: each account routes to the existing GL account register (reused surface),
// which lists the journal_entry_postings the statement number is derived from.
function AccountCell({ code, name }: { code: string; name: string }) {
  return (
    <Link to="/accounting/account-register" className="text-slate-700 underline-offset-2 hover:underline" title="View ledger detail">
      {name || code || "—"}
    </Link>
  );
}

export function FinancialStatementsPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const { enabled, loading: flagLoading } = useFeatureFlag(FINANCE_STATEMENTS_UI_FLAG, companyId);

  const [tab, setTab] = useState<ReportTab>("pl");
  const [basis, setBasis] = useState<AccountingBasis>("accrual");
  const [period, setPeriod] = useState(currentMonthRange);
  const [applied, setApplied] = useState(currentMonthRange);
  const [asOf, setAsOf] = useState(todayIso);
  const [appliedAsOf, setAppliedAsOf] = useState(todayIso);

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

  const header = (
    <div className="mb-3">
      <h1 className="text-lg font-semibold text-slate-800">Financial statements</h1>
      <p className="text-sm text-slate-500">Profit &amp; loss, balance sheet, and trial balance for the selected entity. Read-only — nothing is posted.</p>
    </div>
  );

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
        <div className="rounded border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          Financial statements are not yet enabled for this company. (Feature flag <code>{FINANCE_STATEMENTS_UI_FLAG}</code> is off.)
        </div>
      </div>
    );
  }

  const usesRange = tab === "pl" || tab === "tb";

  function exportCurrentCsv() {
    if (tab === "pl" && plQuery.data) {
      const rows: string[][] = [["Section", "Account #", "Account", "Type", "Amount (USD)"]];
      const push = (section: string, lines: AccountingProfitLossLine[]) =>
        lines.forEach((l) => rows.push([section, l.account_code, l.account_name, l.account_type, (l.amount / 100).toFixed(2)]));
      push("Revenue", plRevenue);
      push("COGS", plCogs);
      push("Operating expenses", plExpenses);
      rows.push(["Net income", "", "", "", (plQuery.data.net_income / 100).toFixed(2)]);
      downloadCsv(`profit-loss-${applied.start}_${applied.end}-${basis}.csv`, rows);
      return;
    }
    if (tab === "bs" && bsQuery.data) {
      const rows: string[][] = [["Section", "Account #", "Account", "Type", "Amount (USD)"]];
      const push = (section: string, lines: AccountingBalanceSheetLine[]) =>
        lines.forEach((l) => rows.push([section, l.account_code, l.account_name, l.account_type, (l.amount / 100).toFixed(2)]));
      push("Assets", bsAssets);
      push("Liabilities", bsLiabilities);
      push("Equity", bsEquity);
      rows.push(["Equity", "", "Current year earnings", "Equity", (bsQuery.data.equity.current_year_earnings / 100).toFixed(2)]);
      rows.push(["Total liabilities + equity", "", "", "", (bsQuery.data.total_liabilities_and_equity / 100).toFixed(2)]);
      downloadCsv(`balance-sheet-${appliedAsOf}-${basis}.csv`, rows);
      return;
    }
    if (tab === "tb" && tbQuery.data) {
      const rows: string[][] = [["Account #", "Account", "Type", "Debits (USD)", "Credits (USD)", "Net (USD)"]];
      tbRows.forEach((r: AccountingTrialBalanceRow) =>
        rows.push([
          r.account_code,
          r.account_name,
          r.account_type,
          (r.total_debits / 100).toFixed(2),
          (r.total_credits / 100).toFixed(2),
          (r.net_balance / 100).toFixed(2),
        ]),
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

      <div className="no-print mb-4 flex flex-wrap items-end gap-3 rounded border border-slate-200 bg-white p-3">
        <BasisSelector value={basis} onChange={setBasis} />
        {usesRange ? (
          <>
            <label className="text-xs text-slate-600">
              From
              <DatePicker
                className="mt-1 block h-9 rounded border border-slate-300 px-2"
                value={period.start}
                onChange={(next) => setPeriod((p) => ({ ...p, start: next }))}
              />
            </label>
            <label className="text-xs text-slate-600">
              To
              <DatePicker
                className="mt-1 block h-9 rounded border border-slate-300 px-2"
                value={period.end}
                onChange={(next) => setPeriod((p) => ({ ...p, end: next }))}
              />
            </label>
            <Button size="sm" onClick={() => setApplied({ ...period })}>
              Apply
            </Button>
          </>
        ) : (
          <>
            <label className="text-xs text-slate-600">
              As-of date
              <DatePicker className="mt-1 block h-9 rounded border border-slate-300 px-2" value={asOf} onChange={(next) => setAsOf(next)} />
            </label>
            <Button size="sm" onClick={() => setAppliedAsOf(asOf)}>
              Apply
            </Button>
          </>
        )}
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="secondary" onClick={exportCurrentCsv}>
            Export CSV
          </Button>
          <Button size="sm" variant="secondary" onClick={() => window.print()}>
            Print
          </Button>
        </div>
      </div>

      {/* PROFIT & LOSS */}
      {tab === "pl" ? (
        <div className="space-y-3">
          {plQuery.isError ? <p className="text-sm text-red-600">Could not load profit &amp; loss.</p> : null}
          {plQuery.isLoading ? <p className="text-sm text-slate-500">Loading…</p> : null}
          {plQuery.data ? (
            <>
              <div className="grid gap-2 md:grid-cols-3">
                <SummaryCard label="Revenue total" value={money(plQuery.data.revenue.total)} />
                <SummaryCard label="Gross profit" value={money(plQuery.data.gross_profit)} />
                <SummaryCard
                  label="Net income"
                  value={money(plQuery.data.net_income)}
                  tone={plQuery.data.net_income < 0 ? "negative" : "positive"}
                />
              </div>
              {[
                { key: "revenue", title: "Revenue", lines: plRevenue, total: plQuery.data.revenue.total },
                { key: "cogs", title: "Cost of goods sold", lines: plCogs, total: plQuery.data.cogs.total },
                { key: "expenses", title: "Operating expenses", lines: plExpenses, total: plQuery.data.operating_expenses.total },
              ].map((section) => (
                <StatementTable
                  key={section.key}
                  title={section.title}
                  head={["Account #", "Account", "Type", "Amount"]}
                  totalLabel="Section total"
                  totalValue={money(section.total)}
                  emptyColSpan={4}
                  rows={section.lines.map((line) => (
                    <tr key={`${section.key}-${line.account_code}-${line.account_name}`} className="border-b border-slate-100">
                      <td className="px-3 py-2 font-medium text-slate-900">{line.account_code || "—"}</td>
                      <td className="px-3 py-2"><AccountCell code={line.account_code} name={line.account_name} /></td>
                      <td className="px-3 py-2">{line.account_type || "—"}</td>
                      <td className="px-3 py-2 text-right">{money(line.amount)}</td>
                    </tr>
                  ))}
                />
              ))}
              <div className="rounded border border-slate-200 bg-white px-3 py-2">
                <div className="flex items-center justify-between text-sm font-semibold">
                  <span>Net income</span>
                  <span className={plQuery.data.net_income < 0 ? "text-rose-700" : "text-emerald-700"}>{money(plQuery.data.net_income)}</span>
                </div>
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      {/* BALANCE SHEET */}
      {tab === "bs" ? (
        <div className="space-y-3">
          {bsQuery.isError ? <p className="text-sm text-red-600">Could not load balance sheet.</p> : null}
          {bsQuery.isLoading ? <p className="text-sm text-slate-500">Loading…</p> : null}
          {bsQuery.data ? (
            <>
              <div className="grid gap-2 md:grid-cols-3">
                <SummaryCard label="Total assets" value={money(bsQuery.data.assets.total)} />
                <SummaryCard label="Liabilities + equity" value={money(bsQuery.data.total_liabilities_and_equity)} />
                <SummaryCard
                  label="A = L + E"
                  value={bsQuery.data.balanced ? "Balanced" : "Out of balance"}
                  tone={bsQuery.data.balanced ? "positive" : "negative"}
                />
              </div>
              <StatementTable
                title="Assets"
                head={["Account #", "Account", "Amount"]}
                totalLabel="Total assets"
                totalValue={money(bsQuery.data.assets.total)}
                emptyColSpan={3}
                rows={bsAssets.map((line) => (
                  <tr key={`asset-${line.account_code}-${line.account_name}`} className="border-b border-slate-100">
                    <td className="px-3 py-2 font-medium text-slate-900">{line.account_code || "—"}</td>
                    <td className="px-3 py-2"><AccountCell code={line.account_code} name={line.account_name} /></td>
                    <td className="px-3 py-2 text-right">{money(line.amount)}</td>
                  </tr>
                ))}
              />
              <StatementTable
                title="Liabilities"
                head={["Account #", "Account", "Amount"]}
                totalLabel="Total liabilities"
                totalValue={money(bsQuery.data.liabilities.total)}
                emptyColSpan={3}
                rows={bsLiabilities.map((line) => (
                  <tr key={`liability-${line.account_code}-${line.account_name}`} className="border-b border-slate-100">
                    <td className="px-3 py-2 font-medium text-slate-900">{line.account_code || "—"}</td>
                    <td className="px-3 py-2"><AccountCell code={line.account_code} name={line.account_name} /></td>
                    <td className="px-3 py-2 text-right">{money(line.amount)}</td>
                  </tr>
                ))}
              />
              <div className="overflow-x-auto rounded border border-slate-200 bg-white">
                <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold">Equity</div>
                <table className="min-w-full text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                    <tr>
                      <th className="px-3 py-2">Account #</th>
                      <th className="px-3 py-2">Account</th>
                      <th className="px-3 py-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bsEquity.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-3 py-4 text-slate-500">No rows</td>
                      </tr>
                    ) : (
                      bsEquity.map((line) => (
                        <tr key={`equity-${line.account_code}-${line.account_name}`} className="border-b border-slate-100">
                          <td className="px-3 py-2 font-medium text-slate-900">{line.account_code || "—"}</td>
                          <td className="px-3 py-2"><AccountCell code={line.account_code} name={line.account_name} /></td>
                          <td className="px-3 py-2 text-right">{money(line.amount)}</td>
                        </tr>
                      ))
                    )}
                    <tr className="bg-slate-50 font-semibold">
                      <td colSpan={2} className="px-3 py-2 text-right">Current year earnings</td>
                      <td className="px-3 py-2 text-right">{money(bsQuery.data.equity.current_year_earnings)}</td>
                    </tr>
                    <tr className="bg-slate-50 font-semibold">
                      <td colSpan={2} className="px-3 py-2 text-right">Total equity</td>
                      <td className="px-3 py-2 text-right">{money(bsQuery.data.equity.total)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      {/* TRIAL BALANCE */}
      {tab === "tb" ? (
        <div className="space-y-3">
          {tbQuery.isError ? <p className="text-sm text-red-600">Could not load trial balance.</p> : null}
          {tbQuery.data?.summary ? (
            <div className="grid gap-2 md:grid-cols-3">
              <SummaryCard label="Grand total debits" value={money(tbQuery.data.summary.grand_total_debits)} />
              <SummaryCard label="Grand total credits" value={money(tbQuery.data.summary.grand_total_credits)} />
              <SummaryCard
                label="Debits = credits"
                value={tbQuery.data.summary.balanced ? "Balanced" : "Out of balance"}
                tone={tbQuery.data.summary.balanced ? "positive" : "negative"}
              />
            </div>
          ) : null}
          <div className="overflow-x-auto rounded border border-slate-200 bg-white">
            <table className="min-w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-3 py-2">Account #</th>
                  <th className="px-3 py-2">Account</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2 text-right">Debits</th>
                  <th className="px-3 py-2 text-right">Credits</th>
                  <th className="px-3 py-2 text-right">Net</th>
                </tr>
              </thead>
              <tbody>
                {tbQuery.isLoading ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-4 text-slate-500">Loading…</td>
                  </tr>
                ) : null}
                {!tbQuery.isLoading && tbRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-4 text-slate-500">No rows</td>
                  </tr>
                ) : null}
                {tbRows.map((row) => (
                  <tr key={row.account_id} className="border-b border-slate-100">
                    <td className="px-3 py-2 font-medium text-slate-900">{row.account_code || "—"}</td>
                    <td className="px-3 py-2"><AccountCell code={row.account_code} name={row.account_name} /></td>
                    <td className="px-3 py-2">{row.account_type || "—"}</td>
                    <td className="px-3 py-2 text-right">{money(row.total_debits)}</td>
                    <td className="px-3 py-2 text-right">{money(row.total_credits)}</td>
                    <td className={`px-3 py-2 text-right ${row.net_balance < 0 ? "text-rose-700" : "text-slate-900"}`}>{money(row.net_balance)}</td>
                  </tr>
                ))}
                {tbQuery.data?.summary ? (
                  <tr className="bg-slate-50 font-semibold">
                    <td colSpan={3} className="px-3 py-2 text-right">Grand total</td>
                    <td className="px-3 py-2 text-right">{money(tbQuery.data.summary.grand_total_debits)}</td>
                    <td className="px-3 py-2 text-right">{money(tbQuery.data.summary.grand_total_credits)}</td>
                    <td className="px-3 py-2" />
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: string; tone?: "positive" | "negative" }) {
  const border = tone === "negative" ? "border-rose-300" : tone === "positive" ? "border-emerald-200" : "border-slate-200";
  const text = tone === "negative" ? "text-rose-700" : tone === "positive" ? "text-emerald-700" : "text-slate-900";
  return (
    <div className={`rounded border bg-white px-3 py-2 ${border}`}>
      <div className="text-[11px] font-semibold uppercase text-slate-500">{label}</div>
      <div className={`text-lg font-semibold ${text}`}>{value}</div>
    </div>
  );
}

function StatementTable({
  title,
  head,
  rows,
  totalLabel,
  totalValue,
  emptyColSpan,
}: {
  title: string;
  head: string[];
  rows: React.ReactNode[];
  totalLabel: string;
  totalValue: string;
  emptyColSpan: number;
}) {
  return (
    <div className="overflow-x-auto rounded border border-slate-200 bg-white">
      <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold">{title}</div>
      <table className="min-w-full text-left text-xs">
        <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
          <tr>
            {head.map((h, i) => (
              <th key={h} className={`px-3 py-2 ${i === head.length - 1 ? "text-right" : ""}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={emptyColSpan} className="px-3 py-4 text-slate-500">No rows</td>
            </tr>
          ) : (
            rows
          )}
          <tr className="bg-slate-50 font-semibold">
            <td colSpan={emptyColSpan - 1} className="px-3 py-2 text-right">{totalLabel}</td>
            <td className="px-3 py-2 text-right">{totalValue}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
