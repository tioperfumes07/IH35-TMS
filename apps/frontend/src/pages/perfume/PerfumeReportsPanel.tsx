/**
 * Inquiry & reports (LEAD ROUND L.20 items 2–6; owner 2026-11-27 13:50 CT "bring what we need from CONTROL into the app, designs and
 * visuals included"). CONTROL's dense one-card inquiry screens and lists with a totals row, in the house style: a KpiCard strip,
 * ParityTable lists, label-above filter boxes at the item editor's widths, never full-width single-field rows.
 *   Items inquiry · Sales inquiry (by item / by customer, drill into an invoice) · Price book · Inventory status · Product families.
 * Read only. Every list has its Excel; the price book also a PDF.
 */
import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "../../components/Button";
import { ParityTable } from "../../components/parity/ParityTable";
import { KpiCard } from "../../components/layout/KpiCard";
import { DatePicker } from "../../components/forms/DatePicker";
import { useToast } from "../../components/Toast";
import { ListErrorState } from "../../components/ListErrorState";
import { userFacingApiError } from "../../lib/api-error-message";
import {
  downloadPerfumeFile, getPerfumeFamilyReport, getPerfumeInventoryStatus, getPerfumeItemInquiry, getPerfumePriceBook, listPerfumePriceLevels, perfumeReportQs,
  searchPerfumeQuoteItems, getPerfumeVendorTiers, type PerfumeVendorTierRow, type PerfumeFamilyReportRow, type PerfumeItemInquiry, type PerfumePriceBookRow, type PerfumeReportFilter, type PerfumeStatusRow,
} from "../../api/perfume";
import { getScentsxInquiryCustomers, getScentsxSalesInvoices, getScentsxSalesLines, scentsxInquiryXlsxPath, type ScentsxInquiryFilter, type ScentsxSaleInvoice, type ScentsxSaleLine } from "../../api/scentsx";
import { tr } from "./perfumeI18n";
import { FamilySelect } from "./PerfumeFamiliesPanel";
import { ctl, DASH, DocLink, money, usDate } from "./perfumeDocParts";

