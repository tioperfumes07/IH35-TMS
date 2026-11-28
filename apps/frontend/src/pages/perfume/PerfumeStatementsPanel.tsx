/**
 * TIO Perfumes · Books · Financial statements — ROUND L.31 M16 (owner 2026-11-27 19:38 CT: "… ACCOUNTING, CHART OF ACCOUNTS … ALL FULLY
 * COMPLETELY DONE"). ScentsX LLC's Profit & Loss, Balance Sheet, Trial Balance and Statement of Cash Flows for any period, accrual or cash,
 * read from the ONE accounting report engine (/api/v1/accounting/profit-loss, balance-sheet, trial-balance, cash-flow) scoped to ScentsX's
 * operating company — the same numbers the books' own pages show, nothing computed here. Every account line opens its register
 * (posted lines, each from its document); PDF and Excel from the engine's own exports. A/R and A/P aging live on Receivables and Payables.
 */
import { formatAccountDisplayLabel } from "../../lib/show-account-numbers";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "../../components/Button";
import { ParityTable } from "../../components/parity/ParityTable";
import { KpiCard } from "../../components/layout/KpiCard";
import { DatePicker } from "../../components/forms/DatePicker";
import { ListErrorState } from "../../components/ListErrorState";
import { useToast } from "../../components/Toast";
import { userFacingApiError } from "../../lib/api-error-message";
import { formatUsdCents } from "../../lib/money";
import {
  exportBalanceSheetReport, exportCashFlowStatementReport, exportProfitLossReport, exportTrialBalanceReport, getBalanceSheetReport,
  getCashFlowStatementReport, getProfitLossReport, getTrialBalanceReport, type AccountingBasis,
} from "../../api/reports";
import { getScentsxAccountRegister, getScentsxCompany, type ScentsxRegisterLine } from "../../api/scentsx";
import { tr } from "./perfumeI18n";
import { DASH, usDate } from "./perfumeDocParts";

type Line = { key: string; account_id: string | null; account: string; type: string; amount: number; section: string };
const todayCT = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
const yearStart = () => `${todayCT().slice(0, 4)}-01-01`;
const money = (c: number) => (c ? formatUsdCents(c) : DASH);
type Report = "pl" | "bs" | "tb" | "cf";
const REPORTS: Array<[Report, string]> = [["pl", "Profit & Loss"], ["bs", "Balance Sheet"], ["tb", "Trial Balance"], ["cf", "Cash flow"]];

