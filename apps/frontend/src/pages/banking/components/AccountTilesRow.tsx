import type { BankingTile } from "../../../api/banking";
import { AccountTile } from "./AccountTile";

type Props = {
  tiles: BankingTile[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onView?: (id: string) => void;
  onInspect?: (id: string) => void;
  onManageAccounts: () => void;
};

export function AccountTilesRow({ tiles, selectedId, onSelect, onView, onInspect, onManageAccounts }: Props) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1">
      {tiles.map((tile) => (
        <AccountTile
          key={tile.id}
          tile={tile}
          selected={selectedId === tile.id}
          onSelect={() => onSelect(tile.id)}
          onView={() => (onView ?? onSelect)(tile.id)}
          onInspect={() => onInspect?.(tile.id)}
        />
      ))}
      <button type="button" onClick={onManageAccounts} className="shrink-0 text-xs text-slate-700 hover:underline">
        + Create Account
      </button>
    </div>
  );
}
