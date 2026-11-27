/**
 * PERFUME-ITEM-FILE — the item file and the linkage screen (owner 2026-11-26 22:51 CT: "IN ITEMS, I ALREADY PROVIDED YOU WITH UPCS
 * AND TIO PERFUMES INTERNAL CODES AS WELL AS HK INTERNAL CODES, WE NEED THE ITEM FILE FOR EACH ITEM ETC SO WE CAN EDIT, ETC AND THE
 * LINKAGE SCREEN THAT SHOWS THE ITEM UPC AND LINKED TO AND DESCRIPTIONS TO ALL LINKED").
 *
 * Item file: every item with its TIO code, HK codes and UPCs, my costs and how many lists carry it; open one to edit its name, brand,
 * size, type, gender, TIO code, add or move a UPC / HK code, and see every vendor line linked to it and its full history.
 * Linkage: type a UPC, a TIO / HK / vendor code or words — the item(s) it points to and every line on every current list that carries
 * it, each vendor's own code and description; a line linked elsewhere is linked to the item in one click.
 */
import { useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "../../components/Button";
import { ParityTable } from "../../components/parity/ParityTable";
import { KpiCard } from "../../components/layout/KpiCard";
import { useToast } from "../../components/Toast";
import { ListErrorState } from "../../components/ListErrorState";
import { userFacingApiError } from "../../lib/api-error-message";
import {
  addPerfumeItemHkCode, addPerfumeItemUpc, applyPerfumeFillCodes, applyPerfumeStrictLinks, confirmPerfumeRow, getPerfumeStockLinkage, getPerfumeStrictLinks, linkPerfumeStockItem, downloadPerfumeFile, getPerfumeFillCodes, getPerfumeItemFile, getPerfumeLinkage,
  listPerfumeItemFile, perfumeItemFileExportPath, updatePerfumeItemFile, bulkEditPerfumeItems, listPerfumeCatalogs, addPerfumeCatalogValue, createPerfumeItem, getPerfumeItemOptions,
  type PerfumeItemControl, type PerfumeItemEdit, type PerfumeItemFile, type PerfumeItemFileHas, type PerfumeItemFileRow, type PerfumeItemScope, type PerfumeLinkageLine, type PerfumeStockLinkRow,
} from "../../api/perfume";
import { tr } from "./perfumeI18n";
import { FamilySelect } from "./PerfumeFamiliesPanel";
import { ctl, DASH, DocLink, money, useOpenDoc, usDate } from "./perfumeDocParts";
import { ItemControlFields, VendorSelect } from "./PerfumeItemControlFields";
import { MoneyInput } from "../../components/forms/MoneyInput";

const PAGE = 100;
const CONC = ["", "EDT", "EDP", "PARFUM", "EXTRAIT", "EDC", "MIST"] as const;
const yn = (b: boolean | undefined) => (b === false ? "N" : "Y");
/** The owner's own item lists (Catalogs → Item product types / Item categories), so a value matches what he keeps there. */
export function useItemCatalogs() {
  const q = useQuery({ queryKey: ["perfume", "catalogs"], queryFn: listPerfumeCatalogs, staleTime: 60_000 });
  const of = (k: string) => (q.data?.kinds.find((x) => x.kind === k)?.values ?? []).map((v) => v.value);
  return { types: of("product_type"), categories: of("item_category") };
}

const ADD_NEW = "__add_new__";
/**
 * A pick list on one of his item catalogs with "+ Add new…" at the end (owner 2026-11-27 07:51 CT "we need the creator for lists and
 * catalogs"): typing a new value adds it to that catalog (same rule as the Catalogs screen — no duplicates) and selects it.
 */
function CatalogSelect({ kind, value, options, onChange, head, className, testId, label }: {
  kind: "product_type" | "item_category"; value: string; options: string[]; onChange: (v: string) => void;
  head?: ReactNode; className?: string; testId?: string; label: string;
}) {
  const qc = useQueryClient();
  const { pushToast } = useToast();
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const all = [...new Set([...options, ...(value && !value.startsWith("__") ? [value] : [])])];
  const save = async () => {
    const v = text.trim(); if (!v) return;
    try {
      await addPerfumeCatalogValue({ kind, value: v });
      await qc.invalidateQueries({ queryKey: ["perfume", "catalogs"] });
      pushToast(`"${v}" added to ${kind === "product_type" ? "Item product types" : "Item categories"}`, "success");
    } catch (e) {
      // Already in the list → just use it.
      if (!/already/i.test(userFacingApiError(e, ""))) { pushToast(userFacingApiError(e, "Not added"), "error"); return; }
    }
    onChange(v); setAdding(false); setText("");
  };
  if (adding) return (
    <span className="flex items-center gap-1">
      <input autoFocus className={`${ctl} w-[160px]`} aria-label={`New ${label}`} placeholder={`New ${label.toLowerCase()}`} value={text} onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") void save(); if (e.key === "Escape") setAdding(false); }} data-testid={testId ? `${testId}-new` : undefined} />
      <Button type="button" className="h-[30px] px-2 text-xs" disabled={!text.trim()} onClick={() => void save()}>{tr("perfume.cat.add", "Add")}</Button>
      <button type="button" className="underline" onClick={() => setAdding(false)}>{tr("perfume.cat.cancel", "Cancel")}</button>
    </span>
  );
  return (
    <select className={className ?? `${ctl} block`} aria-label={label} value={value} data-testid={testId}
      onChange={(e) => { if (e.target.value === ADD_NEW) { setAdding(true); setText(""); } else onChange(e.target.value); }}>
      {head ?? <option value="">{DASH}</option>}
      {all.map((x) => <option key={x} value={x}>{x}</option>)}
      <option value={ADD_NEW}>{tr("perfume.cat.add_new", "+ Add new…")}</option>
    </select>
  );
}
const GENDER: Record<string, string> = { M: "Men", W: "Women", U: "Unisex", "": "—" };
const FLAGS = ["TESTER", "SET", "MINI", "REFILL", "DAMAGED", "UNBOXED"] as const;
const KIND: Record<string, string> = { buy: "Supplier", sell: "Competitor", offer: "My offer list", inventory: "My inventory" };
const FOUND: Record<PerfumeLinkageLine["found_by"], string> = { upc: "Same UPC", code: "Same code", item: "Linked to the item", words: "Same words" };
const EVENT: Record<string, string> = { edited: "Edited", attributes: "Model / type / category / description", tio_code: "TIO code", upc_added: "UPC added", upc_moved_in: "UPC moved here", upc_moved_out: "UPC moved away",
  hk_code_added: "HK code added", hk_code_moved_in: "HK code moved here", hk_code_moved_out: "HK code moved away", line_linked: "Line linked", codes_filled: "TIO code from my offer list" };
const fail = (push: (m: string, k: "error") => void, what = "Not saved") => (e: unknown) => push(userFacingApiError(e, what), "error");
const codes = (a: string[] | null | undefined) => (a && a.length ? a.join(", ") : DASH);

/* ------------------------------------------------------------------ the item file */

export function PerfumeItemFilePanel() {
  const { openId, open } = useOpenDoc();
  const [q, setQ] = useState("");
  const [typed, setTyped] = useState("");
  const [has, setHas] = useState<PerfumeItemFileHas | undefined>(undefined);
  // Owner 23:23 CT: "TOGGLE ONLY OUR ITEMS AND THEN ONLY VENDORS OR ALL" — our stock items first.
  const [scope, setScope] = useState<PerfumeItemScope>("mine");
  const [offset, setOffset] = useState(0);
  // Owner 2026-11-27 07:22 CT: "in items list should have multiple selector as well to edit in mass and bulk".
  const [picked, setPicked] = useState<string[]>([]);
  // Owner 2026-11-27 13:41 CT: "i click on an item and it does not take me to the profile" — every item here opens its profile (Items tab),
  // which carries the same editor plus barcodes, vendors' lines, quotes, orders, sites, accounts and history.
  useEffect(() => { if (openId) open("items", openId); }, [openId, open]);
  useEffect(() => { setPicked([]); }, [q, has, scope, offset]);
  const list = useQuery({ queryKey: ["perfume", "item-file", q, has, scope, offset], queryFn: () => listPerfumeItemFile({ q, has, scope, limit: PAGE, offset }) });
  const { pushToast } = useToast();
  if (list.isError) return <ListErrorState title={tr("perfume.itemfile.error", "Couldn't load the item file")} status={0} message={(list.error as Error)?.message} onRetry={() => void list.refetch()} />;
  const c = list.data?.counts;
  const pick = (h: PerfumeItemFileHas | undefined) => { setHas(h); setOffset(0); };
  const total = list.data?.total ?? 0;
  return (
    <div className="space-y-3" data-testid="perfume-itemfile-panel">
      <div className="grid grid-cols-2 gap-[10px] md:grid-cols-6" data-testid="perfume-itemfile-kpis">
        <KpiCard label={tr("perfume.itemfile.kpi_mine", "Our items")} number={(c?.mine ?? 0).toLocaleString("en-US")} onClick={() => { setScope("mine"); pick(undefined); }} />
        <KpiCard label={tr("perfume.itemfile.kpi_vendors", "Vendors' items only")} number={(c?.vendors_only ?? 0).toLocaleString("en-US")} onClick={() => { setScope("vendors"); pick(undefined); }} />
        <KpiCard label={tr("perfume.itemfile.kpi_items", "All items")} number={(c?.items ?? 0).toLocaleString("en-US")} onClick={() => { setScope("all"); pick(undefined); }} />
        <KpiCard label={tr("perfume.itemfile.kpi_tio", "With a TIO code")} number={(c?.with_tio ?? 0).toLocaleString("en-US")} onClick={() => pick("tio")} />
        <KpiCard label={tr("perfume.itemfile.kpi_hk", "With an HK code")} number={(c?.with_hk ?? 0).toLocaleString("en-US")} onClick={() => pick("hk")} />
        <KpiCard label={tr("perfume.itemfile.kpi_upc", "With a UPC")} number={(c?.with_upc ?? 0).toLocaleString("en-US")} onClick={() => pick("upc")} />
      </div>
      <section className="space-y-2 rounded-[3px] border border-[#D8E0E8] bg-white p-3" aria-label={tr("perfume.itemfile.title", "Item file")}>
        <div className="flex flex-wrap items-end gap-2 text-xs">
          <input type="search" className={`${ctl} min-w-[260px] flex-1`} aria-label={tr("perfume.itemfile.search", "Search items")} value={typed}
            placeholder={tr("perfume.itemfile.search_ph", "UPC, description, brand, TIO code or HK code")} onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { setQ(typed); setOffset(0); } }} data-testid="perfume-itemfile-search" />
          <Button type="button" className="h-[34px] px-3 text-xs" onClick={() => { setQ(typed); setOffset(0); }} data-testid="perfume-itemfile-go">{tr("perfume.itemfile.go", "Search")}</Button>
          <span className="flex gap-1" role="group" aria-label={tr("perfume.itemfile.scope", "Whose items")} data-testid="perfume-itemfile-scope">
            {(["mine", "vendors", "all"] as const).map((sc) => (
              <Button key={sc} type="button" variant={scope === sc ? "primary" : "secondary"} className="h-[34px] px-3 text-xs" aria-pressed={scope === sc}
                onClick={() => { setScope(sc); setOffset(0); }} data-testid={`perfume-itemfile-scope-${sc}`}>
                {sc === "mine" ? tr("perfume.itemfile.ours", "Our items") : sc === "vendors" ? tr("perfume.itemfile.vendors", "Vendors only") : tr("perfume.itemfile.all_scope", "All")}
              </Button>))}
          </span>
          <select className={ctl} aria-label={tr("perfume.itemfile.has", "Show")} value={has ?? ""} onChange={(e) => pick((e.target.value || undefined) as PerfumeItemFileHas | undefined)} data-testid="perfume-itemfile-has">
            <option value="">{tr("perfume.itemfile.all", "All items")}</option>
            <option value="tio">{tr("perfume.itemfile.tio", "With a TIO code")}</option>
            <option value="no_tio">{tr("perfume.itemfile.no_tio", "No TIO code")}</option>
            <option value="hk">{tr("perfume.itemfile.hk", "With an HK code")}</option>
            <option value="no_hk">{tr("perfume.itemfile.no_hk", "No HK code")}</option>
            <option value="upc">{tr("perfume.itemfile.upc", "With a UPC")}</option>
            <option value="no_upc">{tr("perfume.itemfile.no_upc", "No UPC")}</option>
            <option value="active">{tr("perfume.itemfile.only_active", "Active items")}</option>
            <option value="inactive">{tr("perfume.itemfile.only_inactive", "Inactive items")}</option>
          </select>
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" data-testid="perfume-itemfile-xlsx"
            onClick={() => void downloadPerfumeFile(perfumeItemFileExportPath({ q, has, scope }), "TIO item file.xlsx").catch(fail(pushToast, "Export failed"))}>{tr("perfume.itemfile.xlsx", "Excel (all matching)")}</Button>
        </div>
        <FillCodes onDone={() => void list.refetch()} />
        {picked.length ? <BulkEdit ids={picked} onDone={() => { setPicked([]); void list.refetch(); }} onClear={() => setPicked([])} /> : null}
        <ParityTable<PerfumeItemFileRow>
          selectable selectedKeys={picked} onSelectionChange={setPicked} maxSelectable={500}
          rows={list.data?.rows ?? []} rowKey={(r) => r.id} loading={list.isLoading} storageKey="perfume-itemfile-v1"
          exportFilename="TIO item file (this page)" exportExcel emptyText="No items match." onRowClick={(r) => open("items", r.id)}
          columns={[
            { className: "text-left", key: "display_name", label: "Item", sortable: true, render: (r) => <DocLink tab="items" id={r.id}>{r.display_name}</DocLink>, exportValue: (r) => r.display_name },
            { className: "text-left", key: "tio_code", label: "TIO code", sortable: true, render: (r) => r.tio_code ?? DASH, exportValue: (r) => r.tio_code ?? "" },
            { className: "text-left", key: "pos_code", label: "POS code", sortable: true, render: (r) => r.pos_code ?? DASH, exportValue: (r) => r.pos_code ?? "" },
            { className: "text-left", key: "ticket_description", label: "Ticket description", render: (r) => r.ticket_description ?? DASH, exportValue: (r) => r.ticket_description ?? "" },
            { className: "text-left", key: "brand", label: "Brand", sortable: true, render: (r) => r.brand || DASH, exportValue: (r) => r.brand ?? "" },
            { className: "text-left", key: "family", label: "Family", sortable: true, render: (r) => (r.family_id ? <DocLink tab="families" id={r.family_id}>{r.family ?? ""}</DocLink> : DASH), exportValue: (r) => r.family ?? "" },
            { className: "text-left", key: "model", label: "Model", sortable: true, render: (r) => r.model ?? DASH, exportValue: (r) => r.model ?? "" },
            { className: "text-left", key: "product_type", label: "Product type", sortable: true, render: (r) => r.product_type ?? DASH, exportValue: (r) => r.product_type ?? "" },
            { className: "text-left", key: "category", label: "Category", sortable: true, render: (r) => r.category ?? DASH, exportValue: (r) => r.category ?? "" },
            { key: "size_ml", label: "Size ml", kind: "number", sortable: true, cellClass: "text-right tabular-nums", render: (r) => (r.size_ml == null ? DASH : String(r.size_ml)), exportValue: (r) => r.size_ml ?? "" },
            { className: "text-left", key: "conc", label: "EDT / EDP / Parfum", sortable: true, render: (r) => r.conc || DASH, exportValue: (r) => r.conc ?? "" },
            { className: "text-left", key: "gender", label: "Gender", sortable: true, render: (r) => GENDER[r.gender ?? ""] ?? DASH, exportValue: (r) => GENDER[r.gender ?? ""] ?? "" },
            { className: "text-left", key: "description", label: "Description", render: (r) => r.description ?? DASH, exportValue: (r) => r.description ?? "" },
            { key: "case_pack", label: "Case pack", kind: "number", sortable: true, cellClass: "text-right tabular-nums", render: (r) => (r.case_pack == null ? DASH : String(r.case_pack)), exportValue: (r) => r.case_pack ?? "" },
            { key: "min_order_qty", label: "Min order", kind: "number", sortable: true, cellClass: "text-right tabular-nums", render: (r) => (r.min_order_qty == null ? DASH : String(r.min_order_qty)), exportValue: (r) => r.min_order_qty ?? "" },
            { className: "text-left", key: "origin_country", label: "Origin", sortable: true, render: (r) => r.origin_country ?? DASH, exportValue: (r) => r.origin_country ?? "" },
            { className: "text-left", key: "hs_code", label: "HS code", sortable: true, render: (r) => r.hs_code ?? DASH, exportValue: (r) => r.hs_code ?? "" },
            { className: "text-left", key: "sold_by", label: "Sold by", sortable: true, render: (r) => (r.sold_by === "pack" ? `Pack of ${r.units_per_pack ?? "?"}` : "Piece"), exportValue: (r) => (r.sold_by === "pack" ? "Pack" : "Piece") },
            { key: "units_per_pack", label: "Units / pack", kind: "number", sortable: true, cellClass: "text-right tabular-nums", render: (r) => (r.units_per_pack == null ? DASH : String(r.units_per_pack)), exportValue: (r) => r.units_per_pack ?? "" },
            { className: "text-left", key: "preferred_vendor", label: "Preferred vendor", sortable: true, render: (r) => r.preferred_vendor ?? DASH, exportValue: (r) => r.preferred_vendor ?? "" },
            { className: "text-left", key: "is_stock_item", label: "Stock item", sortable: true, render: (r) => yn(r.is_stock_item), exportValue: (r) => yn(r.is_stock_item) },
            { className: "text-left", key: "is_active", label: "Active", sortable: true, render: (r) => yn(r.is_active), exportValue: (r) => yn(r.is_active) },
            { key: "special_price_cents", label: "Special price", kind: "number", sortable: true, cellClass: "text-right tabular-nums", render: (r) => money(r.special_price_cents ?? null), exportValue: (r) => (r.special_price_cents == null ? "" : r.special_price_cents / 100) },
            { key: "min_price_cents", label: "Minimum price", kind: "number", sortable: true, cellClass: "text-right tabular-nums", render: (r) => money(r.min_price_cents ?? null), exportValue: (r) => (r.min_price_cents == null ? "" : r.min_price_cents / 100) },
            { className: "text-left", key: "price_locked", label: "Change price", sortable: true, render: (r) => yn(!r.price_locked), exportValue: (r) => yn(!r.price_locked) },
            { className: "text-left", key: "is_exclusive", label: "Exclusive", sortable: true, render: (r) => (r.is_exclusive ? "Y" : "N"), exportValue: (r) => (r.is_exclusive ? "Y" : "N") },
            { className: "text-left", key: "is_new_launch", label: "New launch", sortable: true, render: (r) => (r.is_new_launch ? "Y" : "N"), exportValue: (r) => (r.is_new_launch ? "Y" : "N") },
            { className: "text-left", key: "hk_codes", label: "HK codes", render: (r) => codes(r.hk_codes), exportValue: (r) => r.hk_codes.join(", ") },
            { className: "text-left", key: "upcs", label: "UPCs", render: (r) => codes(r.upcs), exportValue: (r) => r.upcs.join(", ") },
            { key: "lists_linked", label: "Lists linked", kind: "number", sortable: true, cellClass: "text-right tabular-nums", render: (r) => r.lists_linked.toLocaleString("en-US") },
            { key: "best_cost_cents", label: "Best supplier cost", kind: "number", sortable: true, cellClass: "text-right tabular-nums", render: (r) => money(r.best_cost_cents), exportValue: (r) => (r.best_cost_cents == null ? "" : r.best_cost_cents / 100) },
            { key: "my_avg_cost_cents", label: "My avg cost", kind: "number", sortable: true, cellClass: "text-right tabular-nums", render: (r) => money(r.my_avg_cost_cents), exportValue: (r) => (r.my_avg_cost_cents == null ? "" : r.my_avg_cost_cents / 100) },
            { key: "my_last_cost_cents", label: "My last cost", kind: "number", sortable: true, cellClass: "text-right tabular-nums", render: (r) => money(r.my_last_cost_cents), exportValue: (r) => (r.my_last_cost_cents == null ? "" : r.my_last_cost_cents / 100) },
          ]}
        />
        <div className="flex flex-wrap items-center gap-2 text-xs" data-testid="perfume-itemfile-pager">
          <Button type="button" variant="secondary" className="h-[30px] px-2 text-xs" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>{tr("perfume.itemfile.prev", "Previous 100")}</Button>
          <span>{total ? `${(offset + 1).toLocaleString("en-US")}–${Math.min(offset + PAGE, total).toLocaleString("en-US")} of ${total.toLocaleString("en-US")}` : "0"}</span>
          <Button type="button" variant="secondary" className="h-[30px] px-2 text-xs" disabled={offset + PAGE >= total} onClick={() => setOffset(offset + PAGE)}>{tr("perfume.itemfile.next", "Next 100")}</Button>
        </div>
      </section>
    </div>
  );
}