export function PerfumeStatementsPanel() {
  const { pushToast } = useToast();
  const co = useQuery({ queryKey: ["scentsx", "company"], queryFn: getScentsxCompany });
  const id = co.data?.company.id ?? "";
  const [report, setReport] = useState<Report>("pl");
  const [from, setFrom] = useState(yearStart());
  const [to, setTo] = useState(todayCT());
  const [basis, setBasis] = useState<AccountingBasis>("accrual");
  const [acct, setAcct] = useState<{ id: string; label: string } | null>(null);
  const on = Boolean(id);
  const pl = useQuery({ queryKey: ["scentsx", "pl", id, from, to, basis], queryFn: () => getProfitLossReport({ operating_company_id: id, from_date: from, to_date: to, basis }), enabled: on && report === "pl" });
  const bs = useQuery({ queryKey: ["scentsx", "bs", id, to, basis], queryFn: () => getBalanceSheetReport({ operating_company_id: id, as_of_date: to, basis }), enabled: on && report === "bs" });
  const tb = useQuery({ queryKey: ["scentsx", "tb", id, from, to, basis], queryFn: () => getTrialBalanceReport({ operating_company_id: id, from_date: from, to_date: to, basis }), enabled: on && report === "tb" });
  const cf = useQuery({ queryKey: ["scentsx", "cf", id, from, to, basis], queryFn: () => getCashFlowStatementReport({ operating_company_id: id, from_date: from, to_date: to, basis }), enabled: on && report === "cf" });
  const q = report === "pl" ? pl : report === "bs" ? bs : report === "tb" ? tb : cf;

  const lines: Line[] = [];
  const add = (section: string, ls: Array<{ account_id?: string | null; account_code?: string | null; account_number?: string | null; account_name?: string | null; label?: string; account_type: string; amount: number }>) =>
    ls.forEach((l, i) => lines.push({ key: `${section}-${l.account_id ?? i}`, account_id: l.account_id ?? null, account: formatAccountDisplayLabel({ account_number: l.account_code ?? l.account_number, account_name: l.account_name ?? l.label }), type: l.account_type, amount: l.amount, section }));
  const kpis: Array<[string, number]> = [];
  if (report === "pl" && pl.data) {
    add("Income", pl.data.revenue.lines); add("Cost of goods sold", pl.data.cogs.lines); add("Expenses", pl.data.operating_expenses.lines);
    kpis.push(["Income", pl.data.revenue.total], ["Cost of goods sold", pl.data.cogs.total], ["Gross profit", pl.data.gross_profit], ["Expenses", pl.data.operating_expenses.total], ["Net income", pl.data.net_income]);
  }
  if (report === "bs" && bs.data) {
    add("Assets", bs.data.assets.lines); add("Liabilities", bs.data.liabilities.lines); add("Equity", bs.data.equity.lines);
    kpis.push(["Assets", bs.data.assets.total], ["Liabilities", bs.data.liabilities.total], ["Equity", bs.data.equity.total], ["Current-year earnings", bs.data.equity.current_year_earnings], ["Liabilities + equity", bs.data.total_liabilities_and_equity]);
  }
  if (report === "tb" && tb.data) {
    tb.data.rows.forEach((r) => lines.push({ key: r.account_id, account_id: r.account_id, account: formatAccountDisplayLabel({ account_number: r.account_code, account_name: r.account_name }), type: r.account_type, amount: r.net_balance, section: `Dr ${money(r.total_debits)} / Cr ${money(r.total_credits)}` }));
    kpis.push(["Total debits", tb.data.summary.grand_total_debits], ["Total credits", tb.data.summary.grand_total_credits]);
  }
  if (report === "cf" && cf.data) {
    add("Operating", cf.data.operating.lines); add("Investing", cf.data.investing.lines); add("Financing", cf.data.financing.lines);
    kpis.push(["Cash at start", cf.data.cash_at_start], ["Operating", cf.data.operating.total], ["Investing", cf.data.investing.total], ["Financing", cf.data.financing.total], ["Cash at end", cf.data.cash_at_end]);
  }
  const check = report === "bs" && bs.data ? (bs.data.balanced ? "Balanced: assets = liabilities + equity" : "NOT BALANCED — assets ≠ liabilities + equity")
    : report === "tb" && tb.data ? (tb.data.summary.balanced ? "Balanced: debits = credits" : "NOT BALANCED — debits ≠ credits")
    : report === "cf" && cf.data ? (cf.data.reconciled ? "Reconciled to the cash accounts" : `Not reconciled — ${cf.data.unclassified_leg_count} unclassified lines`) : null;
  const exp = async (format: "pdf" | "xlsx") => {
    try {
      if (report === "pl") await exportProfitLossReport({ operating_company_id: id, from_date: from, to_date: to, format });
      else if (report === "bs") await exportBalanceSheetReport({ operating_company_id: id, as_of_date: to, format });
      else if (report === "tb") await exportTrialBalanceReport({ operating_company_id: id, from_date: from, as_of_date: to, format });
      else await exportCashFlowStatementReport({ operating_company_id: id, from_date: from, to_date: to, format });
    } catch (e) { pushToast(userFacingApiError(e, "Export failed"), "error"); }
  };
  if (co.isError) return <ListErrorState title={tr("scentsx.st.co_error", "Couldn't load ScentsX")} status={0} message={(co.error as Error)?.message} onRetry={() => void co.refetch()} />;
  return (
    <div className="space-y-3" data-testid="perfume-statements-panel">
      <section className="space-y-2 rounded-[3px] border border-[#D8E0E8] bg-white p-3" aria-label={tr("scentsx.st.title", "Financial statements")}>
        <div className="flex flex-wrap items-end gap-2 text-xs">
          <div className="text-card-title mr-2">{tr("scentsx.st.title", "Financial statements")} · {co.data?.company.legal_name ?? "ScentsX"}</div>
          <span className="flex gap-1" role="group" aria-label="Report">
            {REPORTS.map(([k, l]) => <Button key={k} type="button" variant={report === k ? "primary" : "secondary"} aria-pressed={report === k} className="h-[34px] px-3 text-xs" onClick={() => { setReport(k); setAcct(null); }} data-testid={`scentsx-st-${k}`}>{l}</Button>)}
          </span>
          {report !== "bs" ? <label>{tr("scentsx.st.from", "From")} <DatePicker aria-label="From" value={from} onChange={(v) => setFrom(v || yearStart())} /></label> : null}
          <label>{report === "bs" ? tr("scentsx.st.as_of", "As of") : tr("scentsx.st.to", "To")} <DatePicker aria-label={report === "bs" ? "As of" : "To"} value={to} onChange={(v) => setTo(v || todayCT())} /></label>
          <label>{tr("scentsx.st.basis", "Basis")}
            <select className="block h-[34px] rounded-sm border border-[#C6D1DC] px-2 text-xs" value={basis} onChange={(e) => setBasis(e.target.value as AccountingBasis)} data-testid="scentsx-st-basis">
              <option value="accrual">Accrual</option><option value="cash">Cash</option>
            </select>
          </label>
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" disabled={!on} onClick={() => void exp("pdf")} data-testid="scentsx-st-pdf">PDF</Button>
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" disabled={!on} onClick={() => void exp("xlsx")} data-testid="scentsx-st-xlsx">Excel</Button>
        </div>
        {kpis.length ? <div className="grid grid-cols-2 gap-[10px] md:grid-cols-5">{kpis.map(([l, v]) => <KpiCard key={l} label={l} number={formatUsdCents(v)} disabled />)}</div> : null}
        {check ? <div className={`text-xs font-semibold ${/NOT/.test(check) ? "text-[#B91C1C]" : "text-[#166534]"}`} data-testid="scentsx-st-check">{check}</div> : null}
        {q.isError ? <ListErrorState title={tr("scentsx.st.error", "Couldn't load the report")} status={0} message={(q.error as Error)?.message} onRetry={() => void q.refetch()} /> : (
          <ParityTable<Line> selectable
            rows={lines} rowKey={(l) => l.key} loading={q.isLoading || co.isLoading} storageKey={`scentsx-st-${report}-v1`} exportFilename={`ScentsX ${REPORTS.find((r) => r[0] === report)![1]} ${from} to ${to}`} exportExcel
            emptyText="Nothing posted in this period — ScentsX opened at $0." onRowClick={(l) => { if (l.account_id) setAcct({ id: l.account_id, label: l.account }); }}
            columns={[
              { className: "text-left", cellClass: "text-left", key: "section", label: report === "tb" ? "Debits / credits" : "Section", sortable: true, render: (l) => l.section, exportValue: (l) => l.section },
              { className: "text-left", cellClass: "text-left font-semibold", key: "account", label: "Account", sortable: true, render: (l) => (l.account_id ? <button type="button" className="text-left text-[#1D4ED8] hover:underline" onClick={(e) => { e.stopPropagation(); setAcct({ id: l.account_id!, label: l.account }); }}>{l.account || DASH}</button> : l.account || DASH), exportValue: (l) => l.account },
              { className: "text-left", cellClass: "text-left", key: "type", label: "Type", sortable: true, render: (l) => l.type, exportValue: (l) => l.type },
              { key: "amount", label: report === "tb" ? "Balance" : "Amount", kind: "number", sortable: true, cellClass: "text-right tabular-nums", render: (l) => money(l.amount), exportValue: (l) => l.amount / 100 },
            ]}
          />
        )}
      </section>
      {acct ? <Register id={acct.id} label={acct.label} onClose={() => setAcct(null)} /> : null}
    </div>
  );
}

