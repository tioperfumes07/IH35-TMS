import { useMemo, useState } from "react";
import { DatePicker } from "../../components/forms/DatePicker";
import { useQuery } from "@tanstack/react-query";
import { Button } from "../../components/Button";
import { PageHeader } from "../../components/layout/PageHeader";
import { useCompanyContext } from "../../contexts/CompanyContext";
import {
  exportCashFlowStatementReport,
  getCashFlowStatementReport,
  type AccountingCashFlowLine,
} from "../../api/reports";
import { ReportBlockTPendingBanner } from "./ReportBlockTPendingBanner";
import { ReportsSubNav } from "./ReportsSubNav";
import { CollapsedListFilters, useStagedListFilters } from "../../components/table";
import { formatAccountTypeLabel } from "../../lib/formatAccountTypeLabel";
import { formatCashFlowCompoundLabel } from "../../lib/formatCashFlowCompoundLabel";
import { humanizeEnumLabel } from "../../lib/humanizeEnumLabel";
import { formatDateUS } from "../../lib/formatDate";
import { printLetterHtml } from "../../lib/openPrintableDocument";
import { useExportAction } from "../../hooks/useExportAction";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
}

function currentMonthRange() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

function sortLines(lines: AccountingCashFlowLine[]) {
  return [...lines].sort((a, b) => String(a.label || "").localeCompare(String(b.label || "")));
}

