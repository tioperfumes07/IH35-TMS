/**
 * Shared pieces of the perfume documents — quotes, sales orders, purchase orders (owner 2026-11-26 19:12 CT): money and dates
 * the same way everywhere, one history table, one editable quantity / money cell, the item finder, and the links that open
 * one document from another (?tab=…&open=<id>), so every document reaches the ones it came from and the ones it made.
 */
import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { ParityTable } from "../../components/parity/ParityTable";
import { useToast } from "../../components/Toast";
import { userFacingApiError } from "../../lib/api-error-message";
import { ListErrorState } from "../../components/ListErrorState";
import { searchPerfumeQuoteItems, type PerfumeQuoteEvent } from "../../api/perfume";
import { tr } from "./perfumeI18n";

export const DASH = "—";
export const ctl = "h-[34px] rounded-sm border border-[#C6D1DC] bg-white px-2 text-xs";
export const usDate = (d: string | null | undefined) => (d ? `${d.slice(5, 7)}/${d.slice(8, 10)}/${d.slice(0, 4)}` : DASH);
export const money = (c: unknown, cur = "USD") => (c == null || c === "" ? DASH : `${cur === "MXN" ? "MX$" : "$"}${(Number(c) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
/** "$12.50" / "12.5" → 1250 exact (string math). null when not a price. */
export function toCents(v: string): number | null {
  const m = v.replace(/[$,\s]/g, "").match(/^(\d*)(?:\.(\d{0,2}))?$/);
  if (!m || (m[1] === "" && (m[2] ?? "") === "")) return null;
  return Number(m[1] || "0") * 100 + Number((m[2] ?? "").padEnd(2, "0") || "0");
}

/** Opens another desk tab on one document: ?tab=orders&open=<id>. */
export function useOpenDoc() {
  const [params, setParams] = useSearchParams();
  const open = useCallback((tab: string, id: string) => { const n = new URLSearchParams(params); n.set("tab", tab); n.set("open", id); setParams(n); }, [params, setParams]);
  return { openId: params.get("open"), open };
}

export function DocLink({ tab, id, children, testId }: { tab: string; id: string; children: string; testId?: string }) {
  const { open } = useOpenDoc();
  return (
    <button type="button" className="font-semibold text-[#14314F] underline" onClick={(e) => { e.stopPropagation(); open(tab, id); }} data-testid={testId}>
      {children}
    </button>
  );
}

export function Badge({ text, color }: { text: string; color: string }) {
  return <span className={`text-section-header inline-block rounded-sm px-1.5 text-white ${color}`}>{text}</span>;
}

const EVENT_TEXT: Record<string, string> = { created: "Created", edited: "Edited", line_added: "Line added", line_changed: "Line changed", line_removed: "Line taken off",
  status: "Status", exported_xlsx: "Excel made", exported_pdf: "PDF made", copied_from: "Copied from", ordered: "Became an order", shipped: "Shipped",
  received: "Received", purchased: "PO made" };

function eventText(e: PerfumeQuoteEvent): string {
  const d = e.detail ?? {};
  if (e.kind === "status") return `${String(d["from"] ?? "")} → ${String(d["to"] ?? "")}`;
  if (e.kind === "line_added") return `#${String(d["line_no"])} ${String(d["description"] ?? "")} · ${String(d["qty"])} × ${money(d["unit_price_cents"] ?? d["unit_cost_cents"])}`;
  if (e.kind === "line_changed") {
    const to = (d["to"] ?? {}) as Record<string, unknown>;
    const price = to["unit_price_cents"] ?? to["unit_cost_cents"];
    return `#${String(d["line_no"])} ${to["qty"] != null ? `qty ${String(to["qty"])}` : ""} ${price != null ? `price ${money(price)}` : ""}`.trim();
  }
  if (e.kind === "line_removed") return `#${String(d["line_no"])} ${String(d["description"] ?? "")}`;
  if (e.kind === "shipped" || e.kind === "received") return `#${String(d["line_no"])} ${String(d["from"])} → ${String(d["to"])}`;
  if (e.kind === "ordered" || e.kind === "purchased") return String(d["number"] ?? "");
  if (e.kind === "edited") return Array.isArray(d["fields"]) ? (d["fields"] as string[]).join(", ") : d["archived"] ? "archived" : "";
  if (e.kind === "copied_from") return `${String(d["number"] ?? "")} (${String(d["lines"] ?? 0)} lines)`;
  if (e.kind === "created") return [d["customer"], d["from_quote"] ? `from ${String(d["from_quote"])}` : ""].filter(Boolean).join(" ");
  return "";
}