/** TIO codes from my offer list (its code column): shows how many it would fill, fills only when pressed. */
function FillCodes({ onDone }: { onDone: () => void }) {
  const { pushToast } = useToast();
  const p = useQuery({ queryKey: ["perfume", "item-file", "fill-codes"], queryFn: getPerfumeFillCodes });
  if (p.isError) return <span className="text-xs text-[#9B2C2C]" role="alert">{tr("perfume.itemfile.fill_error", "Couldn't read the codes on my offer list — try again.")}</span>;
  if (!p.data || p.data.will_fill === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs" data-testid="perfume-itemfile-fill">
      <span>{`${tr("perfume.itemfile.fill_text", "My offer list carries TIO codes for items that have none here:")} ${p.data.will_fill.toLocaleString("en-US")} ${tr("perfume.itemfile.fill_of", "of")} ${p.data.codes_on_list.toLocaleString("en-US")}.`}</span>
      <Button type="button" className="h-[30px] px-2 text-xs" data-testid="perfume-itemfile-fill-apply"
        onClick={() => void applyPerfumeFillCodes().then((r) => { pushToast(`${r.filled.toLocaleString("en-US")} TIO codes filled`, "success"); void p.refetch(); onDone(); }).catch(fail(pushToast))}>
        {tr("perfume.itemfile.fill", "Fill TIO codes from my offer list")}
      </Button>
    </div>
  );
}

