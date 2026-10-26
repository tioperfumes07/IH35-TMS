import { companyToday, quarterBoundsIso } from "../../lib/businessDate";
// TABLE_DATE_OMIT: this table has no date column by design — one row per account; the statement's as-of date / period is chosen in the report header, not a column.
import { useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AmountLink, resolveAmountRoute, type AmountFilter } from "../../components/shared/AmountLink";
import { ALL_PAGE_SIZE, ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { useQuery } from "@tanstack/react-query";
import { Button } from "../../components/Button";
import { PageHeader } from "../../components/layout/PageHeader";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { BasisSelector, type AccountingBasis } from "../../components/accounting/BasisSelector";
import {
  exportTrialBalanceReport,
  getArAgingReport,
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
import { TrialBalanceBoard, trialBalanceMeasuredArNote } from "./components/TrialBalanceBoard";
import { V3 } from "../../design/v3-tokens";

// GLB-05 -- delegates to the canonical formatter instead of reimplementing an identical
// local currency formatter (same shape lib/money.ts already covers).
function money(cents: number) {
  if (!cents) return "—";
  return formatUsdCents(cents);
}

/** Board table cells: plain 2-dp numbers (no $), true minus sign, em dash for zero. KPI tiles keep $. */
function cell(cents: number) {
  if (!cents) return "—";
  const s = (Math.abs(cents) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return cents < 0 ? `−${s}` : s;
}

const TB_GEAR_TEST_ID = "trial-balance-column-gear";

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
  return quarterBoundsIso(companyToday());
}

type SortKey = keyof AccountingTrialBalanceRow;

export function TrialBalancePage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [showCodes] = useShowAccountNumbers();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
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

  // Live A/R invoice-list total (the subledger) as of the applied end date, for the Measured note.
  const arSubledgerQuery = useQuery({
    queryKey: ["reports", "trial-balance", "ar-subledger", companyId, applied.end],
    queryFn: () => getArAgingReport(companyId, applied.end),
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

  // Measured A/R note (443.248 / 443.282 / 443.280) — computed live: GL account 1100 net from this TB vs the
  // A/R invoice list (aging) total. No hardcoded dollars; every figure clicks through.
  const measuredArNote = useMemo<ReactNode>(() => {
    if (query.isLoading) return null;
    const ar = (query.data?.rows ?? []).find(
      (row) => row.account_code === "1100" || row.account_name.toLowerCase().includes("accounts receivable"),
    );
    if (!ar) return trialBalanceMeasuredArNote(null);
    const glFilter = tbFilter(ar.account_id && !SYNTHETIC_ACCOUNT_IDS.has(ar.account_id), ar.account_id, applied);
    const glNode = (
      <AmountLink filter={glFilter} data-testid="tb-measured-gl">
        {formatUsdCents(ar.net_balance)}
      </AmountLink>
    );
    const sub = arSubledgerQuery.data;
    if (!sub) {
      return (
        <>
          Account 1100 (A/R) nets {glNode} on this trial balance — reconcile the invoice subledger before trusting any AR
          report (assigned 443.248).
        </>
      );
    }
    const subNode = (
      <Link to="/reports/ar-aging" style={{ color: V3.link }} className="hover:underline" data-testid="tb-measured-subledger">
        {formatUsdCents(sub.total_open_cents)}
      </Link>
    );
    const diff = ar.net_balance - sub.total_open_cents;
    if (diff === 0) {
      return (
        <>
          A/R in the ledger nets {glNode} and the invoice list shows {subNode} open — the subledger and GL tie.
        </>
      );
    }
    return (
      <>
        A/R in the ledger nets {glNode} while the invoice list shows {subNode} open — the subledger and GL do not tie by{" "}
        {formatUsdCents(Math.abs(diff))}. Must reconcile before any AR report is trusted (assigned 443.248).
      </>
    );
  }, [query.isLoading, query.data?.rows, arSubledgerQuery.data, applied]);

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
            {cell(row.total_debits)}
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
            {cell(row.total_credits)}
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
              {cell(row.net_balance)}
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
    <div className="space-y-3 print:space-y-2">
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
              Print
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

      <TrialBalanceBoard
        summary={summary}
        accountCount={rows.length}
        loading={query.isLoading}
        measuredArNote={measuredArNote}
        onTotalsDrill={
          resolveAmountRoute(grandTotalLedger)
            ? () => {
                const to = resolveAmountRoute(grandTotalLedger);
                if (to) navigate(to);
              }
            : undefined
        }
        onCustomize={() => {
          const gear = document.querySelector<HTMLButtonElement>(`[data-testid="${TB_GEAR_TEST_ID}"]`);
          gear?.click();
        }}
      >
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
          gearButtonTestId={TB_GEAR_TEST_ID}
        />
      </TrialBalanceBoard>
    </div>
  );
}
