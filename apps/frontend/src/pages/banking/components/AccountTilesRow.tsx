import type { BankingTile } from "../../../api/banking";
import { AccountTile } from "./AccountTile";

type Props = {
  tiles: BankingTile[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onManageAccounts: () => void;
};

export function AccountTilesRow({ tiles, selectedId, onSelect, onManageAccounts }: Props) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {tiles.map((tile) => (
        <AccountTile
          key={tile.id}
          tile={tile}
          selected={selectedId === tile.id}
          onSelect={() => onSelect(tile.id)}
        />
      ))}
      <button
        type="button"
        onClick={onManageAccounts}
        className="h-[104px] w-[200px] flex-shrink-0 rounded border border-dashed border-gray-300 bg-gray-50 px-3 py-2 text-left text-xs text-gray-700"
      >
        <div className="font-semibold">+ Create Account</div>
        <div className="mt-1">Open Manage Accounts modal</div>
      </button>
    </div>
  );
}