/** The one item editor — the Item file tab and every item profile (PerfumeProfilesPanel ItemProfile) render this same form. */
export function ItemFileEditor({ id, onChanged, onClose }: { id: string; onChanged: () => void; onClose?: () => void }) {
  const { pushToast } = useToast();
  const { open } = useOpenDoc();
  const f = useQuery({ queryKey: ["perfume", "item-file", "one", id], queryFn: () => getPerfumeItemFile(id) });
  const [edit, setEdit] = useState<PerfumeItemEdit>({});
  const [upc, setUpc] = useState("");
  const [hk, setHk] = useState("");
  const cats = useItemCatalogs();
  useEffect(() => { setEdit({}); }, [id]);
  if (f.isError) return <ListErrorState title={tr("perfume.itemfile.one_error", "Couldn't load the item")} status={0} message={(f.error as Error)?.message} onRetry={() => void f.refetch()} />;
  if (!f.data) return null;
  if ("merged_into_id" in f.data) {
    const to = f.data.merged_into_id;
    return <div className="text-xs">{tr("perfume.itemfile.merged", "This item was merged into another one.")} <Button type="button" variant="secondary" className="h-[28px] px-2 text-xs" onClick={() => open("itemfile", to)}>{tr("perfume.itemfile.open_it", "Open it")}</Button></div>;
  }
  const x: PerfumeItemFile = f.data;
  const it = x.item;
  const val = <K extends keyof PerfumeItemEdit>(k: K, fallback: PerfumeItemEdit[K]) => (edit[k] !== undefined ? edit[k] : fallback);
  const flags = val("flags", it.flags ?? []) ?? [];
  const run = (fn: () => Promise<unknown>, ok: string) => void fn().then(async () => { await f.refetch(); onChanged(); pushToast(ok, "success"); }).catch(fail(pushToast));
  const save = () => {
    if (!Object.keys(edit).length) { pushToast("Nothing changed", "error"); return; }
    run(() => updatePerfumeItemFile(id, edit).then(() => setEdit({})), "Item saved");
  };
  return (
    <section className="space-y-3 rounded-[3px] border border-[#D8E0E8] bg-white p-3" data-testid="perfume-itemfile-editor" aria-label={it.display_name}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-section-header">{it.display_name}</div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" onClick={() => open("linkage", x.upcs[0] ?? it.internal_code ?? it.display_name)} data-testid="perfume-itemfile-linkage">{tr("perfume.itemfile.to_linkage", "Linkage")}</Button>
          {onClose ? <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" onClick={onClose}>{tr("perfume.itemfile.close", "Close")}</Button> : null}
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-2 text-xs" data-testid="perfume-itemfile-fields">
        <label>{tr("perfume.itemfile.tio_code", "TIO code")} <input className={`${ctl} block w-[120px]`} value={val("tio_code", it.internal_code) ?? ""} onChange={(e) => setEdit({ ...edit, tio_code: e.target.value || null })} data-testid="perfume-itemfile-tio" /></label>
        <label>{tr("perfume.itemfile.brand", "Brand")} <input className={`${ctl} block w-[160px]`} value={val("brand", it.brand) ?? ""} onChange={(e) => setEdit({ ...edit, brand: e.target.value })} data-testid="perfume-itemfile-brand" /></label>
        <label>{tr("perfume.itemfile.name", "Name")} <input className={`${ctl} block w-[260px]`} value={val("name", it.name) ?? ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} data-testid="perfume-itemfile-name" /></label>
        <label>{tr("perfume.itemfile.size", "Size ml")} <input type="number" className={`${ctl} block w-[80px] text-right`} value={val("size_ml", it.size_ml == null ? null : Number(it.size_ml)) ?? ""}
          onChange={(e) => setEdit({ ...edit, size_ml: e.target.value === "" ? null : Number(e.target.value) })} data-testid="perfume-itemfile-size" /></label>
        <label>{tr("perfume.itemfile.conc", "EDT / EDP / Parfum")}
          <select className={`${ctl} block`} value={val("conc", it.conc ?? "") ?? ""} onChange={(e) => setEdit({ ...edit, conc: e.target.value })} data-testid="perfume-itemfile-conc">
            {CONC.map((v) => <option key={v} value={v}>{v || DASH}</option>)}
          </select>
        </label>
        <label>{tr("perfume.itemfile.model", "Model")} <input className={`${ctl} block w-[180px]`} value={val("model", it.model ?? null) ?? ""} onChange={(e) => setEdit({ ...edit, model: e.target.value })} data-testid="perfume-itemfile-model" /></label>
        <label>{tr("perfume.itemfile.family", "Family")}
          <FamilySelect value={val("family_id", it.family_id ?? null) ?? ""} brand={it.brand} onChange={(x) => setEdit({ ...edit, family_id: x || null })} testId="perfume-itemfile-family" />
        </label>
        <label>{tr("perfume.itemfile.product_type", "Product type")}
          <CatalogSelect kind="product_type" label="Product type" value={val("product_type", it.product_type ?? null) ?? ""} options={cats.types} onChange={(x) => setEdit({ ...edit, product_type: x })} testId="perfume-itemfile-product-type" />
        </label>
        <label>{tr("perfume.itemfile.category", "Category")}
          <CatalogSelect kind="item_category" label="Category" value={val("category", it.category ?? null) ?? ""} options={cats.categories} onChange={(x) => setEdit({ ...edit, category: x })} testId="perfume-itemfile-category" />
        </label>
        <label>{tr("perfume.itemfile.gender", "Gender")}
          <select className={`${ctl} block`} value={val("gender", it.gender ?? "") ?? ""} onChange={(e) => setEdit({ ...edit, gender: e.target.value })} data-testid="perfume-itemfile-gender">
            {Object.entries(GENDER).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
          </select>
        </label>
        <label>{tr("perfume.itemfile.flags", "Flags")}
          <FlagsSelect value={flags} onChange={(x) => setEdit({ ...edit, flags: x })} testId="perfume-itemfile-flag" />
        </label>
        <label>{tr("perfume.itemfile.case_pack", "Case pack")} <input type="number" min={1} className={`${ctl} block w-[80px] text-right`} value={val("case_pack", it.case_pack ?? null) ?? ""}
          onChange={(e) => setEdit({ ...edit, case_pack: e.target.value === "" ? null : Number(e.target.value) })} data-testid="perfume-itemfile-case-pack" /></label>
        <label>{tr("perfume.itemfile.moq", "Min order")} <input type="number" min={1} className={`${ctl} block w-[80px] text-right`} value={val("min_order_qty", it.min_order_qty ?? null) ?? ""}
          onChange={(e) => setEdit({ ...edit, min_order_qty: e.target.value === "" ? null : Number(e.target.value) })} data-testid="perfume-itemfile-moq" /></label>
        <label>{tr("perfume.itemfile.weight", "Weight g")} <input type="number" min={0} className={`${ctl} block w-[80px] text-right`} value={val("weight_g", it.weight_g ?? null) ?? ""}
          onChange={(e) => setEdit({ ...edit, weight_g: e.target.value === "" ? null : Number(e.target.value) })} data-testid="perfume-itemfile-weight" /></label>
        <label>{tr("perfume.itemfile.origin", "Origin")} <input maxLength={2} className={`${ctl} block w-[60px] uppercase`} placeholder="FR" value={val("origin_country", it.origin_country ?? null) ?? ""}
          onChange={(e) => setEdit({ ...edit, origin_country: e.target.value.toUpperCase() || null })} data-testid="perfume-itemfile-origin" /></label>
        <label>{tr("perfume.itemfile.hs", "HS code")} <input className={`${ctl} block w-[110px]`} placeholder="3303.00" value={val("hs_code", it.hs_code ?? null) ?? ""}
          onChange={(e) => setEdit({ ...edit, hs_code: e.target.value || null })} data-testid="perfume-itemfile-hs" /></label>
        <label className="w-full">{tr("perfume.itemfile.description", "Description")}
          <textarea className={`${ctl} block h-16 w-full py-1`} maxLength={2000} value={val("description", it.description ?? null) ?? ""} onChange={(e) => setEdit({ ...edit, description: e.target.value })} data-testid="perfume-itemfile-description" />
        </label>
      </div>
      <ItemControlFields prefix="perfume-itemfile" value={it} edit={edit} onChange={(p) => setEdit({ ...edit, ...p })} />
      <div className="flex justify-end">
        <Button type="button" className="h-[34px] px-3 text-xs" disabled={!Object.keys(edit).length} onClick={save} data-testid="perfume-itemfile-save">{tr("perfume.itemfile.save", "Save")}</Button>
      </div>
      <div className="text-xs">{`${tr("perfume.itemfile.costs", "My avg cost")} ${money(x.costs.my_avg_cost_cents)} · ${tr("perfume.itemfile.last", "My last cost")} ${money(x.costs.my_last_cost_cents)} · ${tr("perfume.itemfile.best", "Best supplier cost")} ${money(x.best_cost_cents)}`}</div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-end gap-2 text-xs">
            <label>{tr("perfume.itemfile.add_upc", "Add / move a UPC here")} <input className={`${ctl} block w-[180px]`} value={upc} onChange={(e) => setUpc(e.target.value)} data-testid="perfume-itemfile-upc-input" /></label>
            <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" disabled={!upc.trim()} data-testid="perfume-itemfile-upc-add"
              onClick={() => run(() => addPerfumeItemUpc(id, upc).then((r) => { setUpc(""); if (r.moved_from) pushToast("UPC moved from another item — its file says so", "success"); }), "UPC on the item")}>{tr("perfume.itemfile.add", "Add")}</Button>
          </div>
          <ParityTable<{ upc: string }> title={tr("perfume.itemfile.upcs", "UPCs")} rows={x.upcs.map((u) => ({ upc: u }))} rowKey={(r) => r.upc} storageKey="perfume-itemfile-upcs-v1"
            exportFilename="TIO item UPCs" exportExcel emptyText="No UPC — add one above."
            columns={[{ className: "text-left", key: "upc", label: "UPC", render: (r) => <button type="button" className="underline" onClick={() => open("linkage", r.upc)}>{r.upc}</button>, exportValue: (r) => r.upc }]} />
        </div>
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-end gap-2 text-xs">
            <label>{tr("perfume.itemfile.add_hk", "Add / move an HK code here")} <input className={`${ctl} block w-[160px]`} value={hk} onChange={(e) => setHk(e.target.value)} data-testid="perfume-itemfile-hk-input" /></label>
            <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" disabled={!hk.trim()} data-testid="perfume-itemfile-hk-add"
              onClick={() => run(() => addPerfumeItemHkCode(id, hk).then((r) => { setHk(""); if (r.moved_from) pushToast("HK code moved from another item — its file says so", "success"); }), "HK code on the item")}>{tr("perfume.itemfile.add", "Add")}</Button>
          </div>
          <ParityTable<PerfumeItemFile["hk_codes"][number]> title={tr("perfume.itemfile.hk_codes", "HK codes")} rows={x.hk_codes} rowKey={(r) => r.id} storageKey="perfume-itemfile-hk-v1"
            exportFilename="TIO item HK codes" exportExcel emptyText="No HK code — add one above."
            columns={[
              { className: "text-left", key: "sku", label: "HK code", render: (r) => <button type="button" className="underline" onClick={() => open("linkage", r.sku)}>{r.sku}</button>, exportValue: (r) => r.sku },
              { className: "text-left", key: "list", label: "From my list", render: (r) => r.list },
              { className: "text-left", key: "method", label: "Linked", render: (r) => (r.method === "confirmed" ? "By me" : "By the desk"), exportValue: (r) => (r.method === "confirmed" ? "By me" : "By the desk") },
            ]} />
        </div>
      </div>
      <ParityTable<PerfumeItemFile["vendor_lines"][number]>
        title={tr("perfume.itemfile.linked", "Every line linked to this item (current lists)")} rows={x.vendor_lines} rowKey={(l) => l.id} storageKey="perfume-itemfile-lines-v1"
        exportFilename="TIO item linked lines" exportExcel emptyText="No list carries this item."
        columns={[
          { className: "text-left", key: "vendor", label: "List", render: (l) => <DocLink tab="suppliers" id={l.vendor_id}>{l.vendor}</DocLink>, exportValue: (l) => l.vendor },
          { className: "text-left", key: "kind", label: "Kind", render: (l) => KIND[l.kind] ?? l.kind, exportValue: (l) => KIND[l.kind] ?? l.kind },
          { className: "text-left", key: "sku", label: "Their code", render: (l) => l.sku ?? DASH, exportValue: (l) => l.sku ?? "" },
          { className: "text-left", key: "upc", label: "Their UPC", render: (l) => l.upc ?? DASH, exportValue: (l) => l.upc ?? "" },
          { className: "text-left", key: "description", label: "Their description", render: (l) => [l.brand, l.description, l.size_text].filter(Boolean).join(" "), exportValue: (l) => [l.brand, l.description, l.size_text].filter(Boolean).join(" ") },
          { key: "price_cents", label: "Price", kind: "number", cellClass: "text-right tabular-nums", render: (l) => money(l.price_cents), exportValue: (l) => (l.price_cents == null ? "" : l.price_cents / 100) },
          { key: "list_date", label: "List date", cellClass: "text-right tabular-nums", render: (l) => usDate(l.list_date) },
        ]}
      />
      <ParityTable<PerfumeItemFile["events"][number]>
        title={tr("perfume.itemfile.history", "History")} rows={x.events} rowKey={(e) => e.id} storageKey="perfume-itemfile-history-v1" exportFilename="TIO item history" exportExcel emptyText="No changes yet."
        columns={[
          { key: "created_at", label: "When", cellClass: "text-right tabular-nums", render: (e) => new Date(e.created_at).toLocaleString("en-US", { timeZone: "America/Chicago" }) },
          { className: "text-left", key: "kind", label: "What", render: (e) => EVENT[e.kind] ?? e.kind, exportValue: (e) => EVENT[e.kind] ?? e.kind },
          { className: "text-left", key: "detail", label: "Detail", render: (e) => JSON.stringify(e.detail), exportValue: (e) => JSON.stringify(e.detail) },
          { className: "text-left", key: "by_email", label: "By", render: (e) => e.by_email ?? DASH },
        ]}
      />
    </section>
  );
}

/* ------------------------------------------------------------------ the linkage screen */

export function PerfumeLinkagePanel() {
  const { pushToast } = useToast();
  const { openId } = useOpenDoc();
  const [typed, setTyped] = useState(openId ?? "");
  const [q, setQ] = useState(openId ?? "");
  useEffect(() => { if (openId) { setTyped(openId); setQ(openId); } }, [openId]);
  const lk = useQuery({ queryKey: ["perfume", "linkage", q], queryFn: () => getPerfumeLinkage(q), enabled: q.trim().length > 0 });
  if (lk.isError) return <ListErrorState title={tr("perfume.linkage.error", "Couldn't load the linkage")} status={0} message={(lk.error as Error)?.message} onRetry={() => void lk.refetch()} />;
  const d = lk.data;
  const target = d?.items.length === 1 ? d.items[0]! : null;
  const linkTo = (l: PerfumeLinkageLine) => {
    if (!target) return;
    void confirmPerfumeRow(l.line_id, { item_id: target.id }).then((r) => { pushToast(`Linked — ${r.rows_linked} line(s) of ${l.vendor}`, "success"); void lk.refetch(); }).catch(fail(pushToast, "Not linked"));
  };
  return (
    <div className="space-y-3" data-testid="perfume-linkage-panel">
      <section className="space-y-2 rounded-[3px] border border-[#D8E0E8] bg-white p-3" aria-label={tr("perfume.linkage.title", "Linkage")}>
        <div className="flex flex-wrap items-end gap-2 text-xs">
          <input type="search" className={`${ctl} min-w-[280px] flex-1`} aria-label={tr("perfume.linkage.search", "UPC, code or words")} value={typed}
            placeholder={tr("perfume.linkage.search_ph", "UPC, TIO code, HK code, a vendor's code or words")} onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") setQ(typed); }} data-testid="perfume-linkage-search" />
          <Button type="button" className="h-[34px] px-3 text-xs" onClick={() => setQ(typed)} data-testid="perfume-linkage-go">{tr("perfume.linkage.go", "Show the links")}</Button>
        </div>
        {d ? (
          <div className="text-xs" data-testid="perfume-linkage-items">
            {d.items.length
              ? d.items.map((i) => <div key={i.id}>{tr("perfume.linkage.points_to", "Points to")} <DocLink tab="itemfile" id={i.id}>{i.display_name}</DocLink>{` · TIO ${i.tio_code ?? DASH} · UPC ${codes(i.upcs)}`}</div>)
              : tr("perfume.linkage.no_item", "No item carries this UPC / code — the lines below match it on the lists.")}
          </div>) : null}
        <ParityTable<PerfumeLinkageLine>
          rows={d?.lines ?? []} rowKey={(l) => `${l.line_id}-${l.item_id}`} loading={lk.isLoading && q.length > 0} storageKey="perfume-linkage-v1" exportFilename={`TIO linkage ${q}`} exportExcel
          emptyText={q ? "No line on a current list carries it." : "Type a UPC, a code or words above."}
          columns={[
            { className: "text-left", key: "found_by", label: "Found by", render: (l) => FOUND[l.found_by], exportValue: (l) => FOUND[l.found_by] },
            { className: "text-left", key: "vendor", label: "List", render: (l) => <DocLink tab="suppliers" id={l.vendor_id}>{l.vendor}</DocLink>, exportValue: (l) => l.vendor },
            { className: "text-left", key: "kind", label: "Kind", render: (l) => KIND[l.kind] ?? l.kind, exportValue: (l) => KIND[l.kind] ?? l.kind },
            { className: "text-left", key: "sku", label: "Their code", render: (l) => l.sku ?? DASH, exportValue: (l) => l.sku ?? "" },
            { className: "text-left", key: "upc", label: "Their UPC", render: (l) => l.upc ?? DASH, exportValue: (l) => l.upc ?? "" },
            { className: "text-left", key: "description", label: "Their description", render: (l) => [l.brand, l.description, l.size_text].filter(Boolean).join(" "), exportValue: (l) => [l.brand, l.description, l.size_text].filter(Boolean).join(" ") },
            { key: "price_cents", label: "Price", kind: "number", cellClass: "text-right tabular-nums", render: (l) => money(l.price_cents), exportValue: (l) => (l.price_cents == null ? "" : l.price_cents / 100) },
            { className: "text-left", key: "item", label: "Linked to", render: (l) => (l.item_id && l.item ? <DocLink tab="itemfile" id={l.item_id}>{l.item}</DocLink> : tr("perfume.linkage.not_linked", "Not linked")), exportValue: (l) => l.item ?? "" },
            { key: "list_date", label: "List date", cellClass: "text-right tabular-nums", render: (l) => usDate(l.list_date) },
            { className: "text-left", key: "act", label: "", render: (l) => (target && l.item_id !== target.id
              ? <Button type="button" variant="secondary" className="h-[28px] px-2 text-xs" onClick={() => linkTo(l)} data-testid={`perfume-linkage-link-${l.line_id}`}>{tr("perfume.linkage.link", "Link to this item")}</Button> : null) },
          ]}
        />
      </section>
    </div>
  );
}

/**
 * Stock linkage (owner 2026-11-27 06:19 CT: "I think you need to confirm all those perfumes correctly to upcs and vendors"). Every
 * item on HIS lists that no supplier or competitor line points to, with up to five same-bottle candidates (same size, same kind,
 * gender / type not contradicting). One click links his item onto the vendors' item — his lines, UPCs, HK codes, TIO code and avg
 * cost go with it, and his next import finds it by the HK code. The strict pairs (same words and brand, one-to-one) are shown in
 * full before he presses to link them all.
 */
export function PerfumeStockLinkagePanel() {
  const { pushToast } = useToast();
  const [typed, setTyped] = useState("");
  const [q, setQ] = useState("");
  const [all, setAll] = useState(false);
  const [offset, setOffset] = useState(0);
  const [showStrict, setShowStrict] = useState(false);
  const [busy, setBusy] = useState(false);
  const sq = useQuery({ queryKey: ["perfume", "stock-linkage", q, all, offset], queryFn: () => getPerfumeStockLinkage({ q: q || undefined, perfumes_only: !all, limit: 50, offset }) });
  const strict = useQuery({ queryKey: ["perfume", "stock-linkage-strict"], queryFn: getPerfumeStrictLinks, enabled: showStrict });
  if (sq.isError) return <ListErrorState title={tr("perfume.stock_link.error", "Couldn't load the stock linkage")} status={0} message={(sq.error as Error)?.message} onRetry={() => void sq.refetch()} />;
  const d = sq.data;
  const link = (from: string, to: string) => {
    setBusy(true);
    void linkPerfumeStockItem(from, to).then((r) => { pushToast(`Linked to ${r.into} — ${r.lines} line(s) of your lists moved`, "success"); void sq.refetch(); })
      .catch(fail(pushToast, "Not linked")).finally(() => setBusy(false));
  };
  const applyStrict = () => {
    setBusy(true);
    void applyPerfumeStrictLinks().then((r) => { pushToast(`Linked ${r.linked} item(s)`, "success"); setShowStrict(false); void sq.refetch(); void strict.refetch(); })
      .catch(fail(pushToast, "Not linked")).finally(() => setBusy(false));
  };
  return (
    <div className="space-y-3" data-testid="perfume-stock-linkage-panel">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <KpiCard label={tr("perfume.stock_link.mine", "Our items")} number={d ? d.mine.toLocaleString("en-US") : DASH} disabled disabledReason="Every item on your inventory and offer lists — the list below is the ones not linked yet" />
        <KpiCard label={tr("perfume.stock_link.linked", "Linked to a vendor")} number={d ? d.linked.toLocaleString("en-US") : DASH} disabled disabledReason="Already on at least one supplier or competitor line — open any in the item file" />
        <KpiCard label={tr("perfume.stock_link.open", "Not linked yet")} number={d ? (d.mine - d.linked).toLocaleString("en-US") : DASH} onClick={() => { setTyped(""); setQ(""); setAll(true); setOffset(0); }} />
        <KpiCard label={tr("perfume.stock_link.shown", "Matching this search")} number={d ? d.total.toLocaleString("en-US") : DASH} onClick={() => setOffset(0)} />
      </div>
      <section className="space-y-2 rounded-[3px] border border-[#D8E0E8] bg-white p-3" aria-label={tr("perfume.stock_link.title", "Stock linkage")}>
        <div className="flex flex-wrap items-end gap-2 text-xs">
          <input type="search" className={`${ctl} min-w-[260px] flex-1`} aria-label={tr("perfume.stock_link.search", "Search our items")} value={typed}
            placeholder={tr("perfume.stock_link.search_ph", "Words of our item")} onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { setOffset(0); setQ(typed); } }} data-testid="perfume-stock-link-search" />
          <Button type="button" className="h-[34px] px-3 text-xs" onClick={() => { setOffset(0); setQ(typed); }} data-testid="perfume-stock-link-go">{tr("perfume.stock_link.go", "Search")}</Button>
          <label className="flex items-center gap-1"><input type="checkbox" checked={all} onChange={(e) => { setOffset(0); setAll(e.target.checked); }} data-testid="perfume-stock-link-all" />
            {tr("perfume.stock_link.all", "Include items with no size and mixed lots")}</label>
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" onClick={() => setShowStrict((v) => !v)} data-testid="perfume-stock-link-strict">
            {showStrict ? tr("perfume.stock_link.strict_hide", "Hide the sure matches") : tr("perfume.stock_link.strict_show", "Show the sure matches")}</Button>
        </div>
        {showStrict ? (
          <div className="space-y-2 border-t border-[#D8E0E8] pt-2" data-testid="perfume-stock-link-strict-list">
            <div className="text-xs">{tr("perfume.stock_link.strict_rule", "Same words (EDP / EDT / for him / pour homme ignored), same brand, same size, same kind, and one-to-one — nothing else fits either side.")}</div>
            <ParityTable<{ mine_id: string; mine: string; vend_id: string; vend: string }>
              rows={strict.data?.pairs ?? []} rowKey={(p) => p.mine_id} loading={strict.isLoading} storageKey="perfume-stock-strict-v1" exportFilename="TIO sure matches" exportExcel
              emptyText="No sure match left."
              columns={[
                { className: "text-left", key: "mine", label: "Our item", render: (p) => <DocLink tab="itemfile" id={p.mine_id}>{p.mine}</DocLink>, exportValue: (p) => p.mine },
                { className: "text-left", key: "vend", label: "Vendors' item", render: (p) => <DocLink tab="itemfile" id={p.vend_id}>{p.vend}</DocLink>, exportValue: (p) => p.vend },
                { key: "as_of", label: "As of", cellClass: "text-right tabular-nums", render: () => usDate(new Date().toISOString().slice(0, 10)) },
              ]}
            />
            {strict.data?.pairs.length ? (
              <Button type="button" className="h-[32px] px-3 text-xs" disabled={busy} onClick={applyStrict} data-testid="perfume-stock-link-strict-apply">
                {`Link these ${strict.data.pairs.length}`}</Button>) : null}
          </div>) : null}
        <ParityTable<PerfumeStockLinkRow>
          rows={d?.rows ?? []} rowKey={(r) => r.id} loading={sq.isLoading} storageKey="perfume-stock-linkage-v1" exportFilename="TIO stock linkage" exportExcel
          emptyText="Every one of our items here is linked to a vendor."
          columns={[
            { className: "text-left", key: "display_name", label: "Our item", render: (r) => <DocLink tab="itemfile" id={r.id}>{r.display_name}</DocLink>, exportValue: (r) => r.display_name },
            { className: "text-left", key: "hk", label: "HK code", render: (r) => r.hk ?? DASH, exportValue: (r) => r.hk ?? "" },
            { className: "text-left", key: "my_desc", label: "My description", render: (r) => r.my_desc ?? DASH, exportValue: (r) => r.my_desc ?? "" },
            { className: "text-left", key: "upcs", label: "UPC", render: (r) => codes(r.upcs ?? []), exportValue: (r) => (r.upcs ?? []).join(", ") },
            { className: "text-left", key: "candidates", label: "Same bottle on the vendors' lists", exportValue: (r) => r.candidates.map((c) => c.display_name).join(" | "),
              render: (r) => (r.candidates.length ? (
                <div className="space-y-1">
                  {r.candidates.map((c) => (
                    <div key={c.id} className="flex flex-wrap items-center gap-2" data-testid={`perfume-stock-cand-${r.id}-${c.id}`}>
                      <Button type="button" variant="secondary" className="h-[26px] px-2 text-xs" disabled={busy} onClick={() => link(r.id, c.id)} data-testid={`perfume-stock-link-${r.id}-${c.id}`}>
                        {tr("perfume.stock_link.link", "Link")}</Button>
                      <DocLink tab="itemfile" id={c.id}>{c.display_name}</DocLink>
                      <span className="text-[#5A6B7B]">{[c.exact ? "same words" : `${Math.round(c.score * 100)}% alike`, c.same_brand ? "same brand" : null, `${c.lists} list(s)`,
                        c.best_cents != null ? `best cost ${money(c.best_cents)}` : null, c.upcs?.length ? `UPC ${c.upcs.join(", ")}` : null, c.sample].filter(Boolean).join(" · ")}</span>
                    </div>))}
                </div>) : tr("perfume.stock_link.none", "No same-size, same-kind item on the vendors' lists — open the linkage screen and search by UPC or words.")) },
            { key: "as_of", label: "As of", cellClass: "text-right tabular-nums", render: () => usDate(new Date().toISOString().slice(0, 10)) },
          ]}
        />
        <div className="flex items-center gap-2 text-xs">
          <Button type="button" variant="secondary" className="h-[28px] px-2 text-xs" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 50))} data-testid="perfume-stock-link-prev">{tr("perfume.stock_link.prev", "Previous")}</Button>
          <span>{d ? `${d.total ? offset + 1 : 0}–${Math.min(offset + 50, d.total)} of ${d.total.toLocaleString()}` : ""}</span>
          <Button type="button" variant="secondary" className="h-[28px] px-2 text-xs" disabled={!d || offset + 50 >= d.total} onClick={() => setOffset(offset + 50)} data-testid="perfume-stock-link-next">{tr("perfume.stock_link.next", "Next")}</Button>
        </div>
      </section>
    </div>
  );
}

