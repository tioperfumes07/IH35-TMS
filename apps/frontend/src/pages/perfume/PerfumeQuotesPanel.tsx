/**
 * PERFUME-QUOTES — quotations to customers with their history, Excel and PDF (owner 2026-11-26 18:13 CT: "we need exporters
 * to excel, we need pdfs, we need quotations, and then historoy for quotations"). A quote takes its customer from Contacts and
 * its lines from desk items, each priced from the best current supplier cost + the owner's first wholesale target (the
 * owner edits any price). Every change is in the history. Nothing is deleted — a quote or a line taken off is archived.
 * Never posts to accounting (owner: "maybe later").
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
  addPerfumeQuoteLine, archivePerfumeQuote, copyPerfumeQuote, createPerfumeQuote, downloadPerfumeFile, getPerfumeQuote, listPerfumeContacts, listPerfumeQuotes,
  orderFromPerfumeQuote, removePerfumeQuoteLine, searchPerfumeQuoteItems, setPerfumeQuoteStatus, updatePerfumeQuote, updatePerfumeQuoteLine,
  type PerfumeQuote, type PerfumeQuoteEvent, type PerfumeQuoteLine, type PerfumeQuoteRow, type PerfumeQuoteStatus,
} from "../../api/perfume";
import { tr } from "./perfumeI18n";
import { DocLink, useOpenDoc } from "./perfumeDocParts";

const DASH = "—";
const ctl = "h-[34px] rounded-sm border border-[#C6D1DC] bg-white px-2 text-xs";
const usDate = (d: string | null | undefined) => (d ? `${d.slice(5, 7)}/${d.slice(8, 10)}/${d.slice(0, 4)}` : DASH);
const money = (c: unknown, cur = "USD") => (c == null || c === "" ? DASH : `${cur === "MXN" ? "MX$" : "$"}${(Number(c) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
/** "$12.50" / "12.5" → 1250 exact (string math). null when not a price. */
export function toCents(v: string): number | null {
  const m = v.replace(/[$,\s]/g, "").match(/^(\d*)(?:\.(\d{0,2}))?$/);
  if (!m || (m[1] === "" && (m[2] ?? "") === "")) return null;
  return Number(m[1] || "0") * 100 + Number((m[2] ?? "").padEnd(2, "0") || "0");
}
const STATUS_TEXT: Record<PerfumeQuoteStatus, string> = { draft: "Draft", sent: "Sent", accepted: "Accepted", rejected: "Rejected", expired: "Expired" };
const STATUS_CLASS: Record<PerfumeQuoteStatus, string> = { draft: "bg-[#64748B]", sent: "bg-[#14314F]", accepted: "bg-[#1F6B32]", rejected: "bg-[#9B2C2C]", expired: "bg-[#8A4208]" };
const EVENT_TEXT: Record<string, string> = { created: "Created", edited: "Edited", line_added: "Line added", line_changed: "Line changed", line_removed: "Line taken off",
  status: "Status", exported_xlsx: "Excel made", exported_pdf: "PDF made", copied_from: "Copied from", ordered: "Became a sales order" };
const marginPct = (r: { cost_cents: unknown; costed_total_cents: unknown }) => {
  const sell = Number(r.costed_total_cents), cost = Number(r.cost_cents);
  return sell > 0 ? ((sell - cost) / sell) * 100 : null;
};

function StatusBadge({ s }: { s: PerfumeQuoteStatus }) {
  return <span className={`text-section-header inline-block rounded-sm px-1.5 text-white ${STATUS_CLASS[s]}`}>{STATUS_TEXT[s]}</span>;
}

