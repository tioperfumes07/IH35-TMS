import { useEffect, useRef, useState } from "react";
import { Calendar } from "lucide-react";
import { formatDateUS, DATE_PLACEHOLDER_US } from "../../lib/formatDate";

// Shared QuickBooks-style date field — click to open a month calendar and pick a day,
// instead of typing per sub-field (Block P). Value is "YYYY-MM-DD".
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
  "data-testid"?: string;
};

const DOW = ["S", "M", "T", "W", "T", "F", "S"];

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

/**
 * className is LAYOUT ONLY (width / margin / display). The button owns the single
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

export function DatePicker({ value, onChange, className = "", disabled, id, placeholder, max, min, "data-testid": dataTestId }: Props) {
  const isOutOfRange = (iso: string) => Boolean((max && iso > max) || (min && iso < min));
  const { shell, buttonHeight } = partitionDatePickerClassName(className);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // DATEPICKER-CLICKTHROUGH-REOPEN: picking a day unmounts the popover; the leftover click
  // lands on the trigger and toggles the calendar open again (looks like a seize / auto-close).
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

  useEffect(() => {
    function onDoc(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        // DATEPICKER-LABEL-CLICKTHROUGH-REOPEN: several callers wrap this component in a bare
        // <label>text<DatePicker/></label> (implicit label-for). Clicking the label's own text
        // node is a real click OUTSIDE ref.current (it fires this outside-mousedown close), but
        // the browser then separately activates the label's associated control -- the trigger
        // <button> below -- with a synthetic click, which toggles it straight back open. Net
        // effect: "click outside to close" silently no-ops (live-confirmed via a MutationObserver
        // on /lists/accounting/chart-of-accounts "Balance As Of": one physical click produced
        // REMOVE then ADD of the popover ~2ms apart). Reuse the existing day-pick suppression
        // ref for this one synthetic follow-up click, self-clearing on the next tick so a later,
        // genuinely separate click on the trigger is never swallowed.
        if (open) {
          suppressToggleRef.current = true;
          setTimeout(() => {
            suppressToggleRef.current = false;
          }, 0);
        }
        setOpen(false);
      }
    }
    if (open) document.addEventListener("pointerdown", onDoc);
    return () => document.removeEventListener("pointerdown", onDoc);
  }, [open]);

  const firstDay = new Date(viewY, viewM, 1).getDay();
  const daysInMonth = new Date(viewY, viewM + 1, 0).getDate();
  const monthLabel = new Date(viewY, viewM, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
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

  return (
    <div className={`relative ${shell}`.trim()} ref={ref} data-testid={dataTestId}>
      <button
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => {
          if (suppressToggleRef.current) {
            suppressToggleRef.current = false;
            return;
          }
          setOpen((o) => !o);
        }}
        className={`flex ${buttonHeight || "h-9"} w-full items-center justify-between gap-1 rounded-sm border border-gray-300 px-2 text-left text-[13px]`}
      >
        <span className={value ? "" : "text-gray-400"}>{value ? formatDateUS(value) : placeholder || DATE_PLACEHOLDER_US}</span>
        <Calendar className="h-3.5 w-3.5 text-gray-400" />
      </button>
      {open && (
        <div
          className="absolute z-50 mt-1 w-56 rounded-sm border border-gray-300 bg-white p-2 shadow-lg"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-1 flex items-center justify-between">
            <button type="button" className="rounded-sm px-2 hover:bg-gray-100" onClick={prevMonth} aria-label="Previous month">‹</button>
            <span className="text-xs font-semibold">{monthLabel}</span>
            <button type="button" className="rounded-sm px-2 hover:bg-gray-100" onClick={nextMonth} aria-label="Next month">›</button>
          </div>
          <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] text-gray-400">
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
                      className={`rounded py-1 text-xs ${
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
        </div>
      )}
    </div>
  );
}
