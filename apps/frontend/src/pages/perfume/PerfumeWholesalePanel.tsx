/**
 * PERFUME wholesale lists — owner 2026-11-27 08:10 CT "lists wholesale lists etc we need to make this more efficient and professional".
 * Pick a price level (Retail / Wholesale / Distributor / Export Mexico …): every one of our items with its price at that level (fixed
 * quantity breaks first, else the level's rule on cost — the same pricing the sales order uses), case pack and case price, minimum order,
 * units available, family, category and trade data. Filter by category, family, in stock or words; download the list as Excel to send.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "../../components/Button";
import { ParityTable } from "../../components/parity/ParityTable";
import { KpiCard } from "../../components/layout/KpiCard";
import { useToast } from "../../components/Toast";
import { ListErrorState } from "../../components/ListErrorState";
import { userFacingApiError } from "../../lib/api-error-message";
import {
  downloadPerfumeFile, getPerfumeWholesaleList, listPerfumeCatalogs, listPerfumeFamilies, listPerfumePriceLevels, perfumeWholesaleExportPath,
  type PerfumeWholesaleFilter, type PerfumeWholesaleRow,
} from "../../api/perfume";
import { tr } from "./perfumeI18n";
import { ctl, DASH, DocLink, money, usDate } from "./perfumeDocParts";

const GENDER: Record<string, string> = { M: "Men", W: "Women", U: "Unisex" };

export function PerfumeWholesalePanel() {
  const { pushToast } = useToast();
  const levels = useQuery({ queryKey: ["perfume", "price-levels"], queryFn: listPerfumePriceLevels });
  const cats = useQuery({ queryKey: ["perfume", "catalogs"], queryFn: listPerfumeCatalogs, staleTime: 60_000 });
  const fams = useQuery({ queryKey: ["perfume", "families", ""], queryFn: () => listPerfumeFamilies(""), staleTime: 30_000 });
  const [f, setF] = useState<Omit<PerfumeWholesaleFilter, "level_id"> & { level_id: string }>({ level_id: "" });
  const [typed, setTyped] = useState("");
  const levelId = f.level_id || (levels.data?.levels?.find((l) => l.active && l.channel === "wholesale")?.id ?? levels.data?.levels?.[0]?.id ?? "");
  const filter: PerfumeWholesaleFilter = { ...f, level_id: levelId };
  const list = useQuery({ queryKey: ["perfume", "wholesale-list", filter], queryFn: () => getPerfumeWholesaleList(filter), enabled: Boolean(levelId) });
  if (list.isError) return <ListErrorState title={tr("perfume.wl.error", "Couldn't build the list")} status={0} message={(list.error as Error)?.message} onRetry={() => void list.refetch()} />;
  const rows = list.data?.rows ?? [];
  const tester = list.data?.level.tester_pct ?? 70;
  const categories = (cats.data?.kinds?.find((k) => k.kind === "item_category")?.values ?? []).map((v) => v.value);
  const download = () => void downloadPerfumeFile(perfumeWholesaleExportPath(filter), `TIO Perfumes ${list.data?.level.name ?? ""} price list.xlsx`)
    .catch((e) => pushToast(userFacingApiError(e, "Export failed"), "error"));
  return (
    <div className="space-y-3" data-testid="perfume-wholesale-panel">
      <div className="grid grid-cols-2 gap-[10px] md:grid-cols-4">
        <KpiCard label={tr("perfume.wl.kpi_items", "Items on the list")} number={rows.length.toLocaleString("en-US")} disabled />
        <KpiCard label={tr("perfume.wl.kpi_priced", "With a price")} number={(list.data?.priced ?? 0).toLocaleString("en-US")} disabled />
        <KpiCard label={tr("perfume.wl.kpi_stock", "In stock")} number={rows.filter((r) => r.available > 0).length.toLocaleString("en-US")} disabled />
        <KpiCard label={tr("perfume.wl.kpi_noprice", "No price yet")} number={rows.filter((r) => r.price_cents == null).length.toLocaleString("en-US")} disabled />
      </div>
      <section className="space-y-2 rounded-[3px] border border-[#D8E0E8] bg-white p-3">
        <div className="flex flex-wrap items-end gap-2 text-xs">
          <label>{tr("perfume.wl.level", "Price level")}
            <select className={`${ctl} block`} value={levelId} onChange={(e) => setF({ ...f, level_id: e.target.value })} data-testid="perfume-wl-level">
              {(levels.data?.levels ?? []).map((l) => <option key={l.id} value={l.id}>{l.name}{l.active ? "" : " (inactive)"}</option>)}
            </select>
          </label>
          <label>{tr("perfume.wl.category", "Category")}
            <select className={`${ctl} block`} value={f.category ?? ""} onChange={(e) => setF({ ...f, category: e.target.value || undefined })} data-testid="perfume-wl-category">
              <option value="">{tr("perfume.wl.all", "All")}</option>{categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label>{tr("perfume.wl.family", "Family")}
            <select className={`${ctl} block`} value={f.family_id ?? ""} onChange={(e) => setF({ ...f, family_id: e.target.value || undefined })} data-testid="perfume-wl-family">
              <option value="">{tr("perfume.wl.all", "All")}</option>{(fams.data?.rows ?? []).map((x) => <option key={x.id} value={x.id}>{[x.brand, x.name].filter(Boolean).join(" · ")}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={f.in_stock === "1"} onChange={(e) => setF({ ...f, in_stock: e.target.checked ? "1" : undefined })} data-testid="perfume-wl-instock" />{tr("perfume.wl.in_stock", "In stock only")}</label>
          <input type="search" className={`${ctl} min-w-[220px] flex-1`} placeholder={tr("perfume.wl.search", "Item or TIO code — Enter")} value={typed} aria-label="Search the list"
            onChange={(e) => setTyped(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") setF({ ...f, q: typed.trim() || undefined }); }} />
          <Button type="button" className="h-[34px] px-3 text-xs" disabled={!rows.length} onClick={download} data-testid="perfume-wl-xlsx">{tr("perfume.wl.xlsx", "Download Excel to send")}</Button>
        </div>
        <div className="text-xs text-[#64748B]">{tr("perfume.wl.how", "Price = this level's fixed price at the item's minimum order (Price levels → fixed prices and quantity breaks), else the level's markup / margin on cost. A tester with no fixed price of its own = the level's testers % (Price levels) of its regular version's price. Set case pack, minimum order, origin and HS code on each item (or with the bulk bar on Item file).")}</div>
        <ParityTable<PerfumeWholesaleRow> selectable rows={rows} rowKey={(r) => r.item_id} loading={list.isLoading} storageKey="perfume-wholesale-list-v1" exportFilename={`TIO ${list.data?.level.name ?? ""} price list`} exportExcel
          emptyText="No items — our items are the ones in stock or on my inventory / offer list."
          columns={[
            { className: "text-left", key: "tio_code", label: "TIO code", sortable: true, render: (r) => r.tio_code ?? DASH, exportValue: (r) => r.tio_code ?? "" },
            { className: "text-left", key: "display_name", label: "Item", sortable: true, render: (r) => <DocLink tab="items" id={r.item_id}>{r.display_name}</DocLink>, exportValue: (r) => r.display_name },
            { className: "text-left", key: "family", label: "Family", sortable: true, render: (r) => r.family ?? DASH, exportValue: (r) => r.family ?? "" },
            { className: "text-left", key: "category", label: "Category", sortable: true, render: (r) => r.category ?? DASH, exportValue: (r) => r.category ?? "" },
            { className: "text-left", key: "product_type", label: "Type", sortable: true, render: (r) => r.product_type ?? DASH, exportValue: (r) => r.product_type ?? "" },
            { className: "text-left", key: "conc", label: "EDT / EDP / Parfum", sortable: true, render: (r) => r.conc || DASH, exportValue: (r) => r.conc ?? "" },
            { className: "text-left", key: "gender", label: "Gender", sortable: true, render: (r) => GENDER[r.gender ?? ""] ?? DASH, exportValue: (r) => GENDER[r.gender ?? ""] ?? "" },
            { className: "text-left", key: "upc", sortable: true, label: "UPC", render: (r) => r.upc ?? DASH, exportValue: (r) => r.upc ?? "" },
            { key: "case_pack", label: "Case pack", kind: "number", sortable: true, cellClass: "text-right tabular-nums", render: (r) => (r.case_pack == null ? DASH : String(r.case_pack)), exportValue: (r) => r.case_pack ?? "" },
            { key: "min_order_qty", label: "Min order", kind: "number", sortable: true, cellClass: "text-right tabular-nums", render: (r) => (r.min_order_qty == null ? DASH : String(r.min_order_qty)), exportValue: (r) => r.min_order_qty ?? "" },
            { key: "available", label: "Available", kind: "number", sortable: true, cellClass: "text-right tabular-nums", render: (r) => r.available.toLocaleString("en-US") },
            { key: "price_cents", label: "Price", kind: "number", sortable: true, cellClass: "text-right tabular-nums font-semibold", render: (r) => (r.price_cents == null ? <span className="text-[#B91C1C]">No price</span> : money(r.price_cents)), exportValue: (r) => (r.price_cents == null ? "" : r.price_cents / 100) },
            { key: "case_price_cents", label: "Case price", kind: "number", sortable: true, cellClass: "text-right tabular-nums", render: (r) => money(r.case_price_cents), exportValue: (r) => (r.case_price_cents == null ? "" : r.case_price_cents / 100) },
            { className: "text-left", key: "price_from", label: "Priced from", render: (r) => (r.price_from === "tester" && r.regular_item_id
                ? <span>{`${tr("perfume.wl.tester_of", "Tester")} ${tester}% ${tr("perfume.wl.of", "of")} `}<DocLink tab="items" id={r.regular_item_id}>{r.regular_name ?? tr("perfume.wl.regular", "regular")}</DocLink></span>
                : r.price_from === "fixed" ? tr("perfume.wl.fixed", "Fixed price") : r.price_from === "rule" ? tr("perfume.wl.rule", "Level rule on cost") : DASH),
              exportValue: (r) => (r.price_from === "tester" ? `Tester ${tester}% of ${r.regular_name ?? ""}` : r.price_from ?? "") },
            { className: "text-left", key: "breaks", label: "Quantity breaks", render: (r) => (r.breaks.length ? r.breaks.map((b) => `${b.min_qty}+ ${money(b.price_cents)}`).join(" · ") : DASH), exportValue: (r) => r.breaks.map((b) => `${b.min_qty}+ ${(b.price_cents / 100).toFixed(2)}`).join(" · ") },
            { key: "price_set_on", label: "Price date", sortable: true, cellClass: "text-right tabular-nums", render: (r) => (r.price_set_on ? usDate(r.price_set_on) : r.price_from === "tester" ? "Tester rule" : "By rule"), exportValue: (r) => r.price_set_on ?? "" },
            { className: "text-left", key: "origin_country", sortable: true, label: "Origin", render: (r) => r.origin_country ?? DASH, exportValue: (r) => r.origin_country ?? "" },
            { className: "text-left", key: "hs_code", sortable: true, label: "HS code", render: (r) => r.hs_code ?? DASH, exportValue: (r) => r.hs_code ?? "" },
          ]} />
      </section>
    </div>
  );
}
