/**
 * PERFUME-INVENTORY — the ScentsX stock screens (owner 2026-11-26 20:21 CT: "multiple inventories warehouses retail locations";
 * 20:28 CT: the sites are the ones in his inventory file; FIFO for the books and the average cost he uses for lists, both;
 * adjustments over $500 need a second person). Stock is never typed: every number here is the sum of the stock ledger.
 * Views: Stock on hand · Stock moves · Transfers · Counts · Write-offs · Valuation · Sites (with opening stock from the inventory file).
 */
import { openPrintableDocument } from "../../lib/openPrintableDocument";
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
  addPerfumeTransferLine, applyPerfumeOpening, cancelPerfumeCount, createPerfumeCount, createPerfumeTransfer, downloadPerfumeFile, getPerfumeCount, getPerfumeOpening,
  getPerfumeTransfer, listPerfumeCounts, listPerfumeMoves, listPerfumeSites, listPerfumeStock, listPerfumeTransfers, perfumeStockExportPath, perfumeTransferAction,
  postPerfumeCount, removePerfumeTransferLine, setPerfumeCountLine, setPerfumeReorder, submitPerfumeCount, updatePerfumeSite,
  type PerfumeCountLine, type PerfumeCountRow, type PerfumeMove, type PerfumeSite, type PerfumeStockRow, type PerfumeTransferRow,
  addPerfumeWriteoffLine, createPerfumeWriteoff, getPerfumeValuation, getPerfumeWriteoff, listPerfumeWriteoffs, perfumeValuationExportPath, perfumeWriteoffAction,
  removePerfumeWriteoffLine, type PerfumeValuationRow, type PerfumeWriteoffReason, type PerfumeWriteoffRow,
} from "../../api/perfume";
import { tr } from "./perfumeI18n";
import { FamilySelect } from "./PerfumeFamiliesPanel";
import { useItemCatalogs } from "./PerfumeItemFilePanel";
import { Badge, ctl, DASH, DocLink, ItemFinder, money, NumberCell, SitePicker, useOpenDoc, usDate } from "./perfumeDocParts";

const KIND_TEXT: Record<string, string> = { opening: "Opening stock", receipt: "Received", shipment: "Shipped", transfer_out: "Transfer out", transfer_in: "Transfer in",
  adjustment: "Adjustment", count: "Count", return: "Return", write_down: "Written off" };
const SITE_KIND: Record<string, string> = { warehouse: "Warehouse", store: "Retail store", transit: "In transit", consignment: "Consignment", quarantine: "Quarantine (not sold)" };
const fail = (push: (m: string, k: "error") => void) => (e: unknown) => push(userFacingApiError(e, "Not saved"), "error");

/* ------------------------------------------------------------------ Stock on hand */

