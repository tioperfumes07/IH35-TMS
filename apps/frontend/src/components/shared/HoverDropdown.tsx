import { type ReactNode, useEffect, useId, useRef, useState } from "react";

type Props = {
  trigger: ReactNode;
  children: ReactNode;
  align?: "left" | "right";
  delay?: number;
  minWidth?: number | string;
};

/**
 * Hover opens the menu. A pointer click that arrives while the menu is already
 * open from hover must NOT self-close (LV-HOVERDROPDOWN-HOVER-CLICK-SELF-CLOSE).
 * A later intentional click toggles closed; outside click / Escape / mouseleave still close.
 */
export function HoverDropdown({ trigger, children, align = "left", delay = 200, minWidth = 240 }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const openedViaHoverRef = useRef(false);
  const menuId = useId();

  function clearCloseTimer() {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }

  function openNow(fromHover = false) {
    clearCloseTimer();
    if (fromHover) openedViaHoverRef.current = true;
    setOpen(true);
  }

  function closeSoon() {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      openedViaHoverRef.current = false;
      setOpen(false);
    }, delay);
  }

  function closeNow() {
    clearCloseTimer();
    openedViaHoverRef.current = false;
    setOpen(false);
  }

  useEffect(() => {
    return () => clearCloseTimer();
  }, []);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        closeNow();
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  return (
    <div
      ref={rootRef}
      className="relative"
      data-testid="hover-dropdown"
      onMouseEnter={() => openNow(true)}
      onMouseLeave={closeSoon}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        data-testid="hover-dropdown-trigger"
        onClick={() => {
          if (open && openedViaHoverRef.current) {
            // First click after hover: keep open (consume the hover-open flag).
            openedViaHoverRef.current = false;
            return;
          }
          if (open) {
            closeNow();
            return;
          }
          openNow(false);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setOpen((current) => {
              if (current) {
                openedViaHoverRef.current = false;
                return false;
              }
              return true;
            });
            return;
          }
          if (event.key === "Escape") {
            event.preventDefault();
            closeNow();
            triggerRef.current?.focus();
          }
        }}
      >
        {trigger}
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          data-testid="hover-dropdown-menu"
          className={`absolute top-full z-40 rounded-b border border-gray-200 bg-white py-1 ${align === "right" ? "right-0" : "left-0"}`}
          style={{
            minWidth,
            borderTop: "2px solid #1f2a44",
            boxShadow: "0 6px 18px rgba(15,23,41,0.08)",
          }}
          onClick={(event) => {
            // SAFETY-DRIVER-FILES-DETAIL-STUCK-ON-NAV-AWAY: close the menu when a
            // child link/button is clicked so the dropdown doesn't stay mounted-open
            // across navigation, which contributes to stale Outlet content.
            const target = event.target as HTMLElement;
            if (target.closest("a, button, [role='menuitem']")) {
              closeNow();
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              closeNow();
              triggerRef.current?.focus();
            }
          }}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