/**
 * Bulk edit (owner 2026-11-27 07:22 CT): the same change on every checked item. Only the fields filled here change; a blank field is
 * left alone (choose "Clear" to empty it). Flags are added or removed. All or nothing — if one item cannot take it, nothing is saved
 * and the message names that item. Every item keeps its own history line.
 */
function BulkEdit({ ids, onDone, onClear }: { ids: string[]; onDone: () => void; onClear: () => void }) {
  const { pushToast } = useToast();
  const cats = useItemCatalogs();
  const CLEAR = "__clear__";
  const [v, setV] = useState({ brand: "", model: "", product_type: "", category: "", conc: "", gender: "", size: "", description: "", flag: "", flagMode: "add" as "add" | "remove", family: "", case_pack: "", moq: "", origin: "", hs: "",
    vendor: "", stock: "", active: "", change_price: "", exclusive: "", new_launch: "" });
  const [minCents, setMinCents] = useState<number | null>(null);
  const [clearMin, setClearMin] = useState(false);
  const [busy, setBusy] = useState(false);
  const txt = (x: string) => (x === CLEAR ? null : x.trim() || undefined);
  const apply = async () => {
    const set: Record<string, unknown> = {};
    if (v.brand.trim()) set.brand = v.brand.trim();
    for (const k of ["model", "product_type", "category", "description"] as const) { const t = txt(v[k]); if (t !== undefined) set[k] = t; }
    if (v.conc) set.conc = v.conc === CLEAR ? "" : v.conc;
    if (v.gender) set.gender = v.gender === CLEAR ? "" : v.gender;
    if (v.size.trim()) set.size_ml = Number(v.size);
    if (v.family) set.family_id = v.family === CLEAR ? null : v.family;
    if (v.case_pack.trim()) set.case_pack = Number(v.case_pack);
    if (v.moq.trim()) set.min_order_qty = Number(v.moq);
    if (v.origin.trim()) set.origin_country = v.origin.trim().toUpperCase();
    if (v.hs.trim()) set.hs_code = v.hs.trim();
    if (v.vendor) set.preferred_vendor_id = v.vendor === CLEAR ? null : v.vendor;
    if (v.stock) set.is_stock_item = v.stock === "Y";
    if (v.active) set.is_active = v.active === "Y";
    if (v.change_price) set.price_locked = v.change_price === "N";
    if (v.exclusive) set.is_exclusive = v.exclusive === "Y";
    if (v.new_launch) set.is_new_launch = v.new_launch === "Y";
    if (clearMin) set.min_price_cents = null;
    else if (minCents != null) set.min_price_cents = minCents;
    const flags = v.flag ? { [v.flagMode === "add" ? "flags_add" : "flags_remove"]: [v.flag] } : {};
    if (!Object.keys(set).length && !v.flag) { pushToast("Fill at least one field to change", "error"); return; }
    setBusy(true);
    try {
      const r = await bulkEditPerfumeItems({ ids, set, ...flags });
      pushToast(`${r.updated} item(s) updated`, "success"); onDone();
    } catch (e) { pushToast(userFacingApiError(e, "Nothing was saved"), "error"); } finally { setBusy(false); }
  };
  const opt = (list: string[]) => [<option key="" value="">{tr("perfume.bulk.keep", "— keep —")}</option>, <option key={CLEAR} value={CLEAR}>{tr("perfume.bulk.clear", "Clear")}</option>,
    ...list.map((x) => <option key={x} value={x}>{x}</option>)];
  return (
    <div className="space-y-2 rounded-[3px] border border-[#C6D1DC] bg-[#F8FAFC] p-2 text-xs" data-testid="perfume-itemfile-bulk">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-[#1F2A44]">{`${ids.length} ${tr("perfume.bulk.selected", "selected — change all of them at once (blank = keep as is)")}`}</span>
        <button type="button" className="underline" onClick={onClear}>{tr("perfume.bulk.unselect", "Unselect all")}</button>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label>{tr("perfume.itemfile.brand", "Brand")} <input className={`${ctl} block w-[140px]`} value={v.brand} onChange={(e) => setV({ ...v, brand: e.target.value })} data-testid="perfume-bulk-brand" /></label>
        <label>{tr("perfume.itemfile.family", "Family")} <FamilySelect value={v.family} onChange={(x) => setV({ ...v, family: x })} testId="perfume-bulk-family"
          head={<><option value="">{tr("perfume.bulk.keep", "— keep —")}</option><option value={CLEAR}>{tr("perfume.bulk.out_of_family", "Take out of family")}</option></>} /></label>
        <label>{tr("perfume.itemfile.model", "Model")} <input className={`${ctl} block w-[140px]`} value={v.model === CLEAR ? "" : v.model} onChange={(e) => setV({ ...v, model: e.target.value })} data-testid="perfume-bulk-model" /></label>
        <label>{tr("perfume.itemfile.product_type", "Product type")} <CatalogSelect kind="product_type" label="Product type" value={v.product_type} options={cats.types} onChange={(x) => setV({ ...v, product_type: x })} testId="perfume-bulk-product-type"
          head={<><option value="">{tr("perfume.bulk.keep", "— keep —")}</option><option value={CLEAR}>{tr("perfume.bulk.clear", "Clear")}</option></>} /></label>
        <label>{tr("perfume.itemfile.category", "Category")} <CatalogSelect kind="item_category" label="Category" value={v.category} options={cats.categories} onChange={(x) => setV({ ...v, category: x })} testId="perfume-bulk-category"
          head={<><option value="">{tr("perfume.bulk.keep", "— keep —")}</option><option value={CLEAR}>{tr("perfume.bulk.clear", "Clear")}</option></>} /></label>
        <label>{tr("perfume.itemfile.conc", "EDT / EDP / Parfum")} <select className={`${ctl} block`} value={v.conc} onChange={(e) => setV({ ...v, conc: e.target.value })} data-testid="perfume-bulk-conc">{opt(CONC.filter(Boolean) as unknown as string[])}</select></label>
        <label>{tr("perfume.itemfile.gender", "Gender")}
          <select className={`${ctl} block`} value={v.gender} onChange={(e) => setV({ ...v, gender: e.target.value })} data-testid="perfume-bulk-gender">
            <option value="">{tr("perfume.bulk.keep", "— keep —")}</option><option value={CLEAR}>{tr("perfume.bulk.clear", "Clear")}</option>
            <option value="M">Men</option><option value="W">Women</option><option value="U">Unisex</option>
          </select>
        </label>
        <label>{tr("perfume.itemfile.size", "Size ml")} <input type="number" min={0} className={`${ctl} block w-[80px] text-right`} value={v.size} onChange={(e) => setV({ ...v, size: e.target.value })} data-testid="perfume-bulk-size" /></label>
        <label>{tr("perfume.bulk.flag", "Flag")}
          <span className="flex gap-1">
            <select className={ctl} value={v.flagMode} onChange={(e) => setV({ ...v, flagMode: e.target.value as "add" | "remove" })} aria-label="Add or remove flag"><option value="add">Add</option><option value="remove">Remove</option></select>
            <select className={ctl} value={v.flag} onChange={(e) => setV({ ...v, flag: e.target.value })} data-testid="perfume-bulk-flag" aria-label="Flag">
              <option value="">{DASH}</option>{FLAGS.map((f) => <option key={f} value={f}>{f.charAt(0) + f.slice(1).toLowerCase()}</option>)}
            </select>
          </span>
        </label>
        <label>{tr("perfume.itemfile.case_pack", "Case pack")} <input type="number" min={1} className={`${ctl} block w-[70px] text-right`} value={v.case_pack} onChange={(e) => setV({ ...v, case_pack: e.target.value })} data-testid="perfume-bulk-case-pack" /></label>
        <label>{tr("perfume.itemfile.moq", "Min order")} <input type="number" min={1} className={`${ctl} block w-[70px] text-right`} value={v.moq} onChange={(e) => setV({ ...v, moq: e.target.value })} data-testid="perfume-bulk-moq" /></label>
        <label>{tr("perfume.itemfile.origin", "Origin")} <input maxLength={2} className={`${ctl} block w-[56px] uppercase`} value={v.origin} onChange={(e) => setV({ ...v, origin: e.target.value })} data-testid="perfume-bulk-origin" /></label>
        <label>{tr("perfume.itemfile.hs", "HS code")} <input className={`${ctl} block w-[100px]`} value={v.hs} onChange={(e) => setV({ ...v, hs: e.target.value })} data-testid="perfume-bulk-hs" /></label>
        <label>{tr("perfume.itemfile.pref_vendor", "Preferred vendor")} <VendorSelect value={v.vendor} onChange={(x) => setV({ ...v, vendor: x })} testId="perfume-bulk-pref-vendor"
          head={<><option value="">{tr("perfume.bulk.keep", "— keep —")}</option><option value={CLEAR}>{tr("perfume.bulk.clear", "Clear")}</option></>} /></label>
        {([["stock", "Stock item?", "perfume-bulk-stock-item"], ["active", "Active?", "perfume-bulk-active"], ["change_price", "Change price?", "perfume-bulk-change-price"], ["exclusive", "Exclusive?", "perfume-bulk-exclusive"], ["new_launch", "New launch?", "perfume-bulk-new-launch"]] as const).map(([k, label, tid]) => (
          <label key={k}>{tr(`perfume.bulk.${k}`, label)}
            <select className={`${ctl} block w-[80px]`} value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} data-testid={tid}>
              <option value="">{tr("perfume.bulk.keep", "— keep —")}</option><option value="Y">Y</option><option value="N">N</option>
            </select>
          </label>
        ))}
        <label>{tr("perfume.itemfile.min_price", "Minimum price")}
          <span className="block w-[110px]" data-testid="perfume-bulk-min-price">
            <MoneyInput valueCents={minCents} onChangeCents={setMinCents} disabled={clearMin} ariaLabel={tr("perfume.itemfile.min_price", "Minimum price")} /></span></label>
        <label className="flex items-center gap-1 pb-2"><input type="checkbox" checked={clearMin} onChange={(e) => setClearMin(e.target.checked)} data-testid="perfume-bulk-min-clear" />
          {tr("perfume.bulk.min_clear", "Clear minimum")}</label>
        <label className="min-w-[220px] flex-1">{tr("perfume.itemfile.description", "Description")} <input className={`${ctl} block w-full`} value={v.description === CLEAR ? "" : v.description} onChange={(e) => setV({ ...v, description: e.target.value })} data-testid="perfume-bulk-description" /></label>
        <Button type="button" className="h-[34px] px-3 text-xs" disabled={busy} onClick={() => void apply()} data-testid="perfume-bulk-apply">{tr("perfume.bulk.apply", "Apply to selected")}</Button>
      </div>
    </div>
  );
}

