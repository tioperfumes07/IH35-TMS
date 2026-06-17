import { useEffect, useRef, useState } from "react";
import { Calendar } from "lucide-react";

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

export function DatePicker({ value, onChange, className = "", disabled, id, placeholder, max, min, "data-testid": dataTestId }: Props) {
  const isOutOfRange = (iso: string) => Boolean((max && iso > max) || (min && iso < min));
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
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
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
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
    <div className={`relative ${className}`} ref={ref} data-testid={dataTestId}>
      <button
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="flex h-7 w-full items-center justify-between gap-1 rounded border border-gray-300 px-2 text-left text-xs"
      >
        <span className={value ? "" : "text-gray-400"}>{value || placeholder || "Select date"}</span>
        <Calendar className="h-3.5 w-3.5 text-gray-400" />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-56 rounded border border-gray-300 bg-white p-2 shadow-lg">
          <div className="mb-1 flex items-center justify-between">
            <button type="button" className="rounded px-2 hover:bg-gray-100" onClick={prevMonth} aria-label="Previous month">‹</button>
            <span className="text-xs font-semibold">{monthLabel}</span>
            <button type="button" className="rounded px-2 hover:bg-gray-100" onClick={nextMonth} aria-label="Next month">›</button>
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
                      onClick={() => {
                        if (outOfRange) return;
                        onChange(iso);
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
