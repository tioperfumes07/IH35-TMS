export type SearchResult = {
  uuid: string;
  entity_type: string;
  entity_uuid: string;
  display_text: string;
  secondary_text: string | null;
  url_path: string;
  icon: string | null;
  rank?: number;
};

type Props = {
  result: SearchResult;
  active: boolean;
  onSelect: (result: SearchResult) => void;
};

const BADGE_COLORS: Record<string, string> = {
  load: "bg-blue-100 text-blue-800",
  driver: "bg-emerald-100 text-emerald-800",
  unit: "bg-amber-100 text-amber-800",
  customer: "bg-violet-100 text-violet-800",
  invoice: "bg-rose-100 text-rose-800",
};

export function SearchResultItem({ result, active, onSelect }: Props) {
  const badgeClass = BADGE_COLORS[result.entity_type] ?? "bg-gray-100 text-gray-700";

  return (
    <button
      type="button"
      data-testid={`search-result-${result.entity_uuid}`}
      className={`flex w-full items-start gap-3 rounded px-3 py-2 text-left ${
        active ? "bg-blue-50 ring-1 ring-blue-200" : "hover:bg-gray-50"
      }`}
      onMouseDown={(event) => {
        event.preventDefault();
        onSelect(result);
      }}
    >
      <span className={`mt-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${badgeClass}`}>
        {result.entity_type}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-gray-900">{result.display_text}</span>
        {result.secondary_text ? (
          <span className="block truncate text-xs text-gray-500">{result.secondary_text}</span>
        ) : null}
      </span>
    </button>
  );
}
