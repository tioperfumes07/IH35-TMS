import { ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "../Button";

// VOID-BUTTON-01 (owner order) — QuickBooks-style split button: a primary destructive/reversal
// action + a caret opening the module's OTHER real actions. Structurally modeled on SaveDropdown.tsx
// (the existing split-button precedent in this codebase), but deliberately NOT the same component:
// SaveDropdown persists a "last chosen" primary in localStorage and disables-with-a-reason an action
// that isn't wired yet; a destructive-action menu does neither — the primary is always the module's
// fixed first action (never a remembered preference), and an action the caller doesn't pass is
// simply ABSENT from the menu, never rendered disabled with an explanation. A menu item that isn't a
// real, wired capability must not appear here at all — see the board finding this component's own
// commit files for exactly which modules currently have more than one real action to show.
export type VoidActionMenuAction = {
  key: string;
  label: string;
  onSelect: () => void | Promise<void>;
  /** Rendered in the danger palette (red) instead of the default menu-item styling — for a
   *  genuinely irreversible action (e.g. a real delete) sitting alongside a reversible one (void). */
  destructive?: boolean;
};

export type VoidActionMenuProps = {
  /** The module's fixed primary action — always first, never a remembered preference. */
  primary: VoidActionMenuAction;
  /** Additional real actions this module supports right now. Omit an action entirely rather than
   *  rendering it disabled — an unwired capability must never appear as a dead menu item. */
  menuActions?: VoidActionMenuAction[];
  disabled?: boolean;
  loading?: boolean;
  title?: string;
  size?: "sm" | "md";
  "data-testid"?: string;
};

/**
 * QuickBooks-style split button for a document's destructive/reversal actions. Primary button runs
 * `primary.onSelect` directly; the caret opens a menu of `menuActions` (if any). With zero
 * `menuActions`, renders as a plain button with no caret — a split control with only one real choice
 * is not a split control.
 */
export function VoidActionMenu({
  primary,
  menuActions = [],
  disabled = false,
  loading = false,
  title,
  size = "sm",
  ...rest
}: VoidActionMenuProps) {
  const menuId = useId();
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const testId = rest["data-testid"];

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  const runPrimary = async () => {
    await primary.onSelect();
  };

  const runMenuAction = async (action: VoidActionMenuAction) => {
    setMenuOpen(false);
    await action.onSelect();
  };

  if (menuActions.length === 0) {
    // Only one real action exists for this module today — no caret, no menu, just the button.
    return (
      <Button
        type="button"
        variant="danger"
        size={size}
        disabled={disabled}
        loading={loading}
        title={title}
        data-testid={testId}
        onClick={() => void runPrimary()}
      >
        {primary.label}
      </Button>
    );
  }

  return (
    <div ref={wrapRef} className="relative inline-flex rounded-sm border border-red-700" data-testid={testId}>
      <Button
        type="button"
        variant="danger"
        size={size}
        className="rounded-r-none border-r border-red-800"
        disabled={disabled}
        loading={loading}
        title={title}
        onClick={() => void runPrimary()}
      >
        {primary.label}
      </Button>
      <button
        type="button"
        className="inline-flex h-8 items-center bg-red-800 px-2 text-white hover:bg-red-900 disabled:opacity-60"
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        aria-controls={menuId}
        aria-label={`More ${primary.label.toLowerCase()} options`}
        disabled={disabled || loading}
        data-testid={testId ? `${testId}-caret` : undefined}
        onClick={() => setMenuOpen((o) => !o)}
      >
        <ChevronDown className="h-4 w-4" />
      </button>
      {menuOpen ? (
        <ul
          id={menuId}
          role="menu"
          className="absolute right-0 top-full z-50 mt-1 min-w-[180px] rounded-sm border border-gray-200 bg-white py-1 text-left text-xs shadow-lg"
        >
          {menuActions.map((item) => (
            <li key={item.key} role="none">
              <button
                type="button"
                role="menuitem"
                className={`block w-full px-3 py-2 text-left hover:bg-gray-50 ${item.destructive ? "text-red-700" : "text-gray-900"}`}
                onClick={() => void runMenuAction(item)}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