/** One account's posted lines, each from its document (the books' register). */
function Register({ id, label, onClose }: { id: string; label: string; onClose: () => void }) {
  const r = useQuery({ queryKey: ["scentsx", "register", id], queryFn: () => getScentsxAccountRegister(id) });
  return (
    <section className="space-y-2 rounded-[3px] border border-[#D8E0E8] bg-white p-3" data-testid="scentsx-st-register" aria-label={label}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-card-title">{`${tr("scentsx.st.register", "Register")} · ${label}`}</div>
        <Button type="button" variant="secondary" className="h-[30px] px-2 text-xs" onClick={onClose}>{tr("scentsx.st.close", "Close")}</Button>
      </div>
      <ParityTable<ScentsxRegisterLine> selectable
        rows={r.data?.lines ?? []} rowKey={(l) => String((l as unknown as { id?: string }).id ?? `${l.entry_date}-${l.memo}-${l.amount_cents}`)} loading={r.isLoading} storageKey="scentsx-st-register-v1" exportFilename={`ScentsX register ${label}`} exportExcel emptyText="No posted lines."
        columns={[
          { key: "entry_date", label: "Date", sortable: true, cellClass: "text-right tabular-nums", render: (l) => usDate(String(l.entry_date).slice(0, 10)), exportValue: (l) => String(l.entry_date) },
          { className: "text-left", cellClass: "text-left", key: "memo", sortable: true, label: "Memo", render: (l) => l.memo ?? DASH, exportValue: (l) => l.memo ?? "" },
          { className: "text-left", cellClass: "text-left", key: "source_transaction_type", sortable: true, label: "From", render: (l) => (l.source_transaction_type ?? "journal entry").replace(/_/g, " "), exportValue: (l) => l.source_transaction_type ?? "" },
          { key: "debit", sortable: true, label: "Debit", kind: "number", cellClass: "text-right tabular-nums", render: (l) => (l.debit_or_credit === "debit" ? money(Number(l.amount_cents)) : ""), exportValue: (l) => (l.debit_or_credit === "debit" ? Number(l.amount_cents) / 100 : "") },
          { key: "credit", sortable: true, label: "Credit", kind: "number", cellClass: "text-right tabular-nums", render: (l) => (l.debit_or_credit === "credit" ? money(Number(l.amount_cents)) : ""), exportValue: (l) => (l.debit_or_credit === "credit" ? Number(l.amount_cents) / 100 : "") },
        ]}
      />
    </section>
  );
}
