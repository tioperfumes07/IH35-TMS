import type { ListsInventoryRow } from "../../../api/listsHub";

type Props = {
  rows: ListsInventoryRow[];
  onCatalogClick: (catalogKey: string) => void;
  onViewAllInDomain: () => void;
  onCreateNewCatalog: () => void;
};

export function DomainFlyout({ rows, onCatalogClick, onViewAllInDomain, onCreateNewCatalog }: Props) {
  return (
    <div className="absolute left-0 top-full z-40 mt-1 w-max min-w-[280px] whitespace-nowrap rounded-sm border border-[#E5E7EB] bg-white p-2 shadow-xl">
      <div className="max-h-80 overflow-y-auto">
        {rows.map((row) => (
          <button
            key={row.catalog_key}
            type="button"
            onClick={() => onCatalogClick(row.catalog_key)}
            className="flex w-full items-center justify-between gap-4 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-[#F7F8FA]"
          >
            <span className="text-[#0F1219]">{row.display_name}</span>
            <span className="rounded-sm bg-[#F7F8FA] px-1.5 py-0.5 text-xs text-[#4B5563]">{row.row_count}</span>
          </button>
        ))}
      </div>
      <div className="mt-2 border-t border-[#E5E7EB] pt-2">
        <button type="button" onClick={onCreateNewCatalog} className="block w-full rounded-sm px-2 py-1 text-left text-xs font-semibold text-[#1F2A44] hover:bg-[#F7F8FA]">
          + Create new catalog
        </button>
        <button type="button" onClick={onViewAllInDomain} className="mt-1 block w-full rounded-sm px-2 py-1 text-left text-xs font-semibold text-[#1F2A44] hover:bg-[#F7F8FA]">
          View all in domain
        </button>
      </div>
    </div>
  );
}

