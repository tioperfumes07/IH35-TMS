/**
 * TIO Perfumes · Returns — CONTROL's Returns (ticket → item → qty returned → "Reposition" back to stock), owner 2026-11-27 13:50 CT.
 * Against one issued ScentsX invoice: POST /api/v1/scentsx/returns writes the credit memo(s) through the one credit-memo writer
 * (4800 Sales Returns & Allowances + the invoice's tax on the returned part; applied to the invoice while it has a balance, else the
 * customer's credit) and puts restocked units back at the cost they shipped at. This screen only collects the quantities.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Button } from "../../components/Button";
import { ParityTable } from "../../components/parity/ParityTable";
import { DatePicker } from "../../components/forms/DatePicker";
import { ListErrorState } from "../../components/ListErrorState";
import { useToast } from "../../components/Toast";
import { userFacingApiError } from "../../lib/api-error-message";
import { createScentsxReturn, getScentsxReturnable, listScentsxReturns, type ScentsxReturnable, type ScentsxReturnReason, type ScentsxReturnRow } from "../../api/scentsx";
import { tr } from "./perfumeI18n";
import { ctl, DASH, money, SitePicker, usDate } from "./perfumeDocParts";

const REASONS: Array<[ScentsxReturnReason, string]> = [["damaged", "Damaged"], ["wrong_item", "Wrong item"], ["not_ordered", "Not ordered"], ["overshipped", "Over-shipped"],
  ["customer_changed_mind", "Customer changed mind"], ["billing_error", "Billing error"], ["other", "Other"]];
const reasonText = (r: string) => REASONS.find(([k]) => k === r)?.[1] ?? r;
const todayCT = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
type Row = ScentsxReturnable["lines"][number];

export function ReturnForm({ invoiceId, onDone, onClose }: { invoiceId: string; onDone: () => void; onClose: () => void }) {
  const { pushToast } = useToast();
  const r = useQuery({ queryKey: ["scentsx", "returnable", invoiceId], queryFn: () => getScentsxReturnable(invoiceId) });
  const [qty, setQty] = useState<Record<string, number>>({});
  const [restock, setRestock] = useState<Record<string, boolean>>({});
  const [site, setSite] = useState<string | null>(null);
  const [reason, setReason] = useState<ScentsxReturnReason>("damaged");
  const [date, setDate] = useState(todayCT());
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  if (r.isError) return <ListErrorState title={tr("perfume.ret.error", "Couldn't load the invoice")} status={0} message={(r.error as Error)?.message} onRetry={() => void r.refetch()} />;
  if (!r.data) return null;
  const d = r.data;
  const picked = d.lines.filter((l) => (qty[l.so_line_id] ?? 0) > 0);
  const merch = picked.reduce((s, l) => s + (qty[l.so_line_id] ?? 0) * l.unit_price_cents, 0);
  const over = picked.find((l) => (qty[l.so_line_id] ?? 0) > l.can_return);
  const save = async () => {
    setBusy(true);
    try {
      const res = await createScentsxReturn({ invoice_id: invoiceId, return_date: date, reason, notes: notes.trim() || null,
        lines: picked.map((l) => ({ so_line_id: l.so_line_id, qty: qty[l.so_line_id]!, restock: restock[l.so_line_id] ?? true, location_code: site })) });
      pushToast(`${res.return_no} recorded — credit ${money(res.merchandise_cents + res.tax_cents)}`, "success");
      setQty({}); await r.refetch(); onDone();
    } catch (e) { pushToast(userFacingApiError(e, "Return not recorded"), "error"); } finally { setBusy(false); }
  };
  return (
    <section className="space-y-2 rounded-[3px] border border-[#D8E0E8] p-3" data-testid="perfume-return-form" aria-label={tr("perfume.ret.title", "Return")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-semibold text-[#1F2A44]">{`${tr("perfume.ret.title", "Return")} · ${tr("perfume.ret.invoice", "invoice")} ${d.invoice.number ?? ""} · ${usDate(d.invoice.issue_date)} · ${money(d.invoice.total_cents)}`}</div>
        <Button type="button" variant="secondary" className="h-[28px] px-2 text-xs" onClick={onClose}>{tr("perfume.ret.close", "Close")}</Button>
      </div>
      <div className="flex flex-wrap items-end gap-2 text-xs">
        <label>{tr("perfume.ret.date", "Return date")} <DatePicker aria-label={tr("perfume.ret.date", "Return date")} value={date} onChange={(v) => setDate(v || todayCT())} /></label>
        <label>{tr("perfume.ret.reason", "Reason")}
          <select className={`${ctl} block`} value={reason} onChange={(e) => setReason(e.target.value as ScentsxReturnReason)} data-testid="perfume-return-reason">
            {REASONS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
          </select>
        </label>
        <label>{tr("perfume.ret.site", "Back to site")} <span className="block"><SitePicker value={site} onChange={setSite} label={tr("perfume.ret.site", "Back to site")} testId="perfume-return-site" /></span></label>
        <label>{tr("perfume.ret.notes", "Notes")} <input className={`${ctl} block w-[260px]`} aria-label={tr("perfume.ret.notes", "Notes")} value={notes} onChange={(e) => setNotes(e.target.value)} data-testid="perfume-return-notes" /></label>
      </div>
      <ParityTable<Row>
        rows={d.lines} rowKey={(l) => l.so_line_id} storageKey="perfume-return-lines-v1" emptyText="No sales-order lines on this invoice."
        columns={[
          { key: "line_no", label: "#", kind: "number", cellClass: "text-right tabular-nums", render: (l) => String(l.line_no) },
          { className: "text-left", key: "description", label: "Item", render: (l) => l.description, exportValue: (l) => l.description },
          { key: "unit_price_cents", label: "Unit price", kind: "number", cellClass: "text-right tabular-nums", render: (l) => money(l.unit_price_cents) },
          { key: "billed", label: "Billed", kind: "number", cellClass: "text-right tabular-nums", render: (l) => l.billed.toLocaleString("en-US") },
          { key: "returned", label: "Returned before", kind: "number", cellClass: "text-right tabular-nums", render: (l) => l.returned.toLocaleString("en-US") },
          { key: "qty", label: "Qty return", render: (l) => (
            <input type="number" min={0} max={l.can_return} className={`${ctl} w-[80px] text-right`} aria-label={`Return quantity line ${l.line_no}`} value={qty[l.so_line_id] ?? ""}
              disabled={l.can_return <= 0} onChange={(e) => setQty({ ...qty, [l.so_line_id]: e.target.value === "" ? 0 : Math.max(0, Math.floor(Number(e.target.value))) })} data-testid={`perfume-return-qty-${l.line_no}`} />) },
          { key: "restock", label: "Back to stock", render: (l) => (
            <input type="checkbox" aria-label={`Back to stock line ${l.line_no}`} disabled={!l.item_id} checked={l.item_id ? (restock[l.so_line_id] ?? true) : false}
              onChange={(e) => setRestock({ ...restock, [l.so_line_id]: e.target.checked })} data-testid={`perfume-return-restock-${l.line_no}`} />) },
          { key: "total", label: "Return total", kind: "number", cellClass: "text-right tabular-nums", render: (l) => money((qty[l.so_line_id] ?? 0) * l.unit_price_cents) },
        ]}
      />
      <div className="flex flex-wrap items-center justify-end gap-4 text-xs">
        <span>{`${tr("perfume.ret.merch", "Merchandise credit")} ${money(merch)}`}</span>
        <span className="text-[#64748B]">{tr("perfume.ret.tax_note", "Sales tax on the returned part is credited too, when the invoice charged it.")}</span>
        {over ? <span className="font-semibold text-[#B91C1C]">{`${tr("perfume.ret.over", "Line")} ${over.line_no}: ${tr("perfume.ret.max", "at most")} ${over.can_return}`}</span> : null}
        <Button type="button" className="h-[34px] px-3 text-xs" disabled={busy || !picked.length || Boolean(over)} onClick={() => void save()} data-testid="perfume-return-save">{tr("perfume.ret.record", "Record return")}</Button>
      </div>
    </section>
  );
}

/** Every return (CONTROL has no list; QuickBooks shows them as credit memos) — return no., date, invoice, customer, units, restocked, credit. */
export function ReturnsList() {
  const q = useQuery({ queryKey: ["scentsx", "returns"], queryFn: listScentsxReturns });
  if (q.isError) return <ListErrorState title={tr("perfume.ret.list_error", "Couldn't load the returns")} status={0} message={(q.error as Error)?.message} onRetry={() => void q.refetch()} />;
  return (
    <ParityTable<ScentsxReturnRow>
      title={tr("perfume.ret.list", "Returns")} rows={q.data?.returns ?? []} rowKey={(r) => r.id} loading={q.isLoading} storageKey="perfume-returns-v1" exportFilename="TIO returns" exportExcel
      emptyText="No returns yet."
      columns={[
        { className: "text-left", key: "return_no", label: "Return", sortable: true, render: (r) => <span className="font-semibold">{r.return_no}</span>, exportValue: (r) => r.return_no },
        { key: "return_date", label: "Date", sortable: true, cellClass: "text-right tabular-nums", render: (r) => usDate(r.return_date), exportValue: (r) => r.return_date },
        { className: "text-left", key: "invoice_no", label: "Invoice", render: (r) => <Link className="underline" to={`/accounting/invoices/${encodeURIComponent(r.invoice_id)}`}>{r.invoice_no ?? r.invoice_id.slice(0, 8)}</Link>, exportValue: (r) => r.invoice_no ?? "" },
        { className: "text-left", key: "customer", label: "Customer", sortable: true, render: (r) => r.customer ?? DASH, exportValue: (r) => r.customer ?? "" },
        { className: "text-left", key: "reason", label: "Reason", render: (r) => reasonText(r.reason), exportValue: (r) => reasonText(r.reason) },
        { key: "units", label: "Units", kind: "number", cellClass: "text-right tabular-nums", render: (r) => r.units.toLocaleString("en-US") },
        { key: "restocked", label: "Back to stock", kind: "number", cellClass: "text-right tabular-nums", render: (r) => r.restocked.toLocaleString("en-US") },
        { key: "merchandise_cents", label: "Merchandise", kind: "number", cellClass: "text-right tabular-nums", render: (r) => money(r.merchandise_cents), exportValue: (r) => r.merchandise_cents / 100 },
        { key: "tax_cents", label: "Tax", kind: "number", cellClass: "text-right tabular-nums", render: (r) => money(r.tax_cents), exportValue: (r) => r.tax_cents / 100 },
        { key: "credit", label: "Credit", kind: "number", cellClass: "text-right tabular-nums font-semibold", render: (r) => money(r.merchandise_cents + r.tax_cents), exportValue: (r) => (r.merchandise_cents + r.tax_cents) / 100 },
      ]}
    />
  );
}
