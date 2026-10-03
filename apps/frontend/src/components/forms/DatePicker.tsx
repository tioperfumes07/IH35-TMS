import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Calendar } from "lucide-react";
import { formatDateUS, parseDateUS, DATE_PLACEHOLDER_US } from "../../lib/formatDate";
import "../../design/ih35-design-tokens.css";

// Shared QuickBooks-style date field. Value is "YYYY-MM-DD".
// MOD-02/03 (GO-MECH-0901): typed MM/DD/YYYY + month/year jump + Escape closes
// picker only (not parent wizard) — same pattern as DateTimePicker (#19067).
//
// ROUND 297 / UI-F9637 sibling: DateTimePicker (d47a908929) portaled to document.body because
// `absolute` inside the field wrapper was clipped by every modal's overflow. DatePicker had the
// same defect — CustomerDetail quality-event modal, Amortization, Loan wizard, MonthClose. Same
// fix: portal + fixed placement measured from the trigger, flip above when no room below, clamp
// to viewport, outside-click tests the popover node, w-72 + min 7.5rem month select.
type Props = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
  id?: string;
  placeholder?: string;
  /** Inclusive bounds as "YYYY-MM-DD"; out-of-range days are disabled in the calendar. */
  max?: string;
  min?: string;
  "aria-label"?: string;
  "data-testid"?: string;
  /**
   * OWNER DESIGN LAW 2026-10-02 rule 3: ONE date box width — 132px, never full-width, never sized by its container.
   * "filter" = a filter-bar date (34px tall), "field" = a date being edited in a form (40px tall). When set, any width
   * or height in className is ignored. Opt-in so screens move to the board sizes surface by surface.
   */
  box?: "filter" | "field";
};

const DOW = ["S", "M", "T", "W", "T", "F", "S"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function toISO(y: number, m: number, d: number) {
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}
function parseISO(v: string): { y: number; m: number; d: number } | null {
  const mt = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!mt) return null;
  return { y: Number(mt[1]), m: Number(mt[2]) - 1, d: Number(mt[3]) };
}

function yearRange(viewY: number, min?: string, max?: string): number[] {
  const parsedMin = min ? parseISO(min) : null;
  const parsedMax = max ? parseISO(max) : null;
  const start = parsedMin?.y ?? viewY - 50;
  const end = parsedMax?.y ?? viewY + 10;
  const years: number[] = [];
  for (let y = start; y <= end; y += 1) years.push(y);
  return years.length > 0 ? years : [viewY];
}

/**
 * className is LAYOUT ONLY (width / margin / display). The control owns the single
 * QBO border chrome. Callers that pass `border` / `rounded` / `px-*` / `py-*` used to
 * paint a second box around the control (Assignment History From/To — CLS box-in-box).
 */
function partitionDatePickerClassName(className: string): { shell: string; buttonHeight: string } {
  const shell: string[] = [];
  let buttonHeight = "";
  for (const token of className.trim().split(/\s+/).filter(Boolean)) {
    if (
      /^(rounded|border|px-|py-|p-|pt-|pb-|pl-|pr-|text-|focus:|hover:border)/.test(token) ||
      token.startsWith("border-") ||
      token.startsWith("rounded-")
    ) {
      continue;
    }
    if (/^h-/.test(token)) {
      buttonHeight = token;
      continue;
    }
    shell.push(token);
  }
  return { shell: shell.join(" "), buttonHeight };
}

