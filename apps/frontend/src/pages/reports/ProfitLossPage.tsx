import { companyToday, monthBoundsIso } from "../../lib/businessDate";
// TABLE_DATE_OMIT: this table has no date column by design — one row per account; the statement's as-of date / period is chosen in the report header, not a column.
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AmountLink, type AmountFilter } from "../../components/shared/AmountLink";
import { MoneyCell } from "../../components/shared/MoneyCell";
import { ALL_PAGE_SIZE, ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { useQuery } from "@tanstack/react-query";
import { Button } from "../../components/Button";
import { PageHeader } from "../../components/layout/PageHeader";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { BasisSelector, type AccountingBasis } from "../../components/accounting/BasisSelector";
import {
  exportProfitLossReport,
  getProfitLossReport,
  type AccountingProfitLossLine,
} from "../../api/reports";
import { ReportBlockTPendingBanner } from "./ReportBlockTPendingBanner";
import { ReportsSubNav } from "./ReportsSubNav";
import { ReportFilterBar } from "../../components/reports/ReportFilterBar";
import { useStagedListFilters } from "../../components/table";
import { formatAccountTypeLabel } from "../../lib/formatAccountTypeLabel";
import { mmmDd, mmmDdTime } from "../../lib/formatDate";
import { printLetterHtml } from "../../lib/openPrintableDocument";
import { getShowAccountNumbers } from "../../lib/show-account-numbers";
import { useShowAccountNumbers } from "../../lib/useShowAccountNumbers";
import { useExportAction } from "../../hooks/useExportAction";

import { formatUsdCents } from "../../lib/money";

// GLB-05 -- delegates to the canonical formatter instead of reimplementing an identical
// local currency formatter (same shape lib/money.ts already covers).
function money(cents: number) {
  if (!cents) return "—";
  return formatUsdCents(cents);
}

function currentMonthRange() {
  return monthBoundsIso(companyToday());
}

function sortLines(lines: AccountingProfitLossLine[]) {
  return [...lines].sort((a, b) => String(a.account_code || "").localeCompare(String(b.account_code || "")));
}

/** One place that turns a P&L line into an AmountLink filter, so the account NAME link and the
 *  AMOUNT link cannot drift apart and the basis is carried on both. AmountLink owns THE BASIS RULE
 *  — a cash-basis figure gets no register drill, because the register is accrual-only and the two
 *  would not tie. This page passes the applied basis through and decides nothing itself. */
function plFilter(
  accountId: string | null | undefined,
  applied: { start: string; end: string; basis: AccountingBasis }
): AmountFilter | null {
  if (!accountId) return null;
  return { target: "register", accountId, from: applied.start, to: applied.end, basis: applied.basis };
}


/** ROUND 433.2 — a section TOTAL drills to the ledger lines of exactly that section's accounts. Every line must name its
 *  account (a synthetic line has no ledger to open), or the total stays plain rather than drilling to a partial list. */
function sectionLedger(
  lines: ReadonlyArray<{ account_id?: string | null }>,
  from: string,
  to: string,
  basis: AccountingBasis
): AmountFilter | null {
  if (!lines.length || lines.some((l) => !l.account_id)) return null;
  return { target: "ledger", accountIds: lines.map((l) => String(l.account_id)), from, to, basis };
}

export function ProfitLossPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [showCodes] = useShowAccountNumbers();
  const [searchParams, setSearchParams] = useSearchParams();
  const emptyFilters = { ...currentMonthRange(), basis: "accrual" as AccountingBasis };
  const [applied, setApplied] = useState(emptyFilters);
  const staged = useStagedListFilters({ applied, empty: emptyFilters, onApply: setApplied });
  const exportAction = useExportAction();
  const [reportSearch, setReportSearch] = useState("");

  const query = useQuery({
    queryKey: ["reports", "profit-loss", companyId, applied.start, applied.end, applied.basis],
    queryFn: () =>
      getProfitLossReport({
        operating_company_id: companyId,
        from_date: applied.start,
        to_date: applied.end,
        basis: applied.basis,
      }),
    enabled: Boolean(companyId),
    retry: false,
  });

  const revenueLines = useMemo(() => {
    const q = reportSearch.toLowerCase();
    return sortLines(query.data?.revenue.lines ?? []).filter((line) => {
      if (!q) return true;
      return String(line.account_name ?? "").toLowerCase().includes(q) || String(line.account_code ?? "").toLowerCase().includes(q);
    });
  }, [query.data?.revenue.lines, reportSearch]);
  const cogsLines = useMemo(() => {
    const q = reportSearch.toLowerCase();
    return sortLines(query.data?.cogs.lines ?? []).filter((line) => {
      if (!q) return true;
      return String(line.account_name ?? "").toLowerCase().includes(q) || String(line.account_code ?? "").toLowerCase().includes(q);
    });
  }, [query.data?.cogs.lines, reportSearch]);
  const expenseLines = useMemo(() => {
    const q = reportSearch.toLowerCase();
    return sortLines(query.data?.operating_expenses.lines ?? []).filter((line) => {
      if (!q) return true;
      return String(line.account_name ?? "").toLowerCase().includes(q) || String(line.account_code ?? "").toLowerCase().includes(q);
    });
  }, [query.data?.operating_expenses.lines, reportSearch]);

  // LEAD 443.181 — one ParityTable per P&L section. Account name + amount keep their register AmountLink (the row
  // opens the account ledger); the section total moves to the footer.
  const plColumns = useMemo<ParityColumn<AccountingProfitLossLine>[]>(() => {
    const cols: ParityColumn<AccountingProfitLossLine>[] = [];
    if (showCodes) {
      cols.push({ key: "account_code", label: "Account #", sortable: true, render: (line) => <span className="font-medium text-gray-900">{line.account_code || "—"}</span> });
    }
    cols.push(
      {
        key: "account_name",
        label: "Account",
        sortable: true,
        render: (line) => (
          <AmountLink
            filter={plFilter(line.account_id, applied)}
            className="text-[#1F2A44] underline-offset-2 hover:underline"
            data-testid={`pl-name-${line.account_id}`}
          >
            {line.account_name || "—"}
          </AmountLink>
        ),
      },
      { key: "account_type", label: "Type", sortable: true, render: (line) => formatAccountTypeLabel(line.account_type) },
      {
        key: "amount",
        label: "Amount",
        sortable: true,
        kind: "money",
        sortValue: (line) => line.amount,
        render: (line) => (
          // LST-F405 — the account NAME drilled; the AMOUNT did not. The filter
          // behind this figure IS its drill target: this account over this period.
          <AmountLink filter={plFilter(line.account_id, applied)} data-testid={`pl-amount-${line.account_id}`}>
            {money(line.amount)}
          </AmountLink>
        ),
      },
    );
    return cols;
  }, [showCodes, applied]);

  function printLetter() {
    const data = query.data;
    if (!data) return;
    const esc = (v: unknown) =>
      String(v ?? "—")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    const showCodes = getShowAccountNumbers();
    const sectionHtml = (
      title: string,
      lines: AccountingProfitLossLine[],
      total: number,
    ) => {
      const rows = lines
        .map(
          (line) => `<tr>
            ${showCodes ? `<td>${esc(line.account_code || "—")}</td>` : ""}
            <td>${esc(line.account_name || "—")}</td>
            <td>${esc(formatAccountTypeLabel(line.account_type))}</td>
            <td className="text-right tabular-nums" style="text-align:right">${esc(money(line.amount))}</td>
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
            <tr><th colspan="${colSpan}">Total</th><td className="text-right tabular-nums" style="text-align:right">${esc(money(total))}</td></tr>
          </tbody>
        </table>`;
    };
    printLetterHtml({
      title: `Profit & loss ${applied.start}_${applied.end}`,
      bodyHtml: `
        <h1>Profit &amp; loss</h1>
        <div class="meta">${esc(mmmDd(applied.start))} → ${esc(mmmDd(applied.end))} · ${esc(
          applied.basis === "cash" ? "Cash" : "Accrual",
        )} · printed ${esc(mmmDdTime(new Date()))}</div>
        <table>
          <tbody>
            <tr><th>Revenue total</th><td className="text-right tabular-nums">${esc(money(data.revenue.total))}</td></tr>
            <tr><th>Gross profit</th><td className="text-right tabular-nums">${esc(money(data.gross_profit))}</td></tr>
            <tr><th>Net income</th><td className="text-right tabular-nums">${esc(money(data.net_income))}</td></tr>
          </tbody>
        </table>
        ${sectionHtml("Revenue", revenueLines, data.revenue.total)}
        ${sectionHtml("Cost of goods sold", cogsLines, data.cogs.total)}
        ${sectionHtml("Operating expenses", expenseLines, data.operating_expenses.total)}
      `,
    });
  }

  return (
    <div className="space-y-4 print:space-y-2">
      <style>{`
        @media print { .no-print { display: none !important; } body { background: white; } }
      `}</style>
      <ReportsSubNav />
      <PageHeader
        title="Profit & loss"
        subtitle={`Revenue, COGS, expenses, and net income — ${applied.basis === "cash" ? "Cash" : "Accrual"} basis`}
        backHref="/reports"
        breadcrumb={["Reports", "Profit & Loss"]}
        actions={
          <div className="no-print flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={printLetter} disabled={!query.data}>
              Print this page
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={!companyId || exportAction.pending}
              onClick={() =>
                void exportAction.run(
                  () =>
                    exportProfitLossReport({
                      operating_company_id: companyId,
                      range_key: "custom",
                      from_date: applied.start,
                      to_date: applied.end,
                      format: "pdf",
                    }),
                  "Profit & loss export failed",
                )
              }
            >
              Export PDF
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={!companyId || exportAction.pending}
              onClick={() =>
                void exportAction.run(
                  () =>
                    exportProfitLossReport({
                      operating_company_id: companyId,
                      range_key: "custom",
                      from_date: applied.start,
                      to_date: applied.end,
                      format: "xlsx",
                    }),
                  "Profit & loss export failed",
                )
              }
            >
              Export XLSX
            </Button>
          </div>
        }
      />

      {!companyId ? <p className="text-xs text-red-600">Select an operating company.</p> : null}
      {query.isError ? <ReportBlockTPendingBanner error={query.error} onRetry={() => void query.refetch()} /> : null}
      {exportAction.error ? (
        <p role="alert" className="no-print text-xs text-red-700">
          {exportAction.error}
        </p>
      ) : null}

      <ReportFilterBar
        testIdPrefix="reports-profit-loss"
        fromDate={staged.draft.start}
        toDate={staged.draft.end}
        onFromDateChange={(d) => staged.setDraft((p) => ({ ...p, start: d ?? "" }))}
        onToDateChange={(d) => staged.setDraft((p) => ({ ...p, end: d ?? "" }))}
        onPresetSelect={(preset) => {
          const next = new URLSearchParams(searchParams);
          next.set("preset", preset);
          setSearchParams(next, { replace: true });
        }}
        search={reportSearch}
        onSearchChange={setReportSearch}
        onApply={staged.apply}
        onCancel={staged.cancel}
        onReset={staged.reset}
        applyDisabled={!staged.dirty}
      >
        <BasisSelector
          value={staged.draft.basis}
          onChange={(next) => staged.setDraft((p) => ({ ...p, basis: next }))}
        />
      </ReportFilterBar>

      {query.data ? (
        <div className="grid gap-2 md:grid-cols-3">
          <div className="rounded-sm border border-gray-200 bg-white px-3 py-2">
            <div className="text-section-header font-semibold uppercase text-gray-500">Revenue total</div>
            <div className="text-page-title font-semibold">{money(query.data.revenue.total)}</div>
          </div>
          <div className="rounded-sm border border-gray-200 bg-white px-3 py-2">
            <div className="text-section-header font-semibold uppercase text-gray-500">Gross profit</div>
            <div className="text-page-title font-semibold">{money(query.data.gross_profit)}</div>
          </div>
          <div className={`rounded-sm border bg-white px-3 py-2 ${query.data.net_income < 0 ? "border-rose-300" : "border-emerald-200"}`}>
            <div className="text-section-header font-semibold uppercase text-gray-500">Net income</div>
            <div className={`text-page-title font-semibold ${query.data.net_income < 0 ? "text-rose-700" : "text-emerald-700"}`}>{money(query.data.net_income)}</div>
          </div>
        </div>
      ) : null}

      {query.isLoading ? <p className="text-xs text-gray-500">Loading…</p> : null}

      {query.data ? (
        <div className="space-y-3">
          {[
            { key: "revenue", title: "Revenue", lines: revenueLines, total: query.data.revenue.total },
            { key: "cogs", title: "Cost of goods sold", lines: cogsLines, total: query.data.cogs.total },
            { key: "expenses", title: "Operating expenses", lines: expenseLines, total: query.data.operating_expenses.total },
          ].map((section) => (
            <ParityTable
              key={section.key}
              title={section.title}
              rows={section.lines}
              columns={plColumns}
              rowKey={(line) => `${section.key}-${line.account_code}-${line.account_name}`}
              storageKey={`ih35.reports.profit-loss.${section.key}.v1`}
              emptyText="No rows"
              pageSize={ALL_PAGE_SIZE}
              hidePager
              suppressToolbarSearch
              suppressToolbarRange
              footerCells={{
                account_name: "Section total",
                amount: (
                  <MoneyCell cents={section.total} format={money} drill={{ amount: sectionLedger(section.lines, applied.start, applied.end, applied.basis) }} data-testid={`pl-total-${section.key}`} />
                ),
              }}
            />
          ))}
          <div className="rounded-sm border border-gray-200 bg-white px-3 py-2">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span>Net income</span>
              <span className={query.data.net_income < 0 ? "text-rose-700" : "text-emerald-700"}>{money(query.data.net_income)}</span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
