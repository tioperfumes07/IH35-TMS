/**
 * PERFUME-PURCHASE-ORDERS — what I buy from a vendor (owner 2026-11-26 19:12 CT: "sales order and purchase ordres should already
 * be created"). Made from a sales order (Sales orders → Buy: each line to the vendor with the lowest current price) or started
 * here for one vendor. Every line carries the vendor's own code and words from their current list. Receive per line or all;
 * the PO is received when every line is. Links both ways: vendor profile, the sales order. History, Excel, PDF.
 * Nothing is deleted. Received units are billed to ScentsX A/P from here (PurchaseBillForm, migration 202617120100).
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "../../components/Button";
import { DatePicker } from "../../components/forms/DatePicker";
import { ParityTable } from "../../components/parity/ParityTable";
import { KpiCard } from "../../components/layout/KpiCard";
import { useToast } from "../../components/Toast";
import { ListErrorState } from "../../components/ListErrorState";
import { userFacingApiError } from "../../lib/api-error-message";
import {
  addPerfumePurchaseLine, archivePerfumePurchaseOrder, createPerfumePurchaseOrder, downloadPerfumeFile, getPerfumePurchaseOrder, listPerfumePurchaseOrders,
  listPerfumeVendors, receiveAllPerfumePurchaseOrder, removePerfumePurchaseLine, setPerfumePurchaseOrderStatus, updatePerfumePurchaseLine, updatePerfumePurchaseOrder,
  approvePerfumePurchaseOrder, getPerfumePoApproval, setPerfumePoApproval,
  type PerfumePo, type PerfumePoLine, type PerfumePoRow, type PerfumePoStatus,
} from "../../api/perfume";
import { MoneyInput } from "../../components/forms/MoneyInput";
import { tr } from "./perfumeI18n";
import { Badge, ctl, DASH, DocLink, HistoryTable, ItemFinder, money, NumberCell, SitePicker, toCents, useOpenDoc, usDate } from "./perfumeDocParts";
import { PurchaseBillForm } from "./PerfumePurchaseBillParts";
import { PO_STATUS_CLASS as STATUS_CLASS, PO_STATUS_TEXT as STATUS_TEXT } from "./PerfumeOrdersPanel";

export function PerfumePurchasesPanel() {
  const { pushToast } = useToast();
  const { openId } = useOpenDoc();
  const pos = useQuery({ queryKey: ["perfume", "purchase-orders"], queryFn: listPerfumePurchaseOrders });
  const [status, setStatus] = useState<PerfumePoStatus | "">("");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string | null>(openId);
  const [adding, setAdding] = useState(false);
  useEffect(() => { if (openId) setSelected(openId); }, [openId]);
  const all = useMemo(() => pos.data?.purchase_orders ?? [], [pos.data]);
  const shown = all.filter((r) => (!status || r.status === status)
    && (!q.trim() || `${r.number} ${r.vendor_name} ${r.sales_order_number ?? ""} ${r.sales_order_customer ?? ""}`.toLowerCase().includes(q.trim().toLowerCase())));
  const count = (s: PerfumePoStatus) => all.filter((r) => r.status === s).length;
  const openCost = all.filter((r) => r.status === "open").reduce((t, r) => t + Number(r.total_cents), 0);
  const toReceive = all.filter((r) => r.status === "open").reduce((t, r) => t + (r.units - r.units_received), 0);

  if (pos.isError) return <ListErrorState title={tr("perfume.pos.loadError", "Couldn't load the purchase orders")} status={0} message={(pos.error as Error)?.message} onRetry={() => void pos.refetch()} />;

  return (
    <div className="space-y-3" data-testid="perfume-pos-panel">
      <div className="grid grid-cols-2 gap-[10px] md:grid-cols-6" data-testid="perfume-pos-kpis">
        <KpiCard label={tr("perfume.pos.kpi_all", "Purchase orders")} number={all.length.toLocaleString("en-US")} onClick={() => setStatus("")} />
        <KpiCard label={tr("perfume.pos.kpi_open", "Open")} number={count("open").toLocaleString("en-US")} onClick={() => setStatus("open")} />
        <KpiCard label={tr("perfume.pos.kpi_received", "Received")} number={count("received").toLocaleString("en-US")} onClick={() => setStatus("received")} />
        <KpiCard label={tr("perfume.pos.kpi_cancelled", "Cancelled")} number={count("cancelled").toLocaleString("en-US")} onClick={() => setStatus("cancelled")} />
        <KpiCard label={tr("perfume.pos.kpi_open_cost", "Open cost")} number={money(openCost)} onClick={() => setStatus("open")} />
        <KpiCard label={tr("perfume.pos.kpi_to_receive", "Units still to receive")} number={toReceive.toLocaleString("en-US")} onClick={() => setStatus("open")} />
      </div>
      <section className="space-y-2 rounded-[3px] border border-[#D8E0E8] bg-white p-3" aria-label={tr("perfume.pos.title", "Purchase orders")}>
        <PoApprovalAmount />
        <div className="flex flex-wrap items-center gap-2">
          <select className={ctl} aria-label={tr("perfume.pos.status", "Status")} value={status} onChange={(e) => setStatus(e.target.value as PerfumePoStatus | "")} data-testid="perfume-pos-status">
            <option value="">{tr("perfume.pos.any_status", "Any status")}</option>
            {(Object.keys(STATUS_TEXT) as PerfumePoStatus[]).map((s) => <option key={s} value={s}>{STATUS_TEXT[s]}</option>)}
          </select>
          <input type="search" className={`${ctl} min-w-[220px] flex-1`} aria-label={tr("perfume.pos.search", "Search purchase orders")} placeholder={tr("perfume.pos.search_ph", "Search PO, vendor, sales order or customer")}
            value={q} onChange={(e) => setQ(e.target.value)} data-testid="perfume-pos-search" />
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" data-testid="perfume-pos-export"
            onClick={() => void downloadPerfumeFile(`/api/v1/perfume/purchase-orders/export.xlsx${status ? `?status=${status}` : ""}`, "Purchase orders.xlsx").catch((e) => pushToast(userFacingApiError(e, "Export failed"), "error"))}>
            {tr("perfume.pos.export", "Export list (Excel)")}
          </Button>
          <Button type="button" className="h-[34px] px-3 text-xs" onClick={() => setAdding((v) => !v)} data-testid="perfume-pos-new">{tr("perfume.pos.new", "New purchase order")}</Button>
        </div>
        {adding ? <NewPoForm onClose={() => setAdding(false)} onCreated={(id) => { setAdding(false); setSelected(id); void pos.refetch(); }} /> : null}
        <ParityTable<PerfumePoRow>
          rows={shown}
          rowKey={(r) => r.id}
          loading={pos.isLoading}
          storageKey="perfume-pos-v1"
          exportFilename="TIO purchase orders"
          exportExcel
          emptyText={status || q ? "No purchase order matches these filters." : "No purchase orders yet — press Buy on a sales order, or New purchase order."}
          onRowClick={(r) => setSelected(r.id)}
          columns={[
            { key: "number", label: "PO", sortable: true, render: (r) => <span className="font-semibold">{r.number}</span> },
            { key: "order_date", label: "Date", sortable: true, cellClass: "text-right tabular-nums", render: (r) => usDate(r.order_date) },
            { key: "expected_by", label: "Expected", sortable: true, cellClass: "text-right tabular-nums", render: (r) => usDate(r.expected_by) },
            { key: "vendor_name", label: "Vendor", sortable: true, render: (r) => <DocLink tab="suppliers" id={r.vendor_id}>{r.vendor_name}</DocLink>, exportValue: (r) => r.vendor_name },
            { key: "sales_order_number", label: "Sales order", sortable: true, render: (r) => (r.sales_order_id && r.sales_order_number ? <DocLink tab="orders" id={r.sales_order_id}>{r.sales_order_number}</DocLink> : DASH), exportValue: (r) => r.sales_order_number ?? "" },
            { key: "status", label: "Status", sortable: true, render: (r) => <Badge text={STATUS_TEXT[r.status]} color={STATUS_CLASS[r.status]} />, exportValue: (r) => STATUS_TEXT[r.status] },
            { key: "units", label: "Units", sortable: true, kind: "number", cellClass: "text-right tabular-nums", render: (r) => r.units.toLocaleString("en-US") },
            { key: "units_received", label: "Received", sortable: true, kind: "number", cellClass: "text-right tabular-nums", render: (r) => r.units_received.toLocaleString("en-US") },
            { key: "total_cents", label: "Cost", sortable: true, kind: "number", cellClass: "text-right tabular-nums", render: (r) => money(r.total_cents, r.currency), exportValue: (r) => Number(r.total_cents) / 100 },
          ]}
        />
      </section>
      {selected ? <PoEditor id={selected} onClose={() => setSelected(null)} onChanged={() => void pos.refetch()} /> : null}
    </div>
  );
}

function NewPoForm({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { pushToast } = useToast();
  const vendors = useQuery({ queryKey: ["perfume", "vendors"], queryFn: listPerfumeVendors });
  const [vendorId, setVendorId] = useState("");
  const [expected, setExpected] = useState("");
  // A competitor's list is never bought from.
  const buyable = (vendors.data?.vendors ?? []).filter((v) => v.kind !== "sell").sort((a, b) => a.name.localeCompare(b.name));
  const create = async () => {
    try { const r = await createPerfumePurchaseOrder({ vendor_id: vendorId, expected_by: expected || null }); pushToast(`Purchase order ${r.number} started`, "success"); onCreated(r.id); }
    catch (e) { pushToast(userFacingApiError(e, "Not saved"), "error"); }
  };
  return (
    <div className="flex flex-wrap items-end gap-2 border-t border-[#E8EDF2] pt-2" data-testid="perfume-pos-new-form">
      <label className="text-xs">{tr("perfume.pos.vendor", "Vendor")}
        <select className={`${ctl} block w-[320px]`} value={vendorId} onChange={(e) => setVendorId(e.target.value)} data-testid="perfume-pos-vendor">
          <option value="">{tr("perfume.pos.pick_vendor", "Pick the vendor")}</option>
          {buyable.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
      </label>
      <label className="text-xs">{tr("perfume.pos.expected", "Expected by")}<DatePicker aria-label={tr("perfume.pos.expected", "Expected by")} value={expected} onChange={setExpected} /></label>
      <Button type="button" className="h-[34px] px-3 text-xs" disabled={!vendorId} onClick={() => void create()} data-testid="perfume-pos-create">{tr("perfume.pos.start", "Start purchase order")}</Button>
      <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" onClick={onClose}>{tr("perfume.pos.cancel_new", "Cancel")}</Button>
    </div>
  );
}

/** The amount over which (owner 22:50 CT "over 50K needs approval by me") a PO is approved before its goods are received. Blank = no approval step. */
function PoApprovalAmount() {
  const { pushToast } = useToast();
  const q = useQuery({ queryKey: ["perfume", "po-approval"], queryFn: getPerfumePoApproval });
  const [v, setV] = useState<number | null | undefined>(undefined);
  if (q.isError) return <ListErrorState title={tr("perfume.pos.apprError", "Couldn't load the approval amount")} status={0} message={(q.error as Error)?.message} onRetry={() => void q.refetch()} />;
  const cur = v === undefined ? q.data?.approval_over_cents ?? null : v;
  const save = () => void setPerfumePoApproval(cur).then(() => { setV(undefined); void q.refetch(); pushToast(cur == null ? "No PO approval step" : `POs over ${money(cur)} need approval`, "success"); })
    .catch((e) => pushToast(userFacingApiError(e, "Not saved"), "error"));
  return (
    <div className="flex flex-wrap items-end gap-2 text-xs" data-testid="perfume-po-approval-amount">
      <label>{tr("perfume.pos.appr_amount", "Approve POs over")} <MoneyInput className="block w-[120px]" ariaLabel={tr("perfume.pos.appr_amount", "Approve POs over")} valueCents={cur} onChangeCents={setV} /></label>
      <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" disabled={v === undefined} onClick={save} data-testid="perfume-po-approval-save">{tr("perfume.pos.appr_save", "Save")}</Button>
      <span className="text-[#64748B]">{tr("perfume.pos.appr_help", "Blank = no approval. A PO over it is received only once approved; a change after approval takes it off.")}</span>
    </div>
  );
}

