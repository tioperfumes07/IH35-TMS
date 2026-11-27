/**
 * PERFUME-SALES-ORDERS — what a customer bought (owner 2026-11-26 19:12 CT: "sales order and purchase ordres should already be
 * created"). An accepted quote becomes an order (Quotes → Make order) or one is started here. Each line: qty ordered and
 * shipped; the order is shipped when every line is. "Buy" makes the purchase orders — each line to the vendor with the lowest
 * current price, one PO per vendor. Links both ways: the quote it came from, the POs it made, the customer. History, Excel, PDF.
 * Nothing is deleted. Never posts to accounting.
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
  addPerfumeOrderLine, archivePerfumeOrder, createPerfumeOrder, downloadPerfumeFile, getPerfumeOrder, listPerfumeContacts, listPerfumeOrders,
  perfumePurchaseOrdersOfOrder, purchaseFromPerfumeOrder, removePerfumeOrderLine, setPerfumeOrderStatus, shipAllPerfumeOrder, updatePerfumeOrder,
  updatePerfumeOrderLine, type PerfumeOrder, type PerfumeOrderLine, type PerfumeOrderRow, type PerfumeOrderStatus, type PerfumePoRow,
} from "../../api/perfume";
import { tr } from "./perfumeI18n";
import { Badge, ctl, DASH, DocLink, HistoryTable, ItemFinder, money, NumberCell, useOpenDoc, usDate } from "./perfumeDocParts";

const STATUS_TEXT: Record<PerfumeOrderStatus, string> = { open: "Open", shipped: "Shipped", cancelled: "Cancelled" };
const STATUS_CLASS: Record<PerfumeOrderStatus, string> = { open: "bg-[#14314F]", shipped: "bg-[#1F6B32]", cancelled: "bg-[#9B2C2C]" };
export const PO_STATUS_TEXT = { open: "Open", received: "Received", cancelled: "Cancelled" } as const;
export const PO_STATUS_CLASS = { open: "bg-[#14314F]", received: "bg-[#1F6B32]", cancelled: "bg-[#9B2C2C]" } as const;

export function PerfumeOrdersPanel() {
  const { pushToast } = useToast();
  const { openId } = useOpenDoc();
  const orders = useQuery({ queryKey: ["perfume", "orders"], queryFn: listPerfumeOrders });
  const [status, setStatus] = useState<PerfumeOrderStatus | "">("");
  const [toBuy, setToBuy] = useState(false);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string | null>(openId);
  const [adding, setAdding] = useState(false);
  useEffect(() => { if (openId) setSelected(openId); }, [openId]);
  const all = useMemo(() => orders.data?.orders ?? [], [orders.data]);
  const shown = all.filter((r) => (!status || r.status === status) && (!toBuy || (r.status === "open" && r.purchase_orders === 0))
    && (!q.trim() || `${r.number} ${r.customer_name} ${r.quote_number ?? ""}`.toLowerCase().includes(q.trim().toLowerCase())));
  const count = (s: PerfumeOrderStatus) => all.filter((r) => r.status === s).length;
  const openValue = all.filter((r) => r.status === "open").reduce((t, r) => t + Number(r.total_cents), 0);
  const notBought = all.filter((r) => r.status === "open" && r.purchase_orders === 0).length;
  const pick = (s: PerfumeOrderStatus | "", buy = false) => { setStatus(s); setToBuy(buy); };

  if (orders.isError) return <ListErrorState title={tr("perfume.orders.loadError", "Couldn't load the sales orders")} status={0} message={(orders.error as Error)?.message} onRetry={() => void orders.refetch()} />;

  return (
    <div className="space-y-3" data-testid="perfume-orders-panel">
      <div className="grid grid-cols-2 gap-[10px] md:grid-cols-6" data-testid="perfume-orders-kpis">
        <KpiCard label={tr("perfume.orders.kpi_all", "Sales orders")} number={all.length.toLocaleString("en-US")} onClick={() => pick("")} />
        <KpiCard label={tr("perfume.orders.kpi_open", "Open")} number={count("open").toLocaleString("en-US")} onClick={() => pick("open")} />
        <KpiCard label={tr("perfume.orders.kpi_shipped", "Shipped")} number={count("shipped").toLocaleString("en-US")} onClick={() => pick("shipped")} />
        <KpiCard label={tr("perfume.orders.kpi_cancelled", "Cancelled")} number={count("cancelled").toLocaleString("en-US")} onClick={() => pick("cancelled")} />
        <KpiCard label={tr("perfume.orders.kpi_open_value", "Open value")} number={money(openValue)} onClick={() => pick("open")} />
        <KpiCard label={tr("perfume.orders.kpi_to_buy", "Open, nothing bought yet")} number={notBought.toLocaleString("en-US")} onClick={() => pick("open", true)} />
      </div>
      <section className="space-y-2 rounded-[3px] border border-[#D8E0E8] bg-white p-3" aria-label={tr("perfume.orders.title", "Sales orders")}>
        <div className="flex flex-wrap items-center gap-2">
          <select className={ctl} aria-label={tr("perfume.orders.status", "Status")} value={status} onChange={(e) => pick(e.target.value as PerfumeOrderStatus | "")} data-testid="perfume-orders-status">
            <option value="">{tr("perfume.orders.any_status", "Any status")}</option>
            {(Object.keys(STATUS_TEXT) as PerfumeOrderStatus[]).map((s) => <option key={s} value={s}>{STATUS_TEXT[s]}</option>)}
          </select>
          <input type="search" className={`${ctl} min-w-[220px] flex-1`} aria-label={tr("perfume.orders.search", "Search sales orders")} placeholder={tr("perfume.orders.search_ph", "Search number, customer or quote")}
            value={q} onChange={(e) => setQ(e.target.value)} data-testid="perfume-orders-search" />
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" data-testid="perfume-orders-export"
            onClick={() => void downloadPerfumeFile(`/api/v1/perfume/orders/export.xlsx${status ? `?status=${status}` : ""}`, "Sales orders.xlsx").catch((e) => pushToast(userFacingApiError(e, "Export failed"), "error"))}>
            {tr("perfume.orders.export", "Export list (Excel)")}
          </Button>
          <Button type="button" className="h-[34px] px-3 text-xs" onClick={() => setAdding((v) => !v)} data-testid="perfume-orders-new">{tr("perfume.orders.new", "New sales order")}</Button>
        </div>
        {adding ? <NewOrderForm onClose={() => setAdding(false)} onCreated={(id) => { setAdding(false); setSelected(id); void orders.refetch(); }} /> : null}
        <ParityTable<PerfumeOrderRow>
          rows={shown}
          rowKey={(r) => r.id}
          loading={orders.isLoading}
          storageKey="perfume-orders-v1"
          exportFilename="TIO sales orders"
          exportExcel
          emptyText={status || q || toBuy ? "No sales order matches these filters." : "No sales orders yet — make one from an accepted quote, or press New sales order."}
          onRowClick={(r) => setSelected(r.id)}
          columns={[
            { key: "number", label: "Number", sortable: true, render: (r) => <span className="font-semibold">{r.number}</span> },
            { key: "order_date", label: "Date", sortable: true, cellClass: "text-right tabular-nums", render: (r) => usDate(r.order_date) },
            { key: "ship_by", label: "Ship by", sortable: true, cellClass: "text-right tabular-nums", render: (r) => usDate(r.ship_by) },
            { key: "customer_name", label: "Customer", sortable: true, render: (r) => r.customer_name },
            { key: "quote_number", label: "Quote", sortable: true, render: (r) => (r.quote_id && r.quote_number ? <DocLink tab="quotes" id={r.quote_id}>{r.quote_number}</DocLink> : DASH), exportValue: (r) => r.quote_number ?? "" },
            { key: "status", label: "Status", sortable: true, render: (r) => <Badge text={STATUS_TEXT[r.status]} color={STATUS_CLASS[r.status]} />, exportValue: (r) => STATUS_TEXT[r.status] },
            { key: "units", label: "Units", sortable: true, kind: "number", cellClass: "text-right tabular-nums", render: (r) => r.units.toLocaleString("en-US") },
            { key: "units_shipped", label: "Shipped", sortable: true, kind: "number", cellClass: "text-right tabular-nums", render: (r) => r.units_shipped.toLocaleString("en-US") },
            { key: "purchase_orders", label: "POs", sortable: true, kind: "number", cellClass: "text-right tabular-nums", render: (r) => r.purchase_orders.toLocaleString("en-US") },
            { key: "total_cents", label: "Total", sortable: true, kind: "number", cellClass: "text-right tabular-nums", render: (r) => money(r.total_cents, r.currency), exportValue: (r) => Number(r.total_cents) / 100 },
          ]}
        />
      </section>
      {selected ? <OrderEditor id={selected} onClose={() => setSelected(null)} onChanged={() => void orders.refetch()} /> : null}
    </div>
  );
}

function NewOrderForm({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { pushToast } = useToast();
  const [find, setFind] = useState("");
  const [pick, setPick] = useState<{ id: string; name: string } | null>(null);
  const [shipBy, setShipBy] = useState("");
  const found = useQuery({ queryKey: ["perfume", "contacts", "order-pick", find], queryFn: () => listPerfumeContacts({ q: find, limit: 20 }), enabled: !pick && find.trim().length >= 2 });
  const create = async () => {
    try {
      const r = await createPerfumeOrder({ company_id: pick?.id ?? null, customer_name: pick ? null : find.trim(), ship_by: shipBy || null });
      pushToast(`Sales order ${r.number} started`, "success"); onCreated(r.id);
    } catch (e) { pushToast(userFacingApiError(e, "Not saved"), "error"); }
  };
  return (
    <div className="flex flex-wrap items-end gap-2 border-t border-[#E8EDF2] pt-2" data-testid="perfume-orders-new-form">
      <label className="relative text-xs">{tr("perfume.orders.customer", "Customer (from Contacts, or type a name)")}
        <input className={`${ctl} block w-[320px]`} value={pick ? pick.name : find} onChange={(e) => { setPick(null); setFind(e.target.value); }} data-testid="perfume-orders-customer" />
        {!pick && find.trim().length >= 2 && (found.data?.rows?.length ?? 0) > 0 ? (
          <div className="absolute z-20 mt-1 max-h-64 w-[320px] overflow-y-auto border border-gray-300 bg-white shadow-lg" role="listbox">
            {found.data!.rows.map((r) => (
              <button key={r.id} type="button" role="option" aria-selected={false} className="block w-full px-2 py-1 text-left text-xs hover:bg-gray-100"
                onClick={() => setPick({ id: r.id, name: r.name })} data-testid={`perfume-orders-pick-${r.id}`}>
                <span className="font-semibold">{r.name}</span> <span className="text-[#64748B]">{[r.city, r.country].filter(Boolean).join(", ")}</span>
              </button>
            ))}
          </div>
        ) : null}
      </label>
      <label className="text-xs">{tr("perfume.orders.ship_by", "Ship by")}<DatePicker aria-label={tr("perfume.orders.ship_by", "Ship by")} value={shipBy} onChange={setShipBy} /></label>
      <Button type="button" className="h-[34px] px-3 text-xs" disabled={!pick && find.trim().length < 2} onClick={() => void create()} data-testid="perfume-orders-create">{tr("perfume.orders.start", "Start sales order")}</Button>
      <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" onClick={onClose}>{tr("perfume.orders.cancel_new", "Cancel")}</Button>
    </div>
  );
}

function OrderEditor({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { pushToast } = useToast();
  const order = useQuery({ queryKey: ["perfume", "order", id], queryFn: () => getPerfumeOrder(id) });
  const pos = useQuery({ queryKey: ["perfume", "order-pos", id], queryFn: () => perfumePurchaseOrdersOfOrder(id) });
  const [skipped, setSkipped] = useState<Array<{ line_no: number; description: string; reason: string }>>([]);
  const refresh = async () => { await Promise.all([order.refetch(), pos.refetch()]); onChanged(); };
  const o: PerfumeOrder | undefined = order.data;
  if (order.isError) return <ListErrorState title={tr("perfume.orders.loadOneError", "Couldn't load the sales order")} status={0} message={(order.error as Error)?.message} onRetry={() => void order.refetch()} />;
  if (!o) return null;
  const run = async (f: () => Promise<unknown>, ok?: string, fail = "Not saved") => {
    try { await f(); await refresh(); if (ok) pushToast(ok, "success"); } catch (e) { pushToast(userFacingApiError(e, fail), "error"); }
  };
  const patch = (b: Parameters<typeof updatePerfumeOrder>[1]) => run(() => updatePerfumeOrder(id, b));
  const file = (kind: "xlsx" | "pdf") => run(() => downloadPerfumeFile(`/api/v1/perfume/orders/${id}/export.${kind}`, `${o.number}.${kind}`), undefined, "Export failed");
  const buy = () => run(async () => {
    const r = await purchaseFromPerfumeOrder(id);
    setSkipped(r.skipped);
    pushToast(r.purchase_orders.length ? `${r.purchase_orders.length} purchase order${r.purchase_orders.length === 1 ? "" : "s"} made: ${r.purchase_orders.map((p) => p.number).join(", ")}` : "Nothing left to buy on this order", "success");
  }, undefined, "Not bought");
  const total = o.lines.reduce((t, l) => t + l.qty * l.unit_price_cents, 0);
  const locked = o.status === "cancelled";
  return (
    <section className="space-y-2 rounded-[3px] border border-[#D8E0E8] bg-white p-3" data-testid="perfume-order-editor" aria-label={o.number}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-section-header">{o.number} · {o.customer_name} <Badge text={STATUS_TEXT[o.status]} color={STATUS_CLASS[o.status]} /></div>
          <div className="text-xs text-[#64748B]">
            {[o.customer_email, o.customer_phone, `Date ${usDate(o.order_date)}`].filter(Boolean).join(" · ")}
            {o.quote_id && o.quote_number ? <> · {tr("perfume.orders.from_quote", "From quote")} <DocLink tab="quotes" id={o.quote_id} testId="perfume-order-quote-link">{o.quote_number}</DocLink></> : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" className="h-[34px] px-3 text-xs" disabled={locked || !o.lines.length} onClick={() => void buy()} data-testid="perfume-order-buy">{tr("perfume.orders.buy", "Buy (make purchase orders)")}</Button>
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" disabled={locked || o.status === "shipped"} onClick={() => void run(() => shipAllPerfumeOrder(id), "Everything shipped")} data-testid="perfume-order-ship-all">{tr("perfume.orders.ship_all", "Ship all")}</Button>
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" onClick={() => void file("xlsx")} data-testid="perfume-order-xlsx">{tr("perfume.orders.xlsx", "Excel")}</Button>
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" onClick={() => void file("pdf")} data-testid="perfume-order-pdf">{tr("perfume.orders.pdf", "PDF")}</Button>
          {o.status === "cancelled"
            ? <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" onClick={() => void run(() => setPerfumeOrderStatus(id, "open"), `${o.number} reopened`)} data-testid="perfume-order-reopen">{tr("perfume.orders.reopen", "Reopen")}</Button>
            : <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" disabled={o.status === "shipped"} onClick={() => void run(() => setPerfumeOrderStatus(id, "cancelled"), `${o.number} cancelled`)} data-testid="perfume-order-cancel">{tr("perfume.orders.cancel", "Cancel order")}</Button>}
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" data-testid="perfume-order-archive"
            onClick={() => void archivePerfumeOrder(id).then(() => { onChanged(); onClose(); }).catch((e) => pushToast(userFacingApiError(e, "Not taken off"), "error"))}>
            {tr("perfume.orders.archive", "Take off")}
          </Button>
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" onClick={onClose}>{tr("perfume.orders.close", "Close")}</Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <label>{tr("perfume.orders.ship_by", "Ship by")} <DatePicker aria-label={tr("perfume.orders.ship_by", "Ship by")} value={o.ship_by ?? ""} onChange={(v) => void patch({ ship_by: v || null })} /></label>
        <select className={ctl} aria-label={tr("perfume.orders.currency", "Currency")} value={o.currency} onChange={(e) => void patch({ currency: e.target.value as "USD" | "MXN" })}>
          <option value="USD">{"USD"}</option><option value="MXN">{"MXN"}</option>
        </select>
      </div>
      {locked ? null : <ItemFinder testId="perfume-order-find-item" onPick={(itemId, qty) => void run(() => addPerfumeOrderLine(id, { item_id: itemId, qty }), undefined, "Not added")} />}
      <ParityTable<PerfumeOrderLine>
        title={tr("perfume.orders.lines", "Lines")}
        rows={o.lines}
        rowKey={(l) => `${l.id}-${l.qty}-${l.qty_shipped}-${l.unit_price_cents}`}
        storageKey="perfume-order-lines-v1"
        exportFilename="TIO sales order lines"
        exportExcel
        emptyText="No lines yet — add an item above."
        columns={[
          { key: "line_no", label: "#", cellClass: "tabular-nums", render: (l) => l.line_no },
          { key: "description", label: "Item", render: (l) => <>{l.description}{l.upc ? <span className="ml-1 text-[#64748B]">{l.upc}</span> : null}</>, exportValue: (l) => `${l.description}${l.upc ? ` ${l.upc}` : ""}` },
          { key: "qty", label: "Qty", render: (l) => <NumberCell value={l.qty} min={1} label={tr("perfume.orders.qty", "Qty")} testId={`perfume-order-qty-${l.line_no}`} onSave={(n) => updatePerfumeOrderLine(l.id, { qty: n }).then(refresh)} />, exportValue: (l) => l.qty },
          { key: "qty_shipped", label: "Shipped", render: (l) => <NumberCell value={l.qty_shipped} label={tr("perfume.orders.shipped", "Shipped")} testId={`perfume-order-shipped-${l.line_no}`} onSave={(n) => updatePerfumeOrderLine(l.id, { qty_shipped: n }).then(refresh)} />, exportValue: (l) => l.qty_shipped },
          { key: "unit_price_cents", label: "Unit price", render: (l) => <NumberCell value={l.unit_price_cents} money label={tr("perfume.orders.price", "Unit price")} testId={`perfume-order-price-${l.line_no}`} onSave={(n) => updatePerfumeOrderLine(l.id, { unit_price_cents: n }).then(refresh)} />, exportValue: (l) => l.unit_price_cents / 100 },
          { key: "total", label: "Total", cellClass: "text-right tabular-nums", render: (l) => money(l.qty * l.unit_price_cents, o.currency), exportValue: (l) => (l.qty * l.unit_price_cents) / 100 },
          { key: "cost_cents", label: "Best cost when added", cellClass: "text-right tabular-nums", render: (l) => (l.cost_cents == null ? DASH : `${money(l.cost_cents)}${l.cost_vendor ? ` · ${l.cost_vendor}` : ""}`) },
          { key: "off", label: "", render: (l) => (
            <Button type="button" variant="secondary" className="h-[28px] px-2 text-xs" disabled={l.qty_shipped > 0}
              onClick={(e) => { e.stopPropagation(); void run(() => removePerfumeOrderLine(l.id), undefined, "Not taken off"); }}>
              {tr("perfume.orders.take_off", "Take off")}
            </Button>) },
        ]}
      />
      <div className="flex justify-end gap-4 border-t border-[#14314F] pt-1 text-xs font-semibold" data-testid="perfume-order-lines-total">
        <span>{`${o.lines.length} line${o.lines.length === 1 ? "" : "s"} · ${o.lines.reduce((t, l) => t + l.qty, 0).toLocaleString("en-US")} units · ${o.lines.reduce((t, l) => t + l.qty_shipped, 0).toLocaleString("en-US")} shipped`}</span>
        <span data-testid="perfume-order-total">{money(total, o.currency)}</span>
      </div>
      {skipped.length ? (
        <div className="rounded-sm border border-[#E8C48A] bg-[#FFF8EB] p-2 text-xs" data-testid="perfume-order-skipped">
          {tr("perfume.orders.skipped", "Not bought — pick these by hand on a purchase order:")} {skipped.map((s) => `#${s.line_no} ${s.description} (${s.reason})`).join("; ")}
        </div>
      ) : null}
      <ParityTable<PerfumePoRow>
        title={tr("perfume.orders.pos", "Purchase orders for this sales order")}
        rows={pos.data?.purchase_orders ?? []}
        rowKey={(p) => p.id}
        loading={pos.isLoading}
        storageKey="perfume-order-pos-v1"
        exportFilename="TIO sales order POs"
        exportExcel
        emptyText="None yet — press Buy."
        columns={[
          { key: "number", label: "PO", render: (p) => <DocLink tab="purchases" id={p.id} testId={`perfume-order-po-${p.number}`}>{p.number}</DocLink>, exportValue: (p) => p.number },
          { key: "vendor_name", label: "Vendor", render: (p) => p.vendor_name },
          { key: "status", label: "Status", render: (p) => <Badge text={PO_STATUS_TEXT[p.status]} color={PO_STATUS_CLASS[p.status]} />, exportValue: (p) => PO_STATUS_TEXT[p.status] },
          { key: "units", label: "Units", kind: "number", cellClass: "text-right tabular-nums", render: (p) => p.units.toLocaleString("en-US") },
          { key: "units_received", label: "Received", kind: "number", cellClass: "text-right tabular-nums", render: (p) => p.units_received.toLocaleString("en-US") },
          { key: "total_cents", label: "Cost", kind: "number", cellClass: "text-right tabular-nums", render: (p) => money(p.total_cents, p.currency), exportValue: (p) => Number(p.total_cents) / 100 },
        ]}
      />
      <div className="flex flex-wrap gap-2">
        <label className="flex-1 text-xs">{tr("perfume.orders.ship_to", "Ship to")}
          <textarea className="block min-h-[56px] w-full rounded-sm border border-[#C6D1DC] p-2 text-xs" defaultValue={o.ship_to ?? ""} onBlur={(e) => { if (e.target.value !== (o.ship_to ?? "")) void patch({ ship_to: e.target.value || null }); }} />
        </label>
        <label className="flex-1 text-xs">{tr("perfume.orders.terms", "Terms")}
          <textarea className="block min-h-[56px] w-full rounded-sm border border-[#C6D1DC] p-2 text-xs" defaultValue={o.terms ?? ""} onBlur={(e) => { if (e.target.value !== (o.terms ?? "")) void patch({ terms: e.target.value || null }); }} />
        </label>
        <label className="flex-1 text-xs">{tr("perfume.orders.notes", "Notes")}
          <textarea className="block min-h-[56px] w-full rounded-sm border border-[#C6D1DC] p-2 text-xs" defaultValue={o.notes ?? ""} onBlur={(e) => { if (e.target.value !== (o.notes ?? "")) void patch({ notes: e.target.value || null }); }} />
        </label>
      </div>
      <HistoryTable events={o.events} storageKey="perfume-order-history-v1" exportFilename="TIO sales order history" />
    </section>
  );
}
