import { useMemo } from "react";
import type { ListsInventoryRow } from "../../../api/listsHub";

const DOMAIN_ORDER = ["safety", "maintenance", "dispatch", "fuel", "drivers", "fleet", "accounting", "names_master"] as const;

const DOMAIN_LABELS: Record<(typeof DOMAIN_ORDER)[number], string> = {
  safety: "Safety",
  maintenance: "Maintenance",
  dispatch: "Dispatch",
  fuel: "Fuel",
  drivers: "Drivers",
  fleet: "Fleet",
  accounting: "Accounting",
  names_master: "Names master",
};

const DOMAIN_PILL: Record<(typeof DOMAIN_ORDER)[number], string> = {
  safety: "bg-red-50 text-red-700",
  maintenance: "bg-slate-100 text-slate-700",
  dispatch: "bg-blue-50 text-blue-700",
  fuel: "bg-amber-50 text-amber-700",
  drivers: "bg-green-50 text-green-700",
  fleet: "bg-purple-50 text-purple-700",
  accounting: "bg-slate-200 text-slate-800",
  names_master: "bg-orange-50 text-orange-700",
};

type Props = {
  inventory: ListsInventoryRow[];
  onCatalogClick: (domain: string, catalogKey: string) => void;
};

export function AllCatalogsMap({ inventory, onCatalogClick }: Props) {
  const grouped = useMemo(() => {
    const map: Record<string, ListsInventoryRow[]> = {};
    for (const row of inventory) map[row.domain] = [...(map[row.domain] ?? []), row];
    return map;
  }, [inventory]);

  return (
    <div className="rounded border border-slate-200 bg-white p-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">All Catalogs Domain Map</div>
      <div className="space-y-2">
        {DOMAIN_ORDER.map((domain) => {
          const rows = grouped[domain] ?? [];
          return (
            <div key={domain} className="flex items-start gap-3 rounded border border-slate-100 px-2 py-2 text-xs">
              <span className={`rounded px-2 py-0.5 font-semibold ${DOMAIN_PILL[domain]}`}>{DOMAIN_LABELS[domain]}</span>
              <div className="flex-1 whitespace-nowrap text-slate-700">
                {rows.map((row, idx) => (
                  <span key={row.catalog_key}>
                    <button type="button" className="hover:text-blue-700 hover:underline" onClick={() => onCatalogClick(domain, row.catalog_key)}>
                      {row.display_name}
                    </button>
                    {idx < rows.length - 1 ? " · " : ""}
                  </span>
                ))}
              </div>
              <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">{rows.length}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