export function CashFlowStatementPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const defaultRange = currentMonthRange();
  const [applied, setApplied] = useState(defaultRange);
  const staged = useStagedListFilters({
    applied,
    empty: defaultRange,
    onApply: setApplied,
  });
  const exportAction = useExportAction();

  const query = useQuery({
    queryKey: ["reports", "cash-flow-statement", companyId, applied.start, applied.end],
    queryFn: () =>
      getCashFlowStatementReport({
        operating_company_id: companyId,
        from_date: applied.start,
        to_date: applied.end,
      }),
    enabled: Boolean(companyId),
    retry: false,
  });

  const operatingLines = useMemo(() => sortLines(query.data?.operating.lines ?? []), [query.data?.operating.lines]);
  const investingLines = useMemo(() => sortLines(query.data?.investing.lines ?? []), [query.data?.investing.lines]);
  const financingLines = useMemo(() => sortLines(query.data?.financing.lines ?? []), [query.data?.financing.lines]);

  function printLetter() {
    const data = query.data;
    if (!data) return;
    const esc = (v: unknown) =>
      String(v ?? "—")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    const sectionHtml = (title: string, lines: AccountingCashFlowLine[], total: number) => {
      const rows = lines
        .map(
          (line) => `<tr>
            <td>${esc(formatCashFlowCompoundLabel(line.label) || line.label)}</td>
            <td>${esc(formatAccountTypeLabel(line.account_type))}</td>
            <td style="text-align:right">${esc(money(line.amount))}</td>
          </tr>`,
        )
        .join("");
      return `
        <h1 style="margin-top:16px">${esc(title)}</h1>
        <table>
          <thead><tr><th>Line</th><th>Type</th><th style="text-align:right">Amount</th></tr></thead>
          <tbody>
            ${rows || `<tr><td colspan="3">No rows</td></tr>`}
            <tr><th colspan="2">Total</th><td style="text-align:right">${esc(money(total))}</td></tr>
          </tbody>
        </table>`;
    };
    printLetterHtml({
      title: `Cash flow statement ${applied.start}_${applied.end}`,
      bodyHtml: `
        <h1>Cash flow statement</h1>
        <div class="meta">${esc(formatDateUS(applied.start))} → ${esc(formatDateUS(applied.end))} · Accrual · printed ${esc(
          new Date().toLocaleString(),
        )}</div>
        <table>
          <tbody>
            <tr><th>Net cash change</th><td>${esc(money(data.net_cash_change))}</td></tr>
            <tr><th>Cash at start</th><td>${esc(money(data.cash_at_start))}</td></tr>
            <tr><th>Cash at end</th><td>${esc(money(data.cash_at_end))}</td></tr>
            <tr><th>Reconciliation</th><td>${esc(
              !data.reconciled
                ? "Needs review"
                : data.unclassified_leg_count > 0
                  ? "Reconciled — unclassified legs"
                  : "Reconciled",
            )}</td></tr>
            <tr><th>Unclassified legs</th><td>${esc(String(data.unclassified_leg_count))}</td></tr>
          </tbody>
        </table>
        ${sectionHtml("Operating activities", operatingLines, data.operating.total)}
        ${sectionHtml("Investing activities", investingLines, data.investing.total)}
        ${sectionHtml("Financing activities", financingLines, data.financing.total)}
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
        title="Cash flow statement"
        subtitle="Operating, investing, and financing movements · Accrual basis"
        backHref="/reports"
        breadcrumb={["Reports", "Cash Flow Statement"]}
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
                    exportCashFlowStatementReport({
                      operating_company_id: companyId,
                      range_key: "custom",
                      from_date: applied.start,
                      to_date: applied.end,
                      format: "pdf",
                    }),
                  "Cash flow statement export failed",
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
                    exportCashFlowStatementReport({
                      operating_company_id: companyId,
                      range_key: "custom",
                      from_date: applied.start,
                      to_date: applied.end,
                      format: "xlsx",
                    }),
                  "Cash flow statement export failed",
                )
              }
            >
              Export XLSX
            </Button>
          </div>
        }
      />

      {!companyId ? <p className="text-sm text-red-600">Select an operating company.</p> : null}
      <p className="rounded-sm border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        This report is always accrual basis under the owner-locked reporting policy.
      </p>
      {query.isError ? <ReportBlockTPendingBanner error={query.error} onRetry={() => void query.refetch()} /> : null}
      {exportAction.error ? (
        <p role="alert" className="no-print text-xs text-red-700">
          {exportAction.error}
        </p>
      ) : null}

      <CollapsedListFilters
        activeFilterCount={JSON.stringify(applied) !== JSON.stringify(defaultRange) ? 1 : 0}
        onApply={staged.apply}
        onReset={staged.reset}
        onCancel={staged.cancel}
        applyDisabled={!staged.dirty}
        testIdPrefix="reports-cash-flow-statement"
        className="no-print rounded-sm border border-gray-200 bg-white p-3"
      >
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-gray-600">
            From
            <DatePicker
              className="mt-1 block h-9"
              value={staged.draft.start}
              onChange={(next) => staged.setDraft((previous) => ({ ...previous, start: next }))}
            />
          </label>
          <label className="text-xs text-gray-600">
            To
            <DatePicker
              className="mt-1 block h-9"
              value={staged.draft.end}
              onChange={(next) => staged.setDraft((previous) => ({ ...previous, end: next }))}
            />
          </label>
        </div>
      </CollapsedListFilters>

      {query.data ? (
        <div className="grid gap-2 md:grid-cols-4">
          <div className="rounded-sm border border-gray-200 bg-white px-3 py-2">
            <div className="text-[11px] font-semibold uppercase text-gray-500">Net cash change</div>
            <div className="text-lg font-semibold">{money(query.data.net_cash_change)}</div>
          </div>
          <div className="rounded-sm border border-gray-200 bg-white px-3 py-2">
            <div className="text-[11px] font-semibold uppercase text-gray-500">Cash at start</div>
            <div className="text-lg font-semibold">{money(query.data.cash_at_start)}</div>
          </div>
          <div className="rounded-sm border border-gray-200 bg-white px-3 py-2">
            <div className="text-[11px] font-semibold uppercase text-gray-500">Cash at end</div>
            <div className="text-lg font-semibold">{money(query.data.cash_at_end)}</div>
          </div>
          <div
            className={`rounded-sm border bg-white px-3 py-2 ${
              query.data.reconciled && query.data.unclassified_leg_count === 0 ? "border-emerald-200" : "border-amber-300"
            }`}
          >
            <div className="text-[11px] font-semibold uppercase text-gray-500">Reconciliation</div>
            <div
              className={`text-lg font-semibold ${
                query.data.reconciled && query.data.unclassified_leg_count === 0 ? "text-emerald-700" : "text-amber-700"
              }`}
            >
              {!query.data.reconciled
                ? "Needs review"
                : query.data.unclassified_leg_count > 0
                  ? "Reconciled — unclassified legs"
                  : "Reconciled"}
            </div>
            <div className={query.data.unclassified_leg_count > 0 ? "text-[11px] font-semibold text-slate-700" : "text-[11px] text-gray-500"}>
              Unclassified legs: {query.data.unclassified_leg_count}
              {query.data.unclassified_leg_count > 0
                ? " — bucketed into Operating by default, may not reflect the true Operating/Investing/Financing split"
                : ""}
            </div>
          </div>
        </div>
      ) : null}

      {query.isLoading ? <p className="text-sm text-gray-500">Loading…</p> : null}

      {query.data ? (
        <div className="space-y-3">
          {[
            { key: "operating", title: "Operating activities", lines: operatingLines, total: query.data.operating.total },
            { key: "investing", title: "Investing activities", lines: investingLines, total: query.data.investing.total },
            { key: "financing", title: "Financing activities", lines: financingLines, total: query.data.financing.total },
          ].map((section) => (
            <div key={section.key} className="overflow-x-auto rounded-sm border border-gray-200 bg-white">
              <div className="border-b border-gray-200 bg-gray-50 px-3 py-2 text-sm font-semibold">{section.title}</div>
              <table className="min-w-full text-left text-xs">
                <thead className="border-b border-gray-200 bg-gray-50 text-[11px] font-semibold uppercase tracking-wide text-gray-600">
                  <tr>
                    <th className="px-3 py-2">Class</th>
                    <th className="px-3 py-2">Subtype</th>
                    <th className="px-3 py-2">Label</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {section.lines.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-4 text-gray-500">
                        No rows
                      </td>
                    </tr>
                  ) : (
                    section.lines.map((line) => (
                      <tr key={`${section.key}-${line.label}`} className="border-b border-gray-100">
                        <td className="px-3 py-2">{formatAccountTypeLabel(line.account_type)}</td>
                        <td className="px-3 py-2">{humanizeEnumLabel(line.account_subtype) || "—"}</td>
                        <td className="px-3 py-2 font-medium text-gray-900">{formatCashFlowCompoundLabel(line.label)}</td>
                        <td className="px-3 py-2 text-right">{money(line.amount)}</td>
                      </tr>
                    ))
                  )}
                  <tr className="bg-slate-50 font-semibold">
                    <td colSpan={3} className="px-3 py-2 text-right">
                      Section total
                    </td>
                    <td className="px-3 py-2 text-right">{money(section.total)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
