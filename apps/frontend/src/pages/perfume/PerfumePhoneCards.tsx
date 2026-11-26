/**
 * PERFUME-PHONE — the price desk on a phone. Owner 2026-11-26: "Create the desktop phone version so I can do it
 * from here … auto adjust to phone size … search etc". Below 768 px the 9,000-px comparison grid is replaced by one
 * card per item: the item, my price / last cost / stock, the lowest supplier and the lowest competitor, and a tap
 * opens every other priced column the server sent for this view (same rows, same numbers, nothing recomputed here).
 */
import { useState, useSyncExternalStore } from "react";
import type { PerfumeGridCol, PerfumeGridRow } from "../../api/perfume";
import { tr } from "./perfumeI18n";

const PHONE_QUERY = "(max-width: 767px)";

function subscribe(cb: () => void) {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const mq = window.matchMedia(PHONE_QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
function snapshot() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia(PHONE_QUERY).matches;
}
/** True on a phone-width screen (under 768 px). Follows rotation and window resizes live. */
export function useIsPhone(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}

const cents = (c: unknown) =>
  c == null || c === "" || Number.isNaN(Number(c))
    ? "—"
    : `${Number(c) < 0 ? "−" : ""}$${(Math.abs(Number(c)) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function cellText(col: Pick<PerfumeGridCol, "kind">, v: unknown): string {
  if (v == null || v === "") return "—";
  if (col.kind === "money") return cents(v);
  if (col.kind === "pct") return `${Number(v).toFixed(1)}%`;
  if (col.kind === "int") return Number(v).toLocaleString("en-US");
  return String(v);
}

const str = (v: unknown) => (v == null || v === "" ? "" : String(v));

/** The headline fields every card shows, when the view carries them. */
const HEAD: Array<{ key: string; label: string; vendorKey?: string }> = [
  { key: "my_offer_price", label: tr("perfume.phone.myPrice", "My price") },
  { key: "my_last_cost", label: tr("perfume.phone.lastCost", "Last cost") },
  { key: "my_qty", label: tr("perfume.phone.inStock", "In stock") },
  { key: "low_buy_price", label: tr("perfume.phone.lowSupplier", "Lowest supplier"), vendorKey: "low_buy_vendor" },
  { key: "low_sell", label: tr("perfume.phone.lowCompetitor", "Lowest competitor"), vendorKey: "low_sell_vendor" },
  { key: "offer_margin_pct", label: tr("perfume.phone.margin", "My margin") },
];
const ITEM_KEYS = new Set(["id", "brand", "name", "size_ml", "conc", "category", "gender", "upc", "code", "sku", "description"]);

export function PerfumePhoneCards({ rows, cols, loading, emptyText }: { rows: PerfumeGridRow[]; cols: PerfumeGridCol[]; loading: boolean; emptyText: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const byKey = new Map(cols.map((c) => [c.key, c]));
  const kindOf = (k: string): PerfumeGridCol["kind"] => byKey.get(k)?.kind ?? (k.endsWith("_pct") ? "pct" : k === "my_qty" ? "int" : "money");
  const headKeys = new Set(HEAD.flatMap((h) => [h.key, h.vendorKey ?? ""]));
  const detailCols = cols.filter((c) => !ITEM_KEYS.has(c.key) && !headKeys.has(c.key));

  if (loading && rows.length === 0) return <div className="text-xs text-gray-500" data-testid="perfume-phone-loading">{tr("perfume.phone.loading", "Loading…")}</div>;
  if (rows.length === 0) return <div className="rounded-sm border border-gray-200 bg-white p-3 text-xs text-gray-600" data-testid="perfume-phone-empty">{emptyText}</div>;

  return (
    <ul className="space-y-2" data-testid="perfume-phone-cards">
      {rows.map((r) => {
        const id = String(r.id);
        const isOpen = open === id;
        const title = [str(r.brand), str(r.name)].filter(Boolean).join(" · ") || str(r.description) || tr("perfume.phone.noName", "(no name in the file)");
        const sub = [r.size_ml != null && r.size_ml !== "" ? `${r.size_ml} ml` : "", str(r.conc), str(r.category), str(r.gender)].filter(Boolean).join(" · ");
        const head = HEAD.filter((h) => r[h.key] != null && r[h.key] !== "");
        const details = detailCols.filter((c) => r[c.key] != null && r[c.key] !== "");
        const groups = new Map<string, PerfumeGridCol[]>();
        for (const c of details) groups.set(c.group || "", [...(groups.get(c.group || "") ?? []), c]);
        return (
          <li key={id} className="rounded-sm border border-gray-200 bg-white" data-testid="perfume-phone-card">
            <button type="button" className="block w-full p-3 text-left" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : id)} data-testid="perfume-phone-card-toggle">
              <div className="text-xs font-semibold text-[#1F2A44]">{title}</div>
              {sub ? <div className="text-xs text-gray-600">{sub}</div> : null}
              {str(r.upc) ? <div className="text-xs text-gray-500">{tr("perfume.phone.upc", "UPC")} {str(r.upc)}</div> : null}
              {head.length ? (
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
                  {head.map((h) => (
                    <div key={h.key} className="min-w-0">
                      <dt className="text-xs text-gray-500">{h.label}</dt>
                      <dd className="truncate text-xs font-semibold tabular-nums text-gray-900">
                        {cellText({ kind: kindOf(h.key) }, r[h.key])}
                        {h.vendorKey && str(r[h.vendorKey]) ? <span className="ml-1 text-xs font-normal text-gray-600">{str(r[h.vendorKey])}</span> : null}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              <div className="mt-2 text-xs font-semibold text-[#1F2A44]">
                {details.length ? (isOpen ? tr("perfume.phone.hide", "Hide prices") : `${tr("perfume.phone.all", "All prices")} (${details.length})`) : tr("perfume.phone.none", "No other prices")}
              </div>
            </button>
            {isOpen && details.length ? (
              <div className="border-t border-gray-200 px-3 pb-3 pt-2" data-testid="perfume-phone-card-detail">
                {[...groups.entries()].map(([g, cs]) => (
                  <div key={g} className="mt-1">
                    {g ? <div className="text-section-header font-bold uppercase tracking-wide text-[#4B5563]">{g}</div> : null}
                    <dl>
                      {cs.map((c) => (
                        <div key={c.key} className="flex justify-between gap-3 border-b border-gray-100 py-1 text-xs">
                          <dt className="min-w-0 text-gray-600">{c.label}</dt>
                          <dd className="shrink-0 tabular-nums text-gray-900">{cellText(c, r[c.key])}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ))}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
