/**
 * TIO Perfumes · Books · Expenses, checks & card charges — ROUND L.31 M5 (owner ruling 2026-11-27 22:40 CT "Exempt ScentsX": ScentsX has
 * no trucks, its expenses carry no unit). QuickBooks "Expense / Check": what it was for (one of ScentsX's expense items — rent, utilities,
 * card fees … each carries its account, migration 202617270100), the amount, the date, and where the money came from (Operating Checking,
 * the store cash registers, petty cash, or the Business Credit Card — a card charge posts Cr the card). Through the ONE expense writer
 * (POST /api/v1/expenses → Dr the item's account / Cr the account it was paid from). No GL math here.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { ParityTable } from "../../components/parity/ParityTable";
import { KpiCard } from "../../components/layout/KpiCard";
import { MoneyInput } from "../../components/forms/MoneyInput";
import { DatePicker } from "../../components/forms/DatePicker";
import { ListErrorState } from "../../components/ListErrorState";
import { CappedListNotice } from "../../components/CappedListNotice";
import { useToast } from "../../components/Toast";
import { userFacingApiError } from "../../lib/api-error-message";
import { formatUsdCents } from "../../lib/money";
import { formatAccountDisplayLabel } from "../../lib/show-account-numbers";
import { apiRequest } from "../../api/client";
import { createExpense, listExpenses, type ExpenseListRow } from "../../api/accounting";
import { getAllAccounts } from "../../api/banking";
import { getScentsxCompany } from "../../api/scentsx";
import { tr } from "./perfumeI18n";
import { ctl, DASH, usDate } from "./perfumeDocParts";

const todayCT = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
const LIMIT = 200;
type ExpenseItem = { id: string; item_name: string; item_code: string | null; default_expense_account_id: string | null };
type PaidFrom = { id: string; name: string; type: string; ledger_account_id: string };

export function PerfumeExpensesPanel() {
  const co = useQuery({ queryKey: ["scentsx", "company"], queryFn: getScentsxCompany });
  const id = co.data?.company.id ?? "";
  const list = useQuery({ queryKey: ["scentsx", "expenses", id], queryFn: () => listExpenses(id, { limit: LIMIT }), enabled: Boolean(id) });
  const [adding, setAdding] = useState(false);
  const rows = list.data?.rows ?? [];
  if (co.isError) return <ListErrorState title={tr("scentsx.ex.co_error", "Couldn't load ScentsX")} status={0} message={(co.error as Error)?.message} onRetry={() => void co.refetch()} />;
  return (
    <section className="space-y-2 rounded-[3px] border border-[#D8E0E8] bg-white p-3" data-testid="perfume-expenses-panel" aria-label={tr("scentsx.ex.title", "Expenses, checks & card charges")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-card-title">{tr("scentsx.ex.title", "Expenses, checks & card charges")} · {co.data?.company.legal_name ?? "ScentsX"}</div>
        <Button type="button" className="h-[34px] px-3 text-xs" disabled={!id} onClick={() => setAdding(true)} data-testid="scentsx-ex-new">{tr("scentsx.ex.new", "+ Expense / check / card")}</Button>
      </div>
      <div className="grid grid-cols-2 gap-[10px] md:grid-cols-3">
        <KpiCard label={tr("scentsx.ex.kpi_n", "Expenses")} number={String(rows.length)} disabled />
        <KpiCard label={tr("scentsx.ex.kpi_total", "Total")} number={formatUsdCents(rows.reduce((s, r) => s + Number(r.total_amount_cents ?? 0), 0))} disabled />
        <KpiCard label={tr("scentsx.ex.kpi_unposted", "Not posted")} number={String(rows.filter((r) => r.posting_status !== "posted").length)} disabled />
      </div>
      {list.isError ? <ListErrorState title={tr("scentsx.ex.error", "Couldn't load the expenses")} status={0} message={(list.error as Error)?.message} onRetry={() => void list.refetch()} /> : (
        <>
          <CappedListNotice shown={rows.length} limit={LIMIT} />
          <ParityTable<ExpenseListRow> selectable
            rows={rows} rowKey={(r) => r.id} loading={list.isLoading || co.isLoading} storageKey="scentsx-expenses-v1" exportFilename="ScentsX expenses" exportExcel
            emptyText="No expenses yet."
            columns={[
              { key: "transaction_date", sortable: true, label: "Date", cellClass: "text-right tabular-nums", render: (r) => usDate(String(r.transaction_date).slice(0, 10)), exportValue: (r) => r.transaction_date },
              { className: "text-left", cellClass: "text-left", key: "expense_number", sortable: true, label: "No.", render: (r) => r.expense_number ?? DASH, exportValue: (r) => r.expense_number ?? "" },
              { className: "text-left", cellClass: "text-left", key: "category_account_name", sortable: true, label: "For", render: (r) => r.category_account_name ?? DASH, exportValue: (r) => r.category_account_name ?? "" },
              { className: "text-left", cellClass: "text-left", key: "vendor_name", sortable: true, label: "Payee", render: (r) => r.vendor_name ?? DASH, exportValue: (r) => r.vendor_name ?? "" },
              { className: "text-left", cellClass: "text-left", key: "memo", sortable: true, label: "Memo", render: (r) => r.memo ?? DASH, exportValue: (r) => r.memo ?? "" },
              { key: "total_amount_cents", sortable: true, label: "Amount", kind: "number", cellClass: "text-right tabular-nums font-semibold", render: (r) => formatUsdCents(Number(r.total_amount_cents)), exportValue: (r) => Number(r.total_amount_cents) / 100 },
              { className: "text-left", cellClass: "text-left", key: "posting_status", sortable: true, label: "Books", render: (r) => (r.posting_status === "posted" ? "Posted" : "Not posted"), exportValue: (r) => r.posting_status },
            ]}
          />
        </>
      )}
      {adding ? <ExpenseModal companyId={id} onClose={() => setAdding(false)} onDone={() => { setAdding(false); void list.refetch(); }} /> : null}
    </section>
  );
}

function ExpenseModal({ companyId, onClose, onDone }: { companyId: string; onClose: () => void; onDone: () => void }) {
  const { pushToast } = useToast();
  const items = useQuery({
    queryKey: ["scentsx", "expense-items", companyId],
    queryFn: () => apiRequest<{ items?: ExpenseItem[]; rows?: ExpenseItem[] }>(`/api/v1/catalogs/items?operating_company_id=${encodeURIComponent(companyId)}&search=EXP-&item_type=Service&limit=100`),
  });
  const banks = useQuery({ queryKey: ["scentsx", "banks", companyId], queryFn: () => getAllAccounts(companyId) });
  const expenseItems = ((items.data?.items ?? items.data?.rows) ?? []).filter((i) => (i.item_code ?? "").startsWith("EXP-") && i.default_expense_account_id);
  const paidFrom: PaidFrom[] = (banks.data?.accounts ?? [])
    .filter((r) => r.ledger_account_id)
    .map((r) => ({ id: String(r.id), name: String(r.account_name ?? r.name ?? ""), type: String(r.account_type ?? ""), ledger_account_id: String(r.ledger_account_id) }));
  const [itemId, setItemId] = useState("");
  const [fromId, setFromId] = useState("");
  const [cents, setCents] = useState<number | null>(null);
  const [date, setDate] = useState(todayCT());
  const [ref, setRef] = useState("");
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);
  const item = expenseItems.find((i) => i.id === itemId);
  const from = paidFrom.find((p) => p.id === (fromId || paidFrom[0]?.id));
  const ok = Boolean(item) && Boolean(from) && (cents ?? 0) > 0;
  const go = async () => {
    setBusy(true);
    try {
      const r = await createExpense(companyId, { item_id: item!.id, category_account_id: item!.default_expense_account_id!, expense_date: date, amount_cents: cents!,
        payment_account_uuid: from!.ledger_account_id, memo: memo.trim() || item!.item_name, is_company_expense: true, ...(ref.trim() ? { vendor_document_number: ref.trim() } : {}) });
      pushToast(`${item!.item_name} · ${formatUsdCents(cents!)} · ${r.posting_status === "posted" ? tr("scentsx.ex.posted", "posted") : tr("scentsx.ex.unposted", "saved, not posted")}`, r.posting_status === "posted" ? "success" : "info");
      onDone();
    } catch (e) { pushToast(userFacingApiError(e, "Not saved"), "error"); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={tr("scentsx.ex.new_title", "New expense")} size="md" variant="drawer" data-testid="scentsx-ex-modal">
      <div className="space-y-3 text-xs">
        <label className="block">{tr("scentsx.ex.for", "What it was for")} *
          <select className={`${ctl} block w-full`} value={itemId} onChange={(e) => setItemId(e.target.value)} data-testid="scentsx-ex-item">
            <option value="">{tr("scentsx.ex.pick", "Pick…")}</option>
            {expenseItems.map((i) => <option key={i.id} value={i.id}>{i.item_name}</option>)}
          </select>
        </label>
        <label className="block">{tr("scentsx.ex.amount", "Amount")} *<MoneyInput className="block w-[160px]" ariaLabel="Expense amount" valueCents={cents} onChangeCents={setCents} /></label>
        <label className="block">{tr("scentsx.ex.date", "Date")}<DatePicker aria-label="Expense date" value={date} onChange={(v) => setDate(v || todayCT())} /></label>
        <label className="block">{tr("scentsx.ex.from", "Paid from")}
          <select className={`${ctl} block w-full`} value={from?.id ?? ""} onChange={(e) => setFromId(e.target.value)} data-testid="scentsx-ex-from">
            {paidFrom.map((p) => <option key={p.id} value={p.id}>{`${formatAccountDisplayLabel({ account_name: p.name })}${p.type === "credit_card" ? ` (${tr("scentsx.ex.card", "card charge")})` : ""}`}</option>)}
          </select>
        </label>
        <label className="block">{tr("scentsx.ex.ref", "Check no. / receipt no.")}<input className={`${ctl} block w-[180px]`} aria-label="Check or receipt number" value={ref} onChange={(e) => setRef(e.target.value)} data-testid="scentsx-ex-ref" /></label>
        <label className="block">{tr("scentsx.ex.memo", "Memo")}<input className={`${ctl} block w-full`} aria-label="Expense memo" value={memo} onChange={(e) => setMemo(e.target.value)} data-testid="scentsx-ex-memo" /></label>
        {!items.isLoading && !expenseItems.length ? <p className="text-[#B91C1C]">{tr("scentsx.ex.no_items", "ScentsX has no expense items yet.")}</p> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" onClick={onClose}>{tr("scentsx.ex.cancel", "Cancel")}</Button>
          <Button type="button" className="h-[34px] px-3 text-xs" disabled={busy || !ok} onClick={() => void go()} data-testid="scentsx-ex-save">{tr("scentsx.ex.save", "Save expense")}</Button>
        </div>
      </div>
    </Modal>
  );
}
