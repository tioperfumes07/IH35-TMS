import { useEffect, useRef, useState } from "react";
import { Calendar } from "lucide-react";
import { formatDateTimeLocalUS, DATETIME_PLACEHOLDER_US } from "../../lib/formatDate";

// Shared QuickBooks-style date+time field (C3) — the time-of-day sibling of DatePicker.
//
// WHY THIS EXISTS: `verify-no-raw-date-input` (verify-step 107) has always exempted
// `<input type="datetime-local">` with the reason "no DatePicker time-of-day equivalent exists yet".
// This is that equivalent, so the exemption is retired and verify-step 1553 now enforces it.
//
// The native control it replaces is locale-dependent — a browser set to es-MX renders DD/MM/YYYY,
// so on a Laredo<->Mexico operation two dispatchers could read the same field as two different days.
// This control always renders MM/DD/YYYY, h:mm AM/PM.
//
// VALUE CONTRACT — deliberately identical to `<input type="datetime-local">` so every call site is a
// drop-in: `value` and `onChange` carry a LOCAL WALL-CLOCK string "YYYY-MM-DDTHH:mm" with no zone
// and no seconds. Call sites that need an instant keep doing their own conversion at the boundary
// exactly as they did before (e.g. SafetyEventsPage's toDatetimeLocalValue/fromDatetimeLocalValue),
// so this change is presentation-only and no stored value changes shape.
//
// TIMEZONE CORRECTNESS: the string is never round-tripped through `new Date()`. Parsing the parts
// keeps the displayed day/time identical to the stored day/time — the same rule formatDate.ts
// applies for dates, for the same reason (a Date built from a zoneless string is interpreted in the
// viewer's zone and drifts).
type Props = {
  /** Local wall-clock "YYYY-MM-DDTHH:mm" (same as a native datetime-local value). */
  value: string;
  onChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
  id?: string;
  placeholder?: string;
  /** Inclusive bounds as "YYYY-MM-DDTHH:mm"; out-of-range days are disabled in the calendar. */
  min?: string;
  max?: string;
  "aria-label"?: string;
  "aria-describedby"?: string;
  "data-testid"?: string;
};

const DOW = ["S", "M", "T", "W", "T", "F", "S"];
const DEFAULT_TIME = "09:00";

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function toISODate(y: number, m: number, d: number) {
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}

/** Split "YYYY-MM-DDTHH:mm" into its date and time halves. Tolerates a seconds/zone tail. */
function splitValue(v: string): { date: string; time: string } {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(v);
  if (!m) return { date: "", time: "" };
  return { date: m[1], time: m[2] };
}
function parseDate(dateStr: string): { y: number; m: number; d: number } | null {
  const mt = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!mt) return null;
  return { y: Number(mt[1]), m: Number(mt[2]) - 1, d: Number(mt[3]) };
}

