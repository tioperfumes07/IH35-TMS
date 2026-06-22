import type { BankingTile } from "../../../api/banking";

type Props = {
  tile: BankingTile;
  selected: boolean;
  onSelect: () => void;
};

function badgeClass(tile: BankingTile) {
  if (tile.tag?.includes("DIP")) return "bg-slate-100 text-slate-700";
  if (tile.is_relay) return "bg-slate-100 text-slate-700";
  if (tile.tag === "Factoring") return "bg-slate-100 text-slate-700";
  if (tile.tag === "Escrow") return "bg-green-100 text-green-700";
  if (tile.account_type?.toLowerCase().includes("credit")) return "bg-red-100 text-red-700";
  return "bg-gray-100 text-gray-700";
}

export function AccountTile({ tile, selected, onSelect }: Props) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`h-[104px] w-[200px] flex-shrink-0 rounded border px-3 py-2 text-left ${
        selected ? "border-slate-300 bg-slate-100 shadow-sm" : "border-gray-200 bg-white"
      }`}
    >
      <div className="mb-1 flex items-start justify-between">
        <span className={`rounded-full px-2 py-0.5 text-[10px] ${badgeClass(tile)}`}>{tile.tag || tile.account_type}</span>
        <span className="text-[10px] text-gray-500">{tile.tile_kind}</span>
      </div>
      <div className="truncate text-xs font-semibold text-gray-900">{tile.display_name}</div>
      <div className="mt-1 text-sm font-bold text-gray-900">${Number(tile.current_balance ?? 0).toFixed(2)}</div>
      <div className="mt-1 text-[11px] text-amber-700">Uncat: {Number(tile.uncategorized_count ?? 0)}</div>
    </button>
  );
}
