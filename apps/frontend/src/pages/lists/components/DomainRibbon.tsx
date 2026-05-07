import { useEffect, useMemo, useRef, useState } from "react";
import type { ListsInventoryRow } from "../../../api/listsHub";
import { DomainFlyout } from "./DomainFlyout";
import { DomainTab } from "./DomainTab";

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

type Props = {
  inventory: ListsInventoryRow[];
  onCatalogClick: (domain: string, catalogKey: string) => void;
};

export function DomainRibbon({ inventory, onCatalogClick }: Props) {
  const [openDomain, setOpenDomain] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const byDomain = useMemo(() => {
    const grouped: Record<string, ListsInventoryRow[]> = {};
    for (const row of inventory) {
      grouped[row.domain] = [...(grouped[row.domain] ?? []), row];
    }
    return grouped;
  }, [inventory]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current) return;
      if (rootRef.current.contains(event.target as Node)) return;
      setOpenDomain(null);
    }
    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, []);

  return (
    <div ref={rootRef} className="relative rounded border border-slate-200 bg-white px-2 pt-1 shadow-sm">
      <div className="flex flex-wrap gap-1">
        {DOMAIN_ORDER.map((domain) => {
          const rows = byDomain[domain] ?? [];
          const count = rows.length;
          const isActive = openDomain === domain;
          return (
            <div key={domain} className="relative">
              <DomainTab
                label={DOMAIN_LABELS[domain]}
                count={count}
                isActive={isActive}
                onMouseEnter={() => setOpenDomain(domain)}
                onClick={() => setOpenDomain((prev) => (prev === domain ? null : domain))}
              />
              {isActive ? (
                <DomainFlyout
                  rows={rows}
                  onCatalogClick={(catalogKey) => onCatalogClick(domain, catalogKey)}
                  onCreateNewCatalog={() => onCatalogClick(domain, "_create")}
                  onViewAllInDomain={() => setOpenDomain(null)}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