export function PerfumeQuotesPanel() {
  const { pushToast } = useToast();
  const quotes = useQuery({ queryKey: ["perfume", "quotes"], queryFn: listPerfumeQuotes });
  const [status, setStatus] = useState<PerfumeQuoteStatus | "">("");
  const [q, setQ] = useState("");
  const { openId } = useOpenDoc();
  const [selected, setSelected] = useState<string | null>(openId);
  const [adding, setAdding] = useState(false);
  useEffect(() => { if (openId) setSelected(openId); }, [openId]);
  const all = useMemo(() => quotes.data?.quotes ?? [], [quotes.data]);
  const shown = all.filter((r) => (!status || r.status === status) && (!q.trim() || `${r.number} ${r.customer_name}`.toLowerCase().includes(q.trim().toLowerCase())));
  const count = (s: PerfumeQuoteStatus) => all.filter((r) => r.status === s).length;
  const openValue = all.filter((r) => r.status === "draft" || r.status === "sent").reduce((t, r) => t + Number(r.total_cents), 0);
  const won = all.filter((r) => r.status === "accepted").reduce((t, r) => t + Number(r.total_cents), 0);

  if (quotes.isError) return <ListErrorState title={tr("perfume.quotes.loadError", "Couldn't load the quotes")} status={0} message={(quotes.error as Error)?.message} onRetry={() => void quotes.refetch()} />;

  return (
    <div className="space-y-3" data-testid="perfume-quotes-panel">
      <div className="grid grid-cols-2 gap-[10px] md:grid-cols-6" data-testid="perfume-quotes-kpis">
        <KpiCard label={tr("perfume.quotes.kpi_all", "Quotes")} number={all.length.toLocaleString("en-US")} onClick={() => setStatus("")} />
        <KpiCard label={tr("perfume.quotes.kpi_draft", "Draft")} number={count("draft").toLocaleString("en-US")} onClick={() => setStatus("draft")} />
        <KpiCard label={tr("perfume.quotes.kpi_sent", "Sent")} number={count("sent").toLocaleString("en-US")} onClick={() => setStatus("sent")} />
        <KpiCard label={tr("perfume.quotes.kpi_accepted", "Accepted")} number={count("accepted").toLocaleString("en-US")} onClick={() => setStatus("accepted")} />
        <KpiCard label={tr("perfume.quotes.kpi_open", "Open value (draft + sent)")} number={money(openValue)} onClick={() => setStatus("sent")} />
        <KpiCard label={tr("perfume.quotes.kpi_won", "Accepted value")} number={money(won)} onClick={() => setStatus("accepted")} />
      </div>
      <section className="space-y-2 rounded-[3px] border border-[#D8E0E8] bg-white p-3" aria-label={tr("perfume.quotes.title", "Quotes")}>
        <div className="flex flex-wrap items-center gap-2">
          <select className={ctl} aria-label={tr("perfume.quotes.status", "Status")} value={status} onChange={(e) => setStatus(e.target.value as PerfumeQuoteStatus | "")} data-testid="perfume-quotes-status">
            <option value="">{tr("perfume.quotes.any_status", "Any status")}</option>
            {(Object.keys(STATUS_TEXT) as PerfumeQuoteStatus[]).map((s) => <option key={s} value={s}>{STATUS_TEXT[s]}</option>)}
          </select>
          <input type="search" className={`${ctl} min-w-[220px] flex-1`} aria-label={tr("perfume.quotes.search", "Search quotes")} placeholder={tr("perfume.quotes.search_ph", "Search number or customer")}
            value={q} onChange={(e) => setQ(e.target.value)} data-testid="perfume-quotes-search" />
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" data-testid="perfume-quotes-export"
            onClick={() => void downloadPerfumeFile("/api/v1/perfume/quotes/export.xlsx", "TIO quotes.xlsx").catch((e) => pushToast(userFacingApiError(e, "Export failed"), "error"))}>
            {tr("perfume.quotes.export", "Export list (Excel)")}
          </Button>
          <Button type="button" className="h-[34px] px-3 text-xs" onClick={() => setAdding((v) => !v)} data-testid="perfume-quotes-new">{tr("perfume.quotes.new", "New quote")}</Button>
        </div>
        {adding ? <NewQuoteForm onClose={() => setAdding(false)} onCreated={(id) => { setAdding(false); setSelected(id); void quotes.refetch(); }} /> : null}
        <ParityTable<PerfumeQuoteRow>
          rows={shown}
          rowKey={(r) => r.id}
          loading={quotes.isLoading}
          storageKey="perfume-quotes-v1"
          exportFilename="TIO quotes"
          exportExcel
          emptyText={status || q ? "No quote matches these filters." : "No quotes yet — press New quote."}
          onRowClick={(r) => setSelected(r.id)}
          columns={[
            { key: "number", label: "Number", sortable: true, render: (r) => <span className="font-semibold">{r.number}</span> },
            { key: "quote_date", label: "Date", sortable: true, cellClass: "text-right tabular-nums", render: (r) => usDate(r.quote_date) },
            { key: "valid_until", label: "Valid until", sortable: true, cellClass: "text-right tabular-nums", render: (r) => usDate(r.valid_until) },
            { key: "customer_name", label: "Customer", sortable: true, render: (r) => r.customer_name },
            { key: "status", label: "Status", sortable: true, render: (r) => <StatusBadge s={r.status} />, exportValue: (r) => STATUS_TEXT[r.status] },
            { key: "lines", label: "Lines", sortable: true, kind: "number", cellClass: "text-right tabular-nums", render: (r) => r.lines.toLocaleString("en-US") },
            { key: "units", label: "Units", sortable: true, kind: "number", cellClass: "text-right tabular-nums", render: (r) => r.units.toLocaleString("en-US") },
            { key: "total_cents", label: "Total", sortable: true, kind: "number", cellClass: "text-right tabular-nums", render: (r) => money(r.total_cents, r.currency), exportValue: (r) => Number(r.total_cents) / 100 },
            { key: "margin", label: "Margin", cellClass: "text-right tabular-nums", render: (r) => { const m = marginPct(r); return m == null ? DASH : `${m.toFixed(1)}%`; }, exportValue: (r) => { const m = marginPct(r); return m == null ? "" : Number(m.toFixed(1)); } },
            { key: "order_number", label: "Sales order", sortable: true, render: (r) => (r.order_id && r.order_number ? <DocLink tab="orders" id={r.order_id}>{r.order_number}</DocLink> : DASH), exportValue: (r) => r.order_number ?? "" },
          ]}
        />
      </section>
      {selected ? <QuoteEditor id={selected} onClose={() => setSelected(null)} onChanged={() => void quotes.refetch()} onOpen={(id) => setSelected(id)} /> : null}
    </div>
  );
}

