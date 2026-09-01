import { useEffect, useRef, useState } from "react";
import { Calendar } from "lucide-react";
import {
  formatDateTimeLocalUS,
  formatDateUS,
  parseDateUS,
  DATETIME_PLACEHOLDER_US,
  DATE_PLACEHOLDER_US,
} from "../../lib/formatDate";

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

function yearRange(viewY: number, min?: string, max?: string): number[] {
  const parsedMin = min ? parseDate(splitValue(min).date) : null;
  const parsedMax = max ? parseDate(splitValue(max).date) : null;
  const start = parsedMin?.y ?? viewY - 50;
  const end = parsedMax?.y ?? viewY + 10;
  const years: number[] = [];
  for (let y = start; y <= end; y += 1) years.push(y);
  return years.length > 0 ? years : [viewY];
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
  const [dateDraft, setDateDraft] = useState("");
  const [editingDate, setEditingDate] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const calendarButtonRef = useRef<HTMLButtonElement>(null);

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
    // Escape closes ONLY this popover — stopPropagation so parent wizard modals stay open (Defect 6b).
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

  const commitDateDraft = () => {
    setEditingDate(false);
    const parsedDate = parseDateUS(dateDraft);
    if (!parsedDate) {
      setDateDraft(valueDate ? formatDateUS(valueDate) : "");
      return;
    }
    const candidate = `${parsedDate}T${valueTime || DEFAULT_TIME}`;
    if (isOutOfRange(candidate)) return;
    commit(parsedDate, valueTime);
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

  const timeDisplay = valueTime
    ? formatDateTimeLocalUS(value).replace(/^[^,]+,\s*/, "") || valueTime
    : "--:-- --";
  const dateInputValue = editingDate ? dateDraft : valueDate ? formatDateUS(valueDate) : "";
  const years = yearRange(viewY, min, max);

  return (
    <div className={`relative ${className}`} ref={ref} data-testid={dataTestId}>
      <div
        className={`flex min-h-11 w-full items-center gap-1 rounded-sm border border-gray-300 px-2 py-1 text-left text-xs disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400 sm:min-h-0 ${
          disabled ? "cursor-not-allowed bg-gray-50 text-gray-400" : "bg-white"
        }`}
      >
        <input
          id={id}
          ref={dateInputRef}
          type="text"
          inputMode="numeric"
          disabled={disabled}
          aria-label={ariaLabel}
          aria-describedby={ariaDescribedBy}
          placeholder={placeholder ? placeholder.split(",")[0]?.trim() || DATE_PLACEHOLDER_US : DATE_PLACEHOLDER_US}
          className="min-w-0 flex-1 bg-transparent outline-hidden placeholder:text-gray-400 disabled:cursor-not-allowed"
          value={dateInputValue}
          onFocus={() => {
            setEditingDate(true);
            setDateDraft(valueDate ? formatDateUS(valueDate) : "");
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
        <span className="shrink-0 text-gray-500">,</span>
        <span className="shrink-0 text-gray-700">{timeDisplay}</span>
        <button
          ref={calendarButtonRef}
          type="button"
          disabled={disabled}
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={ariaLabel ? `${ariaLabel} calendar` : "Open calendar"}
          className="shrink-0 rounded-sm p-0.5 hover:bg-gray-100 disabled:cursor-not-allowed disabled:hover:bg-transparent"
        >
          <Calendar className="h-3.5 w-3.5 text-gray-400" />
        </button>
      </div>
      {!valueDate && !editingDate && !open ? (
        <span className="sr-only">{placeholder || DATETIME_PLACEHOLDER_US}</span>
      ) : null}
      {open && (
        <div
          role="dialog"
          aria-label="Choose date and time"
          data-date-picker-popover="open"
          className="absolute z-50 mt-1 w-56 rounded-sm border border-gray-300 bg-white p-2 shadow-lg"
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
            <button type="button" className="min-h-11 rounded-sm px-2 hover:bg-gray-100 sm:min-h-0" onClick={prevMonth} aria-label="Previous month">
              ‹
            </button>
            <div className="flex min-w-0 flex-1 items-center gap-1">
              <select
                aria-label="Month"
                className="min-w-0 flex-1 rounded-sm border border-gray-200 px-1 py-0.5 text-[11px]"
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
                className="w-16 rounded-sm border border-gray-200 px-1 py-0.5 text-[11px]"
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
            <button type="button" className="min-h-11 rounded-sm px-2 hover:bg-gray-100 sm:min-h-0" onClick={nextMonth} aria-label="Next month">
              ›
            </button>
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
                setDateDraft("");
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
