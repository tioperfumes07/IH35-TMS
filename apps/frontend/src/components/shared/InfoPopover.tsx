// LEAD 443.174 — explanatory text lives behind an "i" button, never as a permanent paragraph above a table (owner 10-16:
// "the messages or info that appears should not be permanent … it should not make my screen smaller"). One shared
// component: click (or Enter / Space) opens a floating panel; Escape or a click outside closes it. Nothing reflows.
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

type Props = {
  /** Accessible name of the button, e.g. "About open bills". */
  label: string;
  children: ReactNode;
  /** Panel alignment under the button. */
  align?: "left" | "right";
  testId?: string;
};

export function InfoPopover({ label, children, align = "left", testId = "info-popover" }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span ref={ref} className="relative inline-flex align-middle" data-testid={testId}>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={panelId}
        title={label}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-[#6B7280] bg-white font-serif text-section-header font-bold italic leading-none text-[#4B5563] hover:bg-[#F7F8FA]"
        data-testid={`${testId}-button`}
      >
        i
      </button>
      {open ? (
        <span
          id={panelId}
          role="note"
          className={`absolute top-5 z-50 block w-80 max-w-[90vw] rounded border border-[#E5E7EB] bg-white p-3 text-left text-xs font-normal normal-case tracking-normal text-[#1F2A44] shadow-lg ${align === "right" ? "right-0" : "left-0"}`}
          data-testid={`${testId}-panel`}
        >
          {children}
        </span>
      ) : null}
    </span>
  );
}
