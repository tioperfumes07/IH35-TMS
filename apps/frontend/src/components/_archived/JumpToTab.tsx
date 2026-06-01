import type { ReactNode } from "react";
import { HoverDropdown } from "../shared/HoverDropdown";

type JumpToTabItem = {
  id: string;
  label: string;
};

type Props = {
  items: readonly JumpToTabItem[];
  onSelect: (id: string) => void;
  trigger?: ReactNode;
};

// Archived for MAINT-JUMP-TO-TAB-REMOVE: redundant with Maintenance underline tabs.
export function JumpToTabArchived({ items, onSelect, trigger }: Props) {
  return (
    <HoverDropdown
      trigger={
        trigger ?? (
          <button className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700">
            Jump to tab
          </button>
        )
      }
      align="right"
      minWidth={220}
    >
      <div className="space-y-1">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-slate-100"
            onClick={() => onSelect(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
    </HoverDropdown>
  );
}