/**
 * Item creator (owner 2026-11-27 07:37 CT "in the item creator it should have those rows and should be able to select from list for each
 * one"). One row per field. Brand, model and size offer what is already in the file (type to add a new one); product type and category
 * come from his own lists; EDT / EDP / Parfum and gender are fixed lists. A copy of an item that already exists is refused by name.
 */
/**
 * Flags as one dropdown (owner 2026-11-27 13:58 CT "this should not be like this, make clean, drop down") — the box shows what is
 * picked ("Tester, Set" or —); open it to tick any of the six. Same size as the other boxes.
 */
export function FlagsSelect({ value, onChange, testId }: { value: string[]; onChange: (v: string[]) => void; testId: string }) {
  const nice = (f: string) => f.charAt(0) + f.slice(1).toLowerCase();
  return (
    <details className="relative block" data-testid={testId}>
      <summary className={`${ctl} flex w-[160px] cursor-pointer list-none items-center justify-between gap-1`} aria-label={tr("perfume.itemfile.flags", "Flags")}>
        <span className="truncate">{value.length ? value.map(nice).join(", ") : DASH}</span><span aria-hidden="true">▾</span>
      </summary>
      <div className="absolute left-0 z-20 mt-1 w-[160px] rounded-[3px] border border-[#D8E0E8] bg-white p-2 shadow-md">
        {FLAGS.map((fl) => (
          <label key={fl} className="flex items-center gap-2 py-[3px]">
            <input type="checkbox" checked={value.includes(fl)} onChange={(e) => onChange(e.target.checked ? [...value, fl] : value.filter((y) => y !== fl))} data-testid={`${testId}-${fl}`} />{nice(fl)}
          </label>
        ))}
      </div>
    </details>
  );
}