function PoEditor({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { pushToast } = useToast();
  const po = useQuery({ queryKey: ["perfume", "purchase-order", id], queryFn: () => getPerfumePurchaseOrder(id) });
  const [typed, setTyped] = useState({ description: "", qty: "1", cost: "" });
  const refresh = async () => { await po.refetch(); onChanged(); };
  const p: PerfumePo | undefined = po.data;
  if (po.isError) return <ListErrorState title={tr("perfume.pos.loadOneError", "Couldn't load the purchase order")} status={0} message={(po.error as Error)?.message} onRetry={() => void po.refetch()} />;
  if (!p) return null;
  const run = async (f: () => Promise<unknown>, ok?: string, fail = "Not saved") => {
    try { await f(); await refresh(); if (ok) pushToast(ok, "success"); } catch (e) { pushToast(userFacingApiError(e, fail), "error"); }
  };
  const patch = (b: Parameters<typeof updatePerfumePurchaseOrder>[1]) => run(() => updatePerfumePurchaseOrder(id, b));
  const file = (kind: "xlsx" | "pdf") => run(() => downloadPerfumeFile(`/api/v1/perfume/purchase-orders/${id}/export.${kind}`, `${p.number}.${kind}`), undefined, "Export failed");
  const addTyped = () => {
    const qty = Number(typed.qty), cost = toCents(typed.cost);
    if (!typed.description.trim() || !Number.isInteger(qty) || qty < 1 || cost == null) { pushToast("Type what it is, a whole quantity and its cost", "error"); return; }
    void run(async () => { await addPerfumePurchaseLine(id, { description: typed.description.trim(), qty, unit_cost_cents: cost }); setTyped({ description: "", qty: "1", cost: "" }); }, undefined, "Not added");
  };
  const total = p.lines.reduce((t, l) => t + l.qty * l.unit_cost_cents, 0);
  const locked = p.status === "cancelled";
  return (
    <section className="space-y-2 rounded-[3px] border border-[#D8E0E8] bg-white p-3" data-testid="perfume-po-editor" aria-label={p.number}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-section-header">{p.number} · <DocLink tab="suppliers" id={p.vendor_id} testId="perfume-po-vendor-link">{p.vendor_name}</DocLink> <Badge text={STATUS_TEXT[p.status]} color={STATUS_CLASS[p.status]} /></div>
          <div className="text-xs text-[#64748B]">
            {[p.vendor_contact, `Date ${usDate(p.order_date)}`].filter(Boolean).join(" · ")}
            {p.sales_order_id && p.sales_order_number ? <> · {tr("perfume.pos.for_order", "For sales order")} <DocLink tab="orders" id={p.sales_order_id} testId="perfume-po-order-link">{p.sales_order_number}</DocLink>{p.sales_order_customer ? ` (${p.sales_order_customer})` : ""}</> : null}
          </div>
          {p.needs_approval ? (
            <div className="text-xs" data-testid="perfume-po-approval">
              {p.approved_at
                ? `${tr("perfume.pos.approved_by", "Approved")} ${new Date(p.approved_at).toLocaleDateString("en-US", { timeZone: "America/Chicago" })}${p.approved_by_email ? ` · ${p.approved_by_email}` : ""}`
                : `${tr("perfume.pos.awaiting", "Waiting for approval — over")} ${money(p.approval_over_cents ?? 0)}`}
            </div>) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {p.needs_approval && !p.approved_at
            ? <Button type="button" className="h-[34px] px-3 text-xs" disabled={locked} onClick={() => void run(() => approvePerfumePurchaseOrder(id), `${p.number} approved`)} data-testid="perfume-po-approve">{tr("perfume.pos.approve", "Approve")}</Button>
            : null}
          <Button type="button" className="h-[34px] px-3 text-xs" disabled={locked || p.status === "received" || !p.lines.length || !!p.awaiting_approval} onClick={() => void run(() => receiveAllPerfumePurchaseOrder(id), "Everything received")} data-testid="perfume-po-receive-all">{tr("perfume.pos.receive_all", "Receive all")}</Button>
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" onClick={() => void file("xlsx")} data-testid="perfume-po-xlsx">{tr("perfume.pos.xlsx", "Excel")}</Button>
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" onClick={() => void file("pdf")} data-testid="perfume-po-pdf">{tr("perfume.pos.pdf", "PDF")}</Button>
          {p.status === "cancelled"
            ? <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" onClick={() => void run(() => setPerfumePurchaseOrderStatus(id, "open"), `${p.number} reopened`)} data-testid="perfume-po-reopen">{tr("perfume.pos.reopen", "Reopen")}</Button>
            : <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" disabled={p.status === "received"} onClick={() => void run(() => setPerfumePurchaseOrderStatus(id, "cancelled"), `${p.number} cancelled`)} data-testid="perfume-po-cancel">{tr("perfume.pos.cancel", "Cancel PO")}</Button>}
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" data-testid="perfume-po-archive"
            onClick={() => void archivePerfumePurchaseOrder(id).then(() => { onChanged(); onClose(); }).catch((e) => pushToast(userFacingApiError(e, "Not taken off"), "error"))}>
            {tr("perfume.pos.archive", "Take off")}
          </Button>
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" onClick={onClose}>{tr("perfume.pos.close", "Close")}</Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <label>{tr("perfume.pos.arrives_at", "Arrives at")} <SitePicker value={p.location_code} onChange={(v) => void patch({ location_code: v })} label={tr("perfume.pos.arrives_at", "Arrives at")} testId="perfume-po-site" /></label>
        <label>{tr("perfume.pos.expected", "Expected by")} <DatePicker aria-label={tr("perfume.pos.expected", "Expected by")} value={p.expected_by ?? ""} onChange={(v) => void patch({ expected_by: v || null })} /></label>
        <select className={ctl} aria-label={tr("perfume.pos.currency", "Currency")} value={p.currency} onChange={(e) => void patch({ currency: e.target.value as "USD" | "MXN" })}>
          <option value="USD">{"USD"}</option><option value="MXN">{"MXN"}</option>
        </select>
      </div>
      {locked ? null : (
        <>
          <ItemFinder testId="perfume-po-find-item" onPick={(itemId, qty) => void run(() => addPerfumePurchaseLine(id, { item_id: itemId, qty }), undefined, "Not added")} />
          <div className="flex flex-wrap items-end gap-2 text-xs" data-testid="perfume-po-typed-line">
            <label>{tr("perfume.pos.typed", "Or type a line")} <input className={`${ctl} block w-[320px]`} value={typed.description} onChange={(e) => setTyped({ ...typed, description: e.target.value })} /></label>
            <label>{tr("perfume.pos.qty", "Qty")} <input className={`${ctl} block w-[80px] text-right`} value={typed.qty} onChange={(e) => setTyped({ ...typed, qty: e.target.value })} /></label>
            <label>{tr("perfume.pos.cost", "Unit cost")} <input className={`${ctl} block w-[100px] text-right`} value={typed.cost} onChange={(e) => setTyped({ ...typed, cost: e.target.value })} /></label>
            <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" onClick={addTyped} data-testid="perfume-po-add-typed">{tr("perfume.pos.add", "Add line")}</Button>
          </div>
        </>
      )}
      <ParityTable<PerfumePoLine>
        title={tr("perfume.pos.lines", "Lines")}
        rows={p.lines}
        rowKey={(l) => `${l.id}-${l.qty}-${l.qty_received}-${l.unit_cost_cents}`}
        storageKey="perfume-po-lines-v1"
        exportFilename="TIO purchase order lines"
        exportExcel
        emptyText="No lines yet — add an item above."
        columns={[
          { key: "line_no", label: "#", cellClass: "tabular-nums", render: (l) => l.line_no },
          { key: "vendor_sku", label: "Their code", render: (l) => l.vendor_sku ?? DASH, exportValue: (l) => l.vendor_sku ?? "" },
          { key: "description", label: "Item (their words)", render: (l) => <>{l.description}{l.upc ? <span className="ml-1 text-[#64748B]">{l.upc}</span> : null}</>, exportValue: (l) => `${l.description}${l.upc ? ` ${l.upc}` : ""}` },
          { key: "qty", label: "Qty", render: (l) => <NumberCell value={l.qty} min={1} label={tr("perfume.pos.qty", "Qty")} testId={`perfume-po-qty-${l.line_no}`} onSave={(n) => updatePerfumePurchaseLine(l.id, { qty: n }).then(refresh)} />, exportValue: (l) => l.qty },
          { key: "qty_received", label: "Received", render: (l) => <NumberCell value={l.qty_received} label={tr("perfume.pos.received", "Received")} testId={`perfume-po-received-${l.line_no}`} onSave={(n) => updatePerfumePurchaseLine(l.id, { qty_received: n }).then(refresh)} />, exportValue: (l) => l.qty_received },
          { key: "unit_cost_cents", label: "Unit cost", render: (l) => <NumberCell value={l.unit_cost_cents} money label={tr("perfume.pos.cost", "Unit cost")} testId={`perfume-po-cost-${l.line_no}`} onSave={(n) => updatePerfumePurchaseLine(l.id, { unit_cost_cents: n }).then(refresh)} />, exportValue: (l) => l.unit_cost_cents / 100 },
          { key: "total", label: "Total", cellClass: "text-right tabular-nums", render: (l) => money(l.qty * l.unit_cost_cents, p.currency), exportValue: (l) => (l.qty * l.unit_cost_cents) / 100 },
          { key: "off", label: "", render: (l) => (
            <Button type="button" variant="secondary" className="h-[28px] px-2 text-xs" disabled={l.qty_received > 0}
              onClick={(e) => { e.stopPropagation(); void run(() => removePerfumePurchaseLine(l.id), undefined, "Not taken off"); }}>
              {tr("perfume.pos.take_off", "Take off")}
            </Button>) },
        ]}
      />
      <div className="flex justify-end gap-4 border-t border-[#14314F] pt-1 text-xs font-semibold" data-testid="perfume-po-lines-total">
        <span>{`${p.lines.length} line${p.lines.length === 1 ? "" : "s"} · ${p.lines.reduce((t, l) => t + l.qty, 0).toLocaleString("en-US")} units · ${p.lines.reduce((t, l) => t + l.qty_received, 0).toLocaleString("en-US")} received`}</span>
        <span data-testid="perfume-po-total">{money(total, p.currency)}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <label className="flex-1 text-xs">{tr("perfume.pos.terms", "Terms")}
          <textarea className="block min-h-[56px] w-full rounded-sm border border-[#C6D1DC] p-2 text-xs" defaultValue={p.terms ?? ""} onBlur={(e) => { if (e.target.value !== (p.terms ?? "")) void patch({ terms: e.target.value || null }); }} />
        </label>
        <label className="flex-1 text-xs">{tr("perfume.pos.notes", "Notes")}
          <textarea className="block min-h-[56px] w-full rounded-sm border border-[#C6D1DC] p-2 text-xs" defaultValue={p.notes ?? ""} onBlur={(e) => { if (e.target.value !== (p.notes ?? "")) void patch({ notes: e.target.value || null }); }} />
        </label>
      </div>
      {p.currency === "USD" ? <PurchaseBillForm poId={id} poNumber={p.number} onDone={() => void refresh()} /> : null}
      <HistoryTable events={p.events} storageKey="perfume-po-history-v1" exportFilename="TIO purchase order history" />
    </section>
  );
}
