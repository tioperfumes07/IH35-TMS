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
  exportTrialBalanceReport,
  getTrialBalanceReport,
  type AccountingTrialBalanceRow,
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

const SYNTHETIC_ACCOUNT_IDS = new Set(["cash-basis-ar-row", "cash-basis-ap-row"]);

/** One place that turns a trial-balance row into an AmountLink filter, so the three amount columns
 *  cannot drift apart. Returns null when the row cannot drill, which AmountLink renders as plain
 *  text rather than a dead link. */
function tbFilter(
  canDrill: unknown,
  accountId: string | undefined,
  applied: { start: string; end: string; basis: AccountingBasis }
): AmountFilter | null {
  if (!canDrill || !accountId) return null;
  // basis goes through verbatim. AmountLink owns THE BASIS RULE — a cash-basis figure gets no
  // register drill, because the register is accrual-only and the two would not tie. This page does
  // not decide that; if it did, the rule would drift page by page.
  return { target: "register", accountId, from: applied.start, to: applied.end, basis: applied.basis };
}

function currentQuarterRange() {
  const now = new Date();
  const q = Math.floor(now.getUTCMonth() / 3);
  const startMonth = q * 3;
  const start = new Date(Date.UTC(now.getUTCFullYear(), startMonth, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), startMonth + 3, 0));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

type SortKey = keyof AccountingTrialBalanceRow;

