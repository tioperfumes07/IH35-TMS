import { ChevronDown } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { Link, NavLink, useLocation } from "react-router-dom";
import { measureNavDropdownStyle } from "../forms/shared/HoverDropdownNav";

export interface NavySubNavChild {
  label: string;
  to: string;
}

export interface NavyPageSubNavItem {
  label: string;
  to: string;
  children?: readonly NavySubNavChild[];
  /** B6 (owner, 2026-09-12) — "a dot on any tab that contains data." Optional and additive: a
   *  consumer that never sets this renders exactly as before. White, not an amber/emerald/yellow/
   *  green status hue — §7 (verify-section7-palette-nonfinancial.mjs) reserves those colors for the
   *  Class pill/delete-only red; white is this nav's own existing text color, so a solid dot in it
   *  is visible against the navy bar without adding an off-palette status color. */
  hasData?: boolean;
}

function DataDot() {
  return <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-white" />;
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
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  // P0 FOLLOW-UP #2 (owner 2026-09-14, live Chrome after the click-race fix deployed): the click-state
  // fix alone was NOT enough -- once `open` correctly flips true, the menu is still invisible in
  // production. Confirmed live: `<nav className="overflow-x-auto ...">` (this component's own root)
  // computes `overflow-y: auto` too (CSS Overflow spec pairs the axes -- the exact GO-23
  // nav-dropdown-clip root cause, see HoverDropdownNav.tsx's own header comment), clipping this
  // `position: absolute` `<ul>` since it overflows the `<nav>`'s own box on the y-axis (menu rect
  // extended to y=275 while `<nav>`'s own box ends at y=155). `elementFromPoint` at the menu's own
  // reported coordinates returned a page-content div, not the menu, even with zIndex:30/opacity:1/
  // display:block -- proof this is clipping, not a stacking-context or state bug. Same fix as that
  // precedent: portal the open menu into `document.body`, positioned `fixed` from a live
  // `getBoundingClientRect()` read via the shared `measureNavDropdownStyle()` (also reused by
  // DispatchSubnav) -- no ancestor's overflow or stacking context can then clip or bury it.
  useLayoutEffect(() => {
    if (!open || !wrapperRef.current) return;
    setMenuStyle(measureNavDropdownStyle(wrapperRef.current));
  }, [open, item.children?.length]);

  useEffect(() => {
    if (!open) return undefined;
    function reposition() {
      if (!wrapperRef.current) return;
      setMenuStyle(measureNavDropdownStyle(wrapperRef.current));
    }
    window.addEventListener("resize", reposition);
    // Capture: this nav itself scrolls horizontally (overflow-x: auto) without bubbling.
    document.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      document.removeEventListener("scroll", reposition, true);
    };
  }, [open]);
  // PR #21952 FOLLOW-UP (P0, owner 2026-09-14): `onMouseEnter={show}` on the wrapper races the
  // button's own `onClick` toggle. A real (or automated) click is always preceded by a `mouseenter`
  // on the same element -- the cursor has to land on the button before the click fires. That
  // mouseenter opened the menu via `show()` FIRST; the click's own `setOpen((o) => !o)` then flipped
  // it straight back to closed in the same tick, before React ever painted the open state. Net
  // effect: the dropdown never visibly opens on click, only via a mouseenter with no click (rare --
  // e.g. focus via keyboard Tab then a non-click pointer move). Confirmed live via a realistic
  // mousemove/mouseover/mouseenter/mousedown/mouseup/click sequence dispatched at the real DOM node.
  // Fix: track whether the CURRENT open state was opened by hover. If so, the click that immediately
  // follows is the user's actual "open" gesture (their pointer was already there) -- consume it as a
  // no-op instead of toggling closed, and hand control to the normal click-to-close path on the NEXT
  // click. `close()` always clears the flag so it can never leak into an unrelated later click.
  const openedByHoverRef = useRef(false);

  const clearHide = useCallback(() => {
    if (hideTimer.current != null) { clearTimeout(hideTimer.current); hideTimer.current = null; }
  }, []);

  const close = useCallback(() => {
    openedByHoverRef.current = false;
    setOpen(false);
  }, []);

  const scheduleHide = useCallback(() => {
    clearHide();
    hideTimer.current = setTimeout(close, 150);
  }, [clearHide, close]);

  const show = useCallback(() => {
    clearHide();
    openedByHoverRef.current = true;
    setOpen(true);
  }, [clearHide]);

  const toggleFromClick = useCallback(() => {
    if (openedByHoverRef.current) {
      // The mouseenter that just fired already opened this -- this click is that same gesture's
      // click, not a second, deliberate "close it" click. Consume it and arm normal toggle behavior.
      openedByHoverRef.current = false;
      setOpen(true);
      return;
    }
    setOpen((o) => {
      const next = !o;
      if (!next) openedByHoverRef.current = false;
      return next;
    });
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e: MouseEvent) => {
      if (wrapperRef.current?.contains(e.target as Node)) return;
      close();
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") { close(); btnRef.current?.focus(); }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open, close]);

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
    if (e.key === "Escape" && open) { e.preventDefault(); close(); return; }
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
        onClick={toggleFromClick}
        onKeyDown={onButtonKeyDown}
      >
        {hasDefaultHref ? null : item.label}
        <ChevronDown size={10} aria-hidden className="ml-0.5 inline" />
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <ul
              ref={menuRef}
              id={menuId}
              role="menu"
              className="rounded-sm border border-gray-200 bg-white py-1 text-[11px] text-gray-700 shadow-md"
              style={menuStyle}
              onKeyDown={onMenuKeyDown}
              tabIndex={-1}
            >
              {children.map((child) => (
                <li key={child.to} role="none">
                  <Link
                    role="menuitem"
                    to={child.to}
                    className={`block whitespace-nowrap px-3 py-1.5 hover:bg-gray-50 ${isActive(pathname, child.to) ? "font-semibold text-gray-900" : ""}`}
                    onClick={close}
                  >
                    {child.label}
                  </Link>
                </li>
              ))}
            </ul>,
            document.body,
          )
        : null}
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
                aria-current={active ? "page" : undefined}
                className={`inline-flex items-center gap-1 ${active ? "border-b border-white pb-0.5 font-semibold" : ""}`}
                onClick={() => onTabChange(id)}
              >
                {item.label}
                {item.hasData ? <DataDot /> : null}
              </button>
            );
          }
          return (
            <NavLink
              key={item.to}
              to={item.to}
              aria-current={isActive(pathname, item.to) ? "page" : undefined}
              className={`inline-flex items-center gap-1 ${isActive(pathname, item.to) ? "border-b border-white pb-0.5 font-semibold" : ""}`}
            >
              {item.label}
              {item.hasData ? <DataDot /> : null}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