export function ItemCreator({ onCreated }: { onCreated: (id: string) => void }) {
  const { pushToast } = useToast();
  const cats = useItemCatalogs();
  const opts = useQuery({ queryKey: ["perfume", "item-options"], queryFn: getPerfumeItemOptions, staleTime: 60_000 });
  const [v, setV] = useState({ brand: "", model: "", name: "", product_type: "", category: "", size: "", conc: "", gender: "", description: "", tio_code: "", upc: "", family_id: "", case_pack: "", moq: "", weight: "", origin: "", hs: "", hk: "" });
  const [flags, setFlags] = useState<string[]>([]);
  const [control, setControl] = useState<PerfumeItemControl>({});
  const [busy, setBusy] = useState(false);
  const ok = v.brand.trim() && v.name.trim() && (v.size === "" || Number(v.size) >= 0);
  const save = async () => {
    if (!ok) return;
    setBusy(true);
    try {
      const r = await createPerfumeItem({ brand: v.brand.trim(), name: v.name.trim(), size_ml: v.size === "" ? null : Number(v.size), conc: v.conc, gender: v.gender, flags,
        model: v.model.trim() || null, product_type: v.product_type || null, category: v.category || null, description: v.description.trim() || null,
        tio_code: v.tio_code.trim() || null, hk_code: v.hk.trim() || null, upc: v.upc.trim() || null, family_id: v.family_id || null,
        case_pack: v.case_pack ? Number(v.case_pack) : null, min_order_qty: v.moq ? Number(v.moq) : null, weight_g: v.weight ? Number(v.weight) : null,
        origin_country: v.origin.trim().toUpperCase() || null, hs_code: v.hs.trim() || null, ...control });
      pushToast(`Item created: ${r.display_name}`, "success"); onCreated(r.id);
    } catch (e) { pushToast(userFacingApiError(e, "Item not created"), "error"); } finally { setBusy(false); }
  };
  // Owner 2026-11-27 13:41 CT: "craete item has boxes out of proportion … the boxes the same as in the app" — the creator uses the item
  // editor's own layout: label above each box, the same box widths (TIO 120 · Brand 160 · Name 260 · Size 80 · Model 180 …), one card.
  return (
    <section className="space-y-3 rounded-[3px] border border-[#D8E0E8] bg-white p-3" data-testid="perfume-item-creator" aria-label={tr("perfume.itemfile.new", "New item")}>
      <div className="text-section-header">{tr("perfume.itemfile.new", "New item")}</div>
      <datalist id="perfume-brands">{(opts.data?.brands ?? []).map((b) => <option key={b} value={b} />)}</datalist>
      <datalist id="perfume-models">{(opts.data?.models ?? []).map((b) => <option key={b} value={b} />)}</datalist>
      <datalist id="perfume-sizes">{(opts.data?.sizes ?? []).map((b) => <option key={b} value={b} />)}</datalist>
      <div className="flex flex-wrap items-end gap-2 text-xs" data-testid="perfume-new-fields">
        <label>{tr("perfume.itemfile.tio_code", "TIO code")} <input className={`${ctl} block w-[120px]`} value={v.tio_code} onChange={(e) => setV({ ...v, tio_code: e.target.value })} data-testid="perfume-new-tio" /></label>
        <label>{tr("perfume.itemfile.hk_code", "HK code")} <input className={`${ctl} block w-[120px]`} value={v.hk} onChange={(e) => setV({ ...v, hk: e.target.value })} data-testid="perfume-new-hk" /></label>
        <label>{`${tr("perfume.itemfile.brand", "Brand")} *`} <input list="perfume-brands" className={`${ctl} block w-[160px]`} value={v.brand} onChange={(e) => setV({ ...v, brand: e.target.value })} data-testid="perfume-new-brand" /></label>
        <label>{`${tr("perfume.itemfile.name", "Name")} *`} <input className={`${ctl} block w-[260px]`} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} data-testid="perfume-new-name" /></label>
        <label>{tr("perfume.itemfile.size", "Size ml")} <input list="perfume-sizes" type="number" min={0} className={`${ctl} block w-[80px] text-right`} value={v.size} onChange={(e) => setV({ ...v, size: e.target.value })} data-testid="perfume-new-size" /></label>
        <label>{tr("perfume.itemfile.conc", "EDT / EDP / Parfum")}
          <select className={`${ctl} block`} value={v.conc} onChange={(e) => setV({ ...v, conc: e.target.value })} data-testid="perfume-new-conc">
            {CONC.map((x) => <option key={x} value={x}>{x || DASH}</option>)}
          </select>
        </label>
        <label>{tr("perfume.itemfile.model", "Model")} <input list="perfume-models" className={`${ctl} block w-[180px]`} value={v.model} onChange={(e) => setV({ ...v, model: e.target.value })} data-testid="perfume-new-model" /></label>
        <label>{tr("perfume.itemfile.family", "Family")}
          <FamilySelect value={v.family_id} brand={v.brand} onChange={(x) => setV({ ...v, family_id: x })} testId="perfume-new-family" />
        </label>
        <label>{tr("perfume.itemfile.product_type", "Product type")}
          <CatalogSelect kind="product_type" label="Product type" value={v.product_type} options={cats.types} onChange={(x) => setV({ ...v, product_type: x })} testId="perfume-new-product-type" />
        </label>
        <label>{tr("perfume.itemfile.category", "Category")}
          <CatalogSelect kind="item_category" label="Category" value={v.category} options={cats.categories} onChange={(x) => setV({ ...v, category: x })} testId="perfume-new-category" />
        </label>
        <label>{tr("perfume.itemfile.gender", "Gender")}
          <select className={`${ctl} block`} value={v.gender} onChange={(e) => setV({ ...v, gender: e.target.value })} data-testid="perfume-new-gender">
            {Object.entries(GENDER).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
          </select>
        </label>
        <label>{tr("perfume.itemfile.flags", "Flags")}
          <FlagsSelect value={flags} onChange={setFlags} testId="perfume-new-flag" />
        </label>
        <label>{tr("perfume.itemfile.case_pack", "Case pack")} <input type="number" min={1} className={`${ctl} block w-[80px] text-right`} value={v.case_pack} onChange={(e) => setV({ ...v, case_pack: e.target.value })} data-testid="perfume-new-case-pack" /></label>
        <label>{tr("perfume.itemfile.moq", "Min order")} <input type="number" min={1} className={`${ctl} block w-[80px] text-right`} value={v.moq} onChange={(e) => setV({ ...v, moq: e.target.value })} data-testid="perfume-new-moq" /></label>
        <label>{tr("perfume.itemfile.weight", "Weight g")} <input type="number" min={0} className={`${ctl} block w-[80px] text-right`} value={v.weight} onChange={(e) => setV({ ...v, weight: e.target.value })} data-testid="perfume-new-weight" /></label>
        <label>{tr("perfume.itemfile.origin", "Origin")} <input maxLength={2} className={`${ctl} block w-[60px] uppercase`} placeholder="FR" value={v.origin} onChange={(e) => setV({ ...v, origin: e.target.value })} data-testid="perfume-new-origin" /></label>
        <label>{tr("perfume.itemfile.hs", "HS code")} <input className={`${ctl} block w-[110px]`} placeholder="3303.00" value={v.hs} onChange={(e) => setV({ ...v, hs: e.target.value })} data-testid="perfume-new-hs" /></label>
        <label>{tr("perfume.itemfile.upc", "UPC")} <input inputMode="numeric" className={`${ctl} block w-[180px]`} value={v.upc} onChange={(e) => setV({ ...v, upc: e.target.value })} data-testid="perfume-new-upc" /></label>
        <label className="w-full">{tr("perfume.itemfile.description", "Description")}
          <textarea className={`${ctl} block h-16 w-full py-1`} maxLength={2000} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} data-testid="perfume-new-description" />
        </label>
      </div>
      <ItemControlFields prefix="perfume-new" value={{ sold_by: "piece", is_stock_item: true, is_active: true, price_locked: false }} edit={control}
        onChange={(p) => setControl({ ...control, ...p })} />
      <div className="flex justify-end">
        <Button type="button" className="h-[34px] px-3 text-xs" disabled={busy || !ok} onClick={() => void save()} data-testid="perfume-new-save">{tr("perfume.itemfile.create", "Create item")}</Button>
      </div>
    </section>
  );
}
