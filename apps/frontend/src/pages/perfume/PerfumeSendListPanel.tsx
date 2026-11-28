/**
 * PERFUME-SEND-LIST — the list he sends (owner 2026-11-26 23:23 CT: "WHEN SENDING LIST REMEMBER WE CAN SELECT WHAT TO SHOW, SO WE CAN
 * ADD OR REMOVE RESTRICTED BRANDS, UPC SKUS, ETC."). Built from OUR items (current inventory file + offer list): he ticks the columns,
 * the price (my list price or a price level), the sites whose stock counts, the types, and leaves out restricted brands (saved once,
 * kept for every list) and any brand for this one list. Preview, Excel, or attach the Excel to a campaign. Nothing is emailed here.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "../../components/Button";
import { ParityTable } from "../../components/parity/ParityTable";
import { KpiCard } from "../../components/layout/KpiCard";
import { useToast } from "../../components/Toast";
import { ListErrorState } from "../../components/ListErrorState";
import { userFacingApiError } from "../../lib/api-error-message";
import {
  attachPerfumeSendList, downloadPerfumeSendList, getPerfumeRestricted, listPerfumeCampaigns, listPerfumePriceLevels, listPerfumeSites, previewPerfumeSendList,
  setPerfumeRestricted, PERFUME_SEND_COLUMNS, type PerfumeSendColumn, type PerfumeSendListInput, type PerfumeSendRow,
} from "../../api/perfume";
import { tr } from "./perfumeI18n";
import { ctl, DASH, money } from "./perfumeDocParts";

const COL_TEXT: Record<PerfumeSendColumn, string> = { description: "Description", brand: "Brand", category: "Type", size: "Size ml", conc: "Concentration", upc: "UPC",
  tio_code: "TIO code", hk_code: "HK code", qty: "Qty", my_price: "My list price", level_price: "Price level's price" };
const CATEGORIES = ["Men", "Women", "Unisex", "Tester Men", "Tester Women", "Tester Unisex", "Set Men", "Set Women", "Set Unisex", "Cosmetics"];
const fail = (push: (m: string, k: "error") => void, what = "Not saved") => (e: unknown) => push(userFacingApiError(e, what), "error");

export function PerfumeSendListPanel() {
  const { pushToast } = useToast();
  const restricted = useQuery({ queryKey: ["perfume", "send-list", "restricted"], queryFn: getPerfumeRestricted });
  const sites = useQuery({ queryKey: ["perfume", "inventory", "sites"], queryFn: listPerfumeSites });
  const levels = useQuery({ queryKey: ["perfume", "price-levels"], queryFn: listPerfumePriceLevels });
  const campaigns = useQuery({ queryKey: ["perfume", "campaigns"], queryFn: listPerfumeCampaigns });
  const [columns, setColumns] = useState<PerfumeSendColumn[]>(["description", "brand", "category", "upc", "qty", "my_price"]);
  const [levelId, setLevelId] = useState<string>("");
  const [pickedSites, setPickedSites] = useState<string[]>([]);
  const [cats, setCats] = useState<string[]>([]);
  const [inStock, setInStock] = useState(true);
  const [exRestricted, setExRestricted] = useState(true);
  const [exBrands, setExBrands] = useState<string[]>([]);
  const [title, setTitle] = useState("TIO Perfumes price list");
  const [newBrand, setNewBrand] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const input: PerfumeSendListInput = useMemo(() => ({ columns, level_id: levelId || null, sites: pickedSites, in_stock_only: inStock, exclude_restricted: exRestricted,
    exclude_brands: exBrands, categories: cats, title }), [columns, levelId, pickedSites, inStock, exRestricted, exBrands, cats, title]);
  const preview = useQuery({ queryKey: ["perfume", "send-list", "preview", input], queryFn: () => previewPerfumeSendList(input), enabled: columns.length > 0 });

  if (restricted.isError) return <ListErrorState title={tr("perfume.send.restricted_error", "Couldn't load the restricted brands")} status={0} message={(restricted.error as Error)?.message} onRetry={() => void restricted.refetch()} />;
  if (preview.isError) return <ListErrorState title={tr("perfume.send.error", "Couldn't build the list")} status={0} message={(preview.error as Error)?.message} onRetry={() => void preview.refetch()} />;
  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const saveRestricted = (brands: string[]) => void setPerfumeRestricted({ brands, item_ids: (restricted.data?.items ?? []).map((i) => i.id) })
    .then(() => { void restricted.refetch(); void preview.refetch(); }).catch(fail(pushToast));
  const p = preview.data;
  // The list's date: prices and stock are as of today (Laredo).
  const asOf = new Date().toLocaleDateString("en-US", { timeZone: "America/Chicago" });
  const ourSites = (sites.data?.sites ?? []).filter((s) => s.kind !== "transit");
  return (
    <div className="space-y-3" data-testid="perfume-sendlist-panel">
      <div className="grid grid-cols-2 gap-[10px] md:grid-cols-5" data-testid="perfume-sendlist-kpis">
        <KpiCard label={tr("perfume.send.kpi_rows", "Lines on the list")} number={(p?.total ?? 0).toLocaleString("en-US")} onClick={() => void preview.refetch()} />
        <KpiCard label={tr("perfume.send.kpi_ours", "Our items")} number={(p?.our_items ?? 0).toLocaleString("en-US")} onClick={() => setInStock(false)} />
        <KpiCard label={tr("perfume.send.kpi_restricted", "Left out — restricted")} number={(p?.left_out.restricted ?? 0).toLocaleString("en-US")} onClick={() => setExRestricted(!exRestricted)} />
        <KpiCard label={tr("perfume.send.kpi_brand", "Left out — brand unticked")} number={(p?.left_out.brand ?? 0).toLocaleString("en-US")} onClick={() => setExBrands([])} />
        <KpiCard label={tr("perfume.send.kpi_stock", "Left out — no stock")} number={(p?.left_out.no_stock ?? 0).toLocaleString("en-US")} onClick={() => setInStock(!inStock)} />
      </div>
      <section className="space-y-3 rounded-[3px] border border-[#D8E0E8] bg-white p-3 text-left text-xs" aria-label={tr("perfume.send.title", "Send list")}>
        <div className="space-y-1" data-testid="perfume-sendlist-columns">
          <div className="text-card-title">{tr("perfume.send.show", "What the list shows (in this order)")}</div>
          <div className="flex flex-wrap gap-3">
            {PERFUME_SEND_COLUMNS.map((c) => (
              <label key={c} className="flex items-center gap-1"><input type="checkbox" checked={columns.includes(c)} onChange={() => setColumns(toggle(columns, c))} data-testid={`perfume-send-col-${c}`} />{COL_TEXT[c]}</label>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label>{tr("perfume.send.list_title", "Title")} <input className={`${ctl} block w-[260px]`} value={title} onChange={(e) => setTitle(e.target.value)} data-testid="perfume-send-title" /></label>
          <label>{tr("perfume.send.level", "Price level for \"Price level's price\"")}
            <select className={`${ctl} block`} value={levelId} onChange={(e) => setLevelId(e.target.value)} data-testid="perfume-send-level">
              <option value="">{tr("perfume.send.no_level", "None")}</option>
              {(levels.data?.levels ?? []).filter((l) => l.active).map((l) => <option key={l.id} value={l.id}>{`${l.name}${l.pct != null ? ` · ${l.pct}% ${l.method}` : ""}`}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={inStock} onChange={(e) => setInStock(e.target.checked)} data-testid="perfume-send-instock" />{tr("perfume.send.in_stock", "Only items in stock")}</label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={exRestricted} onChange={(e) => setExRestricted(e.target.checked)} data-testid="perfume-send-exrestricted" />{tr("perfume.send.ex_restricted", "Leave out restricted brands / items")}</label>
        </div>
        <div className="space-y-1">
          <div className="text-card-title">{tr("perfume.send.sites", "Stock from these sites (none ticked = every site)")}</div>
          <div className="flex flex-wrap gap-3">
            {sites.isError ? <span className="text-[#9B2C2C]" role="alert">{tr("perfume.send.sites_error", "Couldn't load the sites")}</span> : null}
            {ourSites.map((s) => <label key={s.code} className="flex items-center gap-1"><input type="checkbox" checked={pickedSites.includes(s.code)} onChange={() => setPickedSites(toggle(pickedSites, s.code))} data-testid={`perfume-send-site-${s.code}`} />{`${s.code} · ${s.name}`}</label>)}
          </div>
        </div>
        <div className="space-y-1">
          <div className="text-card-title">{tr("perfume.send.types", "Types (none ticked = all)")}</div>
          <div className="flex flex-wrap gap-3">
            {CATEGORIES.map((c) => <label key={c} className="flex items-center gap-1"><input type="checkbox" checked={cats.includes(c)} onChange={() => setCats(toggle(cats, c))} />{c}</label>)}
          </div>
        </div>
        <div className="space-y-1" data-testid="perfume-send-restricted">
          <div className="text-card-title">{tr("perfume.send.restricted", "Restricted brands (left out of every list)")}</div>
          <div className="flex flex-wrap items-center gap-2">
            {(restricted.data?.brands ?? []).map((b) => (
              <span key={b} className="inline-flex items-center gap-1 rounded-sm border border-[#C6D1DC] px-2 py-0.5">{b}
                <button type="button" aria-label={`${tr("perfume.send.remove", "Remove")} ${b}`} className="font-semibold" onClick={() => saveRestricted((restricted.data?.brands ?? []).filter((x) => x !== b))}>×</button>
              </span>))}
            <input className={`${ctl} w-[180px]`} value={newBrand} placeholder={tr("perfume.send.add_brand", "Add a brand")} list="perfume-send-brands"
              onChange={(e) => setNewBrand(e.target.value)} data-testid="perfume-send-restricted-input" />
            <datalist id="perfume-send-brands">{(p?.brands ?? []).map((b) => <option key={b} value={b} />)}</datalist>
            <Button type="button" variant="secondary" className="h-[30px] px-2 text-xs" disabled={!newBrand.trim()} data-testid="perfume-send-restricted-add"
              onClick={() => { saveRestricted([...(restricted.data?.brands ?? []), newBrand.trim()]); setNewBrand(""); }}>{tr("perfume.send.add", "Add")}</Button>
          </div>
        </div>
        <div className="space-y-1">
          <div className="text-card-title">{tr("perfume.send.brands_out", "Brands left out of this list only")}</div>
          <div className="flex max-h-[140px] flex-wrap gap-x-3 gap-y-1 overflow-y-auto" data-testid="perfume-send-brands">
            {(p?.brands ?? []).map((b) => <label key={b} className="flex items-center gap-1"><input type="checkbox" checked={exBrands.includes(b)} onChange={() => setExBrands(toggle(exBrands, b))} />{b}</label>)}
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Button type="button" className="h-[34px] px-3 text-xs" disabled={!columns.length} data-testid="perfume-send-xlsx"
            onClick={() => void downloadPerfumeSendList(input).catch(fail(pushToast, "Export failed"))}>{tr("perfume.send.xlsx", "Excel")}</Button>
          <label>{tr("perfume.send.campaign", "Attach to campaign")}
            <select className={`${ctl} block`} value={campaignId} onChange={(e) => setCampaignId(e.target.value)} data-testid="perfume-send-campaign">
              <option value="">{tr("perfume.send.pick_campaign", "Pick a campaign")}</option>
              {(campaigns.data?.campaigns ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" disabled={!campaignId || !columns.length} data-testid="perfume-send-attach"
            onClick={() => void attachPerfumeSendList({ ...input, campaign_id: campaignId }).then((r) => pushToast(`${r.attached} attached — ${r.rows.toLocaleString("en-US")} lines`, "success")).catch(fail(pushToast, "Not attached"))}>
            {tr("perfume.send.attach", "Attach the Excel")}
          </Button>
        </div>
        <ParityTable<PerfumeSendRow> selectable
          cardTitle title={tr("perfume.send.preview", "Preview (first 300 lines)")} rows={p?.rows ?? []} rowKey={(r) => r.item_id} loading={preview.isLoading} storageKey="perfume-sendlist-v1"
          exportFilename={title || "TIO price list"} exportExcel emptyText="Nothing on the list with these choices."
          columns={[
            { key: "as_of", label: "As of", className: "text-left", render: () => asOf, exportValue: () => asOf },
            ...columns.map((c) => ({
            key: c, label: c === "level_price" && p?.level ? `Price (${p.level})` : COL_TEXT[c],
            ...(c === "my_price" || c === "level_price" || c === "qty" || c === "size" ? { kind: "number" as const, cellClass: "text-right tabular-nums" } : { className: "text-left" }),
            render: (r: PerfumeSendRow) => (c === "my_price" || c === "level_price" ? money(r[c]) : r[c] == null || r[c] === "" ? DASH : String(r[c])),
            exportValue: (r: PerfumeSendRow) => (c === "my_price" || c === "level_price" ? (r[c] == null ? "" : Number(r[c]) / 100) : (r[c] ?? "")),
          }))]}
        />
      </section>
    </div>
  );
}