const n = (v: number) => v.toLocaleString("en-US");
const monthStart = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`; };
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });

function useDownload() {
  const { pushToast } = useToast();
  return (path: string, name: string) => void downloadPerfumeFile(path, name).catch((e) => pushToast(userFacingApiError(e, "Download failed"), "error"));
}
function Strip({ children, testId }: { children: ReactNode; testId: string }) {
  return <div className="grid grid-cols-2 gap-[10px] md:grid-cols-4" data-testid={testId}>{children}</div>;
}
function Card({ title, children, testId }: { title: string; children: ReactNode; testId?: string }) {
  return (
    <section className="min-w-0 space-y-2 rounded-[3px] border border-[#D8E0E8] bg-white p-3" data-testid={testId}>
      <div className="text-section-header">{title}</div>
      {children}
    </section>
  );
}
/** CONTROL's two-column card: label left, value right. */
function Pairs({ rows, testId }: { rows: Array<[string, ReactNode]>; testId?: string }) {
  return (
    <dl className="grid grid-cols-[minmax(110px,max-content)_1fr] gap-x-3 gap-y-1 text-xs" data-testid={testId}>
      {rows.map(([k, v]) => <div key={k} className="contents"><dt className="text-[#5B6B82]">{k}</dt><dd className="min-w-0 break-words font-medium text-[#1F2A44]">{v ?? DASH}</dd></div>)}
    </dl>
  );
}

/** Pick an item by name, brand, barcode or POS code (the quotes / orders finder). */
function ItemPick({ value, onPick, testId }: { value: { id: string; name: string } | null; onPick: (v: { id: string; name: string } | null) => void; testId: string }) {
  const [find, setFind] = useState("");
  const items = useQuery({ queryKey: ["perfume", "report-items", find], queryFn: () => searchPerfumeQuoteItems(find), enabled: find.trim().length >= 2 });
  return (
    <label className="relative block text-xs">{tr("perfume.reports.item", "Item")}
      {value ? (
        <span className={`${ctl} flex w-[320px] items-center justify-between gap-2`} data-testid={`${testId}-picked`}>
          <span className="truncate">{value.name}</span><button type="button" className="underline" onClick={() => onPick(null)}>{tr("perfume.reports.change", "Change")}</button>
        </span>
      ) : (
        <input type="search" className={`${ctl} block w-[320px]`} value={find} onChange={(e) => setFind(e.target.value)} data-testid={testId} aria-label={tr("perfume.reports.item", "Item")}
          placeholder={tr("perfume.reports.find_item", "Name, brand, UPC or POS code")} />
      )}
      {!value && (items.data?.items.length ?? 0) > 0 ? (
        <ul className="absolute z-20 mt-1 max-h-64 w-[420px] overflow-auto rounded-[3px] border border-[#C6D1DC] bg-white shadow" data-testid={`${testId}-results`}>
          {items.data!.items.map((it) => (
            <li key={it.id}><button type="button" className="block w-full px-2 py-1 text-left hover:bg-[#EEF2F6]" onClick={() => { setFind(""); onPick({ id: it.id, name: it.display_name }); }}>
              {it.display_name}{it.upc ? <span className="ml-2 text-[#5B6B82]">{it.upc}</span> : null}</button></li>
          ))}
        </ul>
      ) : null}
    </label>
  );
}

/* ------------------------------------------------------------------ 2. Items inquiry */

export function PerfumeItemInquiryPanel({ initialId }: { initialId?: string | null }) {
  const [item, setItem] = useState<{ id: string; name: string } | null>(initialId ? { id: initialId, name: "" } : null);
  const q = useQuery({ queryKey: ["perfume", "item-inquiry", item?.id], queryFn: () => getPerfumeItemInquiry(item!.id), enabled: !!item });
  const d = q.data && !("merged_into_id" in q.data) ? (q.data as PerfumeItemInquiry) : null;
  const it = d?.item;
  const yn = (b: boolean | undefined) => (b === false ? "N" : "Y");
  return (
    <div className="space-y-3" data-testid="perfume-item-inquiry">
      <div className="flex flex-wrap items-end gap-2"><ItemPick value={item && (it ? { id: item.id, name: it.display_name } : item.name ? item : null)} onPick={setItem} testId="perfume-inquiry-item" /></div>
      {q.isError ? <ListErrorState title={tr("perfume.reports.inquiry_error", "Couldn't load the item")} status={0} message={(q.error as Error)?.message} onRetry={() => void q.refetch()} /> : null}
      {q.data && "merged_into_id" in q.data ? <div className="text-xs">{tr("perfume.reports.merged", "This item was merged into another one.")}</div> : null}
      {d && it ? (
        <>
          <Strip testId="perfume-inquiry-kpis">
            <KpiCard label={tr("perfume.reports.on_hand", "On hand")} number={n(d.on_hand)} disabled />
            <KpiCard label={tr("perfume.reports.value", "Inventory value")} number={money(d.inventory_value_cents)} disabled />
            <KpiCard label={tr("perfume.reports.avg_cost", "Avg cost")} number={money(d.avg_cost_cents)} disabled />
            <KpiCard label={tr("perfume.reports.last_receipt", "Last receipt")} number={d.last_receipt_at ? usDate(d.last_receipt_at.slice(0, 10)) : DASH} disabled />
          </Strip>
          <div className="grid gap-3 md:grid-cols-2">
            <Card title={tr("perfume.reports.codes", "Codes")} testId="perfume-inquiry-codes">
              <Pairs rows={[
                [tr("perfume.reports.item", "Item"), <DocLink tab="items" id={it.id}>{it.display_name}</DocLink>],
                ["TIO code", it.tio_code], ["POS code", it.pos_code], ["UPC", d.codes.upcs.join(", ") || null], ["HK code", d.codes.hk_codes.join(", ") || null],
                [tr("perfume.itemfile.ticket", "Ticket description"), it.ticket_description],
                [tr("perfume.itemfile.family", "Family"), it.family], [tr("perfume.itemfile.product_type", "Product type"), it.product_type],
                [tr("perfume.itemfile.sold_by", "Sold by"), it.sold_by === "pack" ? `Pack of ${it.units_per_pack ?? "?"}` : "Piece"],
                [tr("perfume.itemfile.pref_vendor", "Preferred vendor"), it.preferred_vendor],
                [tr("perfume.itemfile.stock_item", "Stock item?"), yn(it.is_stock_item)], [tr("perfume.itemfile.active", "Active?"), yn(it.is_active)],
                [tr("perfume.itemfile.change_price", "Change price?"), yn(!it.price_locked)],
              ]} />
            </Card>
            <Card title={tr("perfume.reports.prices", "Prices and cost")} testId="perfume-inquiry-prices">
              <Pairs rows={[
                ...d.prices.map((p): [string, ReactNode] => [p.level, money(p.price_cents)]),
                [tr("perfume.itemfile.special", "Special price"), money(d.special_price_cents)], [tr("perfume.itemfile.min_price", "Minimum price"), money(d.min_price_cents)],
                [tr("perfume.reports.avg_cost", "Avg cost"), money(d.avg_cost_cents)], [tr("perfume.reports.last_cost", "Last cost"), money(d.last_cost_cents)],
                [tr("perfume.reports.best_supplier", "Best supplier"), money(d.best_supplier_cents)],
                [tr("perfume.reports.on_hand", "On hand"), n(d.on_hand)], [tr("perfume.reports.value", "Inventory value"), money(d.inventory_value_cents)],
              ]} />
            </Card>
          </div>
          <ParityTable<PerfumeItemInquiry["stock"][number]> title={tr("perfume.reports.by_site", "On hand by site")} rows={d.stock} rowKey={(r) => r.location_code}
            storageKey="perfume-inquiry-stock-v1" exportFilename={`TIO item inquiry ${it.tio_code ?? it.display_name}`} exportExcel emptyText="Nothing on hand."
            columns={[
              { className: "text-left", key: "location_code", label: "Site", render: (r) => r.site ? `${r.location_code} · ${r.site}` : r.location_code, exportValue: (r) => r.location_code },
              { key: "qty", label: "On hand", kind: "number", cellClass: "text-right tabular-nums", render: (r) => n(r.qty), exportValue: (r) => r.qty },
              { key: "avg_cost_cents", label: "Avg cost", kind: "number", cellClass: "text-right tabular-nums", render: (r) => money(r.avg_cost_cents), exportValue: (r) => (r.avg_cost_cents == null ? "" : r.avg_cost_cents / 100) },
              { key: "value_cents", label: "Value", kind: "number", cellClass: "text-right tabular-nums", render: (r) => money(r.value_cents), exportValue: (r) => r.value_cents / 100 },
            ]} />
        </>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ 3. Sales inquiry (by item / by customer) */

export function PerfumeSalesInquiryPanel() {
  const dl = useDownload();
  const [mode, setMode] = useState<"item" | "customer">("item");
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [item, setItem] = useState<{ id: string; name: string } | null>(null);
  const [customer, setCustomer] = useState("");
  const [invoice, setInvoice] = useState<ScentsxSaleInvoice | null>(null);
  const customers = useQuery({ queryKey: ["scentsx", "inquiry-customers"], queryFn: getScentsxInquiryCustomers, staleTime: 60_000 });
  const f: ScentsxInquiryFilter = { from, to, item_id: mode === "item" ? item?.id : undefined, customer_id: customer || undefined };
  const lines = useQuery({ queryKey: ["scentsx", "inquiry-lines", f], queryFn: () => getScentsxSalesLines(f), enabled: mode === "item" && !!from && !!to });
  const invoices = useQuery({ queryKey: ["scentsx", "inquiry-invoices", from, to, customer], queryFn: () => getScentsxSalesInvoices({ from, to, customer_id: customer || undefined }), enabled: mode === "customer" && !!from && !!to });
  const drill = useQuery({ queryKey: ["scentsx", "inquiry-drill", invoice?.invoice_id], queryFn: () => getScentsxSalesLines({ from: "2000-01-01", to: "2100-12-31", invoice_id: invoice!.invoice_id }), enabled: !!invoice });
  const err = mode === "item" ? lines : invoices;
  const lineCols = [
    { className: "text-left", key: "invoice", label: "Invoice", sortable: true, render: (r: ScentsxSaleLine) => r.invoice ?? DASH, exportValue: (r: ScentsxSaleLine) => r.invoice ?? "" },
    { className: "text-left", key: "issue_date", label: "Date", sortable: true, render: (r: ScentsxSaleLine) => usDate(r.issue_date), exportValue: (r: ScentsxSaleLine) => r.issue_date },
    { className: "text-left", key: "customer", label: "Customer", sortable: true, render: (r: ScentsxSaleLine) => r.customer, exportValue: (r: ScentsxSaleLine) => r.customer },
    { className: "text-left", key: "item", label: "Item", sortable: true, render: (r: ScentsxSaleLine) => (r.item_id ? <DocLink tab="items" id={r.item_id}>{r.item ?? ""}</DocLink> : r.description ?? DASH), exportValue: (r: ScentsxSaleLine) => r.item ?? r.description ?? "" },
    { key: "qty", label: "Qty", kind: "number" as const, sortable: true, cellClass: "text-right tabular-nums", render: (r: ScentsxSaleLine) => n(r.qty), exportValue: (r: ScentsxSaleLine) => r.qty },
    { key: "unit_price_cents", label: "Price", kind: "number" as const, sortable: true, cellClass: "text-right tabular-nums", render: (r: ScentsxSaleLine) => money(r.unit_price_cents), exportValue: (r: ScentsxSaleLine) => r.unit_price_cents / 100 },
    { key: "amount_cents", label: "Amount", kind: "number" as const, sortable: true, cellClass: "text-right tabular-nums", render: (r: ScentsxSaleLine) => money(r.amount_cents), exportValue: (r: ScentsxSaleLine) => r.amount_cents / 100 },
  ];
  return (
    <div className="space-y-3" data-testid="perfume-sales-inquiry">
      <div className="flex flex-wrap items-end gap-2 text-xs">
        <label>{tr("perfume.reports.inquiry_by", "Inquiry")}
          <select className={`${ctl} block w-[140px]`} value={mode} onChange={(e) => { setMode(e.target.value as "item" | "customer"); setInvoice(null); }} data-testid="perfume-sales-inquiry-mode">
            <option value="item">{tr("perfume.reports.by_item", "By item")}</option><option value="customer">{tr("perfume.reports.by_customer", "By customer")}</option>
          </select></label>
        <label>{tr("perfume.reports.from", "From")}<DatePicker aria-label="From" value={from} onChange={setFrom} /></label>
        <label>{tr("perfume.reports.to", "To")}<DatePicker aria-label="To" value={to} onChange={setTo} /></label>
        {mode === "item" ? <ItemPick value={item} onPick={setItem} testId="perfume-sales-inquiry-item" /> : null}
        <label>{tr("perfume.reports.customer", "Customer")}
          <select className={`${ctl} block w-[240px]`} value={customer} onChange={(e) => { setCustomer(e.target.value); setInvoice(null); }} data-testid="perfume-sales-inquiry-customer">
            <option value="">{tr("perfume.reports.all_customers", "All customers")}</option>
            {(customers.data?.customers ?? []).map((c) => <option key={c.customer_id} value={c.customer_id}>{c.customer}</option>)}
          </select></label>
        <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" data-testid="perfume-sales-inquiry-xlsx"
          onClick={() => dl(scentsxInquiryXlsxPath(mode === "item" ? "sales-lines" : "sales-invoices", mode === "item" ? f : { from, to, customer_id: customer || undefined }), "ScentsX sales inquiry.xlsx")}>
          {tr("perfume.reports.excel", "Excel")}</Button>
      </div>
      {err.isError ? <ListErrorState title={tr("perfume.reports.sales_error", "Couldn't load the sales")} status={0} message={(err.error as Error)?.message} onRetry={() => void err.refetch()} /> : null}
      {mode === "item" && lines.data ? (
        <>
          <Strip testId="perfume-sales-inquiry-kpis">
            <KpiCard label={tr("perfume.reports.lines", "Lines")} number={n(lines.data.total.lines)} disabled />
            <KpiCard label={tr("perfume.reports.invoices", "Invoices")} number={n(lines.data.total.invoices)} disabled />
            <KpiCard label={tr("perfume.reports.units", "Units")} number={n(lines.data.total.qty)} disabled />
            <KpiCard label={tr("perfume.reports.sales", "Sales")} number={money(lines.data.total.amount_cents)} disabled />
          </Strip>
          <ParityTable<ScentsxSaleLine> title={tr("perfume.reports.sale_lines", "Sale lines")} rows={lines.data.rows} rowKey={(r) => r.invoice_line_id} storageKey="perfume-sales-inquiry-lines-v1"
            exportFilename="ScentsX sales by item" exportExcel emptyText="No sales in these dates." columns={lineCols} />
          {lines.data.truncated ? <div className="text-xs text-[#5B6B82]">{tr("perfume.reports.truncated", "First 5,000 shown — the totals above count every line. Narrow the dates for the rest.")}</div> : null}
        </>
      ) : null}
      {mode === "customer" && invoices.data ? (
        <>
          <Strip testId="perfume-sales-inquiry-kpis">
            <KpiCard label={tr("perfume.reports.invoices", "Invoices")} number={n(invoices.data.total.invoices)} disabled />
            <KpiCard label={tr("perfume.reports.units", "Units")} number={n(invoices.data.total.units)} disabled />
            <KpiCard label={tr("perfume.reports.sales", "Sales")} number={money(invoices.data.total.sales_cents)} disabled />
            <KpiCard label={tr("perfume.reports.total", "Total with tax")} number={money(invoices.data.total.total_cents)} disabled />
          </Strip>
          <ParityTable<ScentsxSaleInvoice> title={tr("perfume.reports.sales_list", "Sales")} rows={invoices.data.rows} rowKey={(r) => r.invoice_id} storageKey="perfume-sales-inquiry-invoices-v1"
            exportFilename="ScentsX sales inquiry" exportExcel emptyText="No sales in these dates." onRowClick={(r) => setInvoice(r)}
            columns={[
              { className: "text-left", key: "invoice", label: "Invoice", sortable: true, render: (r) => <button type="button" className="underline" onClick={() => setInvoice(r)} data-testid={`perfume-sales-inquiry-open-${r.invoice_id}`}>{r.invoice ?? DASH}</button>, exportValue: (r) => r.invoice ?? "" },
              { className: "text-left", key: "issue_date", label: "Date", sortable: true, render: (r) => usDate(r.issue_date), exportValue: (r) => r.issue_date },
              { className: "text-left", key: "customer", label: "Customer", sortable: true, render: (r) => r.customer, exportValue: (r) => r.customer },
              { className: "text-left", key: "status", label: "Status", sortable: true, render: (r) => r.status, exportValue: (r) => r.status },
              { key: "lines", label: "Lines", kind: "number", sortable: true, cellClass: "text-right tabular-nums", render: (r) => n(r.lines), exportValue: (r) => r.lines },
              { key: "units", label: "Units", kind: "number", sortable: true, cellClass: "text-right tabular-nums", render: (r) => n(r.units), exportValue: (r) => r.units },
              { key: "sales_cents", label: "Sales", kind: "number", sortable: true, cellClass: "text-right tabular-nums", render: (r) => money(r.sales_cents), exportValue: (r) => r.sales_cents / 100 },
              { key: "tax_cents", label: "Tax", kind: "number", sortable: true, cellClass: "text-right tabular-nums", render: (r) => money(r.tax_cents), exportValue: (r) => r.tax_cents / 100 },
              { key: "total_cents", label: "Total", kind: "number", sortable: true, cellClass: "text-right tabular-nums", render: (r) => money(r.total_cents), exportValue: (r) => r.total_cents / 100 },
            ]} />
          {invoice ? (
            <ParityTable<ScentsxSaleLine> title={`${tr("perfume.reports.invoice_lines", "Lines of invoice")} ${invoice.invoice ?? ""} · ${invoice.customer}`} rows={drill.data?.rows ?? []} loading={drill.isLoading}
              rowKey={(r) => r.invoice_line_id} storageKey="perfume-sales-inquiry-drill-v1" exportFilename={`ScentsX invoice ${invoice.invoice ?? ""}`} exportExcel emptyText="No sale lines." columns={lineCols} />
          ) : null}
        </>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ the item filter (price book + inventory status) */

function ReportFilterBar({ f, setF, children, testId }: { f: PerfumeReportFilter; setF: (f: PerfumeReportFilter) => void; children?: ReactNode; testId: string }) {
  return (
    <div className="flex flex-wrap items-end gap-2 text-xs" data-testid={testId}>
      <label>{tr("perfume.itemfile.family", "Family")}
        <FamilySelect value={f.family_id ?? ""} onChange={(x) => setF({ ...f, family_id: x || undefined })} testId={`${testId}-family`}
          head={<option value="">{tr("perfume.reports.all_families", "All families")}</option>} /></label>
      <label>{tr("perfume.reports.family_from", "Family from")}<input className={`${ctl} block w-[130px]`} value={f.family_from ?? ""} onChange={(e) => setF({ ...f, family_from: e.target.value || undefined })} data-testid={`${testId}-family-from`} /></label>
      <label>{tr("perfume.reports.family_to", "Family to")}<input className={`${ctl} block w-[130px]`} value={f.family_to ?? ""} onChange={(e) => setF({ ...f, family_to: e.target.value || undefined })} data-testid={`${testId}-family-to`} /></label>
      <label>{tr("perfume.reports.code_from", "TIO code from")}<input className={`${ctl} block w-[120px]`} value={f.code_from ?? ""} onChange={(e) => setF({ ...f, code_from: e.target.value || undefined })} data-testid={`${testId}-code-from`} /></label>
      <label>{tr("perfume.reports.code_to", "TIO code to")}<input className={`${ctl} block w-[120px]`} value={f.code_to ?? ""} onChange={(e) => setF({ ...f, code_to: e.target.value || undefined })} data-testid={`${testId}-code-to`} /></label>
      <label>{tr("perfume.reports.zero", "Include on hand = 0?")}
        <select className={`${ctl} block w-[70px]`} value={f.zero ?? "N"} onChange={(e) => setF({ ...f, zero: e.target.value as "Y" | "N" })} data-testid={`${testId}-zero`}><option value="N">N</option><option value="Y">Y</option></select></label>
      <label>{tr("perfume.reports.active_only", "Active only?")}
        <select className={`${ctl} block w-[70px]`} value={f.active_only ?? "Y"} onChange={(e) => setF({ ...f, active_only: e.target.value as "Y" | "N" })} data-testid={`${testId}-active`}><option value="Y">Y</option><option value="N">N</option></select></label>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ 4. Price book */

export function PerfumePriceBookPanel() {
  const dl = useDownload();
  const levels = useQuery({ queryKey: ["perfume", "price-levels"], queryFn: listPerfumePriceLevels });
  const active = (levels.data?.levels ?? []).filter((l) => l.active);
  const [levelId, setLevelId] = useState("");
  const [f, setF] = useState<PerfumeReportFilter>({ zero: "N", active_only: "Y" });
  const level = levelId || active[0]?.id || "";
  const q = useQuery({ queryKey: ["perfume", "price-book", level, f], queryFn: () => getPerfumePriceBook({ ...f, level_id: level }), enabled: !!level });
  const qs = perfumeReportQs({ ...f, level_id: level });
  return (
    <div className="space-y-3" data-testid="perfume-price-book">
      <ReportFilterBar f={f} setF={setF} testId="perfume-price-book-filter">
        <label>{tr("perfume.reports.level", "Price level")}
          <select className={`${ctl} block w-[150px]`} value={level} onChange={(e) => setLevelId(e.target.value)} data-testid="perfume-price-book-level">
            {active.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select></label>
        <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" disabled={!level} data-testid="perfume-price-book-xlsx"
          onClick={() => dl(`/api/v1/perfume/reports/price-book/export.xlsx?${qs}`, "TIO price book.xlsx")}>{tr("perfume.reports.excel", "Excel")}</Button>
        <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" disabled={!level} data-testid="perfume-price-book-pdf"
          onClick={() => dl(`/api/v1/perfume/reports/price-book/export.pdf?${qs}`, "TIO price book.pdf")}>{tr("perfume.reports.pdf", "PDF")}</Button>
      </ReportFilterBar>
      {q.isError ? <ListErrorState title={tr("perfume.reports.book_error", "Couldn't build the price book")} status={0} message={(q.error as Error)?.message} onRetry={() => void q.refetch()} /> : null}
      {q.data ? (
        <>
          <Strip testId="perfume-price-book-kpis">
            <KpiCard label={tr("perfume.reports.level", "Price level")} number={q.data.level.name} disabled />
            <KpiCard label={tr("perfume.reports.items", "Items")} number={n(q.data.total.items)} disabled />
            <KpiCard label={tr("perfume.reports.priced", "Priced")} number={n(q.data.total.priced)} disabled />
            <KpiCard label={tr("perfume.reports.not_priced", "No price")} number={n(q.data.rows.length - q.data.total.priced)} disabled />
          </Strip>
          <ParityTable<PerfumePriceBookRow> title={`${tr("perfume.reports.price_book", "Price book")} · ${q.data.level.name}`} rows={q.data.rows} rowKey={(r) => r.id} storageKey="perfume-price-book-v1"
            exportFilename={`TIO price book ${q.data.level.name}`} exportExcel emptyText="No items match."
            columns={[
              { className: "text-left", key: "tio_code", label: "TIO code", sortable: true, render: (r) => r.tio_code ?? DASH, exportValue: (r) => r.tio_code ?? "" },
              { className: "text-left", key: "upc", label: "UPC", render: (r) => r.upc ?? DASH, exportValue: (r) => r.upc ?? "" },
              { className: "text-left", key: "display_name", label: "Item", sortable: true, render: (r) => <DocLink tab="items" id={r.id}>{r.display_name}</DocLink>, exportValue: (r) => r.display_name },
              { className: "text-left", key: "family", label: "Family", sortable: true, render: (r) => r.family ?? DASH, exportValue: (r) => r.family ?? "" },
              { key: "on_hand", label: "On hand", kind: "number", sortable: true, cellClass: "text-right tabular-nums", render: (r) => n(r.on_hand), exportValue: (r) => r.on_hand },
              { key: "price_cents", label: q.data.level.name, kind: "number", sortable: true, cellClass: "text-right tabular-nums", render: (r) => money(r.price_cents), exportValue: (r) => (r.price_cents == null ? "" : r.price_cents / 100) },
              { key: "special_price_cents", label: "Special", kind: "number", sortable: true, cellClass: "text-right tabular-nums", render: (r) => money(r.special_price_cents), exportValue: (r) => (r.special_price_cents == null ? "" : r.special_price_cents / 100) },
              { key: "min_price_cents", label: "Minimum", kind: "number", sortable: true, cellClass: "text-right tabular-nums", render: (r) => money(r.min_price_cents), exportValue: (r) => (r.min_price_cents == null ? "" : r.min_price_cents / 100) },
            ]} />
          {q.data.truncated ? <div className="text-xs text-[#5B6B82]">{tr("perfume.reports.book_truncated", "First 2,000 shown — narrow by family or code range.")}</div> : null}
        </>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ 5. Inventory status */

export function PerfumeInventoryStatusPanel() {
  const dl = useDownload();
  const [f, setF] = useState<PerfumeReportFilter>({ zero: "N", active_only: "Y" });
  const q = useQuery({ queryKey: ["perfume", "inventory-status", f], queryFn: () => getPerfumeInventoryStatus(f) });
  return (
    <div className="space-y-3" data-testid="perfume-inventory-status">
      <ReportFilterBar f={f} setF={setF} testId="perfume-inventory-status-filter">
        <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" data-testid="perfume-inventory-status-xlsx"
          onClick={() => dl(`/api/v1/perfume/reports/inventory-status/export.xlsx?${perfumeReportQs(f)}`, "TIO inventory status.xlsx")}>{tr("perfume.reports.excel", "Excel")}</Button>
      </ReportFilterBar>
      {q.isError ? <ListErrorState title={tr("perfume.reports.status_error", "Couldn't load inventory status")} status={0} message={(q.error as Error)?.message} onRetry={() => void q.refetch()} /> : null}
      {q.data ? (
        <>
          <Strip testId="perfume-inventory-status-kpis">
            <KpiCard label={tr("perfume.reports.items", "Items")} number={n(q.data.total.items)} disabled />
            <KpiCard label={tr("perfume.reports.units", "Units on hand")} number={n(q.data.total.on_hand)} disabled />
            <KpiCard label={tr("perfume.reports.value", "Inventory value")} number={money(q.data.total.value_cents)} disabled />
            <KpiCard label={tr("perfume.reports.avg_unit", "Avg cost per unit")} number={q.data.total.on_hand > 0 ? money(Math.round(q.data.total.value_cents / q.data.total.on_hand)) : DASH} disabled />
          </Strip>
          <ParityTable<PerfumeStatusRow> title={tr("perfume.reports.inventory_status", "Inventory status")} rows={q.data.rows} rowKey={(r) => r.id} storageKey="perfume-inventory-status-v1"
            exportFilename="TIO inventory status" exportExcel emptyText="No items match." loading={q.isLoading}
            columns={[
              { className: "text-left", key: "tio_code", label: "TIO code", sortable: true, render: (r) => r.tio_code ?? DASH, exportValue: (r) => r.tio_code ?? "" },
              { className: "text-left", key: "pos_code", label: "POS code", sortable: true, render: (r) => r.pos_code ?? DASH, exportValue: (r) => r.pos_code ?? "" },
              { className: "text-left", key: "display_name", label: "Item", sortable: true, render: (r) => <DocLink tab="items" id={r.id}>{r.display_name}</DocLink>, exportValue: (r) => r.display_name },
              { className: "text-left", key: "family", label: "Family", sortable: true, render: (r) => r.family ?? DASH, exportValue: (r) => r.family ?? "" },
              { key: "on_hand", label: "On hand", kind: "number", sortable: true, cellClass: "text-right tabular-nums", render: (r) => n(r.on_hand), exportValue: (r) => r.on_hand },
              { key: "avg_cost_cents", label: "Avg cost", kind: "number", sortable: true, cellClass: "text-right tabular-nums", render: (r) => money(r.avg_cost_cents), exportValue: (r) => (r.avg_cost_cents == null ? "" : r.avg_cost_cents / 100) },
              { key: "value_cents", label: "Value", kind: "number", sortable: true, cellClass: "text-right tabular-nums", render: (r) => money(r.value_cents), exportValue: (r) => r.value_cents / 100 },
            ]} />
          <div className="flex justify-end gap-6 border-t border-[#1F2A44] pt-1 text-xs font-semibold tabular-nums" data-testid="perfume-inventory-status-total">
            <span>{`${tr("perfume.reports.total_label", "Total")} · ${n(q.data.total.items)} ${tr("perfume.reports.items_l", "items")}`}</span>
            <span>{`${n(q.data.total.on_hand)} ${tr("perfume.reports.units_l", "units")}`}</span><span>{money(q.data.total.value_cents)}</span>
          </div>
          {q.data.truncated ? <div className="text-xs text-[#5B6B82]">{tr("perfume.reports.truncated_items", "First 5,000 items shown — the totals count every item.")}</div> : null}
        </>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ 6. Product family report */

export function PerfumeFamilyReportPanel() {
  const dl = useDownload();
  const [activeOnly, setActiveOnly] = useState<"Y" | "N">("Y");
  const q = useQuery({ queryKey: ["perfume", "family-report", activeOnly], queryFn: () => getPerfumeFamilyReport(activeOnly) });
  return (
    <div className="space-y-3" data-testid="perfume-family-report">
      <div className="flex flex-wrap items-end gap-2 text-xs">
        <label>{tr("perfume.reports.active_only", "Active only?")}
          <select className={`${ctl} block w-[70px]`} value={activeOnly} onChange={(e) => setActiveOnly(e.target.value as "Y" | "N")} data-testid="perfume-family-report-active"><option value="Y">Y</option><option value="N">N</option></select></label>
        <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" data-testid="perfume-family-report-xlsx"
          onClick={() => dl(`/api/v1/perfume/reports/families/export.xlsx?active_only=${activeOnly}`, "TIO product families.xlsx")}>{tr("perfume.reports.excel", "Excel")}</Button>
      </div>
      {q.isError ? <ListErrorState title={tr("perfume.reports.family_error", "Couldn't load the family report")} status={0} message={(q.error as Error)?.message} onRetry={() => void q.refetch()} /> : null}
      {q.data ? (
        <>
          <Strip testId="perfume-family-report-kpis">
            <KpiCard label={tr("perfume.reports.families", "Families")} number={n(q.data.total.families)} disabled />
            <KpiCard label={tr("perfume.reports.items", "Items")} number={n(q.data.total.items)} disabled />
            <KpiCard label={tr("perfume.reports.units", "Units on hand")} number={n(q.data.total.on_hand)} disabled />
            <KpiCard label={tr("perfume.reports.value", "Inventory value")} number={money(q.data.total.value_cents)} disabled />
          </Strip>
          <ParityTable<PerfumeFamilyReportRow> title={tr("perfume.reports.family_report", "Product families")} rows={q.data.rows} rowKey={(r) => r.family_id ?? "none"} storageKey="perfume-family-report-v1"
            exportFilename="TIO product families" exportExcel emptyText="No families."
            columns={[
              { className: "text-left", key: "family", label: "Family", sortable: true, render: (r) => (r.family_id ? <DocLink tab="families" id={r.family_id}>{r.family}</DocLink> : r.family), exportValue: (r) => r.family },
              { className: "text-left", key: "brand", label: "Brand", sortable: true, render: (r) => r.brand ?? DASH, exportValue: (r) => r.brand ?? "" },
              { key: "items", label: "Items", kind: "number", sortable: true, cellClass: "text-right tabular-nums", render: (r) => n(r.items), exportValue: (r) => r.items },
              { key: "items_on_hand", label: "Items on hand", kind: "number", sortable: true, cellClass: "text-right tabular-nums", render: (r) => n(r.items_on_hand), exportValue: (r) => r.items_on_hand },
              { key: "on_hand", label: "Units on hand", kind: "number", sortable: true, cellClass: "text-right tabular-nums", render: (r) => n(r.on_hand), exportValue: (r) => r.on_hand },
              { key: "value_cents", label: "Value", kind: "number", sortable: true, cellClass: "text-right tabular-nums", render: (r) => money(r.value_cents), exportValue: (r) => r.value_cents / 100 },
            ]} />
        </>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ Vendor price tiers (owner 2026-11-27 15:40 CT) */

/** Who lists high, medium, low on the items vendors have in common: Low = sell to them cheap (low margin, high volume), High = can sell
 *  to them dearer. 100 % = the item's median supplier price. The thresholds and the minimum items are boxes the owner can change. */
export function PerfumeVendorTiersPanel() {
  const dl = useDownload();
  const [minItems, setMinItems] = useState("30");
  const [low, setLow] = useState("98");
  const [high, setHigh] = useState("102");
  const qv = { min_items: Number(minItems) || 30, low_below: Number(low) || 98, high_above: Number(high) || 102 };
  const q = useQuery({ queryKey: ["perfume", "vendor-tiers", qv], queryFn: () => getPerfumeVendorTiers(qv) });
  const qs = perfumeReportQs({ min_items: String(qv.min_items), low_below: String(qv.low_below), high_above: String(qv.high_above) });
  const tone: Record<PerfumeVendorTierRow["tier"], string> = { Low: "text-[#14532D] font-semibold", Medium: "text-[#1F2A44]", High: "text-[#991B1B] font-semibold", "Too few items": "text-[#5B6B82]" };
  return (
    <div className="space-y-3" data-testid="perfume-vendor-tiers">
      <div className="flex flex-wrap items-end gap-2 text-xs">
        <label>{tr("perfume.tiers.low", "Low below %")}<input inputMode="decimal" className={`${ctl} block w-[80px] text-right`} value={low} onChange={(e) => setLow(e.target.value)} data-testid="perfume-tiers-low" /></label>
        <label>{tr("perfume.tiers.high", "High above %")}<input inputMode="decimal" className={`${ctl} block w-[80px] text-right`} value={high} onChange={(e) => setHigh(e.target.value)} data-testid="perfume-tiers-high" /></label>
        <label>{tr("perfume.tiers.min", "Min items in common")}<input inputMode="numeric" className={`${ctl} block w-[90px] text-right`} value={minItems} onChange={(e) => setMinItems(e.target.value)} data-testid="perfume-tiers-min" /></label>
        <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" data-testid="perfume-tiers-xlsx"
          onClick={() => dl(`/api/v1/perfume/reports/vendor-tiers/export.xlsx?${qs}`, "TIO vendor price tiers.xlsx")}>{tr("perfume.reports.excel", "Excel")}</Button>
      </div>
      {q.isError ? <ListErrorState title={tr("perfume.tiers.error", "Couldn't measure the vendors")} status={0} message={(q.error as Error)?.message} onRetry={() => void q.refetch()} /> : null}
      {q.data ? (
        <>
          <Strip testId="perfume-tiers-kpis">
            <KpiCard label={tr("perfume.tiers.k_low", "Low priced (sell cheap)")} number={n(q.data.total.low)} disabled />
            <KpiCard label={tr("perfume.tiers.k_med", "Medium")} number={n(q.data.total.medium)} disabled />
            <KpiCard label={tr("perfume.tiers.k_high", "High priced (sell dearer)")} number={n(q.data.total.high)} disabled />
            <KpiCard label={tr("perfume.tiers.k_few", "Too few items")} number={n(q.data.total.too_few)} disabled />
          </Strip>
          <ParityTable<PerfumeVendorTierRow> title={tr("perfume.tiers.title", "Vendor price tiers — 100 % = the item's median supplier price")} rows={q.data.rows} rowKey={(r) => r.vendor_id}
            storageKey="perfume-vendor-tiers-v1" exportFilename="TIO vendor price tiers" exportExcel emptyText="No supplier lists."
            columns={[
              { className: "text-left", key: "vendor", label: "Vendor", sortable: true, render: (r) => <DocLink tab="suppliers" id={r.vendor_id}>{r.vendor}</DocLink>, exportValue: (r) => r.vendor },
              { className: "text-left", key: "tier", label: "Tier", sortable: true, render: (r) => <span className={tone[r.tier]}>{r.tier}</span>, exportValue: (r) => r.tier },
              { key: "index_pct", label: "Price index %", kind: "number", sortable: true, cellClass: "text-right tabular-nums", render: (r) => (r.index_pct == null ? DASH : `${r.index_pct.toFixed(1)}%`), exportValue: (r) => r.index_pct ?? "" },
              { key: "items_compared", label: "Items in common", kind: "number", sortable: true, cellClass: "text-right tabular-nums", render: (r) => n(r.items_compared), exportValue: (r) => r.items_compared },
              { key: "cheapest_pct", label: "Cheapest on", kind: "number", sortable: true, cellClass: "text-right tabular-nums", render: (r) => (r.cheapest_pct == null ? DASH : `${r.cheapest_pct.toFixed(1)}%`), exportValue: (r) => r.cheapest_pct ?? "" },
              { key: "priciest_pct", label: "Most expensive on", kind: "number", sortable: true, cellClass: "text-right tabular-nums", render: (r) => (r.priciest_pct == null ? DASH : `${r.priciest_pct.toFixed(1)}%`), exportValue: (r) => r.priciest_pct ?? "" },
            ]} />
        </>
      ) : null}
    </div>
  );
}