export function DateTimePicker({
  value,
  onChange,
  className = "",
  disabled,
  id,
  placeholder,
  min,
  max,
  "aria-label": ariaLabel,
  "aria-describedby": ariaDescribedBy,
  "data-testid": dataTestId,
}: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const { date: valueDate, time: valueTime } = splitValue(value);
  const parsed = parseDate(valueDate);
  const today = new Date();
  const [viewY, setViewY] = useState(parsed?.y ?? today.getFullYear());
  const [viewM, setViewM] = useState(parsed?.m ?? today.getMonth());

  useEffect(() => {
    const p = parseDate(splitValue(value).date);
    if (p) {
      setViewY(p.y);
      setViewM(p.m);
    }
  }, [value]);

  useEffect(() => {
    function onDoc(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    // Escape closes and returns focus to the trigger (a11y — L4).
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    if (open) {
      document.addEventListener("pointerdown", onDoc);
      document.addEventListener("keydown", onKey);
    }
    return () => {
      document.removeEventListener("pointerdown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Bounds are compared on the full "YYYY-MM-DDTHH:mm" string. That format is lexicographically
  // ordered (fixed-width, big-endian), so a string compare IS a chronological compare.
  const isOutOfRange = (candidate: string) =>
    Boolean((max && candidate > max) || (min && candidate < min));

  // A day is only disabled when EVERY minute of it is out of range, so a boundary day stays
  // selectable and the time field decides. (Comparing the day's last minute against min and its
  // first minute against max.)
  const isDayFullyOutOfRange = (isoDate: string) =>
    Boolean((max && `${isoDate}T00:00` > max) || (min && `${isoDate}T23:59` < min));

  const commit = (nextDate: string, nextTime: string) => {
    if (!nextDate) {
      onChange("");
      return;
    }
    onChange(`${nextDate}T${nextTime || DEFAULT_TIME}`);
  };

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

  const display = value ? formatDateTimeLocalUS(value) : "";

  return (
    <div className={`relative ${className}`} ref={ref} data-testid={dataTestId}>
      <button
        id={id}
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        className="flex min-h-11 w-full items-center justify-between gap-1 rounded-sm border border-gray-300 px-2 py-1 text-left text-xs disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400 sm:min-h-0"
      >
        <span className={display ? "" : "text-gray-400"}>{display || placeholder || DATETIME_PLACEHOLDER_US}</span>
        <Calendar className="h-3.5 w-3.5 text-gray-400" />
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Choose date and time"
          className="absolute z-50 mt-1 w-56 rounded-sm border border-gray-300 bg-white p-2 shadow-lg"
        >
          <div className="mb-1 flex items-center justify-between">
            <button type="button" className="min-h-11 rounded-sm px-3 hover:bg-gray-100 sm:min-h-0" onClick={prevMonth} aria-label="Previous month">‹</button>
            <span className="text-xs font-semibold">{monthLabel}</span>
            <button type="button" className="min-h-11 rounded-sm px-3 hover:bg-gray-100 sm:min-h-0" onClick={nextMonth} aria-label="Next month">›</button>
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
                  const isoDate = toISODate(viewY, viewM, d);
                  const outOfRange = isDayFullyOutOfRange(isoDate);
                  const selected = parsed && parsed.d === d && parsed.m === viewM && parsed.y === viewY;
                  return (
                    <button
                      key={i}
                      type="button"
                      disabled={outOfRange}
                      aria-label={isoDate}
                      aria-current={selected ? "date" : undefined}
                      className={`rounded py-1 text-xs ${
                        outOfRange
                          ? "cursor-not-allowed text-gray-300"
                          : `hover:bg-slate-100 ${selected ? "bg-slate-700 text-white hover:bg-slate-700" : ""}`
                      }`}
                      onClick={() => {
                        if (outOfRange) return;
                        commit(isoDate, valueTime);
                      }}
                    >
                      {d}
                    </button>
                  );
                })()
              )
            )}
          </div>
          <div className="mt-2 flex items-center gap-2 border-t border-gray-200 pt-2">
            <label className="text-[10px] font-semibold uppercase text-gray-500" htmlFor={id ? `${id}-time` : undefined}>
              Time
            </label>
            {/* A native time field is intentional and is NOT the defect this block fixes: HH:mm has
                no MM/DD-vs-DD/MM ambiguity, so there is no locale hazard, and the OS time control is
                the best keyboard/AT experience available. Only the DATE half was locale-unsafe. */}
            <input
              id={id ? `${id}-time` : undefined}
              type="time"
              className="min-h-11 flex-1 rounded-sm border border-gray-300 px-1 py-0.5 text-xs sm:min-h-0"
              value={valueTime}
              onChange={(e) => commit(valueDate || toISODate(viewY, viewM, today.getDate()), e.target.value)}
            />
          </div>
          {value && isOutOfRange(value) ? (
            <p className="mt-1 text-[10px] text-gray-500">Outside the allowed range.</p>
          ) : null}
          {value ? (
            <button
              type="button"
              className="mt-1 w-full rounded-sm py-1 text-[10px] text-gray-500 hover:bg-gray-100"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
            >
              Clear
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