export function PerfumeStockPanel() {
  const { pushToast } = useToast();
  const [site, setSite] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [low, setLow] = useState(false);
  const stock = useQuery({ queryKey: ["perfume", "inventory", "stock", site, q, low], queryFn: () => listPerfumeStock({ location: site ?? undefined, q: q.trim() || undefined, low }) });
  const rows = useMemo(() => stock.data?.stock ?? [], [stock.data]);
  const units = rows.reduce((t, r) => t + r.qty, 0);
  const fifo = rows.reduce((t, r) => t + Number(r.fifo_value_cents), 0);
  const avgValue = rows.reduce((t, r) => t + r.qty * Number(r.avg_cost_cents), 0);
  if (stock.isError) return <ListErrorState title={tr("perfume.inv.stockError", "Couldn't load the stock")} status={0} message={(stock.error as Error)?.message} onRetry={() => void stock.refetch()} />;
  return (
    <div className="space-y-3" data-testid="perfume-stock-panel">
      <div className="grid grid-cols-2 gap-[10px] md:grid-cols-5" data-testid="perfume-stock-kpis">
        <KpiCard label={tr("perfume.inv.kpi_lines", "Item × site lines")} number={rows.length.toLocaleString("en-US")} onClick={() => setLow(false)} />
        <KpiCard label={tr("perfume.inv.kpi_units", "Units on hand")} number={units.toLocaleString("en-US")} onClick={() => setLow(false)} />
        <KpiCard label={tr("perfume.inv.kpi_fifo", "Value at FIFO cost")} number={money(fifo)} onClick={() => setLow(false)} />
        <KpiCard label={tr("perfume.inv.kpi_avg", "Value at average cost")} number={money(avgValue)} onClick={() => setLow(false)} />
        <KpiCard label={tr("perfume.inv.kpi_low", "Below reorder point")} number={rows.filter((r) => r.min_qty != null && r.qty < r.min_qty).length.toLocaleString("en-US")} onClick={() => setLow(true)} />
      </div>
      <section className="space-y-2 rounded-[3px] border border-[#D8E0E8] bg-white p-3" aria-label={tr("perfume.inv.stock", "Stock on hand")}>
        <div className="flex flex-wrap items-center gap-2">
          <SitePicker value={site} onChange={setSite} label={tr("perfume.inv.site", "Site")} testId="perfume-stock-site" />
          <input type="search" className={`${ctl} min-w-[220px] flex-1`} aria-label={tr("perfume.inv.search", "Search items")} placeholder={tr("perfume.inv.search_ph", "Search item name or my code")}
            value={q} onChange={(e) => setQ(e.target.value)} data-testid="perfume-stock-search" />
          <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={low} onChange={(e) => setLow(e.target.checked)} data-testid="perfume-stock-low" />{tr("perfume.inv.low", "Only below reorder point")}</label>
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" data-testid="perfume-stock-export"
            onClick={() => void downloadPerfumeFile(perfumeStockExportPath({ location: site ?? undefined, q: q.trim() || undefined, low }), "Stock on hand.xlsx").catch(fail(pushToast))}>
            {tr("perfume.inv.export", "Export (Excel)")}
          </Button>
        </div>
        <ParityTable<PerfumeStockRow> selectable
          rows={rows} rowKey={(r) => `${r.item_id}-${r.location_code}`} loading={stock.isLoading} storageKey="perfume-stock-v1" exportFilename="TIO stock on hand" exportExcel
          emptyText={site || q || low ? "Nothing matches these filters." : "No stock yet — receive a purchase order, or bring in opening stock on the Sites tab."}
          columns={[
            { key: "display_name", label: "Item", sortable: true, render: (r) => <DocLink tab="items" id={r.item_id}>{r.display_name}</DocLink>, exportValue: (r) => r.display_name },
            { key: "internal_code", label: "My code", sortable: true, render: (r) => r.internal_code ?? DASH, exportValue: (r) => r.internal_code ?? "" },
            { key: "location_code", label: "Site", sortable: true, render: (r) => `${r.location_code} · ${r.location_name}` },
            { key: "qty", label: "On hand", sortable: true, kind: "number", cellClass: "text-right tabular-nums", render: (r) => r.qty.toLocaleString("en-US") },
            { key: "avg_cost_cents", label: "Average cost", sortable: true, kind: "number", cellClass: "text-right tabular-nums", render: (r) => money(r.avg_cost_cents), exportValue: (r) => Number(r.avg_cost_cents) / 100 },
            { key: "fifo_value_cents", label: "FIFO value", sortable: true, kind: "number", cellClass: "text-right tabular-nums", render: (r) => money(r.fifo_value_cents), exportValue: (r) => Number(r.fifo_value_cents) / 100 },
            { key: "oldest_lot", label: "Oldest lot", sortable: true, cellClass: "text-right tabular-nums", render: (r) => usDate(r.oldest_lot) },
            { key: "min_qty", label: "Reorder at", render: (r) => <NumberCell value={r.min_qty ?? 0} label={tr("perfume.inv.min", "Reorder at")} testId={`perfume-stock-min-${r.item_id}-${r.location_code}`}
              onSave={(n) => setPerfumeReorder({ item_id: r.item_id, location_code: r.location_code, min_qty: n || null, max_qty: r.max_qty }).then(() => stock.refetch())} />, exportValue: (r) => r.min_qty ?? "" },
          ]}
        />
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ Stock moves (the ledger) */

export function PerfumeMovesPanel() {
  const [site, setSite] = useState<string | null>(null);
  const [kind, setKind] = useState("");
  const moves = useQuery({ queryKey: ["perfume", "inventory", "moves", site, kind], queryFn: () => listPerfumeMoves({ location: site ?? undefined, kind: kind || undefined, limit: 2000 }) });
  if (moves.isError) return <ListErrorState title={tr("perfume.inv.movesError", "Couldn't load the stock moves")} status={0} message={(moves.error as Error)?.message} onRetry={() => void moves.refetch()} />;
  const docOf = (m: PerfumeMove) => m.po_number && m.purchase_order_id ? <DocLink tab="purchases" id={m.purchase_order_id}>{m.po_number}</DocLink>
    : m.so_number && m.sales_order_id ? <DocLink tab="orders" id={m.sales_order_id}>{m.so_number}</DocLink>
    : m.transfer_number && m.transfer_id ? <DocLink tab="transfers" id={m.transfer_id}>{m.transfer_number}</DocLink>
    : m.count_number && m.count_id ? <DocLink tab="counts" id={m.count_id}>{m.count_number}</DocLink>
    : m.writeoff_number && m.writeoff_id ? <DocLink tab="writeoffs" id={m.writeoff_id}>{m.writeoff_number}</DocLink> : <>{m.reason ?? DASH}</>;
  return (
    <section className="space-y-2 rounded-[3px] border border-[#D8E0E8] bg-white p-3" data-testid="perfume-moves-panel" aria-label={tr("perfume.inv.moves", "Stock moves")}>
      <div className="flex flex-wrap items-center gap-2">
        <SitePicker value={site} onChange={setSite} label={tr("perfume.inv.site", "Site")} testId="perfume-moves-site" />
        <select className={ctl} aria-label={tr("perfume.inv.kind", "Kind")} value={kind} onChange={(e) => setKind(e.target.value)} data-testid="perfume-moves-kind">
          <option value="">{tr("perfume.inv.any_kind", "Any kind")}</option>
          {Object.entries(KIND_TEXT).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
        </select>
        <span className="text-xs text-[#64748B]">{tr("perfume.inv.moves_note", "Written once, never changed. A mistake is undone by a new move.")}</span>
      </div>
      <ParityTable<PerfumeMove> selectable
        rows={moves.data?.moves ?? []} rowKey={(m) => m.id} loading={moves.isLoading} storageKey="perfume-moves-v1" exportFilename="TIO stock moves" exportExcel emptyText="No stock has moved yet."
        columns={[
          { key: "moved_at", label: "When", sortable: true, render: (m) => new Date(m.moved_at).toLocaleString("en-US") },
          { key: "kind", label: "What", sortable: true, render: (m) => KIND_TEXT[m.kind] ?? m.kind, exportValue: (m) => KIND_TEXT[m.kind] ?? m.kind },
          { key: "display_name", label: "Item", sortable: true, render: (m) => <DocLink tab="items" id={m.item_id}>{m.display_name}</DocLink>, exportValue: (m) => m.display_name },
          { key: "location_code", label: "Site", sortable: true, render: (m) => m.location_code },
          { key: "qty", label: "Qty", sortable: true, kind: "number", cellClass: "text-right tabular-nums", render: (m) => (m.qty > 0 ? `+${m.qty}` : String(m.qty)), exportValue: (m) => m.qty },
          { key: "unit_cost_cents", label: "Lot cost", kind: "number", cellClass: "text-right tabular-nums", render: (m) => money(m.unit_cost_cents), exportValue: (m) => Number(m.unit_cost_cents) / 100 },
          { key: "lot_code", label: "Lot", render: (m) => m.lot_code ?? DASH, exportValue: (m) => m.lot_code ?? "" },
          { key: "qty_after", label: "On hand after", kind: "number", cellClass: "text-right tabular-nums", render: (m) => m.qty_after.toLocaleString("en-US") },
          { key: "avg_cost_after_cents", label: "Average after", kind: "number", cellClass: "text-right tabular-nums", render: (m) => money(m.avg_cost_after_cents), exportValue: (m) => Number(m.avg_cost_after_cents) / 100 },
          { key: "doc", label: "Document", render: docOf, exportValue: (m) => m.po_number ?? m.so_number ?? m.transfer_number ?? m.count_number ?? m.reason ?? "" },
          { key: "by_email", label: "By", render: (m) => m.by_email ?? DASH },
        ]}
      />
    </section>
  );
}

/* ------------------------------------------------------------------ Transfers */

const TR_TEXT = { draft: "Draft", shipped: "On the road", received: "Received", cancelled: "Cancelled" } as const;
const TR_CLASS = { draft: "bg-[#64748B]", shipped: "bg-[#14314F]", received: "bg-[#1F6B32]", cancelled: "bg-[#9B2C2C]" } as const;

export function PerfumeTransfersPanel() {
  const { pushToast } = useToast();
  const { openId } = useOpenDoc();
  const list = useQuery({ queryKey: ["perfume", "inventory", "transfers"], queryFn: listPerfumeTransfers });
  const [selected, setSelected] = useState<string | null>(openId);
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  useEffect(() => { if (openId) setSelected(openId); }, [openId]);
  if (list.isError) return <ListErrorState title={tr("perfume.inv.trError", "Couldn't load the transfers")} status={0} message={(list.error as Error)?.message} onRetry={() => void list.refetch()} />;
  const create = () => {
    if (!from || !to) { pushToast("Pick both sites", "error"); return; }
    void createPerfumeTransfer({ from_code: from, to_code: to }).then((r) => { pushToast(`Transfer ${r.number} started`, "success"); setSelected(r.id); void list.refetch(); }).catch(fail(pushToast));
  };
  return (
    <div className="space-y-3" data-testid="perfume-transfers-panel">
      <section className="space-y-2 rounded-[3px] border border-[#D8E0E8] bg-white p-3" aria-label={tr("perfume.inv.transfers", "Transfers")}>
        <div className="flex flex-wrap items-end gap-2 text-xs">
          <label>{tr("perfume.inv.from", "From")} <SitePicker value={from} onChange={setFrom} label={tr("perfume.inv.from", "From")} testId="perfume-transfer-from" /></label>
          <label>{tr("perfume.inv.to", "To")} <SitePicker value={to} onChange={setTo} label={tr("perfume.inv.to", "To")} testId="perfume-transfer-to" /></label>
          <Button type="button" className="h-[34px] px-3 text-xs" onClick={create} data-testid="perfume-transfer-new">{tr("perfume.inv.new_transfer", "New transfer")}</Button>
        </div>
        <ParityTable<PerfumeTransferRow> selectable
          rows={list.data?.transfers ?? []} rowKey={(t) => t.id} loading={list.isLoading} storageKey="perfume-transfers-v1" exportFilename="TIO transfers" exportExcel
          emptyText="No transfers yet." onRowClick={(t) => setSelected(t.id)}
          columns={[
            { key: "number", label: "Transfer", sortable: true, render: (t) => <span className="font-semibold">{t.number}</span> },
            { key: "from_code", label: "From", sortable: true, render: (t) => t.from_code },
            { key: "to_code", label: "To", sortable: true, render: (t) => t.to_code },
            { key: "status", label: "Status", sortable: true, render: (t) => <Badge text={TR_TEXT[t.status]} color={TR_CLASS[t.status]} />, exportValue: (t) => TR_TEXT[t.status] },
            { key: "units", label: "Units", kind: "number", cellClass: "text-right tabular-nums", render: (t) => t.units.toLocaleString("en-US") },
            { key: "created_at", label: "Started", sortable: true, render: (t) => new Date(t.created_at).toLocaleDateString("en-US") },
          ]}
        />
      </section>
      {selected ? <TransferEditor id={selected} onChanged={() => void list.refetch()} onClose={() => setSelected(null)} /> : null}
    </div>
  );
}

function TransferEditor({ id, onChanged, onClose }: { id: string; onChanged: () => void; onClose: () => void }) {
  const { pushToast } = useToast();
  const t = useQuery({ queryKey: ["perfume", "inventory", "transfer", id], queryFn: () => getPerfumeTransfer(id) });
  if (t.isError) return <ListErrorState title={tr("perfume.inv.trOneError", "Couldn't load the transfer")} status={0} message={(t.error as Error)?.message} onRetry={() => void t.refetch()} />;
  if (!t.data) return null;
  const x = t.data;
  const run = (f: () => Promise<unknown>, ok?: string) => void f().then(async () => { await t.refetch(); onChanged(); if (ok) pushToast(ok, "success"); }).catch(fail(pushToast));
  return (
    <section className="space-y-2 rounded-[3px] border border-[#D8E0E8] bg-white p-3" data-testid="perfume-transfer-editor" aria-label={x.number}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-card-title">{x.number} · {x.from_code} → {x.to_code} <Badge text={TR_TEXT[x.status]} color={TR_CLASS[x.status]} /></div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" className="h-[34px] px-3 text-xs" disabled={x.status !== "draft" || !x.lines.length} onClick={() => run(() => perfumeTransferAction(id, "ship"), `${x.number} left ${x.from_code}`)} data-testid="perfume-transfer-ship">{tr("perfume.inv.ship", "Ship")}</Button>
          <Button type="button" className="h-[34px] px-3 text-xs" disabled={x.status !== "shipped"} onClick={() => run(() => perfumeTransferAction(id, "receive"), `${x.number} received at ${x.to_code}`)} data-testid="perfume-transfer-receive">{tr("perfume.inv.receive", "Receive")}</Button>
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" disabled={x.status !== "draft"} onClick={() => run(() => perfumeTransferAction(id, "cancel"))} data-testid="perfume-transfer-cancel">{tr("perfume.inv.cancel", "Cancel")}</Button>
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" onClick={onClose}>{tr("perfume.inv.close", "Close")}</Button>
        </div>
      </div>
      {x.status === "draft" ? <ItemFinder testId="perfume-transfer-find" onPick={(itemId, qty) => run(() => addPerfumeTransferLine(id, { item_id: itemId, qty }))} /> : null}
      <ParityTable<typeof x.lines[number]> selectable
        cardTitle title={tr("perfume.inv.lines", "Lines")} rows={x.lines} rowKey={(l) => l.id} storageKey="perfume-transfer-lines-v1" exportFilename="TIO transfer lines" exportExcel emptyText="No lines yet — add an item above."
        columns={[
          { key: "display_name", label: "Item", render: (l) => l.display_name },
          { key: "qty", label: "Qty", kind: "number", cellClass: "text-right tabular-nums", render: (l) => l.qty.toLocaleString("en-US") },
          { key: "on_hand_from", label: `On hand at ${x.from_code}`, kind: "number", cellClass: "text-right tabular-nums", render: (l) => l.on_hand_from.toLocaleString("en-US") },
          { key: "off", label: "", render: (l) => (x.status === "draft"
            ? <Button type="button" variant="secondary" className="h-[28px] px-2 text-xs" onClick={(e) => { e.stopPropagation(); run(() => removePerfumeTransferLine(l.id)); }}>{tr("perfume.inv.take_off", "Take off")}</Button> : null) },
        ]}
      />
    </section>
  );
}

/* ------------------------------------------------------------------ Counts (every adjustment is a count) */

const CC_TEXT = { draft: "Counting", submitted: "Waiting to post", posted: "Posted", cancelled: "Cancelled" } as const;
const CC_CLASS = { draft: "bg-[#64748B]", submitted: "bg-[#8A4208]", posted: "bg-[#1F6B32]", cancelled: "bg-[#9B2C2C]" } as const;

/**
 * Physical count cycle (CONTROL Physical Inventory Process, owner 2026-11-27 13:50 CT; migration 202617110100):
 * 1 pick the site and the items for the sheet (all, or by category / brand / product type / family; with or without 0 on hand) →
 * 2 print the BLIND count sheet (by bin; no expected quantity) → 3 type what is on the shelf (each line keeps the on-hand at the moment
 * it is counted) → 4 the variance report (counted − on hand when counted, gains / losses / net) → 5 submit and post (over $500 a second
 * person posts). Lines never counted move nothing.
 */
export function PerfumeCountsPanel() {
  const { pushToast } = useToast();
  const { openId } = useOpenDoc();
  const list = useQuery({ queryKey: ["perfume", "inventory", "counts"], queryFn: listPerfumeCounts });
  const cats = useItemCatalogs();
  const [site, setSite] = useState<string | null>(null);
  const [sel, setSel] = useState<{ category: string; brand: string; product_type: string; family_id: string; include_zero: boolean }>({ category: "", brand: "", product_type: "", family_id: "", include_zero: false });
  const [selected, setSelected] = useState<string | null>(openId);
  useEffect(() => { if (openId) setSelected(openId); }, [openId]);
  if (list.isError) return <ListErrorState title={tr("perfume.inv.ccError", "Couldn't load the counts")} status={0} message={(list.error as Error)?.message} onRetry={() => void list.refetch()} />;
  const start = (mode: "sheet" | "spot") => {
    if (!site) { pushToast("Pick the site", "error"); return; }
    const filtered = Boolean(sel.category || sel.brand || sel.product_type || sel.family_id);
    const body = mode === "spot" ? { location_code: site } : { location_code: site, all_items: !filtered, category: sel.category || null, brand: sel.brand.trim() || null,
      product_type: sel.product_type || null, family_id: sel.family_id || null, include_zero: sel.include_zero };
    void createPerfumeCount(body).then((r) => { pushToast(`Count ${r.number} started`, "success"); setSelected(r.id); void list.refetch(); }).catch(fail(pushToast));
  };
  return (
    <div className="space-y-3" data-testid="perfume-counts-panel">
      <section className="space-y-2 rounded-[3px] border border-[#D8E0E8] bg-white p-3" aria-label={tr("perfume.inv.counts", "Counts")}>
        <div className="text-card-title">{tr("perfume.inv.count_new", "New count sheet")}</div>
        <div className="flex flex-wrap items-end gap-2 text-xs">
          <label>{tr("perfume.inv.site", "Site")} <SitePicker value={site} onChange={setSite} label={tr("perfume.inv.site", "Site")} testId="perfume-count-site" /></label>
          <label>{tr("perfume.itemfile.category", "Category")}
            <select className={`${ctl} block`} value={sel.category} onChange={(e) => setSel({ ...sel, category: e.target.value })} data-testid="perfume-count-category">
              <option value="">{tr("perfume.inv.any", "All")}</option>{cats.categories.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>
          <label>{tr("perfume.itemfile.product_type", "Product type")}
            <select className={`${ctl} block`} value={sel.product_type} onChange={(e) => setSel({ ...sel, product_type: e.target.value })} data-testid="perfume-count-type">
              <option value="">{tr("perfume.inv.any", "All")}</option>{cats.types.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>
          <label>{tr("perfume.itemfile.brand", "Brand")} <input className={`${ctl} block w-[160px]`} aria-label={tr("perfume.itemfile.brand", "Brand")} value={sel.brand} onChange={(e) => setSel({ ...sel, brand: e.target.value })} data-testid="perfume-count-brand" /></label>
          <label>{tr("perfume.itemfile.family", "Family")} <FamilySelect value={sel.family_id} onChange={(x) => setSel({ ...sel, family_id: x })} testId="perfume-count-family" /></label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={sel.include_zero} onChange={(e) => setSel({ ...sel, include_zero: e.target.checked })} data-testid="perfume-count-zero" />{tr("perfume.inv.zero", "Include items at 0 on hand")}</label>
          <Button type="button" className="h-[34px] px-3 text-xs" onClick={() => start("sheet")} data-testid="perfume-count-full">{tr("perfume.inv.start_sheet", "Start count sheet")}</Button>
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" onClick={() => start("spot")} data-testid="perfume-count-spot">{tr("perfume.inv.spot_count", "Count or adjust a few items")}</Button>
        </div>
        <div className="text-xs text-[#64748B]">{tr("perfume.inv.count_rule2", "The sheet is blind (no expected quantity). Each line keeps the on-hand at the moment it is counted, so sales during the count are never counted twice. Lines left blank move nothing. A difference worth more than $500 is posted by a second person.")}</div>
        <ParityTable<PerfumeCountRow> selectable
          rows={list.data?.counts ?? []} rowKey={(k) => k.id} loading={list.isLoading} storageKey="perfume-counts-v1" exportFilename="TIO counts" exportExcel emptyText="No counts yet." onRowClick={(k) => setSelected(k.id)}
          columns={[
            { key: "number", label: "Count", sortable: true, render: (k) => <span className="font-semibold">{k.number}</span> },
            { key: "created_at", label: "Started", sortable: true, cellClass: "text-right tabular-nums", render: (k) => usDate(k.created_at), exportValue: (k) => k.created_at },
            { key: "location_code", label: "Site", sortable: true, render: (k) => k.location_code },
            { key: "status", label: "Status", sortable: true, render: (k) => <Badge text={CC_TEXT[k.status]} color={CC_CLASS[k.status]} />, exportValue: (k) => CC_TEXT[k.status] },
            { key: "lines", label: "Lines", kind: "number", cellClass: "text-right tabular-nums", render: (k) => k.lines.toLocaleString("en-US") },
            { key: "diff_value_cents", label: "Variance", kind: "number", cellClass: "text-right tabular-nums", render: (k) => money(k.diff_value_cents), exportValue: (k) => (k.diff_value_cents == null ? "" : k.diff_value_cents / 100) },
            { key: "submitted_by_email", label: "Submitted by", render: (k) => k.submitted_by_email ?? DASH },
            { key: "approved_by_email", label: "Posted by", render: (k) => k.approved_by_email ?? DASH },
          ]}
        />
      </section>
      {selected ? <CountEditor id={selected} onChanged={() => void list.refetch()} onClose={() => setSelected(null)} /> : null}
    </div>
  );
}

/** The shelf count of one line: blank until counted (blank is "not counted", never 0); saved when the box is left. */
function CountCell({ value, label, testId, onSave }: { value: number | null; label: string; testId: string; onSave: (n: number) => Promise<unknown> }) {
  const { pushToast } = useToast();
  const [v, setV] = useState(value == null ? "" : String(value));
  useEffect(() => setV(value == null ? "" : String(value)), [value]);
  const save = () => {
    if (v.trim() === "") { setV(value == null ? "" : String(value)); return; }
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0) { pushToast("Type a whole number, 0 or more", "error"); setV(value == null ? "" : String(value)); return; }
    if (n === value) return;
    void onSave(n).catch((e) => { pushToast(userFacingApiError(e, "Not saved"), "error"); setV(value == null ? "" : String(value)); });
  };
  return <input className={`${ctl} w-[80px] text-right`} inputMode="numeric" aria-label={label} placeholder={tr("perfume.inv.not_counted", "Not counted")} value={v}
    onChange={(e) => setV(e.target.value)} onBlur={save} onClick={(e) => e.stopPropagation()} data-testid={testId} />;
}

function CountEditor({ id, onChanged, onClose }: { id: string; onChanged: () => void; onClose: () => void }) {
  const { pushToast } = useToast();
  const k = useQuery({ queryKey: ["perfume", "inventory", "count", id], queryFn: () => getPerfumeCount(id) });
  if (k.isError) return <ListErrorState title={tr("perfume.inv.ccOneError", "Couldn't load the count")} status={0} message={(k.error as Error)?.message} onRetry={() => void k.refetch()} />;
  if (!k.data) return null;
  const x = k.data;
  const t = x.totals;
  const run = (f: () => Promise<unknown>, ok?: string) => void f().then(async () => { await k.refetch(); onChanged(); if (ok) pushToast(ok, "success"); }).catch(fail(pushToast));
  return (
    <section className="space-y-2 rounded-[3px] border border-[#D8E0E8] bg-white p-3" data-testid="perfume-count-editor" aria-label={x.number}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-card-title">{x.number} · {x.location_code} <Badge text={CC_TEXT[x.status]} color={CC_CLASS[x.status]} />
          {x.needs_second_person ? <span className="ml-2 text-xs">{tr("perfume.inv.second", "a second person posts it")}</span> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" disabled={!x.lines.length} onClick={() => openPrintableDocument(`/api/v1/perfume/inventory/counts/${encodeURIComponent(x.id)}/sheet.html`)} data-testid="perfume-count-print">{tr("perfume.inv.print_sheet", "Print count sheet")}</Button>
          <Button type="button" className="h-[34px] px-3 text-xs" disabled={x.status !== "draft" || !t.counted} onClick={() => run(() => submitPerfumeCount(id), "Submitted")} data-testid="perfume-count-submit">{tr("perfume.inv.submit", "Submit")}</Button>
          <Button type="button" className="h-[34px] px-3 text-xs" disabled={x.status !== "submitted"} onClick={() => run(() => postPerfumeCount(id), "Posted to stock")} data-testid="perfume-count-post">{tr("perfume.inv.post", "Post to stock")}</Button>
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" disabled={x.status === "posted" || x.status === "cancelled"} onClick={() => run(() => cancelPerfumeCount(id))} data-testid="perfume-count-cancel">{tr("perfume.inv.cancel", "Cancel")}</Button>
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" onClick={onClose}>{tr("perfume.inv.close", "Close")}</Button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-[10px] md:grid-cols-5" data-testid="perfume-count-totals">
        <KpiCard label={tr("perfume.inv.k_lines", "Lines on the sheet")} number={t.lines.toLocaleString("en-US")} disabled />
        <KpiCard label={tr("perfume.inv.k_counted", "Counted")} number={`${t.counted.toLocaleString("en-US")} · ${t.not_counted.toLocaleString("en-US")} ${tr("perfume.inv.k_left", "left")}`} disabled />
        <KpiCard label={tr("perfume.inv.k_gain", "Gains")} number={money(t.gain_cents)} disabled />
        <KpiCard label={tr("perfume.inv.k_loss", "Losses")} number={money(t.loss_cents)} accent={t.loss_cents < 0 ? "#B91C1C" : undefined} disabled />
        <KpiCard label={tr("perfume.inv.k_net", "Net variance")} number={money(t.net_cents)} disabled />
      </div>
      {x.status === "draft" ? <ItemFinder testId="perfume-count-find" onPick={(itemId, qty) => run(() => setPerfumeCountLine(id, { item_id: itemId, counted_qty: qty }))} /> : null}
      <ParityTable<PerfumeCountLine> selectable
        cardTitle title={tr("perfume.inv.variance", "Count entry and variance report")} rows={x.lines} rowKey={(l) => `${l.id}-${l.counted_qty ?? "x"}`} storageKey="perfume-count-lines-v2"
        exportFilename={`TIO ${x.number} variance`} exportExcel emptyText="No lines yet — add an item above."
        columns={[
          { key: "bin", label: "Bin", sortable: true, render: (l) => l.bin ?? DASH, exportValue: (l) => l.bin ?? "" },
          { key: "tio_code", label: "TIO code", sortable: true, render: (l) => l.tio_code ?? DASH, exportValue: (l) => l.tio_code ?? "" },
          { key: "display_name", label: "Item", sortable: true, render: (l) => l.display_name },
          { key: "counted_qty", label: "Counted", render: (l) => (x.status === "draft"
            ? <CountCell value={l.counted_qty} label={`${tr("perfume.inv.counted", "Counted")} ${l.display_name}`} testId={`perfume-count-qty-${l.item_id}`}
                onSave={(n) => setPerfumeCountLine(id, { item_id: l.item_id, counted_qty: n }).then(() => k.refetch())} />
            : l.counted_qty == null ? tr("perfume.inv.not_counted", "Not counted") : l.counted_qty.toLocaleString("en-US")), exportValue: (l) => l.counted_qty ?? "" },
          { key: "expected_qty", label: "On hand when counted", kind: "number", cellClass: "text-right tabular-nums", render: (l) => (l.counted_at ? l.expected_qty.toLocaleString("en-US") : DASH), exportValue: (l) => (l.counted_at ? l.expected_qty : "") },
          { key: "variance", label: "Variance", kind: "number", sortable: true, cellClass: "text-right tabular-nums", render: (l) => (l.variance == null ? DASH : l.variance > 0 ? `+${l.variance}` : String(l.variance)), exportValue: (l) => l.variance ?? "" },
          { key: "value", label: "Variance $", kind: "number", cellClass: "text-right tabular-nums", render: (l) => (l.variance == null ? DASH : money(l.variance * l.unit_cost_cents)), exportValue: (l) => (l.variance == null ? "" : (l.variance * l.unit_cost_cents) / 100) },
          { key: "on_hand_now", label: "On hand now", kind: "number", cellClass: "text-right tabular-nums", render: (l) => l.on_hand_now.toLocaleString("en-US") },
          { key: "counted_at", label: "Counted at", cellClass: "text-right tabular-nums", render: (l) => (l.counted_at ? `${usDate(l.counted_at)} ${l.counted_by_email ?? ""}` : DASH), exportValue: (l) => l.counted_at ?? "" },
        ]}
      />
    </section>
  );
}

/* ------------------------------------------------------------------ Write-offs */

const WO_REASON: Record<PerfumeWriteoffReason, string> = { damaged: "Damaged", expired: "Expired", stolen: "Stolen / missing", counterfeit: "Counterfeit", sample: "Used as samples", other: "Other" };
const WO_TEXT = { draft: "Draft", submitted: "Waiting to post", posted: "Posted", cancelled: "Cancelled" } as const;

export function PerfumeWriteoffsPanel() {
  const { pushToast } = useToast();
  const { openId } = useOpenDoc();
  const list = useQuery({ queryKey: ["perfume", "inventory", "writeoffs"], queryFn: listPerfumeWriteoffs });
  const [site, setSite] = useState<string | null>(null);
  const [reason, setReason] = useState<PerfumeWriteoffReason>("damaged");
  const [notes, setNotes] = useState("");
  const [selected, setSelected] = useState<string | null>(openId);
  useEffect(() => { if (openId) setSelected(openId); }, [openId]);
  if (list.isError) return <ListErrorState title={tr("perfume.inv.woError", "Couldn't load the write-offs")} status={0} message={(list.error as Error)?.message} onRetry={() => void list.refetch()} />;
  const start = () => {
    if (!site) { pushToast("Pick the site", "error"); return; }
    void createPerfumeWriteoff({ location_code: site, reason, notes: notes.trim() || null })
      .then((r) => { pushToast(`Write-off ${r.number} started`, "success"); setSelected(r.id); setNotes(""); void list.refetch(); }).catch(fail(pushToast));
  };
  return (
    <div className="space-y-3" data-testid="perfume-writeoffs-panel">
      <section className="space-y-2 rounded-[3px] border border-[#D8E0E8] bg-white p-3" aria-label={tr("perfume.inv.writeoffs", "Write-offs")}>
        <div className="flex flex-wrap items-end gap-2 text-xs">
          <label>{tr("perfume.inv.site", "Site")} <SitePicker value={site} onChange={setSite} label={tr("perfume.inv.site", "Site")} testId="perfume-wo-site" /></label>
          <label>{tr("perfume.inv.wo_reason", "Why")}
            <select className={`${ctl} block`} aria-label={tr("perfume.inv.wo_reason", "Why")} value={reason} onChange={(e) => setReason(e.target.value as PerfumeWriteoffReason)} data-testid="perfume-wo-reason">
              {(Object.keys(WO_REASON) as PerfumeWriteoffReason[]).map((r) => <option key={r} value={r}>{WO_REASON[r]}</option>)}
            </select>
          </label>
          <label>{tr("perfume.inv.wo_notes", "What happened")} <input className={`${ctl} block w-[260px]`} value={notes} onChange={(e) => setNotes(e.target.value)} data-testid="perfume-wo-notes" /></label>
          <Button type="button" className="h-[34px] px-3 text-xs" onClick={start} data-testid="perfume-wo-start">{tr("perfume.inv.wo_start", "Start a write-off")}</Button>
          <span className="text-[#64748B]">{tr("perfume.inv.wo_rule", "Pieces leave at their lot cost (oldest first). Worth more than $500: a second person posts it.")}</span>
        </div>
        <ParityTable<PerfumeWriteoffRow> selectable
          rows={list.data?.writeoffs ?? []} rowKey={(w) => `${w.id}-${w.status}`} loading={list.isLoading} storageKey="perfume-writeoffs-v1" exportFilename="TIO write-offs" exportExcel emptyText="No write-offs." onRowClick={(w) => setSelected(w.id)}
          columns={[
            { key: "number", label: "Write-off", sortable: true, render: (w) => <span className="font-semibold">{w.number}</span> },
            { key: "location_code", label: "Site", sortable: true, render: (w) => w.location_code },
            { key: "reason", label: "Why", sortable: true, render: (w) => WO_REASON[w.reason], exportValue: (w) => WO_REASON[w.reason] },
            { key: "status", label: "Status", sortable: true, render: (w) => <Badge text={WO_TEXT[w.status]} color={CC_CLASS[w.status]} />, exportValue: (w) => WO_TEXT[w.status] },
            { key: "units", label: "Units", kind: "number", cellClass: "text-right tabular-nums", render: (w) => w.units.toLocaleString("en-US") },
            { key: "value_cents", label: "Value", kind: "number", cellClass: "text-right tabular-nums", render: (w) => money(w.value_cents), exportValue: (w) => (w.value_cents == null ? "" : w.value_cents / 100) },
            { key: "submitted_by_email", label: "Submitted by", render: (w) => w.submitted_by_email ?? DASH },
            { key: "approved_by_email", label: "Posted by", render: (w) => w.approved_by_email ?? DASH },
          ]}
        />
      </section>
      {selected ? <WriteoffEditor id={selected} onChanged={() => void list.refetch()} onClose={() => setSelected(null)} /> : null}
    </div>
  );
}

function WriteoffEditor({ id, onChanged, onClose }: { id: string; onChanged: () => void; onClose: () => void }) {
  const { pushToast } = useToast();
  const w = useQuery({ queryKey: ["perfume", "inventory", "writeoff", id], queryFn: () => getPerfumeWriteoff(id) });
  if (w.isError) return <ListErrorState title={tr("perfume.inv.woOneError", "Couldn't load the write-off")} status={0} message={(w.error as Error)?.message} onRetry={() => void w.refetch()} />;
  if (!w.data) return null;
  const x = w.data;
  const run = (f: () => Promise<unknown>, ok?: string) => void f().then(async () => { await w.refetch(); onChanged(); if (ok) pushToast(ok, "success"); }).catch(fail(pushToast));
  return (
    <section className="space-y-2 rounded-[3px] border border-[#D8E0E8] bg-white p-3" data-testid="perfume-wo-editor" aria-label={x.number}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-card-title">{x.number} · {x.location_code} · {WO_REASON[x.reason]} <Badge text={WO_TEXT[x.status]} color={CC_CLASS[x.status]} />
          {x.value_cents != null ? <span className="ml-2 text-xs">{`${tr("perfume.inv.value", "Value")} ${money(x.value_cents)}`}{x.needs_second_person && x.status === "submitted" ? ` · ${tr("perfume.inv.second", "a second person posts it")}` : ""}</span> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" className="h-[34px] px-3 text-xs" disabled={x.status !== "draft" || !x.lines.length} onClick={() => run(() => perfumeWriteoffAction(id, "submit"), "Submitted")} data-testid="perfume-wo-submit">{tr("perfume.inv.submit", "Submit")}</Button>
          <Button type="button" className="h-[34px] px-3 text-xs" disabled={x.status !== "submitted"} onClick={() => run(() => perfumeWriteoffAction(id, "post"), "Taken out of stock")} data-testid="perfume-wo-post">{tr("perfume.inv.post", "Post to stock")}</Button>
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" disabled={x.status === "posted" || x.status === "cancelled"} onClick={() => run(() => perfumeWriteoffAction(id, "cancel"))} data-testid="perfume-wo-cancel">{tr("perfume.inv.cancel", "Cancel")}</Button>
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" onClick={onClose}>{tr("perfume.inv.close", "Close")}</Button>
        </div>
      </div>
      {x.notes ? <div className="text-xs text-[#64748B]">{x.notes}</div> : null}
      {x.status === "draft" ? <ItemFinder testId="perfume-wo-find" onPick={(itemId, qty) => run(() => addPerfumeWriteoffLine(id, { item_id: itemId, qty }))} /> : null}
      <ParityTable<typeof x.lines[number]> selectable
        cardTitle title={tr("perfume.inv.lines", "Lines")} rows={x.lines} rowKey={(l) => l.id} storageKey="perfume-wo-lines-v1" exportFilename="TIO write-off lines" exportExcel emptyText="No pieces yet — add an item above."
        columns={[
          { key: "display_name", label: "Item", render: (l) => <DocLink tab="items" id={l.item_id}>{l.display_name}</DocLink>, exportValue: (l) => l.display_name },
          { key: "qty", label: "Pieces", kind: "number", cellClass: "text-right tabular-nums", render: (l) => l.qty.toLocaleString("en-US") },
          { key: "lot_code", label: "Lot", render: (l) => l.lot_code ?? (l.lot_id ? tr("perfume.inv.named_lot", "named lot") : tr("perfume.inv.oldest", "oldest first")) },
          { key: "on_hand", label: "On hand now", kind: "number", cellClass: "text-right tabular-nums", render: (l) => l.on_hand.toLocaleString("en-US") },
          { key: "off", label: "", render: (l) => (x.status === "draft"
            ? <Button type="button" variant="secondary" className="h-[28px] px-2 text-xs" onClick={() => run(() => removePerfumeWriteoffLine(l.id))} data-testid={`perfume-wo-remove-${l.id}`}>{tr("perfume.inv.remove", "Remove")}</Button> : null) },
        ]}
      />
    </section>
  );
}

/* ------------------------------------------------------------------ Month-end valuation */

export function PerfumeValuationPanel() {
  const { pushToast } = useToast();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  const [asOf, setAsOf] = useState(today);
  const [site, setSite] = useState<string | null>(null);
  const v = useQuery({ queryKey: ["perfume", "inventory", "valuation", asOf, site], queryFn: () => getPerfumeValuation(asOf, site ?? undefined), enabled: !!asOf });
  if (v.isError) return <ListErrorState title={tr("perfume.inv.valError", "Couldn't load the valuation")} status={0} message={(v.error as Error)?.message} onRetry={() => void v.refetch()} />;
  const d = v.data;
  return (
    <div className="space-y-3" data-testid="perfume-valuation-panel">
      <div className="grid grid-cols-2 gap-[10px] md:grid-cols-4" data-testid="perfume-valuation-kpis">
        <KpiCard label={tr("perfume.inv.val_fifo", "Value at FIFO (books)")} number={money(d?.total_fifo_cents ?? 0)} onClick={() => setSite(null)} />
        <KpiCard label={tr("perfume.inv.val_avg", "Value at average cost")} number={money(d?.total_avg_cents ?? 0)} onClick={() => setSite(null)} />
        <KpiCard label={tr("perfume.inv.val_units", "Units")} number={(d?.sites.reduce((t, s) => t + s.units, 0) ?? 0).toLocaleString("en-US")} onClick={() => setSite(null)} />
        <KpiCard label={tr("perfume.inv.val_sites", "Sites holding stock")} number={(d?.sites.length ?? 0).toLocaleString("en-US")} onClick={() => setSite(null)} />
      </div>
      <section className="space-y-2 rounded-[3px] border border-[#D8E0E8] bg-white p-3" aria-label={tr("perfume.inv.valuation", "Valuation")}>
        <div className="flex flex-wrap items-end gap-2 text-xs">
          <label>{tr("perfume.inv.as_of", "At the close of")} <DatePicker aria-label={tr("perfume.inv.as_of", "At the close of")} value={asOf} onChange={setAsOf} /></label>
          <label>{tr("perfume.inv.site", "Site")} <SitePicker value={site} onChange={setSite} label={tr("perfume.inv.site", "Site")} testId="perfume-val-site" /></label>
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" disabled={!asOf} data-testid="perfume-val-xlsx"
            onClick={() => void downloadPerfumeFile(perfumeValuationExportPath(asOf, site ?? undefined), `Stock valuation ${asOf}.xlsx`).catch(fail(pushToast))}>{tr("perfume.inv.val_xlsx", "Excel")}</Button>
          <span className="text-[#64748B]">{tr("perfume.inv.val_help", "From the stock ledger alone: FIFO = what the lots still hold at their cost; average = on hand × the moving average.")}</span>
        </div>
        <ParityTable<PerfumeValuationRow> selectable
          rows={d?.rows ?? []} rowKey={(r) => `${r.location_code}-${r.item_id}`} loading={v.isLoading} storageKey="perfume-valuation-v1" exportFilename={`TIO valuation ${asOf}`} exportExcel emptyText="No stock on hand at that date."
          columns={[
            { key: "location_code", label: "Site", sortable: true, render: (r) => r.location_code },
            { key: "display_name", label: "Item", sortable: true, render: (r) => <DocLink tab="items" id={r.item_id}>{r.display_name}</DocLink>, exportValue: (r) => r.display_name },
            { key: "qty", label: "On hand", sortable: true, kind: "number", cellClass: "text-right tabular-nums", render: (r) => r.qty.toLocaleString("en-US") },
            { key: "fifo_cents", label: "FIFO value", sortable: true, kind: "number", cellClass: "text-right tabular-nums", render: (r) => money(r.fifo_cents), exportValue: (r) => r.fifo_cents / 100 },
            { key: "avg_cents", label: "Average value", sortable: true, kind: "number", cellClass: "text-right tabular-nums", render: (r) => money(r.avg_cents), exportValue: (r) => r.avg_cents / 100 },
          ]}
        />
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ Sites + opening stock */

export function PerfumeSitesPanel() {
  const { pushToast } = useToast();
  const sites = useQuery({ queryKey: ["perfume", "inventory", "sites"], queryFn: listPerfumeSites });
  const opening = useQuery({ queryKey: ["perfume", "inventory", "opening"], queryFn: getPerfumeOpening });
  const [onDate, setOnDate] = useState("");
  if (sites.isError) return <ListErrorState title={tr("perfume.inv.sitesError", "Couldn't load the sites")} status={0} message={(sites.error as Error)?.message} onRetry={() => void sites.refetch()} />;
  const save = (code: string, b: Parameters<typeof updatePerfumeSite>[1]) => void updatePerfumeSite(code, b).then(() => sites.refetch()).catch(fail(pushToast));
  const o = opening.data;
  const apply = () => {
    if (!onDate) { pushToast("Pick the date the stock was counted on", "error"); return; }
    void applyPerfumeOpening(onDate).then((r) => { pushToast(`Opening stock in: ${r.units.toLocaleString("en-US")} units, ${money(r.value_cents)}`, "success"); void sites.refetch(); void opening.refetch(); }).catch(fail(pushToast));
  };
  return (
    <div className="space-y-3" data-testid="perfume-sites-panel">
      <section className="space-y-2 rounded-[3px] border border-[#D8E0E8] bg-white p-3" aria-label={tr("perfume.inv.sites", "Sites")}>
        <ParityTable<PerfumeSite> selectable
          cardTitle title={tr("perfume.inv.sites_title", "My sites — warehouses and stores from my inventory file")}
          rows={sites.data?.sites ?? []} rowKey={(s) => `${s.code}-${s.kind}-${s.own}-${s.active}`} loading={sites.isLoading} storageKey="perfume-sites-v1" exportFilename="TIO sites" exportExcel emptyText="No sites."
          columns={[
            { key: "code", label: "Code", sortable: true, render: (s) => <span className="font-semibold">{s.code}</span> },
            { key: "name", label: "Name", sortable: true, render: (s) => s.name },
            { key: "kind", label: "Kind", render: (s) => (s.kind === "transit" ? SITE_KIND.transit : (
              <select className={ctl} aria-label={tr("perfume.inv.kind", "Kind")} value={s.kind ?? ""} onChange={(e) => save(s.code, { kind: (e.target.value || null) as "warehouse" | "store" | "consignment" | "quarantine" | null })} data-testid={`perfume-site-kind-${s.code}`}>
                <option value="">{tr("perfume.inv.kind_unset", "Not set")}</option>
                <option value="warehouse">{tr("perfume.inv.kind_wh", "Warehouse")}</option>
                <option value="store">{tr("perfume.inv.kind_store", "Retail store")}</option>
                <option value="consignment">{tr("perfume.inv.kind_cons", "Consignment")}</option>
                <option value="quarantine">{tr("perfume.inv.kind_quar", "Quarantine (not sold)")}</option>
              </select>)), exportValue: (s) => SITE_KIND[s.kind ?? ""] ?? "" },
            { key: "units", label: "Units", kind: "number", cellClass: "text-right tabular-nums", render: (s) => Number(s.units).toLocaleString("en-US") },
            { key: "items", label: "Items", kind: "number", cellClass: "text-right tabular-nums", render: (s) => Number(s.items).toLocaleString("en-US") },
            { key: "fifo_value_cents", label: "FIFO value", kind: "number", cellClass: "text-right tabular-nums", render: (s) => money(s.fifo_value_cents), exportValue: (s) => Number(s.fifo_value_cents) / 100 },
            { key: "active", label: "Holds stock", render: (s) => (s.kind === "transit" ? DASH : (
              <input type="checkbox" checked={s.own && s.active} aria-label={tr("perfume.inv.holds", "Holds stock")} onChange={(e) => save(s.code, { own: e.target.checked, active: e.target.checked })} data-testid={`perfume-site-own-${s.code}`} />)),
              exportValue: (s) => (s.own && s.active ? "yes" : "no") },
          ]}
        />
      </section>
      <section className="space-y-2 rounded-[3px] border border-[#D8E0E8] bg-white p-3" data-testid="perfume-opening" aria-label={tr("perfume.inv.opening", "Opening stock")}>
        <div className="text-card-title">{tr("perfume.inv.opening", "Opening stock from my inventory file")}</div>
        {!o ? null : o.already_applied ? <div className="text-xs">{tr("perfume.inv.opening_done", "Opening stock is already in the ledger. Corrections go through a count.")}</div> : (
          <>
            <div className="text-xs">{`${o.lists.join(", ") || tr("perfume.inv.no_file", "No current inventory file")} — ${o.lines.toLocaleString("en-US")} lines, ${o.units.toLocaleString("en-US")} units, ${money(o.value_cents)} at the file's cost. Skipped: ${o.skipped_no_cost.toLocaleString("en-US")} with no cost, ${o.skipped_unknown_site.toLocaleString("en-US")} at a site that does not hold stock.`}</div>
            <ParityTable<PerfumeOpeningSite> selectable rows={o.by_site} rowKey={(r) => r.code} storageKey="perfume-opening-v1" exportFilename="TIO opening stock" exportExcel emptyText="Nothing to bring in."
              columns={[
                { key: "code", label: "Site", render: (r) => r.code },
                { key: "lines", label: "Lines", kind: "number", cellClass: "text-right tabular-nums", render: (r) => r.lines.toLocaleString("en-US") },
                { key: "units", label: "Units", kind: "number", cellClass: "text-right tabular-nums", render: (r) => r.units.toLocaleString("en-US") },
                { key: "value", label: "Value", kind: "number", cellClass: "text-right tabular-nums", render: (r) => money(r.value), exportValue: (r) => r.value / 100 },
              ]} />
            <div className="flex flex-wrap items-end gap-2 text-xs">
              <label>{tr("perfume.inv.counted_on", "Stock counted on")} <DatePicker aria-label={tr("perfume.inv.counted_on", "Stock counted on")} value={onDate} onChange={setOnDate} /></label>
              <Button type="button" className="h-[34px] px-3 text-xs" disabled={!o.lines} onClick={apply} data-testid="perfume-opening-apply">{tr("perfume.inv.apply", "Bring in opening stock")}</Button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
type PerfumeOpeningSite = { code: string; units: number; value: number; lines: number };
