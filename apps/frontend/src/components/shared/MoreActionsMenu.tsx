import { useEffect, useId, useRef, useState } from "react";

// CREATECHECK-MENU-01 (owner report, ROUND 155.11-B): every hand-rolled "More" dropdown in this
// codebase (CheckDetailPage, LoadDetailDrawer, ...) tracked its own open/closed useState with NO
// outside-click, NO Escape, and NO "another menu opened elsewhere" handling -- once open, a menu
// stayed open until its own trigger was clicked again. One shared component, fixed once, used by
// every "More" surface, so the fix cannot drift per-instance the way the bug did.
let activeMenuId: string | null = null;
const listeners = new Set<(id: string | null) => void>();
function setActiveMenu(id: string | null) {
  activeMenuId = id;
  for (const l of listeners) l(id);
}

export type MoreActionsMenuItem = {
  key: string;
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  destructive?: boolean;
};

export function MoreActionsMenu({
  trigger,
  items,
  "data-testid": testId,
}: {
  trigger: (props: { open: boolean; toggle: () => void; triggerTestId?: string }) => React.ReactNode;
  items: MoreActionsMenuItem[];
  "data-testid"?: string;
}) {
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Another MoreActionsMenu opened elsewhere -> close this one.
  useEffect(() => {
    const onActiveChange = (id: string | null) => {
      if (id !== menuId) setOpen(false);
    };
    listeners.add(onActiveChange);
    return () => {
      listeners.delete(onActiveChange);
    };
  }, [menuId]);

  useEffect(() => {
    if (!open) return;
    const onOutside = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const toggle = () => {
    setOpen((wasOpen) => {
      const next = !wasOpen;
      if (next) setActiveMenu(menuId);
      else if (activeMenuId === menuId) setActiveMenu(null);
      return next;
    });
  };

  return (
    <div ref={wrapRef} className="relative inline-block" data-testid={testId}>
      {trigger({ open, toggle, triggerTestId: testId ? `${testId}-trigger` : undefined })}
      {open ? (
        <div
          id={menuId}
          role="menu"
          data-testid={testId ? `${testId}-menu` : undefined}
          className="absolute right-0 z-30 mt-1 min-w-[180px] rounded-sm border border-gray-200 bg-white py-1 shadow-lg"
        >
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              className={`block w-full px-4 py-2 text-left text-xs hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-300 ${
                item.destructive ? "text-red-700" : "text-gray-800"
              }`}
              onClick={() => {
                setOpen(false);
                if (activeMenuId === menuId) setActiveMenu(null);
                item.onSelect();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
