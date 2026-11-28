/**
 * SCENTSX · Books · The day — ROUND L.31 M8 (CC2's draft, rewritten by LEAD).
 *   · D1 Daily transactions: every journal entry ScentsX POSTED on the date, from the books — the document each came from, memo,
 *     amount — grouped by kind, with the day's sales and money in / out of the bank and cash accounts. Read only.
 *   · D2 End-of-shift drawer count: the cash counted in a register vs what the books say is in it; the difference is booked through
 *     the one journal-entry writer (short = Dr 6450 Cash Over & Short / Cr the register, over = the reverse). Confirmed in a pop-up.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ParityTable } from "../../components/parity/ParityTable";
import { KpiCard } from "../../components/layout/KpiCard";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { MoneyInput } from "../../components/forms/MoneyInput";
import { DatePicker } from "../../components/forms/DatePicker";
import { ListErrorState } from "../../components/ListErrorState";
import { useToast } from "../../components/Toast";
import { userFacingApiError } from "../../lib/api-error-message";
import { formatAccountDisplayLabel } from "../../lib/show-account-numbers";
import { getAllAccounts } from "../../api/banking";
import { getScentsxCompany, getScentsxDailyReport, postScentsxDrawerCount, type ScentsxDailyEntry } from "../../api/scentsx";
import { ctl, DASH, money } from "./perfumeDocParts";
import { tr } from "./perfumeI18n";

const todayCT = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
const kind = (t: string | null) => (t ?? "journal entry").replace(/_/g, " ");

export function ScentsxDailyReportPanel() {
  const [date, setDate] = useState(todayCT());
  const [counting, setCounting] = useState(false);
  const q = useQuery({ queryKey: ["scentsx", "daily-report", date], queryFn: () => getScentsxDailyReport(date) });
  const d = q.data;
  return (
    <section className="space-y-2 rounded-[3px] border border-[#D8E0E8] bg-white p-3" data-testid="scentsx-daily-report" aria-label={tr("scentsx.day.title", "The day")}>
      <div className="flex flex-wrap items-end gap-2 text-xs">
        <div className="text-card-title mr-2">{tr("scentsx.day.title", "The day — transactions & drawer count")}</div>
        <label>{tr("scentsx.day.date", "Date")} <DatePicker aria-label="Day" value={date} onChange={(v) => setDate(v || todayCT())} /></label>
        <Button type="button" className="h-[34px] px-3 text-xs" onClick={() => setCounting(true)} data-testid="scentsx-day-count">{tr("scentsx.day.count", "Count the drawer")}</Button>
      </div>
      {q.isError ? <ListErrorState title={tr("scentsx.day.error", "Couldn't load the day")} status={0} message={(q.error as Error)?.message} onRetry={() => void q.refetch()} /> : (
        <>
          <div className="grid grid-cols-2 gap-[10px] md:grid-cols-4">
            <KpiCard label={tr("scentsx.day.entries", "Entries posted")} number={String(d?.totals.entries ?? 0)} disabled />
            <KpiCard label={tr("scentsx.day.sales", "Sales")} number={money(d?.totals.sales_cents ?? 0)} disabled />
            <KpiCard label={tr("scentsx.day.in", "Money in")} number={money(d?.totals.cash_in_cents ?? 0)} disabled />
            <KpiCard label={tr("scentsx.day.out", "Money out")} number={money(d?.totals.cash_out_cents ?? 0)} disabled />
          </div>
          <ParityTable<ScentsxDailyEntry> selectable
            cardTitle title={tr("scentsx.day.entries_t", "Posted today")} rows={d?.entries ?? []} rowKey={(e) => e.journal_entry_id} loading={q.isLoading}
            storageKey="scentsx-day-v1" exportFilename={`ScentsX day ${date}`} exportExcel emptyText="Nothing posted on this day."
            columns={[
              { key: "date", sortable: false, label: "Date", cellClass: "text-right tabular-nums", render: () => date, exportValue: () => date },
              { className: "text-left", cellClass: "text-left", key: "source_transaction_type", sortable: true, label: "From", render: (e) => kind(e.source_transaction_type), exportValue: (e) => kind(e.source_transaction_type) },
              { className: "text-left", cellClass: "text-left", key: "memo", sortable: true, label: "Memo", render: (e) => e.memo ?? DASH, exportValue: (e) => e.memo ?? "" },
              { key: "amount_cents", sortable: true, label: "Amount", kind: "number", cellClass: "text-right tabular-nums font-semibold", render: (e) => money(e.amount_cents), exportValue: (e) => e.amount_cents / 100 },
            ]}
          />
        </>
      )}
      {counting ? <DrawerCount date={date} onClose={() => setCounting(false)} onDone={() => { setCounting(false); void q.refetch(); }} /> : null}
    </section>
  );
}

function DrawerCount({ date, onClose, onDone }: { date: string; onClose: () => void; onDone: () => void }) {
  const { pushToast } = useToast();
  const co = useQuery({ queryKey: ["scentsx", "company"], queryFn: getScentsxCompany });
  const id = co.data?.company.id ?? "";
  const banks = useQuery({ queryKey: ["scentsx", "banks", id], queryFn: () => getAllAccounts(id), enabled: Boolean(id) });
  const regs = (banks.data?.accounts ?? []).filter((r) => r.ledger_account_id && /^(cash_on_hand|petty_cash)$/i.test(String(r.account_type ?? "")))
    .map((r) => ({ id: String(r.id), name: String(r.account_name ?? r.name ?? "") }));
  const [regId, setRegId] = useState("");
  const [cents, setCents] = useState<number | null>(null);
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);
  const reg = regs.find((r) => r.id === (regId || regs[0]?.id));
  const go = async () => {
    setBusy(true);
    try {
      const r = await postScentsxDrawerCount({ date, counted_cents: cents!, bank_account_id: reg!.id, ...(memo.trim() ? { memo: memo.trim() } : {}) });
      pushToast(r.direction === "exact" ? `${r.register.name}: exact (${money(r.book_cents)})`
        : `${r.register.name}: ${r.direction} ${money(Math.abs(r.variance_cents))} · counted ${money(r.counted_cents)} vs books ${money(r.book_cents)} · booked to Cash Over & Short`, r.direction === "exact" ? "success" : "info");
      onDone();
    } catch (e) { pushToast(userFacingApiError(e, "Not counted"), "error"); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={`${tr("scentsx.day.count", "Count the drawer")} · ${date}`} size="sm" variant="drawer" data-testid="scentsx-day-count-modal">
      <div className="space-y-3 text-xs">
        <p>{tr("scentsx.day.count_help", "Count the cash in the register at the end of the shift. A difference from the books is booked to 6450 Cash Over & Short.")}</p>
        <label className="block">{tr("scentsx.day.register", "Register")}
          <select className={`${ctl} block w-full`} value={reg?.id ?? ""} onChange={(e) => setRegId(e.target.value)} data-testid="scentsx-day-register">
            {regs.map((r) => <option key={r.id} value={r.id}>{formatAccountDisplayLabel({ account_name: r.name })}</option>)}
          </select>
        </label>
        <label className="block">{tr("scentsx.day.counted", "Cash counted")} *<MoneyInput className="block w-[160px]" ariaLabel="Cash counted" valueCents={cents} onChangeCents={setCents} /></label>
        <label className="block">{tr("scentsx.day.memo", "Memo")}<input className={`${ctl} block w-full`} aria-label="Drawer count memo" value={memo} onChange={(e) => setMemo(e.target.value)} data-testid="scentsx-day-memo" /></label>
        {!banks.isLoading && !regs.length ? <p className="text-[#B91C1C]">{tr("scentsx.day.no_reg", "ScentsX has no cash register account.")}</p> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" onClick={onClose}>{tr("scentsx.day.cancel", "Cancel")}</Button>
          <Button type="button" className="h-[34px] px-3 text-xs" disabled={busy || !reg || cents == null} onClick={() => void go()} data-testid="scentsx-day-count-save">{tr("scentsx.day.post", "Save count")}</Button>
        </div>
      </div>
    </Modal>
  );
}
