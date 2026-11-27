/**
 * CONTROL item fields (migration 202617100100, LEAD ROUND L.20; owner 2026-11-27 13:50 CT "bring what we need from CONTROL").
 * The CONTROL "Item File Maintenance" boxes in the item editor's style: label above the box, fixed widths, one wrapping row —
 * POS code, ticket description, sold by piece / pack + units per pack, preferred vendor, stock item, active, special price,
 * minimum price, change price. Used by the item editor and the item creator (same boxes, same rules).
 */
import { useQuery } from "@tanstack/react-query";
import { listPerfumeVendors, type PerfumeItemControl } from "../../api/perfume";
import { MoneyInput } from "../../components/forms/MoneyInput";
import { tr } from "./perfumeI18n";
import { ctl, DASH } from "./perfumeDocParts";

/** The vendors a preferred vendor can be (buy / both suppliers first, archived left out). */
export function useVendorOptions() {
  const q = useQuery({ queryKey: ["perfume", "vendors"], queryFn: listPerfumeVendors, staleTime: 60_000 });
  return (q.data?.vendors ?? [])
    .filter((v) => !(v as { archived_at?: string | null }).archived_at)
    .map((v) => ({ id: v.id, name: (v as { short_name?: string | null }).short_name?.trim() || v.name, kind: String((v as { kind?: string }).kind ?? "") }))
    .sort((a, b) => Number(["inventory", "offer", "sell"].includes(a.kind)) - Number(["inventory", "offer", "sell"].includes(b.kind)) || a.name.localeCompare(b.name));
}

export function VendorSelect({ value, onChange, testId, head }: { value: string; onChange: (v: string) => void; testId: string; head?: React.ReactNode }) {
  const vendors = useVendorOptions();
  return (
    <select className={`${ctl} block w-[180px]`} value={value} onChange={(e) => onChange(e.target.value)} data-testid={testId} aria-label={tr("perfume.itemfile.pref_vendor", "Preferred vendor")}>
      {head ?? <option value="">{DASH}</option>}
      {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
    </select>
  );
}

const YN = ({ value, onChange, testId, label }: { value: boolean; onChange: (v: boolean) => void; testId: string; label: string }) => (
  <select className={`${ctl} block w-[64px]`} value={value ? "Y" : "N"} onChange={(e) => onChange(e.target.value === "Y")} data-testid={testId} aria-label={label}>
    <option value="Y">Y</option><option value="N">N</option>
  </select>
);

/**
 * `value` is what the item has now (or the creator's defaults), `edit` what the owner changed; `onChange` merges a patch into the edit.
 * Prices go through the house MoneyInput (cents in, cents out).
 */
export function ItemControlFields({ value, edit, onChange, prefix }: {
  value: PerfumeItemControl; edit: PerfumeItemControl; onChange: (patch: PerfumeItemControl) => void; prefix: string;
}) {
  const v = <K extends keyof PerfumeItemControl>(k: K): PerfumeItemControl[K] => (edit[k] !== undefined ? edit[k] : value[k]);
  const soldBy = v("sold_by") ?? "piece";
  return (
    <div className="flex flex-wrap items-end gap-2 text-xs" data-testid={`${prefix}-control`}>
      <label>{tr("perfume.itemfile.pos_code", "POS code")}
        <input className={`${ctl} block w-[110px]`} maxLength={30} value={v("pos_code") ?? ""} onChange={(e) => onChange({ pos_code: e.target.value.trim() || null })} data-testid={`${prefix}-pos-code`} /></label>
      <label>{tr("perfume.itemfile.ticket", "Ticket description")}
        <input className={`${ctl} block w-[220px]`} maxLength={40} value={v("ticket_description") ?? ""} onChange={(e) => onChange({ ticket_description: e.target.value || null })} data-testid={`${prefix}-ticket`} /></label>
      <label>{tr("perfume.itemfile.sold_by", "Sold by")}
        <select className={`${ctl} block w-[90px]`} value={soldBy} data-testid={`${prefix}-sold-by`}
          onChange={(e) => onChange(e.target.value === "pack" ? { sold_by: "pack" } : { sold_by: "piece", units_per_pack: null })}>
          <option value="piece">{tr("perfume.itemfile.piece", "Piece")}</option><option value="pack">{tr("perfume.itemfile.pack", "Pack")}</option>
        </select></label>
      <label>{tr("perfume.itemfile.units_per_pack", "Units / pack")}
        <input type="number" min={2} className={`${ctl} block w-[80px] text-right`} disabled={soldBy !== "pack"} value={v("units_per_pack") ?? ""}
          onChange={(e) => onChange({ units_per_pack: e.target.value === "" ? null : Number(e.target.value) })} data-testid={`${prefix}-units-per-pack`} /></label>
      <label>{tr("perfume.itemfile.pref_vendor", "Preferred vendor")}
        <VendorSelect value={v("preferred_vendor_id") ?? ""} onChange={(x) => onChange({ preferred_vendor_id: x || null })} testId={`${prefix}-pref-vendor`} /></label>
      <label>{tr("perfume.itemfile.stock_item", "Stock item?")}
        <YN value={v("is_stock_item") ?? true} onChange={(x) => onChange({ is_stock_item: x })} testId={`${prefix}-stock-item`} label="Stock item?" /></label>
      <label>{tr("perfume.itemfile.active", "Active?")}
        <YN value={v("is_active") ?? true} onChange={(x) => onChange({ is_active: x })} testId={`${prefix}-active`} label="Active?" /></label>
      <label>{tr("perfume.itemfile.special", "Special price")}
        <span className="block w-[110px]" data-testid={`${prefix}-special`}>
          <MoneyInput valueCents={v("special_price_cents") ?? null} onChangeCents={(c) => onChange({ special_price_cents: c })} ariaLabel={tr("perfume.itemfile.special", "Special price")} /></span></label>
      <label>{tr("perfume.itemfile.min_price", "Minimum price")}
        <span className="block w-[110px]" data-testid={`${prefix}-min-price`}>
          <MoneyInput valueCents={v("min_price_cents") ?? null} onChangeCents={(c) => onChange({ min_price_cents: c })} ariaLabel={tr("perfume.itemfile.min_price", "Minimum price")} /></span></label>
      <label>{tr("perfume.itemfile.exclusive", "Exclusive?")}
        <YN value={v("is_exclusive") ?? false} onChange={(x) => onChange({ is_exclusive: x })} testId={`${prefix}-exclusive`} label="Exclusive?" /></label>
      <label>{tr("perfume.itemfile.new_launch", "New launch?")}
        <YN value={v("is_new_launch") ?? false} onChange={(x) => onChange({ is_new_launch: x })} testId={`${prefix}-new-launch`} label="New launch?" /></label>
      <label title={tr("perfume.itemfile.change_price_hint", "N = an order line takes the customer's level price and cannot be retyped without a written reason")}>
        {tr("perfume.itemfile.change_price", "Change price?")}
        <YN value={!(v("price_locked") ?? false)} onChange={(x) => onChange({ price_locked: !x })} testId={`${prefix}-change-price`} label="Change price?" /></label>
    </div>
  );
}
