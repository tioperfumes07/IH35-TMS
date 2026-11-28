/**
 * TIO Perfumes · Books · Banking — ROUND L.31 M10 (owner 2026-11-27 19:38 CT "MONEY … PAYMENTS … ALL FULLY COMPLETELY DONE").
 * ScentsX LLC's bank and cash accounts (Operating Checking, Store Cash Registers, Petty Cash, Business Credit Card) with their book
 * balance from ScentsX's own ledger; transfers between them and credit-card payments through the ONE transfer engine
 * (RecordTransferModal → POST /api/v1/banking/transfers, TRANSFER_GL_POSTING_ENABLED ON for ScentsX), reversed with a reason; and the
 * QuickBooks reconcile: pick the account, the statement period and the statement ending balance, tick each cleared line, finish when
 * the difference is $0.00 — the ONE reconciliation engine (/api/v1/banking/reconciliation/*). No GL math here.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { ParityTable } from "../../components/parity/ParityTable";
import { KpiCard } from "../../components/layout/KpiCard";
import { MoneyInput } from "../../components/forms/MoneyInput";
import { DatePicker } from "../../components/forms/DatePicker";
import { ListErrorState } from "../../components/ListErrorState";
import { useToast } from "../../components/Toast";
import { userFacingApiError } from "../../lib/api-error-message";
import { formatUsdCents } from "../../lib/money";
import {
  clearReconciliationTransaction, completeReconciliationSession, getAllAccounts, getReconciliationSessions, getReconciliationWorkspace, listTransfers,
  revokeTransfer, startReconciliationSession, type ReconciliationGlLine, type ReconciliationSession, type Transfer,
} from "../../api/banking";
import { getScentsxCompany, listScentsxAccounts } from "../../api/scentsx";
import { RecordTransferModal } from "../banking/RecordTransferModal";
import { tr } from "./perfumeI18n";
import { ctl, DASH, usDate } from "./perfumeDocParts";

const todayCT = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
type BankRow = { id: string; name: string; type: string; ledger_account_id: string | null; book_cents: number | null };

export function PerfumeBankingPanel() {
  const co = useQuery({ queryKey: ["scentsx", "company"], queryFn: getScentsxCompany });
  const id = co.data?.company.id ?? "";
  const banks = useQuery({ queryKey: ["scentsx", "banks", id], queryFn: () => getAllAccounts(id), enabled: Boolean(id) });
  const ledger = useQuery({ queryKey: ["scentsx", "accounts"], queryFn: listScentsxAccounts });
  const transfers = useQuery({ queryKey: ["scentsx", "transfers", id], queryFn: () => listTransfers(id, { limit: 200 }), enabled: Boolean(id) });
  const sessions = useQuery({ queryKey: ["scentsx", "recon-sessions", id], queryFn: () => getReconciliationSessions(id), enabled: Boolean(id) });
  const [transferOpen, setTransferOpen] = useState<"bank_to_bank" | "cc_payment" | null>(null);
  const [reconcile, setReconcile] = useState<BankRow | null>(null);
  const [workspace, setWorkspace] = useState<string | null>(null);
  const [revoke, setRevoke] = useState<Transfer | null>(null);
  const refresh = () => { void banks.refetch(); void ledger.refetch(); void transfers.refetch(); void sessions.refetch(); };

  const rows = useMemo<BankRow[]>(() => {
    const byId = new Map((ledger.data?.accounts ?? []).map((a) => [a.id, a]));
    return (banks.data?.accounts ?? []).map((r) => {
      const ledgerId = (r.ledger_account_id as string | null | undefined) ?? null;
      const a = ledgerId ? byId.get(ledgerId) : undefined;
      const type = String(r.account_type ?? "");
      // Book balance on ScentsX's ledger: an asset is debits − credits; the credit card (a liability) is credits − debits (what is owed).
      const book = a ? (type === "credit_card" ? Number(a.credit_cents) - Number(a.debit_cents) : Number(a.debit_cents) - Number(a.credit_cents)) : null;
      return { id: String(r.id), name: String(r.account_name ?? r.name ?? ""), type, ledger_account_id: ledgerId, book_cents: book };
    });
  }, [banks.data, ledger.data]);
  const nameOf = (bankOrLedgerId: string) => rows.find((r) => r.id === bankOrLedgerId || r.ledger_account_id === bankOrLedgerId)?.name
    ?? (ledger.data?.accounts ?? []).find((a) => a.id === bankOrLedgerId)?.account_name ?? DASH;
  const cash = rows.filter((r) => r.type !== "credit_card").reduce((s, r) => s + (r.book_cents ?? 0), 0);
  const card = rows.filter((r) => r.type === "credit_card").reduce((s, r) => s + (r.book_cents ?? 0), 0);
  const allSessions = [...(sessions.data?.open_sessions ?? []), ...(sessions.data?.completed_sessions ?? [])];
  const openFor = (bankId: string) => (sessions.data?.open_sessions ?? []).find((s) => s.bank_account_id === bankId) ?? null;

  if (co.isError) return <ListErrorState title={tr("scentsx.bk.co_error", "Couldn't load ScentsX")} status={0} message={(co.error as Error)?.message} onRetry={() => void co.refetch()} />;
  return (
    <div className="space-y-3" data-testid="perfume-banking-panel">
      <section className="space-y-2 rounded-[3px] border border-[#D8E0E8] bg-white p-3" aria-label={tr("scentsx.bk.title", "Banking")}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-card-title">{tr("scentsx.bk.title", "Banking")} · {co.data?.company.legal_name ?? "ScentsX"}</div>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" disabled={!id} onClick={() => setTransferOpen("cc_payment")} data-testid="scentsx-bk-ccpay">{tr("scentsx.bk.ccpay", "+ Pay the credit card")}</Button>
            <Button type="button" className="h-[34px] px-3 text-xs" disabled={!id} onClick={() => setTransferOpen("bank_to_bank")} data-testid="scentsx-bk-transfer">{tr("scentsx.bk.transfer", "+ Transfer")}</Button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-[10px] md:grid-cols-3">
          <KpiCard label={tr("scentsx.bk.kpi_cash", "Cash in bank & on hand")} number={formatUsdCents(cash)} disabled />
          <KpiCard label={tr("scentsx.bk.kpi_card", "Owed on the credit card")} number={formatUsdCents(card)} disabled />
          <KpiCard label={tr("scentsx.bk.kpi_recon", "Reconciliations")} number={String(allSessions.length)} disabled />
        </div>
        {banks.isError ? <ListErrorState title={tr("scentsx.bk.error", "Couldn't load the bank accounts")} status={0} message={(banks.error as Error)?.message} onRetry={() => void banks.refetch()} /> : (
          <ParityTable<BankRow> selectable
            rows={rows} rowKey={(r) => r.id} loading={banks.isLoading || ledger.isLoading || co.isLoading} storageKey="scentsx-banks-v1" exportFilename="ScentsX bank accounts" exportExcel
            emptyText="No bank accounts."
            columns={[
              { className: "text-left", cellClass: "text-left font-semibold", key: "name", sortable: true, label: "Account", render: (r) => r.name, exportValue: (r) => r.name },
              { className: "text-left", cellClass: "text-left", key: "type", sortable: true, label: "Type", render: (r) => r.type.replace(/_/g, " "), exportValue: (r) => r.type },
              { key: "book_cents", sortable: true, label: "Book balance", kind: "number", cellClass: "text-right tabular-nums font-semibold", render: (r) => (r.book_cents == null ? DASH : formatUsdCents(r.book_cents)), exportValue: (r) => (r.book_cents ?? 0) / 100 },
              { key: "last_reconciled_date", sortable: true, label: "Last reconciled", cellClass: "text-right tabular-nums",
                render: (r) => { const s = (sessions.data?.completed_sessions ?? []).filter((x) => x.bank_account_id === r.id).sort((a, b) => b.period_end.localeCompare(a.period_end))[0]; return s ? usDate(s.period_end) : DASH; } },
              { key: "act", sortable: false, label: "", render: (r) => (
                <Button type="button" variant="secondary" className="h-[28px] px-2 text-xs" onClick={(e) => { e.stopPropagation(); const s = openFor(r.id); if (s) setWorkspace(s.id); else setReconcile(r); }} data-testid={`scentsx-bk-reconcile-${r.id}`}>
                  {openFor(r.id) ? tr("scentsx.bk.continue", "Continue reconciling") : tr("scentsx.bk.reconcile", "Reconcile")}</Button>) },
            ]}
          />
        )}
      </section>

      <section className="space-y-2 rounded-[3px] border border-[#D8E0E8] bg-white p-3" aria-label={tr("scentsx.bk.transfers", "Transfers")}>
        <div className="text-card-title">{tr("scentsx.bk.transfers", "Transfers")}</div>
        <ParityTable<Transfer> selectable
          rows={transfers.data?.transfers ?? []} rowKey={(t) => t.id} loading={transfers.isLoading} storageKey="scentsx-transfers-v1" exportFilename="ScentsX transfers" exportExcel
          emptyText="No transfers yet."
          columns={[
            { key: "transfer_date", sortable: true, label: "Date", cellClass: "text-right tabular-nums", render: (t) => usDate(String(t.transfer_date).slice(0, 10)), exportValue: (t) => t.transfer_date },
            { className: "text-left", cellClass: "text-left", key: "transfer_type", sortable: true, label: "Type", render: (t) => (t.transfer_type === "cc_payment" ? "Credit card payment" : t.transfer_type.replace(/_/g, " ")), exportValue: (t) => t.transfer_type },
            { className: "text-left", cellClass: "text-left", key: "from_account_id", sortable: true, label: "From", render: (t) => nameOf(t.from_account_id), exportValue: (t) => nameOf(t.from_account_id) },
            { className: "text-left", cellClass: "text-left", key: "to_account_id", sortable: true, label: "To", render: (t) => nameOf(t.to_account_id), exportValue: (t) => nameOf(t.to_account_id) },
            { key: "amount_cents", sortable: true, label: "Amount", kind: "number", cellClass: "text-right tabular-nums font-semibold", render: (t) => formatUsdCents(t.amount_cents), exportValue: (t) => t.amount_cents / 100 },
            { className: "text-left", cellClass: "text-left", key: "memo", sortable: true, label: "Memo", render: (t) => t.memo ?? DASH, exportValue: (t) => t.memo ?? "" },
            { className: "text-left", cellClass: "text-left", key: "status", sortable: true, label: "Status", render: (t) => (t.revoked_at ? "Reversed" : "Posted"), exportValue: (t) => (t.revoked_at ? "Reversed" : "Posted") },
            { key: "rev", sortable: false, label: "", render: (t) => (t.revoked_at ? DASH
              : <Button type="button" variant="secondary" className="h-[28px] px-2 text-xs" onClick={(e) => { e.stopPropagation(); setRevoke(t); }} data-testid={`scentsx-bk-revoke-${t.id}`}>{tr("scentsx.bk.reverse", "Reverse")}</Button>) },
          ]}
        />
      </section>

      <section className="space-y-2 rounded-[3px] border border-[#D8E0E8] bg-white p-3" aria-label={tr("scentsx.bk.recons", "Reconciliations")}>
        <div className="text-card-title">{tr("scentsx.bk.recons", "Reconciliations")}</div>
        <ParityTable<ReconciliationSession> selectable
          rows={allSessions} rowKey={(s) => s.id} loading={sessions.isLoading} storageKey="scentsx-recons-v1" exportFilename="ScentsX reconciliations" exportExcel
          emptyText="No reconciliations yet." onRowClick={(s) => setWorkspace(s.id)}
          columns={[
            { className: "text-left", cellClass: "text-left font-semibold", key: "bank_account_id", sortable: true, label: "Account", render: (s) => nameOf(s.bank_account_id), exportValue: (s) => nameOf(s.bank_account_id) },
            { key: "period_end", sortable: true, label: "Statement ending", cellClass: "text-right tabular-nums", render: (s) => usDate(s.period_end), exportValue: (s) => s.period_end },
            { key: "statement_balance_cents", sortable: true, label: "Statement balance", kind: "number", cellClass: "text-right tabular-nums", render: (s) => formatUsdCents(s.statement_balance_cents), exportValue: (s) => s.statement_balance_cents / 100 },
            { key: "variance_cents", sortable: true, label: "Difference", kind: "number", cellClass: "text-right tabular-nums", render: (s) => (s.variance_cents == null ? DASH : formatUsdCents(s.variance_cents)), exportValue: (s) => (s.variance_cents ?? 0) / 100 },
            { className: "text-left", cellClass: "text-left", key: "status", sortable: true, label: "Status", render: (s) => (s.status === "reconciled" ? "Reconciled" : s.status === "open" ? "In progress" : s.status), exportValue: (s) => s.status },
            { key: "reconciled_at", sortable: true, label: "Finished", cellClass: "text-right tabular-nums", render: (s) => (s.reconciled_at ? usDate(s.reconciled_at.slice(0, 10)) : DASH), exportValue: (s) => s.reconciled_at ?? "" },
          ]}
        />
      </section>

      {transferOpen ? <RecordTransferModal open operatingCompanyId={id} defaultTransferType={transferOpen} onClose={() => setTransferOpen(null)} onSaved={() => { setTransferOpen(null); refresh(); }} /> : null}
      {reconcile ? <StartModal bank={reconcile} onClose={() => setReconcile(null)} onStarted={(sid) => { setReconcile(null); setWorkspace(sid); void sessions.refetch(); }} /> : null}
      {workspace ? <WorkspaceModal sessionId={workspace} companyId={id} onClose={() => { setWorkspace(null); refresh(); }} /> : null}
      {revoke ? <RevokeModal t={revoke} companyId={id} label={`${formatUsdCents(revoke.amount_cents)} · ${nameOf(revoke.from_account_id)} → ${nameOf(revoke.to_account_id)}`} onClose={() => setRevoke(null)} onDone={() => { setRevoke(null); refresh(); }} /> : null}
    </div>
  );
}

function StartModal({ bank, onClose, onStarted }: { bank: BankRow; onClose: () => void; onStarted: (sessionId: string) => void }) {
  const { pushToast } = useToast();
  const today = todayCT();
  const [start, setStart] = useState(`${today.slice(0, 7)}-01`);
  const [end, setEnd] = useState(today);
  const [balance, setBalance] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const ok = balance != null && end >= start;
  const go = async () => {
    setBusy(true);
    try { const r = await startReconciliationSession({ bank_account_id: bank.id, period_start: start, period_end: end, statement_balance_cents: balance! }); onStarted(r.session_id); }
    catch (e) { pushToast(userFacingApiError(e, "Not started"), "error"); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={`${tr("scentsx.bk.reconcile", "Reconcile")} ${bank.name}`} size="sm" data-testid="scentsx-bk-start-modal">
      <div className="space-y-3 text-xs">
        <p>{tr("scentsx.bk.start_help", "Enter the dates and the ending balance printed on the bank (or card) statement.")}</p>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">{tr("scentsx.bk.from", "Statement starts")}<DatePicker value={start} onChange={(v) => setStart(v)} /></label>
          <label className="block">{tr("scentsx.bk.to", "Statement ends")}<DatePicker value={end} onChange={(v) => setEnd(v)} /></label>
        </div>
        <label className="block">{tr("scentsx.bk.ending", "Statement ending balance")} *<MoneyInput className="block w-[180px]" ariaLabel="Statement ending balance" valueCents={balance} onChangeCents={setBalance} /></label>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" onClick={onClose}>{tr("scentsx.bk.cancel", "Cancel")}</Button>
          <Button type="button" className="h-[34px] px-3 text-xs" disabled={busy || !ok} onClick={() => void go()} data-testid="scentsx-bk-start">{tr("scentsx.bk.start", "Start reconciling")}</Button>
        </div>
      </div>
    </Modal>
  );
}

function WorkspaceModal({ sessionId, companyId, onClose }: { sessionId: string; companyId: string; onClose: () => void }) {
  const { pushToast } = useToast();
  const ws = useQuery({ queryKey: ["scentsx", "recon", sessionId], queryFn: () => getReconciliationWorkspace(sessionId, companyId), enabled: Boolean(companyId) });
  const [busy, setBusy] = useState<string | null>(null);
  const d = ws.data;
  const open = d?.session.status === "open";
  const variance = d?.summary.variance_cents ?? null;
  const toggle = async (l: ReconciliationGlLine) => {
    setBusy(l.posting_id);
    try { await clearReconciliationTransaction(sessionId, companyId, { posting_id: l.posting_id, cleared: !l.register_cleared }); await ws.refetch(); }
    catch (e) { pushToast(userFacingApiError(e, "Not changed"), "error"); } finally { setBusy(null); }
  };
  const finish = async () => {
    setBusy("finish");
    try { await completeReconciliationSession(sessionId, companyId); pushToast(tr("scentsx.bk.done", "Reconciled"), "success"); onClose(); }
    catch (e) { pushToast(userFacingApiError(e, "Not finished"), "error"); } finally { setBusy(null); }
  };
  return (
    <Modal open onClose={onClose} title={`${tr("scentsx.bk.reconcile", "Reconcile")} ${d?.bank_account_label ?? ""}`} size="lg" data-testid="scentsx-bk-workspace">
      <div className="space-y-3 text-xs">
        {ws.isError ? <ListErrorState title={tr("scentsx.bk.ws_error", "Couldn't load the reconciliation")} status={0} message={(ws.error as Error)?.message} onRetry={() => void ws.refetch()} /> : null}
        {d ? (
          <div className="grid grid-cols-2 gap-[10px] md:grid-cols-5" data-testid="scentsx-bk-summary">
            <KpiCard label={tr("scentsx.bk.s_begin", "Beginning balance")} number={formatUsdCents(d.summary.beginning_balance_cents ?? 0)} disabled />
            <KpiCard label={tr("scentsx.bk.s_dep", "Cleared deposits")} number={formatUsdCents(d.summary.cleared_credits_cents ?? d.summary.matched_credits_cents)} disabled />
            <KpiCard label={tr("scentsx.bk.s_pay", "Cleared payments")} number={formatUsdCents(d.summary.cleared_debits_cents ?? d.summary.matched_debits_cents)} disabled />
            <KpiCard label={tr("scentsx.bk.s_stmt", "Statement ending")} number={formatUsdCents(d.summary.statement_balance_cents)} disabled />
            <KpiCard label={tr("scentsx.bk.s_diff", "Difference")} number={formatUsdCents(variance ?? 0)} disabled />
          </div>
        ) : null}
        <ParityTable<ReconciliationGlLine> selectable
          rows={d?.gl_lines ?? []} rowKey={(l) => l.posting_id} loading={ws.isLoading} storageKey="scentsx-recon-lines-v1" exportFilename="ScentsX reconciliation lines" exportExcel
          emptyText="No entries on this account in the period."
          columns={[
            { key: "cleared", sortable: false, label: "", render: (l) => (
              <input type="checkbox" aria-label={`Cleared ${l.memo ?? l.type_label} ${usDate(l.entry_date)}`} checked={l.register_cleared} disabled={!open || busy === l.posting_id}
                onChange={() => void toggle(l)} data-testid={`scentsx-bk-clear-${l.posting_id}`} />) },
            { key: "entry_date", sortable: true, label: "Date", cellClass: "text-right tabular-nums", render: (l) => usDate(l.entry_date), exportValue: (l) => l.entry_date },
            { className: "text-left", cellClass: "text-left", key: "type_label", sortable: true, label: "Type", render: (l) => l.type_label, exportValue: (l) => l.type_label },
            { className: "text-left", cellClass: "text-left", key: "ref", sortable: true, label: "Ref no.", render: (l) => l.ref ?? DASH, exportValue: (l) => l.ref ?? "" },
            { className: "text-left", cellClass: "text-left", key: "payee", sortable: true, label: "Payee", render: (l) => l.payee ?? DASH, exportValue: (l) => l.payee ?? "" },
            { className: "text-left", cellClass: "text-left", key: "memo", sortable: true, label: "Memo", render: (l) => l.memo ?? l.description ?? DASH, exportValue: (l) => l.memo ?? "" },
            { key: "deposit", sortable: true, label: "Deposit", kind: "number", cellClass: "text-right tabular-nums", render: (l) => (l.is_credit ? formatUsdCents(l.amount_cents) : DASH), exportValue: (l) => (l.is_credit ? l.amount_cents / 100 : 0) },
            { key: "payment", sortable: true, label: "Payment", kind: "number", cellClass: "text-right tabular-nums", render: (l) => (!l.is_credit ? formatUsdCents(l.amount_cents) : DASH), exportValue: (l) => (!l.is_credit ? l.amount_cents / 100 : 0) },
          ]}
        />
        <div className="flex items-center justify-end gap-2">
          {open && variance !== 0 ? <span className="text-[#B91C1C]">{tr("scentsx.bk.diff_help", "Finish when the difference is $0.00.")}</span> : null}
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" onClick={onClose}>{tr("scentsx.bk.close", "Save for later")}</Button>
          <Button type="button" className="h-[34px] px-3 text-xs" disabled={!open || variance !== 0 || busy === "finish"} onClick={() => void finish()} data-testid="scentsx-bk-finish">{tr("scentsx.bk.finish", "Finish now")}</Button>
        </div>
      </div>
    </Modal>
  );
}

function RevokeModal({ t, companyId, label, onClose, onDone }: { t: Transfer; companyId: string; label: string; onClose: () => void; onDone: () => void }) {
  const { pushToast } = useToast();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try { await revokeTransfer(t.id, companyId, reason.trim()); pushToast(tr("scentsx.bk.reversed", "Transfer reversed"), "success"); onDone(); }
    catch (e) { pushToast(userFacingApiError(e, "Not reversed"), "error"); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={tr("scentsx.bk.rev_title", "Reverse transfer")} size="sm" data-testid="scentsx-bk-revoke-modal">
      <div className="space-y-3 text-xs">
        <p>{label}</p>
        <label className="block">{tr("scentsx.bk.reason", "Reason")} *
          <textarea className={`${ctl} block h-[64px] w-full py-1`} value={reason} onChange={(e) => setReason(e.target.value)} data-testid="scentsx-bk-revoke-reason" />
        </label>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" onClick={onClose}>{tr("scentsx.bk.cancel", "Cancel")}</Button>
          <Button type="button" className="h-[34px] px-3 text-xs" disabled={busy || !reason.trim()} onClick={() => void go()} data-testid="scentsx-bk-revoke-confirm">{tr("scentsx.bk.reverse", "Reverse")}</Button>
        </div>
      </div>
    </Modal>
  );
}
