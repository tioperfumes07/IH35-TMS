import { type ReactNode, useEffect, useId, useRef, useState } from "react";

type Props = {
  trigger: ReactNode;
  children: ReactNode;
  align?: "left" | "right";
  delay?: number;
  minWidth?: number | string;
};

export function HoverDropdown({ trigger, children, align = "left", delay = 200, minWidth = 240 }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const menuId = useId();

  function clearCloseTimer() {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }

  function openNow() {
    clearCloseTimer();
    setOpen(true);
  }

  function closeSoon() {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => setOpen(false), delay);
  }

  function closeNow() {
    clearCloseTimer();
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
    <div ref={rootRef} className="relative" onMouseEnter={openNow} onMouseLeave={closeSoon}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => {
          if (open) {
            closeNow();
            return;
          }
          openNow();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setOpen((current) => !current);
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
          className={`absolute top-full z-40 rounded-b border border-gray-200 bg-white py-1 ${align === "right" ? "right-0" : "left-0"}`}
          style={{
            minWidth,
            borderTop: "2px solid #1f2a44",
            boxShadow: "0 6px 18px rgba(15,23,41,0.08)",
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
