import { ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

// ROUND-20.8 B1 — was thirteen unstyled text links crammed into one header line (Bank Register ·
// Chart of Accounts · +Record Transfer · +Record Deposit · View Transfers · +Import Statement ·
// Cash GL setup · Email Queue · +Create Account/Manage Accounts · +Petty Cash · Connect Bank ·
// +Connect Credit Card · +Connect Other). B2 deletes the three that duplicate a tab outright
// (Import Statement, the three Connect-* links, Create/Manage Account) rather than moving them
// here — they stay reachable on their own tab. What's LEFT folds into this one grouped menu.
// Dismisses on outside mousedown (the GO-21 K2 "good picker" pattern components/Combobox uses),
// never traps the operator.
export type BankingNewMenuGroup = {
  heading: string;
  // BANK-F02 regression fix — an item can carry an explicit `testId` so a specific menu entry
  // stays reachable by a stable, dedicated selector (e.g. Record Transfer) even though it now
  // lives inside this grouped dropdown rather than as its own standalone button. Falls back to
  // the existing derived `banking-new-menu-item-${key}` pattern when omitted.
  items: { key: string; label: string; onClick: () => void; testId?: string }[];
};

export function BankingNewMenu({ groups }: { groups: BankingNewMenuGroup[] }) {
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const visibleGroups = groups.filter((g) => g.items.length > 0);

  return (
    <div ref={wrapRef} className="relative inline-block">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((o) => !o)}
        data-testid="banking-new-menu-trigger"
        className="inline-flex h-7 items-center gap-1 rounded-sm bg-[#14314F] px-2.5 text-xs font-bold text-white hover:bg-[#0f2540]"
      >
        + New
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          data-testid="banking-new-menu"
          className="absolute left-0 top-full z-50 mt-1 min-w-[220px] rounded-sm border border-[#C7D2DC] bg-white py-1 text-left text-xs shadow-lg"
        >
          {visibleGroups.map((group, gi) => (
            <div key={group.heading}>
              {gi > 0 ? <div className="my-1 border-t border-gray-100" /> : null}
              <div className="px-3 pb-1 pt-1.5 font-bold uppercase text-[#9aa7b4]" style={{ fontSize: "10.5px", letterSpacing: ".065em" }}>
                {group.heading}
              </div>
              {group.items.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  role="menuitem"
                  data-testid={item.testId ?? `banking-new-menu-item-${item.key}`}
                  className="block w-full px-3 py-1.5 text-left hover:bg-gray-50"
                  onClick={() => {
                    setOpen(false);
                    item.onClick();
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
