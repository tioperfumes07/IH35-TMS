import { ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

export type ActionsDropdownItem = {
  key: string;
  label: string;
  onClick: () => void | Promise<void>;
  disabled?: boolean;
  loading?: boolean;
  title?: string;
  /** Rendered raw (e.g. a Link) instead of a menu-item button — for navigation items like "HOS Detail". */
  href?: string;
};

/**
 * DP1 (owner 13:20Z): "Actions: 5 buttons instead of 1 dropdown." A plain click-to-open action
 * menu — one button, 28px, the caller's items fire independently (unlike SaveDropdown's
 * split-primary-with-persisted-choice shape, which does not fit a set of unrelated actions like
 * Deactivate / Resend Invite / HOS Detail).
 */
export function ActionsDropdown({ items, label = "Actions" }: { items: ActionsDropdownItem[]; label?: string }) {
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

  const visibleItems = items.filter((item) => item != null);
  if (visibleItems.length === 0) return null;

  return (
    <div ref={wrapRef} className="relative inline-block">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-7 items-center gap-1 rounded-sm bg-[#14314F] px-2 text-xs font-semibold text-white hover:bg-[#0f2540]"
      >
        {label}
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
      {open ? (
        <ul
          id={menuId}
          role="menu"
          className="absolute right-0 top-full z-50 mt-1 min-w-[200px] rounded-sm border border-gray-200 bg-white py-1 text-left text-xs shadow-lg"
        >
          {visibleItems.map((item) =>
            item.href ? (
              <li key={item.key} role="none">
                <a
                  href={item.href}
                  role="menuitem"
                  className="block px-3 py-2 hover:bg-gray-50"
                  onClick={() => setOpen(false)}
                >
                  {item.label}
                </a>
              </li>
            ) : (
              <li key={item.key} role="none">
                <button
                  type="button"
                  role="menuitem"
                  disabled={item.disabled || item.loading}
                  title={item.title}
                  className="block w-full px-3 py-2 text-left hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-400 disabled:hover:bg-white"
                  onClick={() => {
                    setOpen(false);
                    void item.onClick();
                  }}
                >
                  {item.loading ? "…" : item.label}
                </button>
              </li>
            )
          )}
        </ul>
      ) : null}
    </div>
  );
}
