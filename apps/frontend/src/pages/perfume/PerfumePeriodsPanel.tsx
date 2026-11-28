/**
 * TIO Perfumes · Books · Periods & closing date — ROUND L.31 M17 part 2 (owner 2026-11-27 19:38 CT "ACCOUNTING … ALL FULLY
 * COMPLETELY DONE"). ScentsX LLC's monthly periods on the ONE period engine (accounting.periods): close a month — the database's
 * closed-period lock then refuses any invoice, bill, payment, deposit, expense, credit or journal entry dated in it — and reopen one
 * (Owner only, a reason is required and kept in the audit). Closing a fiscal year-end month posts the retained-earnings entry through
 * the existing closer. QuickBooks "closing date" — never a delete; every close and reopen is audited.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { ParityTable } from "../../components/parity/ParityTable";
import { KpiCard } from "../../components/layout/KpiCard";
import { ListErrorState } from "../../components/ListErrorState";
import { useToast } from "../../components/Toast";
import { userFacingApiError } from "../../lib/api-error-message";
import { closeAccountingPeriod, getAccountingPeriods, reopenAccountingPeriod, type AccountingPeriod } from "../../api/my-accountant";
import { getScentsxCompany } from "../../api/scentsx";
import { tr } from "./perfumeI18n";
import { ctl, DASH, usDate } from "./perfumeDocParts";

type Act = { kind: "close" | "reopen"; p: AccountingPeriod };
const label = (p: AccountingPeriod) => p.period_label ?? `${usDate(p.period_start)} – ${usDate(p.period_end)}`;

export function PerfumePeriodsPanel() {
  const co = useQuery({ queryKey: ["scentsx", "company"], queryFn: getScentsxCompany });
  const id = co.data?.company.id ?? "";
  const list = useQuery({ queryKey: ["scentsx", "periods", id], queryFn: () => getAccountingPeriods(id), enabled: Boolean(id) });
  const [act, setAct] = useState<Act | null>(null);
  const rows = list.data?.periods ?? [];
  const closed = rows.filter((p) => p.status === "closed");
  // The closing date is the end of the latest closed period: nothing dated on or before it can be posted.
  const closingDate = closed.reduce<string | null>((m, p) => (!m || p.period_end > m ? p.period_end : m), null);
  // Close in order: the earliest open month is the only one offered, so no open month is left behind a closed one.
  const nextToClose = [...rows].filter((p) => p.status === "open").sort((a, b) => a.period_start.localeCompare(b.period_start))[0]?.id ?? null;
  const lastClosed = [...closed].sort((a, b) => b.period_end.localeCompare(a.period_end))[0]?.id ?? null;
  if (co.isError) return <ListErrorState title={tr("scentsx.pd.co_error", "Couldn't load ScentsX")} status={0} message={(co.error as Error)?.message} onRetry={() => void co.refetch()} />;
  return (
    <section className="space-y-2 rounded-[3px] border border-[#D8E0E8] bg-white p-3" data-testid="perfume-periods-panel" aria-label={tr("scentsx.pd.title", "Periods & closing date")}>
      <div className="text-card-title">{tr("scentsx.pd.title", "Periods & closing date")} · {co.data?.company.legal_name ?? "ScentsX"}</div>
      <div className="text-xs text-[#64748B]">{tr("scentsx.pd.help", "Close a month when its books are final. After that nothing dated in it can be entered, changed or voided until the owner reopens it with a reason.")}</div>
      <div className="grid grid-cols-2 gap-[10px] md:grid-cols-3">
        <KpiCard label={tr("scentsx.pd.kpi_closing", "Closing date")} number={closingDate ? usDate(closingDate) : tr("scentsx.pd.none", "None — all open")} disabled />
        <KpiCard label={tr("scentsx.pd.kpi_closed", "Closed months")} number={String(closed.length)} disabled />
        <KpiCard label={tr("scentsx.pd.kpi_open", "Open months")} number={String(rows.length - closed.length)} disabled />
      </div>
      {list.isError ? <ListErrorState title={tr("scentsx.pd.error", "Couldn't load the periods")} status={0} message={(list.error as Error)?.message} onRetry={() => void list.refetch()} /> : (
        <ParityTable<AccountingPeriod> selectable
          rows={rows} rowKey={(p) => p.id} loading={list.isLoading || co.isLoading} storageKey="scentsx-periods-v1" exportFilename="ScentsX periods" exportExcel
          emptyText="No periods yet."
          columns={[
            { className: "text-left", cellClass: "text-left font-semibold", key: "period_label", label: "Period", sortable: true, render: (p) => label(p), exportValue: (p) => label(p) },
            { key: "period_start", label: "Start", sortable: true, cellClass: "text-right tabular-nums", render: (p) => usDate(p.period_start), exportValue: (p) => p.period_start },
            { key: "period_end", label: "End", cellClass: "text-right tabular-nums", render: (p) => usDate(p.period_end), exportValue: (p) => p.period_end },
            { key: "fiscal_year", label: "Fiscal year", cellClass: "text-right tabular-nums", render: (p) => String(p.fiscal_year) },
            { className: "text-left", cellClass: "text-left", key: "status", label: "Status", sortable: true, render: (p) => (p.status === "closed" ? "Closed" : p.status === "closing" ? "Closing" : "Open"), exportValue: (p) => p.status },
            { key: "closed_at", label: "Closed on", cellClass: "text-right tabular-nums", render: (p) => (p.closed_at ? usDate(p.closed_at.slice(0, 10)) : DASH), exportValue: (p) => p.closed_at ?? "" },
            { key: "act", label: "", render: (p) => (p.id === nextToClose
              ? <Button type="button" className="h-[28px] px-2 text-xs" onClick={(e) => { e.stopPropagation(); setAct({ kind: "close", p }); }} data-testid={`scentsx-pd-close-${p.id}`}>{tr("scentsx.pd.close", "Close month")}</Button>
              : p.id === lastClosed
                ? <Button type="button" variant="secondary" className="h-[28px] px-2 text-xs" onClick={(e) => { e.stopPropagation(); setAct({ kind: "reopen", p }); }} data-testid={`scentsx-pd-reopen-${p.id}`}>{tr("scentsx.pd.reopen", "Reopen")}</Button>
                : DASH) },
          ]}
        />
      )}
      {act ? <ActModal act={act} companyId={id} onClose={() => setAct(null)} onDone={() => { setAct(null); void list.refetch(); }} /> : null}
    </section>
  );
}

function ActModal({ act, companyId, onClose, onDone }: { act: Act; companyId: string; onClose: () => void; onDone: () => void }) {
  const { pushToast } = useToast();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const closing = act.kind === "close";
  const ok = closing || text.trim().length > 0;
  const run = async () => {
    setBusy(true);
    try {
      if (closing) {
        const r = await closeAccountingPeriod(act.p.id, companyId, text);
        pushToast(`${label(act.p)} closed${r.retained_earnings_entry_id ? " — year-end retained-earnings entry posted" : ""}`, "success");
      } else {
        await reopenAccountingPeriod(act.p.id, companyId, text.trim());
        pushToast(`${label(act.p)} reopened`, "success");
      }
      onDone();
    } catch (e) { pushToast(userFacingApiError(e, closing ? "Not closed" : "Not reopened"), "error"); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={`${closing ? tr("scentsx.pd.close_title", "Close") : tr("scentsx.pd.reopen_title", "Reopen")} ${label(act.p)}`} size="sm" data-testid="scentsx-pd-modal">
      <div className="space-y-3 text-xs">
        <p>{closing
          ? tr("scentsx.pd.close_help", "After closing, nothing dated in this month can be entered, changed or voided. If this is the fiscal year's last month, the year-end retained-earnings entry posts.")
          : tr("scentsx.pd.reopen_help", "Reopening lets entries dated in this month be changed again. The reason is kept in the audit trail.")}</p>
        <label className="block">{closing ? tr("scentsx.pd.notes", "Closing notes (optional)") : `${tr("scentsx.pd.reason", "Reason")} *`}
          <textarea className={`${ctl} block h-[72px] w-full py-1`} value={text} onChange={(e) => setText(e.target.value)} data-testid="scentsx-pd-text" />
        </label>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" onClick={onClose}>{tr("scentsx.pd.cancel", "Cancel")}</Button>
          <Button type="button" className="h-[34px] px-3 text-xs" disabled={busy || !ok} onClick={() => void run()} data-testid="scentsx-pd-confirm">
            {closing ? tr("scentsx.pd.confirm_close", "Confirm — close month") : tr("scentsx.pd.confirm_reopen", "Confirm — reopen")}</Button>
        </div>
      </div>
    </Modal>
  );
}