export function DatePicker({
  value,
  onChange,
  className = "",
  disabled,
  id,
  placeholder,
  max,
  min,
  "aria-label": ariaLabel,
  "data-testid": dataTestId,
  box,
}: Props) {
  const isOutOfRange = (iso: string) => Boolean((max && iso > max) || (min && iso < min));
  const partitioned = partitionDatePickerClassName(className);
  const { buttonHeight } = partitioned;
  // Board box: the width is the date token, not the container's (w-* / flex-* layout tokens are dropped).
  const shell = box
    ? partitioned.shell.split(/\s+/).filter((t) => !/^(w-|min-w-|max-w-|flex-1|grow|basis-)/.test(t)).join(" ")
    : partitioned.shell;
  const [open, setOpen] = useState(false);
  const [dateDraft, setDateDraft] = useState("");
  const [editingDate, setEditingDate] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const calendarButtonRef = useRef<HTMLButtonElement>(null);
  // DATEPICKER-CLICKTHROUGH-REOPEN: picking a day unmounts the popover; the leftover click
  // lands on the trigger and toggles the calendar open again.
  const suppressToggleRef = useRef(false);
  const parsed = parseISO(value);
  const today = new Date();
  const [viewY, setViewY] = useState(parsed?.y ?? today.getFullYear());
  const [viewM, setViewM] = useState(parsed?.m ?? today.getMonth());

  useEffect(() => {
    const p = parseISO(value);
    if (p) {
      setViewY(p.y);
      setViewM(p.m);
    }
  }, [value]);

  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const placePopover = useCallback(() => {
    const anchor = ref.current;
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    const PANEL_W = 288; // w-72 — full month name beside year (was w-56 → ~50px month)
    const PANEL_H = popoverRef.current?.offsetHeight ?? 280;
    const GAP = 4;
    const roomBelow = window.innerHeight - r.bottom;
    const top =
      roomBelow < PANEL_H + GAP && r.top > PANEL_H + GAP
        ? Math.max(GAP, r.top - PANEL_H - GAP)
        : Math.min(r.bottom + GAP, Math.max(GAP, window.innerHeight - PANEL_H - GAP));
    const left = Math.min(Math.max(GAP, r.left), Math.max(GAP, window.innerWidth - PANEL_W - GAP));
    setPopoverPos({ top, left, width: PANEL_W });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setPopoverPos(null);
      return;
    }
    placePopover();
    window.addEventListener("scroll", placePopover, true);
    window.addEventListener("resize", placePopover);
    return () => {
      window.removeEventListener("scroll", placePopover, true);
      window.removeEventListener("resize", placePopover);
    };
  }, [open, placePopover]);

  useEffect(() => {
    function onDoc(e: PointerEvent) {
      const t = e.target as Node;
      const inField = ref.current?.contains(t) ?? false;
      const inPopover = popoverRef.current?.contains(t) ?? false;
      if (!inField && !inPopover) {
        // DATEPICKER-LABEL-CLICKTHROUGH-REOPEN: label text click → outside close → synthetic
        // activate of associated control. Suppress one follow-up toggle.
        if (open) {
          suppressToggleRef.current = true;
          setTimeout(() => {
            suppressToggleRef.current = false;
          }, 0);
        }
        setOpen(false);
      }
    }
    // Escape closes ONLY this popover — stopPropagation so parent wizard modals stay open (MOD-02).
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape" || !open) return;
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      (dateInputRef.current ?? calendarButtonRef.current)?.focus();
    }
    if (open) {
      document.addEventListener("pointerdown", onDoc);
      document.addEventListener("keydown", onKey, true);
    }
    return () => {
      document.removeEventListener("pointerdown", onDoc);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  const commitDateDraft = () => {
    setEditingDate(false);
    const parsedDate = parseDateUS(dateDraft);
    if (!parsedDate) {
      setDateDraft(value ? formatDateUS(value) : "");
      return;
    }
    if (isOutOfRange(parsedDate)) return;
    onChange(parsedDate);
  };

  const firstDay = new Date(viewY, viewM, 1).getDay();
  const daysInMonth = new Date(viewY, viewM + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i += 1) cells.push(null);
  for (let d = 1; d <= daysInMonth; d += 1) cells.push(d);

  const prevMonth = () => {
    if (viewM === 0) {
      setViewM(11);
      setViewY(viewY - 1);
    } else setViewM(viewM - 1);
  };
  const nextMonth = () => {
    if (viewM === 11) {
      setViewM(0);
      setViewY(viewY + 1);
    } else setViewM(viewM + 1);
  };

  const dateInputValue = editingDate ? dateDraft : value ? formatDateUS(value) : "";
  const years = yearRange(viewY, min, max);
  const heightClass = box ? "" : buttonHeight || "h-9";
  const boxStyle = box
    ? {
        height: box === "field" ? "var(--ih-h-field)" : "var(--ih-h-control)",
        borderColor: "var(--ih-border-control)",
        borderRadius: "var(--ih-radius)",
        fontSize: "var(--ih-fs-body)",
        fontVariantNumeric: "tabular-nums" as const,
      }
    : undefined;

  return (
    <div
      className={`relative ${shell}`.trim()}
      ref={ref}
      data-testid={dataTestId}
      data-date-box={box}
      style={box ? { width: "var(--ih-w-date)", flex: "none" } : undefined}
    >
      <div
        className={`flex ${heightClass} w-full items-center gap-1 rounded-sm border border-gray-300 px-2 text-left text-xs ${
          disabled ? "cursor-not-allowed bg-gray-50 text-gray-400" : "bg-white"
        }`}
        style={boxStyle}
      >
        <input
          id={id}
          ref={dateInputRef}
          type="text"
          inputMode="numeric"
          disabled={disabled}
          aria-label={ariaLabel}
          placeholder={placeholder || DATE_PLACEHOLDER_US}
          // dp-input: marks this as DatePicker's OWN internal input so page-level CSS (e.g.
          // .ldt-fld input) that targets bare <input> elements does not paint a second
          // border/background around it — see tokens-load-detail.css ROUND 16.18 comment.
          className="dp-input min-w-0 flex-1 bg-transparent outline-hidden placeholder:text-gray-400 disabled:cursor-not-allowed"
          value={dateInputValue}
          onFocus={() => {
            setEditingDate(true);
            setDateDraft(value ? formatDateUS(value) : "");
          }}
          onChange={(e) => setDateDraft(e.target.value)}
          onBlur={commitDateDraft}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitDateDraft();
              dateInputRef.current?.blur();
            }
            if (e.key === "Escape" && open) {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
            }
          }}
        />
        <button
          ref={calendarButtonRef}
          type="button"
          disabled={disabled}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={ariaLabel ? `${ariaLabel} calendar` : "Open calendar"}
          className="shrink-0 rounded-sm p-0.5 hover:bg-gray-100 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          onClick={() => {
            if (suppressToggleRef.current) {
              suppressToggleRef.current = false;
              return;
            }
            setOpen((o) => !o);
          }}
        >
          <Calendar className="h-3.5 w-3.5 text-gray-400" />
        </button>
      </div>
      {open && popoverPos && createPortal(
        <div
          ref={popoverRef}
          role="dialog"
          aria-label="Choose date"
          data-date-picker-popover="open"
          className="fixed z-[1000] rounded-sm border border-gray-300 bg-white p-2 shadow-lg"
          style={{ top: popoverPos.top, left: popoverPos.left, width: popoverPos.width }}
          onMouseDown={(e) => {
            // U21 (owner): preventDefault keeps focus in the date field for day clicks — but on a native <select> it also
            // stops the browser from OPENING it, so the Month and Year selectors could never be changed with the mouse
            // ("the calendars cannot change the YEAR"). Let form controls take their own mousedown.
            const t = e.target as HTMLElement;
            if (!t.closest("select, option, input, textarea")) e.preventDefault();
            e.stopPropagation();
          }}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
              (dateInputRef.current ?? calendarButtonRef.current)?.focus();
            }
          }}
        >
          <div className="mb-1 flex items-center justify-between gap-1">
            <button type="button" className="min-h-[34px] rounded-sm px-2 hover:bg-gray-100 sm:min-h-0" onClick={prevMonth} aria-label="Previous month">
              ‹
            </button>
            <div className="flex min-w-0 flex-1 items-center gap-1">
              <select
                aria-label="Month"
                className="dp-select min-w-[7.5rem] flex-1 rounded-sm border border-gray-200 px-1 py-0.5 text-xs tabular-nums"
                value={viewM}
                onChange={(e) => setViewM(Number(e.target.value))}
              >
                {MONTHS.map((label, index) => (
                  <option key={label} value={index}>
                    {label}
                  </option>
                ))}
              </select>
              <select
                aria-label="Year"
                className="dp-select w-16 rounded-sm border border-gray-200 px-1 py-0.5 text-xs tabular-nums"
                value={viewY}
                onChange={(e) => setViewY(Number(e.target.value))}
              >
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
            <button type="button" className="min-h-[34px] rounded-sm px-2 hover:bg-gray-100 sm:min-h-0" onClick={nextMonth} aria-label="Next month">
              ›
            </button>
          </div>
          <div className="grid grid-cols-7 gap-0.5 text-center text-xs text-gray-400">
            {DOW.map((d, i) => (
              <div key={i}>{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((d, i) =>
              d == null ? (
                <div key={i} />
              ) : (
                (() => {
                  const iso = toISO(viewY, viewM, d);
                  const outOfRange = isOutOfRange(iso);
                  const selected = parsed && parsed.d === d && parsed.m === viewM && parsed.y === viewY;
                  return (
                    <button
                      key={i}
                      type="button"
                      disabled={outOfRange}
                      aria-label={iso}
                      aria-current={selected ? "date" : undefined}
                      className={`min-h-[34px] rounded py-1 text-xs sm:min-h-0 ${
                        outOfRange
                          ? "cursor-not-allowed text-gray-300"
                          : `hover:bg-slate-100 ${selected ? "bg-slate-700 text-white hover:bg-slate-700" : ""}`
                      }`}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (outOfRange) return;
                        onChange(iso);
                        suppressToggleRef.current = true;
                        setOpen(false);
                      }}
                    >
                      {d}
                    </button>
                  );
                })()
              )
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
