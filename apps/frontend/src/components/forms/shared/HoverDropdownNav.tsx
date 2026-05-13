import { ChevronDown } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Link } from "react-router-dom";
import "./HoverDropdownNav.css";

export type NavChild = { label: string; href: string };
export type NavItem = { label: string; href?: string; children?: readonly NavChild[] };

export type HoverDropdownNavProps = {
  items: NavItem[];
  activeHref?: string;
};

const EXIT_MS = 150;

function itemOrChildActive(item: NavItem, activeHref?: string): boolean {
  if (!activeHref) return false;
  if (item.href != null && item.href === activeHref) return true;
  return item.children?.some((c) => c.href === activeHref) ?? false;
}

function DropdownColumn({ item, activeHref }: { item: NavItem; activeHref?: string }) {
  const menuId = useId().replace(/:/g, "");
  const [open, setOpen] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const openViaKey = useRef(false);

  const clearHide = useCallback(() => {
    if (hideTimer.current != null) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }, []);

  const scheduleHide = useCallback(() => {
    clearHide();
    hideTimer.current = setTimeout(() => setOpen(false), EXIT_MS);
  }, [clearHide]);

  const show = useCallback(() => {
    clearHide();
    setOpen(true);
  }, [clearHide]);

  useEffect(() => {
    if (!open) return undefined;
    if (openViaKey.current) {
      queueMicrotask(() => {
        menuRef.current?.querySelector<HTMLAnchorElement>("a")?.focus();
        openViaKey.current = false;
      });
    }

    const onDocMouse = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      setOpen(false);
    };

    const onDocKey = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key === "Escape") {
        setOpen(false);
        btnRef.current?.focus();
      }
    };

    document.addEventListener("mousedown", onDocMouse);
    document.addEventListener("keydown", onDocKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouse);
      document.removeEventListener("keydown", onDocKey);
    };
  }, [open]);

  useEffect(() => () => clearHide(), [clearHide]);

  const parentActive = itemOrChildActive(item, activeHref);

  const focusSibling = (dir: 1 | -1) => {
    const links = [...(menuRef.current?.querySelectorAll<HTMLAnchorElement>("a") ?? [])];
    if (!links.length) return;
    const ae = document.activeElement;
    const i = Math.max(0, links.indexOf(ae as HTMLAnchorElement));
    const next = (i + dir + links.length) % links.length;
    links[next]?.focus();
  };

  const onMenuKeyDown = (e: KeyboardEvent<HTMLUListElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      focusSibling(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      focusSibling(-1);
    }
  };

  const onButtonKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "Escape" && open) {
      e.preventDefault();
      setOpen(false);
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) {
        openViaKey.current = true;
        show();
      } else {
        queueMicrotask(() => menuRef.current?.querySelector<HTMLAnchorElement>("a")?.focus());
      }
      return;
    }

    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (!open) show();
      else queueMicrotask(() => menuRef.current?.querySelector<HTMLAnchorElement>("a")?.focus());
    }
  };

  const children = item.children ?? [];

  return (
    <li role="none" className="nav-item-with-dropdown">
      <div onMouseEnter={show} onMouseLeave={scheduleHide}>
        <button
          ref={btnRef}
          type="button"
          role="menuitem"
          aria-haspopup="true"
          aria-expanded={open}
          aria-controls={menuId}
          className={parentActive ? "active" : undefined}
          id={`${menuId}-trigger`}
          onKeyDown={onButtonKeyDown}
        >
          {item.label}
          <ChevronDown size={12} aria-hidden />
        </button>
        {open ? (
          <ul
            ref={menuRef}
            id={menuId}
            role="menu"
            className="nav-dropdown"
            data-testid={item.label === "Bills" ? "bills-dropdown-menu" : undefined}
            onKeyDown={onMenuKeyDown}
            tabIndex={-1}
          >
            {children.map((child) => (
              <li key={child.href} role="none">
                <Link
                  role="menuitem"
                  to={child.href}
                  className={activeHref === child.href ? "active" : undefined}
                  onClick={() => setOpen(false)}
                >
                  {child.label}
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </li>
  );
}

function LeafItem({ item, activeHref }: { item: NavItem; activeHref?: string }) {
  if (item.href == null) return null;
  const active = activeHref === item.href;
  return (
    <li role="none">
      <Link role="menuitem" to={item.href} className={active ? "active" : undefined}>
        {item.label}
      </Link>
    </li>
  );
}

/**
 * Top horizontal hover sub-nav (invariant #20). Dropdown width follows longest label (MUST 6.3.1.1).
 * Not wired to module routes in this primitive commit.
 */
export function HoverDropdownNav({ items, activeHref }: HoverDropdownNavProps) {
  return (
    <nav className="hover-dropdown-nav" aria-label="Module sub-navigation (hover dropdown)">
      <ul role="menubar">
        {items.map((item) =>
          item.children?.length ? (
            <DropdownColumn key={item.label} item={item} activeHref={activeHref} />
          ) : (
            <LeafItem key={item.label} item={item} activeHref={activeHref} />
          ),
        )}
      </ul>
    </nav>
  );
}