export function TrialBalancePage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [showCodes] = useShowAccountNumbers();
  const [searchParams, setSearchParams] = useSearchParams();
  const emptyFilters = { ...currentQuarterRange(), basis: "accrual" as AccountingBasis };
  const [applied, setApplied] = useState(emptyFilters);
  const staged = useStagedListFilters({ applied, empty: emptyFilters, onApply: setApplied });
  const exportAction = useExportAction();
  const [reportSearch, setReportSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("account_code");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const query = useQuery({
    queryKey: ["reports", "trial-balance", companyId, applied.start, applied.end, applied.basis],
    queryFn: () =>
      getTrialBalanceReport({
        operating_company_id: companyId,
        from_date: applied.start,
        to_date: applied.end,
        basis: applied.basis,
      }),
    enabled: Boolean(companyId),
    retry: false,
  });

  const rows = useMemo(() => {
    const input = [...(query.data?.rows ?? [])];
    if (applied.basis === "cash") {
      const hasAr = input.some((row) => row.account_name.toLowerCase().includes("accounts receivable") || row.account_code === "1100");
      const hasAp = input.some((row) => row.account_name.toLowerCase().includes("accounts payable") || row.account_code === "2000");
      if (!hasAr) {
        input.push({
          account_id: "cash-basis-ar-row",
          account_code: "1100",
          account_name: "Accounts Receivable",
          account_type: "Asset",
          total_debits: 0,
          total_credits: 0,
          net_balance: 0,
        });
      }
      if (!hasAp) {
        input.push({
          account_id: "cash-basis-ap-row",
          account_code: "2000",
          account_name: "Accounts Payable",
          account_type: "Liability",
          total_debits: 0,
          total_credits: 0,
          net_balance: 0,
        });
      }
    }
    const q = reportSearch.toLowerCase();
    const filtered = q ? input.filter((row) => String(row.account_name ?? "").toLowerCase().includes(q) || String(row.account_code ?? "").toLowerCase().includes(q)) : input;
    const mul = sortDir === "asc" ? 1 : -1;
    const output = [...filtered];
    output.sort((a, b) => {
      if (sortKey === "account_code" || sortKey === "account_name" || sortKey === "account_type") {
        return String(a[sortKey]).localeCompare(String(b[sortKey])) * mul;
      }
      return ((a[sortKey] as number) - (b[sortKey] as number)) * mul;
    });
    return output;
  }, [query.data?.rows, sortDir, sortKey, reportSearch, applied.basis]);

  const summary = query.data?.summary;

  // LEAD 443.181 — the account name + every amount keep their register AmountLink (the row opens the account
  // ledger). LST-F405 — canDrill already excludes SYNTHETIC_ACCOUNT_IDS, so the synthetic cash-basis AR/AP rows
  // stay plain text instead of linking to an id that is not a real account.
  const tbColumns = useMemo<ParityColumn<AccountingTrialBalanceRow>[]>(() => {
    const canDrill = (row: AccountingTrialBalanceRow) => row.account_id && !SYNTHETIC_ACCOUNT_IDS.has(row.account_id);
    const cols: ParityColumn<AccountingTrialBalanceRow>[] = [];
    if (showCodes) {
      cols.push({ key: "account_code", label: "Account #", sortable: true, render: (row) => <span className="font-medium text-gray-900">{row.account_code || "—"}</span> });
    }
    cols.push(
      {
        key: "account_name",
        label: "Account",
        sortable: true,
        render: (row) => (
          <AmountLink
            filter={tbFilter(canDrill(row), row.account_id, applied)}
            className="text-[#1F2A44] underline-offset-2 hover:underline"
            data-testid={`tb-name-${row.account_id}`}
          >
            {row.account_name || "—"}
          </AmountLink>
        ),
      },
      { key: "account_type", label: "Type", sortable: true, render: (row) => formatAccountTypeLabel(row.account_type) },
      {
        key: "total_debits",
        label: "Debits",
        sortable: true,
        kind: "money",
        render: (row) => (
          <AmountLink filter={tbFilter(canDrill(row), row.account_id, applied)} data-testid={`tb-debits-${row.account_id}`}>
            {money(row.total_debits)}
          </AmountLink>
        ),
      },
      {
        key: "total_credits",
        label: "Credits",
        sortable: true,
        kind: "money",
        render: (row) => (
          <AmountLink filter={tbFilter(canDrill(row), row.account_id, applied)} data-testid={`tb-credits-${row.account_id}`}>
            {money(row.total_credits)}
          </AmountLink>
        ),
      },
      {
        key: "net_balance",
        label: "Net",
        sortable: true,
        kind: "money",
        render: (row) => (
          <span className={row.net_balance < 0 ? "text-rose-700" : "text-[#0F1219]"}>
            <AmountLink filter={tbFilter(canDrill(row), row.account_id, applied)} data-testid={`tb-net-${row.account_id}`}>
              {money(row.net_balance)}
            </AmountLink>
          </span>
        ),
      },
    );
    return cols;
  }, [showCodes, applied]);

  // The grand totals are the server summary over every posted account row, so they drill to the ledger lines
  // of exactly those accounts (same shape as the P&L / Balance Sheet section totals). A row with no account id
  // means no ledger list sums to it, so the total stays plain. AmountLink owns the basis rule.
  const grandTotalLedger = useMemo<AmountFilter | null>(() => {
    const serverRows = query.data?.rows ?? [];
    if (!serverRows.length || serverRows.some((r) => !r.account_id || SYNTHETIC_ACCOUNT_IDS.has(r.account_id))) return null;
    return { target: "ledger", accountIds: serverRows.map((r) => String(r.account_id)), from: applied.start, to: applied.end, basis: applied.basis };
  }, [query.data?.rows, applied]);

  function printLetter() {
    if (!query.data) return;
    const esc = (v: unknown) =>
      String(v ?? "—")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    const showCodes = getShowAccountNumbers();
    const rowsHtml = rows
      .map(
        (row) => `<tr>
          ${showCodes ? `<td>${esc(row.account_code || "—")}</td>` : ""}
          <td>${esc(row.account_name || "—")}</td>
          <td>${esc(formatAccountTypeLabel(row.account_type))}</td>
          <td className="text-right tabular-nums" style="text-align:right">${esc(money(row.total_debits))}</td>
          <td className="text-right tabular-nums" style="text-align:right">${esc(money(row.total_credits))}</td>
          <td className="text-right tabular-nums" style="text-align:right">${esc(money(row.net_balance))}</td>
        </tr>`,
      )
      .join("");
    const s = summary;
    printLetterHtml({
      title: `Trial balance ${applied.start}_${applied.end}`,
      bodyHtml: `
        <h1>Trial balance</h1>
        <div class="meta">${esc(mmmDd(applied.start))} → ${esc(mmmDd(applied.end))} · ${esc(
          applied.basis === "cash" ? "Cash" : "Accrual",
        )} · printed ${esc(mmmDdTime(new Date()))}</div>
        <table>
          <tbody>
            <tr><th>Total debits</th><td className="text-right tabular-nums">${esc(money(s?.grand_total_debits ?? 0))}</td></tr>
            <tr><th>Total credits</th><td className="text-right tabular-nums">${esc(money(s?.grand_total_credits ?? 0))}</td></tr>
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
          <tbody>${rowsHtml || `<tr><td colspan="6">No rows</td></tr>`}</tbody>
        </table>
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
        title="Trial balance"
        subtitle={`Ledger debits and credits by account · ${applied.basis === "cash" ? "Cash" : "Accrual"} basis`}
        backHref="/reports"
        breadcrumb={["Reports", "Trial Balance"]}
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
                    exportTrialBalanceReport({
                      operating_company_id: companyId,
                      as_of_date: applied.end,
                      format: "pdf",
                    }),
                  "Trial balance export failed",
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
                    exportTrialBalanceReport({
                      operating_company_id: companyId,
                      as_of_date: applied.end,
                      format: "xlsx",
                    }),
                  "Trial balance export failed",
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
        testIdPrefix="reports-trial-balance"
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

      {summary ? (
        <div className="grid gap-2 md:grid-cols-3">
          <div className="rounded-sm border border-gray-200 bg-white px-3 py-2">
            <div className="text-section-header font-semibold uppercase text-gray-500">Grand total debits</div>
            <div className="text-page-title font-semibold">{money(summary.grand_total_debits)}</div>
          </div>
          <div className="rounded-sm border border-gray-200 bg-white px-3 py-2">
            <div className="text-section-header font-semibold uppercase text-gray-500">Grand total credits</div>
            <div className="text-page-title font-semibold">{money(summary.grand_total_credits)}</div>
          </div>
          <div className={`rounded-sm border bg-white px-3 py-2 ${summary.balanced ? "border-emerald-200" : "border-rose-300"}`}>
            <div className="text-section-header font-semibold uppercase text-gray-500">Balance check</div>
            <div className={`text-page-title font-semibold ${summary.balanced ? "text-emerald-700" : "text-rose-700"}`}>
              {summary.balanced ? "Balanced" : "Out of balance"}
            </div>
          </div>
        </div>
      ) : null}

      <ParityTable
        rows={rows}
        columns={tbColumns}
        rowKey={(row) => row.account_id}
        loading={query.isLoading}
        storageKey="ih35.reports.trial-balance.accounts.v1"
        emptyText="No rows"
        // LEAD 443.181 — ParityTable owns the header clicks; the page keeps the sorted order (default
        // account_code asc, same comparator as before) so the printed letter follows the screen.
        sortKey={sortKey}
        sortDirection={sortDir}
        onSortChange={(key, direction) => {
          setSortKey(key as SortKey);
          setSortDir(direction);
        }}
        sortMode="external"
        pageSize={ALL_PAGE_SIZE}
        hidePager
        suppressToolbarSearch
        suppressToolbarRange
        footerCells={
          summary
            ? {
                account_name: "Grand total",
                total_debits: <MoneyCell cents={summary.grand_total_debits} format={money} drill={{ amount: grandTotalLedger }} />,
                total_credits: <MoneyCell cents={summary.grand_total_credits} format={money} drill={{ amount: grandTotalLedger }} />,
              }
            : undefined
        }
      />
    </div>
  );
}