function NewQuoteForm({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { pushToast } = useToast();
  const [find, setFind] = useState("");
  const [pick, setPick] = useState<{ id: string; name: string } | null>(null);
  const [validUntil, setValidUntil] = useState("");
  const found = useQuery({ queryKey: ["perfume", "contacts", "quote-pick", find], queryFn: () => listPerfumeContacts({ q: find, limit: 20 }), enabled: !pick && find.trim().length >= 2 });
  const create = async () => {
    try {
      const r = await createPerfumeQuote({ company_id: pick?.id ?? null, customer_name: pick ? null : find.trim(), valid_until: validUntil || null });
      pushToast(`Quote ${r.number} started`, "success"); onCreated(r.id);
    } catch (e) { pushToast(userFacingApiError(e, "Not saved"), "error"); }
  };
  return (
    <div className="flex flex-wrap items-end gap-2 border-t border-[#E8EDF2] pt-2" data-testid="perfume-quotes-new-form">
      <label className="relative text-xs">{tr("perfume.quotes.customer", "Customer (from Contacts, or type a name)")}
        <input className={`${ctl} block w-[320px]`} value={pick ? pick.name : find} onChange={(e) => { setPick(null); setFind(e.target.value); }} data-testid="perfume-quotes-customer" />
        {!pick && find.trim().length >= 2 && (found.data?.rows?.length ?? 0) > 0 ? (
          <div className="absolute z-20 mt-1 max-h-64 w-[320px] overflow-y-auto border border-gray-300 bg-white shadow-lg" role="listbox">
            {found.data!.rows.map((r) => (
              <button key={r.id} type="button" role="option" aria-selected={false} className="block w-full px-2 py-1 text-left text-xs hover:bg-gray-100"
                onClick={() => setPick({ id: r.id, name: r.name })} data-testid={`perfume-quotes-pick-${r.id}`}>
                <span className="font-semibold">{r.name}</span> <span className="text-[#64748B]">{[r.city, r.country].filter(Boolean).join(", ")}</span>
              </button>
            ))}
          </div>
        ) : null}
      </label>
      <label className="text-xs">{tr("perfume.quotes.valid_until", "Valid until")}<DatePicker aria-label={tr("perfume.quotes.valid_until", "Valid until")} value={validUntil} onChange={setValidUntil} /></label>
      <Button type="button" className="h-[34px] px-3 text-xs" disabled={!pick && find.trim().length < 2} onClick={() => void create()} data-testid="perfume-quotes-create">{tr("perfume.quotes.start", "Start quote")}</Button>
      <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" onClick={onClose}>{tr("perfume.quotes.cancel", "Cancel")}</Button>
    </div>
  );
}

/** A quantity or a price on a quote line: saved when the box is left (Enter or Tab), only when it changed. */
function LineCell({ l, field, onSaved }: { l: PerfumeQuoteLine; field: "qty" | "unit_price_cents"; onSaved: () => void }) {
  const { pushToast } = useToast();
  const start = field === "qty" ? String(l.qty) : (l.unit_price_cents / 100).toFixed(2);
  const [v, setV] = useState(start);
  const save = async () => {
    const n = field === "qty" ? Number(v) : toCents(v);
    if (n == null || !Number.isInteger(n) || n < (field === "qty" ? 1 : 0)) { pushToast("Quantity must be a whole number and the price a dollar amount", "error"); setV(start); return; }
    if (n === (field === "qty" ? l.qty : l.unit_price_cents)) return;
    try { await updatePerfumeQuoteLine(l.id, { [field]: n }); onSaved(); } catch (e) { pushToast(userFacingApiError(e, "Not saved"), "error"); }
  };
  return (
    <input className={`${ctl} ${field === "qty" ? "w-[80px]" : "w-[100px]"} text-right`} aria-label={field === "qty" ? tr("perfume.quotes.qty", "Qty") : tr("perfume.quotes.price", "Unit price")}
      value={v} onChange={(e) => setV(e.target.value)} onBlur={() => void save()} onClick={(e) => e.stopPropagation()} data-testid={`perfume-quote-${field}-${l.line_no}`} />
  );
}

function eventText(e: PerfumeQuoteEvent): string {
  const d = e.detail ?? {};
  if (e.kind === "status") return `${String(d["from"] ?? "")} → ${String(d["to"] ?? "")}`;
  if (e.kind === "line_added") return `#${String(d["line_no"])} ${String(d["description"] ?? "")} · ${String(d["qty"])} × ${money(d["unit_price_cents"])}`;
  if (e.kind === "line_changed") { const to = (d["to"] ?? {}) as Record<string, unknown>; return `#${String(d["line_no"])} ${to["qty"] != null ? `qty ${String(to["qty"])}` : ""} ${to["unit_price_cents"] != null ? `price ${money(to["unit_price_cents"])}` : ""}`.trim(); }
  if (e.kind === "line_removed") return `#${String(d["line_no"])} ${String(d["description"] ?? "")}`;
  if (e.kind === "edited") return Array.isArray(d["fields"]) ? (d["fields"] as string[]).join(", ") : d["archived"] ? "archived" : "";
  if (e.kind === "copied_from") return `${String(d["number"] ?? "")} (${String(d["lines"] ?? 0)} lines)`;
  if (e.kind === "created") return String(d["customer"] ?? "");
  if (e.kind === "ordered") return String(d["number"] ?? "");
  return "";
}

function QuoteEditor({ id, onClose, onChanged, onOpen }: { id: string; onClose: () => void; onChanged: () => void; onOpen: (id: string) => void }) {
  const { pushToast } = useToast();
  const { open } = useOpenDoc();
  const quote = useQuery({ queryKey: ["perfume", "quote", id], queryFn: () => getPerfumeQuote(id) });
  const [find, setFind] = useState("");
  const [qty, setQty] = useState("1");
  const items = useQuery({ queryKey: ["perfume", "quote-items", find], queryFn: () => searchPerfumeQuoteItems(find), enabled: find.trim().length >= 2 });
  const refresh = async () => { await quote.refetch(); onChanged(); };
  const q: PerfumeQuote | undefined = quote.data;
  if (quote.isError) return <ListErrorState title={tr("perfume.quotes.loadOneError", "Couldn't load the quote")} status={0} message={(quote.error as Error)?.message} onRetry={() => void quote.refetch()} />;
  if (!q) return null;
  const total = q.lines.reduce((t, l) => t + l.qty * l.unit_price_cents, 0);
  const add = async (itemId: string) => {
    const n = Number(qty);
    if (!Number.isInteger(n) || n < 1) { pushToast("Quantity must be a whole number", "error"); return; }
    try { await addPerfumeQuoteLine(id, { item_id: itemId, qty: n }); setFind(""); await refresh(); } catch (e) { pushToast(userFacingApiError(e, "Not added"), "error"); }
  };
  const patch = async (b: Parameters<typeof updatePerfumeQuote>[1]) => { try { await updatePerfumeQuote(id, b); await refresh(); } catch (e) { pushToast(userFacingApiError(e, "Not saved"), "error"); } };
  const status = async (s: PerfumeQuoteStatus) => { try { await setPerfumeQuoteStatus(id, s); await refresh(); pushToast(`${q.number}: ${STATUS_TEXT[s]}`, "success"); } catch (e) { pushToast(userFacingApiError(e, "Not saved"), "error"); } };
  const file = async (kind: "xlsx" | "pdf") => {
    try { await downloadPerfumeFile(`/api/v1/perfume/quotes/${id}/export.${kind}`, `${q.number}.${kind}`); await refresh(); }
    catch (e) { pushToast(userFacingApiError(e, "Export failed"), "error"); }
  };
  return (
    <section className="space-y-2 rounded-[3px] border border-[#D8E0E8] bg-white p-3" data-testid="perfume-quote-editor" aria-label={q.number}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-section-header">{q.number} · {q.customer_name} <StatusBadge s={q.status} /></div>
          <div className="text-xs text-[#64748B]">{[q.customer_email, q.customer_phone, `Date ${usDate(q.quote_date)}`, q.valid_until ? `Valid until ${usDate(q.valid_until)}` : ""].filter(Boolean).join(" · ")}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          {q.order_id && q.order_number
            ? <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" onClick={() => open("orders", q.order_id!)} data-testid="perfume-quote-open-order">{`${tr("perfume.quotes.open_order", "Open sales order")} ${q.order_number}`}</Button>
            : <Button type="button" className="h-[34px] px-3 text-xs" disabled={!q.lines.length || q.status === "rejected"} data-testid="perfume-quote-make-order"
                onClick={() => void orderFromPerfumeQuote(id).then((r) => { pushToast(`Sales order ${r.number} made`, "success"); onChanged(); open("orders", r.id); }).catch((e) => pushToast(userFacingApiError(e, "Not made"), "error"))}>
                {tr("perfume.quotes.make_order", "Make sales order")}
              </Button>}
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" onClick={() => void file("xlsx")} data-testid="perfume-quote-xlsx">{tr("perfume.quotes.xlsx", "Excel")}</Button>
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" onClick={() => void file("pdf")} data-testid="perfume-quote-pdf">{tr("perfume.quotes.pdf", "PDF")}</Button>
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" data-testid="perfume-quote-copy"
            onClick={() => void copyPerfumeQuote(id).then((r) => { pushToast(`Copied to ${r.number}`, "success"); onChanged(); onOpen(r.id); }).catch((e) => pushToast(userFacingApiError(e, "Not copied"), "error"))}>
            {tr("perfume.quotes.copy", "Copy as new")}
          </Button>
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" data-testid="perfume-quote-archive"
            onClick={() => void archivePerfumeQuote(id).then(() => { onChanged(); onClose(); }).catch((e) => pushToast(userFacingApiError(e, "Not taken off"), "error"))}>
            {tr("perfume.quotes.archive", "Take off")}
          </Button>
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" onClick={onClose}>{tr("perfume.quotes.close", "Close")}</Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs" data-testid="perfume-quote-status-buttons">
        <span className="text-[#64748B]">{tr("perfume.quotes.mark", "Mark as:")}</span>
        {(Object.keys(STATUS_TEXT) as PerfumeQuoteStatus[]).map((s) => (
          <button key={s} type="button" aria-pressed={q.status === s} onClick={() => void status(s)} data-testid={`perfume-quote-status-${s}`}
            className={`h-[28px] rounded-sm border px-2 ${q.status === s ? "border-[#14314F] bg-[#14314F] font-semibold text-white" : "border-[#C6D1DC] bg-[var(--surface-unselected)] text-[#1F2A44] hover:bg-[var(--surface-hover)]"}`}>
            {STATUS_TEXT[s]}
          </button>
        ))}
        <label className="ml-2">{tr("perfume.quotes.valid_until", "Valid until")} <DatePicker aria-label={tr("perfume.quotes.valid_until", "Valid until")} value={q.valid_until ?? ""} onChange={(v) => void patch({ valid_until: v || null })} /></label>
        <select className={ctl} aria-label={tr("perfume.quotes.currency", "Currency")} value={q.currency} onChange={(e) => void patch({ currency: e.target.value as "USD" | "MXN" })}>
          <option value="USD">{"USD"}</option><option value="MXN">{"MXN"}</option>
        </select>
      </div>
      <div className="relative flex flex-wrap items-center gap-2">
        <input type="search" className={`${ctl} w-full max-w-[460px]`} aria-label={tr("perfume.quotes.find_item", "Add an item")} placeholder={tr("perfume.quotes.find_item_ph", "Add an item — type a name, brand or barcode")}
          value={find} onChange={(e) => setFind(e.target.value)} data-testid="perfume-quote-find-item" />
        <label className="text-xs">{tr("perfume.quotes.qty", "Qty")} <input className={`${ctl} w-[80px] text-right`} aria-label={tr("perfume.quotes.qty", "Qty")} value={qty} onChange={(e) => setQty(e.target.value)} /></label>
        {find.trim().length >= 2 && (items.data?.items?.length ?? 0) > 0 ? (
          <div className="absolute top-[38px] z-20 max-h-72 w-full max-w-[460px] overflow-y-auto border border-gray-300 bg-white shadow-lg" role="listbox">
            {items.data!.items.map((it) => (
              <button key={it.id} type="button" role="option" aria-selected={false} className="block w-full px-2 py-1 text-left text-xs hover:bg-gray-100"
                onClick={() => void add(it.id)} data-testid={`perfume-quote-item-${it.id}`}>
                <span className="font-semibold">{it.display_name}</span>
                <span className="ml-1 text-[#64748B]">{[it.upc, it.best ? `best cost ${money(it.best.cents)} · ${it.best.vendor}` : "no supplier cost — type the price after adding"].filter(Boolean).join(" · ")}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <ParityTable<PerfumeQuoteLine>
        title={tr("perfume.quotes.lines", "Lines")}
        rows={q.lines}
        rowKey={(l) => `${l.id}-${l.qty}-${l.unit_price_cents}`}
        storageKey="perfume-quote-lines-v1"
          exportFilename="TIO quote lines"
          exportExcel
        emptyText="No lines yet — add an item above."
        columns={[
          { key: "line_no", label: "#", cellClass: "tabular-nums", render: (l) => l.line_no },
          { key: "description", label: "Item", render: (l) => <>{l.description}{l.upc ? <span className="ml-1 text-[#64748B]">{l.upc}</span> : null}</>, exportValue: (l) => `${l.description}${l.upc ? ` ${l.upc}` : ""}` },
          { key: "qty", label: "Qty", render: (l) => <LineCell l={l} field="qty" onSaved={() => void refresh()} />, exportValue: (l) => l.qty },
          { key: "unit_price_cents", label: "Unit price", render: (l) => <LineCell l={l} field="unit_price_cents" onSaved={() => void refresh()} />, exportValue: (l) => l.unit_price_cents / 100 },
          { key: "total", label: "Total", cellClass: "text-right tabular-nums", render: (l) => money(l.qty * l.unit_price_cents, q.currency), exportValue: (l) => (l.qty * l.unit_price_cents) / 100 },
          { key: "cost_cents", label: "Best cost when added", cellClass: "text-right tabular-nums", render: (l) => (l.cost_cents == null ? DASH : `${money(l.cost_cents)}${l.cost_vendor ? ` · ${l.cost_vendor}` : ""}`) },
          { key: "margin", label: "Margin", cellClass: "text-right tabular-nums", render: (l) => (l.cost_cents != null && l.unit_price_cents > 0 ? `${(((l.unit_price_cents - l.cost_cents) / l.unit_price_cents) * 100).toFixed(1)}%` : DASH) },
          { key: "off", label: "", render: (l) => (
            <Button type="button" variant="secondary" className="h-[28px] px-2 text-xs"
              onClick={(e) => { e.stopPropagation(); void removePerfumeQuoteLine(l.id).then(() => refresh()).catch((er) => pushToast(userFacingApiError(er, "Not taken off"), "error")); }}>
              {tr("perfume.quotes.take_off", "Take off")}
            </Button>) },
        ]}
      />
      <div className="flex justify-end gap-4 border-t border-[#14314F] pt-1 text-xs font-semibold" data-testid="perfume-quote-lines-total">
        <span>{`${q.lines.length} line${q.lines.length === 1 ? "" : "s"} · ${q.lines.reduce((t, l) => t + l.qty, 0).toLocaleString("en-US")} units`}</span>
        <span data-testid="perfume-quote-total">{money(total, q.currency)}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <label className="flex-1 text-xs">{tr("perfume.quotes.terms", "Terms")}
          <textarea className="block min-h-[56px] w-full rounded-sm border border-[#C6D1DC] p-2 text-xs" defaultValue={q.terms ?? ""} onBlur={(e) => { if (e.target.value !== (q.terms ?? "")) void patch({ terms: e.target.value || null }); }} />
        </label>
        <label className="flex-1 text-xs">{tr("perfume.quotes.notes", "Notes")}
          <textarea className="block min-h-[56px] w-full rounded-sm border border-[#C6D1DC] p-2 text-xs" defaultValue={q.notes ?? ""} onBlur={(e) => { if (e.target.value !== (q.notes ?? "")) void patch({ notes: e.target.value || null }); }} />
        </label>
      </div>
      <ParityTable<PerfumeQuoteEvent>
        title={tr("perfume.quotes.history", "History")}
        rows={q.events}
        rowKey={(e) => e.id}
        storageKey="perfume-quote-history-v1"
          exportFilename="TIO quote history"
          exportExcel
        emptyText="No history yet."
        columns={[
          { key: "created_at", label: "When", render: (e) => new Date(e.created_at).toLocaleString("en-US") },
          { key: "kind", label: "What", render: (e) => EVENT_TEXT[e.kind] ?? e.kind, exportValue: (e) => EVENT_TEXT[e.kind] ?? e.kind },
          { key: "detail", label: "Detail", render: (e) => eventText(e) || DASH, exportValue: (e) => eventText(e) },
          { key: "by_email", label: "By", render: (e) => e.by_email ?? DASH },
        ]}
      />
    </section>
  );
}
