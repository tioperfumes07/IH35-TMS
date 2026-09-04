import type { BankingTile } from "../../../api/banking";

type Props = {
  tile: BankingTile;
  selected: boolean;
  onSelect: () => void;
  /** Open the transactions register for this account (QBO View). */
  onView?: () => void;
  /** Open account inspect drawer (institution / mask / sync / balance). */
  onInspect?: () => void;
};

function isRelayWalletTile(tile: BankingTile) {
  return tile.is_relay_wallet === true || tile.system_purpose === "relay_fuel_wallet";
}

function badgeClass(tile: BankingTile) {
  if (tile.tag?.includes("DIP")) return "bg-slate-100 text-slate-700";
  // BANK-SURF-05: never style off phantom is_relay — use CoA system_purpose enrichment.
  if (isRelayWalletTile(tile)) return "bg-slate-100 text-slate-700";
  if (tile.tag === "Factoring") return "bg-slate-100 text-slate-700";
  if (tile.tag === "Escrow") return "bg-slate-100 text-slate-700";
  if (tile.account_type?.toLowerCase().includes("credit")) return "bg-red-100 text-red-700";
  return "bg-gray-100 text-gray-700";
}

export function AccountTile({ tile, selected, onSelect, onView, onInspect }: Props) {
  return (
    <div
      className={`flex h-[120px] w-[220px] shrink-0 flex-col rounded-sm border px-3 py-2 text-left ${
        selected ? "border-slate-400 bg-slate-50 shadow-xs" : "border-gray-200 bg-white"
      }`}
      data-testid={`bank-account-tile-${tile.id}`}
    >
      <button type="button" onClick={onSelect} className="min-h-0 flex-1 text-left">
        <div className="mb-1 flex items-start justify-between gap-1">
          <span className={`rounded-sm px-2 py-0.5 text-xs ${badgeClass(tile)}`}>
            {isRelayWalletTile(tile) ? tile.tag || "Relay" : tile.tag || tile.account_type}
          </span>
          <span className="text-xs text-gray-500">{tile.tile_kind}</span>
        </div>
        <div className="truncate text-xs font-semibold text-gray-900">{tile.display_name}</div>
        <div className="mt-1 text-xs font-bold tabular-nums text-gray-900">${Number(tile.current_balance ?? 0).toFixed(2)}</div>
        <div className="mt-1 text-[11px] text-slate-700">Uncat: {Number(tile.uncategorized_count ?? 0)}</div>
      </button>
      <div className="mt-1 flex gap-2 border-t border-gray-100 pt-1">
        <button
          type="button"
          data-testid="bank-account-tile-view"
          className="text-[11px] font-medium text-slate-800 underline-offset-2 hover:underline"
          onClick={(e) => {
            e.stopPropagation();
            (onView ?? onSelect)();
          }}
        >
          View
        </button>
        <button
          type="button"
          data-testid="bank-account-tile-inspect"
          className="text-[11px] font-medium text-slate-800 underline-offset-2 hover:underline"
          onClick={(e) => {
            e.stopPropagation();
            onInspect?.();
          }}
        >
          Inspect
        </button>
      </div>
    </div>
  );
}
