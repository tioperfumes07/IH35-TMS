import { ChevronDown } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";

export interface NavySubNavChild {
  label: string;
  to: string;
}

export interface NavyPageSubNavItem {
  label: string;
  to: string;
  children?: readonly NavySubNavChild[];
}

interface NavyPageSubNavProps {
  items: NavyPageSubNavItem[];
  activeId?: string;
  onTabChange?: (id: string) => void;
  itemIds?: string[];
}

function isActive(pathname: string, to: string): boolean {
  if (to === "/") return pathname === "/";
  return pathname === to || pathname.startsWith(`${to}/`);
}

function itemOrChildActive(pathname: string, item: NavyPageSubNavItem): boolean {
  if (isActive(pathname, item.to)) return true;
  return item.children?.some((c) => isActive(pathname, c.to)) ?? false;
}

function NavyDropdown({ item, pathname }: { item: NavyPageSubNavItem; pathname: string }) {
  const menuId = useId().replace(/:/g, "");
  const [open, setOpen] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const clearHide = useCallback(() => {
    if (hideTimer.current != null) { clearTimeout(hideTimer.current); hideTimer.current = null; }
  }, []);

  const scheduleHide = useCallback(() => {
    clearHide();
    hideTimer.current = setTimeout(() => setOpen(false), 150);
  }, [clearHide]);

  const show = useCallback(() => { clearHide(); setOpen(true); }, [clearHide]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e: MouseEvent) => {
      if (wrapperRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") { setOpen(false); btnRef.current?.focus(); }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  useEffect(() => () => clearHide(), [clearHide]);

  const parentActive = itemOrChildActive(pathname, item);
  const hasDefaultHref = item.to.length > 0;
  const children = item.children ?? [];

  const focusSibling = (dir: 1 | -1) => {
    const links = [...(menuRef.current?.querySelectorAll<HTMLAnchorElement>("a") ?? [])];
    if (!links.length) return;
    const ae = document.activeElement;
    const i = Math.max(0, links.indexOf(ae as HTMLAnchorElement));
    const next = (i + dir + links.length) % links.length;
    links[next]?.focus();
  };

  const onMenuKeyDown = (e: KeyboardEvent<HTMLUListElement>) => {
    if (e.key === "ArrowDown") { e.preventDefault(); focusSibling(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); focusSibling(-1); }
  };

  const onButtonKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "Escape" && open) { e.preventDefault(); setOpen(false); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); queueMicrotask(() => menuRef.current?.querySelector<HTMLAnchorElement>("a")?.focus()); return; }
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(true); queueMicrotask(() => menuRef.current?.querySelector<HTMLAnchorElement>("a")?.focus()); }
  };

  return (
    <div
      ref={wrapperRef}
      className="relative inline-flex items-stretch"
      onMouseEnter={show}
      onMouseLeave={scheduleHide}
    >
      {hasDefaultHref ? (
        <NavLink
          to={item.to}
          className={parentActive ? "border-b border-white pb-0.5 font-semibold" : ""}
        >
          {item.label}
        </NavLink>
      ) : null}
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={menuId}
        className={hasDefaultHref ? "" : parentActive ? "border-b border-white pb-0.5 font-semibold" : ""}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onButtonKeyDown}
      >
        {hasDefaultHref ? null : item.label}
        <ChevronDown size={10} aria-hidden className="ml-0.5 inline" />
      </button>
      {open ? (
        <ul
          ref={menuRef}
          id={menuId}
          role="menu"
          className="absolute left-0 top-full z-30 min-w-[180px] rounded-sm border border-gray-200 bg-white py-1 text-[11px] text-gray-700 shadow-md"
          onKeyDown={onMenuKeyDown}
          tabIndex={-1}
        >
          {children.map((child) => (
            <li key={child.to} role="none">
              <Link
                role="menuitem"
                to={child.to}
                className={`block whitespace-nowrap px-3 py-1.5 hover:bg-gray-50 ${isActive(pathname, child.to) ? "font-semibold text-gray-900" : ""}`}
                onClick={() => setOpen(false)}
              >
                {child.label}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function NavyPageSubNav({ items, activeId, onTabChange, itemIds }: NavyPageSubNavProps) {
  const { pathname } = useLocation();
  const useLocalState = activeId !== undefined && onTabChange !== undefined;
  return (
    <nav
      aria-label="Section navigation"
      className="overflow-x-auto rounded-sm bg-[#1A1F36] px-2 py-1 text-[11px] text-white"
    >
      <div className="flex min-w-max gap-4">
        {items.map((item, index) => {
          if (item.children?.length) {
            return <NavyDropdown key={item.to || item.label} item={item} pathname={pathname} />;
          }
          const id = itemIds?.[index] ?? item.to;
          if (useLocalState) {
            const active = activeId === id;
            return (
              <button
                key={id}
                type="button"
                className={active ? "border-b border-white pb-0.5 font-semibold" : ""}
                onClick={() => onTabChange(id)}
              >
                {item.label}
              </button>
            );
          }
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={isActive(pathname, item.to) ? "border-b border-white pb-0.5 font-semibold" : ""}
            >
              {item.label}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
