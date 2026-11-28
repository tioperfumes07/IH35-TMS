/**
 * TIO Perfumes · Books · Journal entries — ROUND L.31 M17 + M12 (owner 2026-11-27 19:38 CT "ASSETS, LIABILITIES … ACCOUNTING, CHART OF
 * ACCOUNTS … ALL FULLY COMPLETELY DONE"). ScentsX LLC's manual journal entries, QuickBooks style: a pop-up with lines (account from the
 * ScentsX chart, debit or credit, memo), totals that must balance before Save, and ready-made entries for the owner's own money —
 * Owner contribution (Dr bank / Cr 3000) and Owner draw (Dr 3100 / Cr bank). A loan from the owner is NOT a journal entry: the owner's
 * rule (2026-10-10/11) is that every loan creates a loan document on ONE running loan per person (default 4% a year), so "+ Loan from owner"
 * and "+ Repay owner loan" open the one related-party loan engine's wizard (LoanApplicationWizard → POST /api/v1/accounting/related-party-
 * loans, posted by its flag-gated poster, RELATED_PARTY_LOAN_GL_POSTING_ENABLED on for ScentsX). Saved through the ONE journal entry writer (POST /api/v1/accounting/journal-entries, membership checked,
 * balanced or refused); listed with the engine's own list; each entry's lines open in its register on Financial statements.
 */
import { CappedListNotice } from "../../components/CappedListNotice";
import { accountIdByNumber, accountsWithNumbers, formatAccountDisplayLabel } from "../../lib/show-account-numbers";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { ParityTable } from "../../components/parity/ParityTable";
import { MoneyInput } from "../../components/forms/MoneyInput";
import { DatePicker } from "../../components/forms/DatePicker";
import { ListErrorState } from "../../components/ListErrorState";
import { useToast } from "../../components/Toast";
import { userFacingApiError } from "../../lib/api-error-message";
import { formatUsdCents } from "../../lib/money";
import { createJournalEntry, listJournalEntries, type JournalEntry } from "../../api/accounting";
import { getScentsxCompany, listScentsxAccounts, type ScentsxAccount } from "../../api/scentsx";
import { tr } from "./perfumeI18n";
import { LoanApplicationWizard, type LoanApplicationPrefill } from "../accounting/loans/LoanApplicationWizard";
import { ctl, DASH, usDate } from "./perfumeDocParts";

const todayCT = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
type Row = { account_id: string; side: "debit" | "credit"; cents: number | null; memo: string };
const blank = (): Row => ({ account_id: "", side: "debit", cents: null, memo: "" });

/** Ready-made entries for the owner's own money (accounts by number in the ScentsX chart). Bank = the account picked in the pop-up. */
const TEMPLATES: Array<{ key: string; label: string; memo: string; debit: string | "bank"; credit: string | "bank" }> = [
  { key: "contribution", sortable: true, label: "Owner contribution", memo: "Owner contribution", debit: "bank", credit: "3000" },
  { key: "draw", sortable: true, label: "Owner draw", memo: "Owner draw", debit: "3100", credit: "bank" },
];