export function HistoryTable({ events, storageKey, exportFilename }: { events: PerfumeQuoteEvent[]; storageKey: string; exportFilename: string }) {
  return (
    <ParityTable<PerfumeQuoteEvent>
      title={tr("perfume.docs.history", "History")}
      rows={events}
      rowKey={(e) => e.id}
      storageKey={storageKey}
      exportFilename={exportFilename}
      exportExcel
      emptyText="No history yet."
      columns={[
        { key: "created_at", label: "When", render: (e) => new Date(e.created_at).toLocaleString("en-US") },
        { key: "kind", label: "What", render: (e) => EVENT_TEXT[e.kind] ?? e.kind, exportValue: (e) => EVENT_TEXT[e.kind] ?? e.kind },
        { key: "detail", label: "Detail", render: (e) => eventText(e) || DASH, exportValue: (e) => eventText(e) },
        { key: "by_email", label: "By", render: (e) => e.by_email ?? DASH },
      ]}
    />
  );
}

/** A whole number or a money amount on a line: saved when the box is left, only when it changed. */
export function NumberCell({ value, money: isMoney, min = 0, label, testId, onSave }: {
  value: number; money?: boolean; min?: number; label: string; testId: string; onSave: (n: number) => Promise<unknown>;
}) {
  const { pushToast } = useToast();
  const start = isMoney ? (value / 100).toFixed(2) : String(value);
  const [v, setV] = useState(start);
  const save = async () => {
    const n = isMoney ? toCents(v) : Number(v);
    if (n == null || !Number.isInteger(n) || n < min) { pushToast(isMoney ? "Type a dollar amount" : `Type a whole number of ${min} or more`, "error"); setV(start); return; }
    if (n === value) return;
    try { await onSave(n); } catch (e) { pushToast(userFacingApiError(e, "Not saved"), "error"); setV(start); }
  };
  return (
    <input className={`${ctl} ${isMoney ? "w-[100px]" : "w-[80px]"} text-right`} aria-label={label} value={v} onChange={(e) => setV(e.target.value)}
      onBlur={() => void save()} onClick={(e) => e.stopPropagation()} data-testid={testId} />
  );
}

/** Find a desk item by name, brand or barcode (each with its best supplier cost). */
export function ItemFinder({ testId, onPick }: { testId: string; onPick: (itemId: string, qty: number) => void }) {
  const { pushToast } = useToast();
  const [find, setFind] = useState("");
  const [qty, setQty] = useState("1");
  const items = useQuery({ queryKey: ["perfume", "doc-items", find], queryFn: () => searchPerfumeQuoteItems(find), enabled: find.trim().length >= 2 });
  const pick = (id: string) => {
    const n = Number(qty);
    if (!Number.isInteger(n) || n < 1) { pushToast("Quantity must be a whole number", "error"); return; }
    setFind(""); onPick(id, n);
  };
  return (
    <div className="relative flex flex-wrap items-center gap-2">
      <input type="search" className={`${ctl} w-full max-w-[460px]`} aria-label={tr("perfume.docs.find_item", "Add an item")} placeholder={tr("perfume.docs.find_item_ph", "Add an item — type a name, brand or barcode")}
        value={find} onChange={(e) => setFind(e.target.value)} data-testid={testId} />
      <label className="text-xs">{tr("perfume.docs.qty", "Qty")} <input className={`${ctl} w-[80px] text-right`} aria-label={tr("perfume.docs.qty", "Qty")} value={qty} onChange={(e) => setQty(e.target.value)} /></label>
      {items.isError ? (
        <div className="w-full max-w-[460px]">
          <ListErrorState title={tr("perfume.docs.find_error", "Couldn't search the items")} status={0} message={(items.error as Error)?.message} onRetry={() => void items.refetch()} />
        </div>
      ) : null}
      {find.trim().length >= 2 && (items.data?.items?.length ?? 0) > 0 ? (
        <div className="absolute top-[38px] z-20 max-h-72 w-full max-w-[460px] overflow-y-auto border border-gray-300 bg-white shadow-lg" role="listbox">
          {items.data!.items.map((it) => (
            <button key={it.id} type="button" role="option" aria-selected={false} className="block w-full px-2 py-1 text-left text-xs hover:bg-gray-100"
              onClick={() => pick(it.id)} data-testid={`${testId}-${it.id}`}>
              <span className="font-semibold">{it.display_name}</span>
              <span className="ml-1 text-[#64748B]">{[it.upc, it.best ? `best cost ${money(it.best.cents)} · ${it.best.vendor}` : "no supplier cost"].filter(Boolean).join(" · ")}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