export function PerfumeJournalPanel() {
  const co = useQuery({ queryKey: ["scentsx", "company"], queryFn: getScentsxCompany });
  const id = co.data?.company.id ?? "";
  const accts = useQuery({ queryKey: ["scentsx", "accounts"], queryFn: listScentsxAccounts });
  const list = useQuery({ queryKey: ["scentsx", "je", id], queryFn: () => listJournalEntries(id, { source: "manual", limit: 200 }), enabled: Boolean(id) });
  const [open, setOpen] = useState<string | null>(null);
  const [loan, setLoan] = useState<"in" | "repay" | null>(null);
  // Held per opening, not rebuilt each render — a background refetch must never reset the wizard mid-entry. Owner loans go to 2400.
  const loanPrefill = useMemo<LoanApplicationPrefill | null>(() => (loan === "in" ? { direction: "in", relationship: "owner", counterparty_kind: "user", pick_account_no: "2400", interest_rate_pct: "4.00", entry_date: todayCT() }
    : loan ? { direction: "out", target_type: "repayment", entry_date: todayCT() } : null), [loan]);
  if (co.isError) return <ListErrorState title={tr("scentsx.je.co_error", "Couldn't load ScentsX")} status={0} message={(co.error as Error)?.message} onRetry={() => void co.refetch()} />;
  return (
    <section className="space-y-2 rounded-[3px] border border-[#D8E0E8] bg-white p-3" data-testid="perfume-journal-panel" aria-label={tr("scentsx.je.title", "Journal entries")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-card-title">{tr("scentsx.je.title", "Journal entries")} · {co.data?.company.legal_name ?? "ScentsX"}</div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" className="h-[34px] px-3 text-xs" disabled={!id || !accts.data} onClick={() => setOpen("blank")} data-testid="scentsx-je-new">{tr("scentsx.je.new", "+ Journal entry")}</Button>
          {TEMPLATES.map((t) => <Button key={t.key} type="button" variant="secondary" className="h-[34px] px-3 text-xs" disabled={!id || !accts.data} onClick={() => setOpen(t.key)} data-testid={`scentsx-je-${t.key}`}>{`+ ${t.label}`}</Button>)}
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" disabled={!id} onClick={() => setLoan("in")} data-testid="scentsx-je-loan_in">{tr("scentsx.je.loan_in", "+ Loan from owner")}</Button>
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" disabled={!id} onClick={() => setLoan("repay")} data-testid="scentsx-je-loan_out">{tr("scentsx.je.loan_out", "+ Repay owner loan")}</Button>
        </div>
      </div>
      <CappedListNotice shown={(list.data?.journal_entries ?? []).length} limit={200} />
      {list.isError ? <ListErrorState title={tr("scentsx.je.error", "Couldn't load the journal entries")} status={0} message={(list.error as Error)?.message} onRetry={() => void list.refetch()} /> : (
        <ParityTable<JournalEntry> selectable
          rows={list.data?.journal_entries ?? []} rowKey={(j) => j.id} loading={list.isLoading || co.isLoading} storageKey="scentsx-je-v1" exportFilename="ScentsX journal entries" exportExcel
          emptyText="No manual journal entries yet — ScentsX opened at $0."
          columns={[
            { key: "entry_date", label: "Date", sortable: true, cellClass: "text-right tabular-nums", render: (j) => usDate(String(j.entry_date).slice(0, 10)), exportValue: (j) => String(j.entry_date) },
            { className: "text-left", cellClass: "text-left", key: "memo", sortable: true, label: "Memo", render: (j) => j.memo ?? DASH, exportValue: (j) => j.memo ?? "" },
            { key: "debit_total_cents", sortable: true, label: "Amount", kind: "number", cellClass: "text-right tabular-nums", render: (j) => (j.debit_total_cents ? formatUsdCents(j.debit_total_cents) : DASH), exportValue: (j) => (j.debit_total_cents ?? 0) / 100 },
            { className: "text-left", cellClass: "text-left", key: "status", sortable: true, label: "Status", render: (j) => (j.voided_at ? "Voided" : j.status), exportValue: (j) => (j.voided_at ? "Voided" : j.status) },
          ]}
        />
      )}
      {loan ? (
        <LoanApplicationWizard open operatingCompanyId={id} onClose={() => setLoan(null)} onCreated={() => { setLoan(null); void list.refetch(); }}
          prefill={loanPrefill} />
      ) : null}
      {open && accts.data ? <JournalModal companyId={id} accounts={accts.data.accounts} template={TEMPLATES.find((t) => t.key === open) ?? null} onClose={() => setOpen(null)} onSaved={() => { setOpen(null); void list.refetch(); }} /> : null}
    </section>
  );
}

function JournalModal({ companyId, accounts, template, onClose, onSaved }: { companyId: string; accounts: ScentsxAccount[]; template: (typeof TEMPLATES)[number] | null; onClose: () => void; onSaved: () => void }) {
  const { pushToast } = useToast();
  const byNo = (n: string) => accountIdByNumber(accounts, n);
  const banks = accountsWithNumbers(accounts, ["1000", "1010", "1020"]);
  const [bank, setBank] = useState(byNo("1000"));
  const [date, setDate] = useState(todayCT());
  const [memo, setMemo] = useState(template?.memo ?? "");
  const [ref, setRef] = useState("");
  const [amount, setAmount] = useState<number | null>(null);
  const [rows, setRows] = useState<Row[]>([blank(), { ...blank(), side: "credit" }]);
  const [busy, setBusy] = useState(false);
  const label = (a: ScentsxAccount) => formatAccountDisplayLabel(a);
  const lines: Row[] = template
    ? [{ account_id: template.debit === "bank" ? bank : byNo(template.debit), side: "debit", cents: amount, memo }, { account_id: template.credit === "bank" ? bank : byNo(template.credit), side: "credit", cents: amount, memo }]
    : rows;
  const dr = lines.filter((l) => l.side === "debit").reduce((s, l) => s + (l.cents ?? 0), 0);
  const cr = lines.filter((l) => l.side === "credit").reduce((s, l) => s + (l.cents ?? 0), 0);
  const filled = lines.filter((l) => l.account_id && (l.cents ?? 0) > 0);
  const ok = filled.length >= 2 && filled.length === lines.filter((l) => l.account_id || l.cents).length && dr === cr && dr > 0 && filled.some((l) => l.side === "debit") && filled.some((l) => l.side === "credit");
  const sorted = useMemo(() => [...accounts].sort((a, b) => (a.account_number ?? "").localeCompare(b.account_number ?? "")), [accounts]);
  const save = async () => {
    setBusy(true);
    try {
      await createJournalEntry(companyId, { entry_date: date, memo: memo.trim() || undefined, reference_number: ref.trim() || undefined, source: "manual",
        postings: filled.map((l) => ({ account_id: l.account_id, debit_or_credit: l.side, amount_cents: l.cents!, description: l.memo.trim() || null })) });
      pushToast(`${template?.label ?? "Journal entry"} saved — ${formatUsdCents(dr)}`, "success");
      onSaved();
    } catch (e) { pushToast(userFacingApiError(e, "Not saved"), "error"); } finally { setBusy(false); }
  };
  const setRow = (i: number, p: Partial<Row>) => setRows(rows.map((r, k) => (k === i ? { ...r, ...p } : r)));
  return (
    <Modal open onClose={onClose} title={template?.label ?? tr("scentsx.je.new_title", "New journal entry")} size="lg" data-testid="scentsx-je-modal">
      <div className="space-y-3 text-xs">
        <div className="flex flex-wrap items-end gap-2">
          <label>{tr("scentsx.je.date", "Date")} <DatePicker aria-label="Entry date" value={date} onChange={(v) => setDate(v || todayCT())} /></label>
          <label>{tr("scentsx.je.ref", "Reference no.")} <input className={`${ctl} block w-[140px]`} value={ref} onChange={(e) => setRef(e.target.value)} data-testid="scentsx-je-ref" /></label>
          <label className="min-w-[260px] flex-1">{tr("scentsx.je.memo", "Memo")} <input className={`${ctl} block w-full`} value={memo} onChange={(e) => setMemo(e.target.value)} data-testid="scentsx-je-memo" /></label>
        </div>
        {template ? (
          <div className="flex flex-wrap items-end gap-2">
            <label>{tr("scentsx.je.bank", "Bank / cash account")}
              <select className={`${ctl} block w-[220px]`} value={bank} onChange={(e) => setBank(e.target.value)} data-testid="scentsx-je-bank">
                {banks.map((a) => <option key={a.id} value={a.id}>{label(a)}</option>)}
              </select>
            </label>
            <label>{tr("scentsx.je.amount", "Amount")} <MoneyInput className="block w-[140px]" ariaLabel="Amount" valueCents={amount} onChangeCents={setAmount} /></label>
            <p className="text-[#64748B]">{`Dr ${label(accounts.find((a) => a.id === lines[0]!.account_id) ?? accounts[0]!)} · Cr ${label(accounts.find((a) => a.id === lines[1]!.account_id) ?? accounts[0]!)}`}</p>
          </div>
        ) : (
          <div className="space-y-1" data-testid="scentsx-je-lines">
            {rows.map((r, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <select className={`${ctl} w-[280px]`} aria-label={`Account line ${i + 1}`} value={r.account_id} onChange={(e) => setRow(i, { account_id: e.target.value })} data-testid={`scentsx-je-acct-${i}`}>
                  <option value="">{tr("scentsx.je.pick", "Pick an account…")}</option>
                  {sorted.map((a) => <option key={a.id} value={a.id}>{label(a)}</option>)}
                </select>
                <select className={`${ctl} w-[100px]`} aria-label={`Debit or credit line ${i + 1}`} value={r.side} onChange={(e) => setRow(i, { side: e.target.value as Row["side"] })} data-testid={`scentsx-je-side-${i}`}>
                  <option value="debit">Debit</option><option value="credit">Credit</option>
                </select>
                <MoneyInput className="w-[130px]" ariaLabel={`Amount line ${i + 1}`} valueCents={r.cents} onChangeCents={(c) => setRow(i, { cents: c })} />
                <input className={`${ctl} min-w-[160px] flex-1`} aria-label={`Line memo ${i + 1}`} value={r.memo} onChange={(e) => setRow(i, { memo: e.target.value })} />
                {rows.length > 2 ? <Button type="button" variant="secondary" className="h-[30px] px-2 text-xs" onClick={() => setRows(rows.filter((_, k) => k !== i))}>{tr("scentsx.je.remove", "Remove")}</Button> : null}
              </div>
            ))}
            <Button type="button" variant="secondary" className="h-[30px] px-2 text-xs" onClick={() => setRows([...rows, blank()])} data-testid="scentsx-je-add-line">{tr("scentsx.je.add_line", "+ Line")}</Button>
          </div>
        )}
        <div className={`font-semibold ${dr === cr ? "text-[#166534]" : "text-[#B91C1C]"}`} data-testid="scentsx-je-totals">{`Debits ${formatUsdCents(dr)} · Credits ${formatUsdCents(cr)}${dr === cr ? "" : ` · off by ${formatUsdCents(Math.abs(dr - cr))}`}`}</div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" onClick={onClose}>{tr("scentsx.je.cancel", "Cancel")}</Button>
          <Button type="button" className="h-[34px] px-3 text-xs" disabled={busy || !ok} onClick={() => void save()} data-testid="scentsx-je-save">{tr("scentsx.je.save", "Save and post")}</Button>
        </div>
      </div>
    </Modal>
  );
}
