import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useTranslation } from "../../hooks/useTranslation";
import { FILTER_CONTROL_HEIGHT_CLASS, FILTER_CONTROL_SIZE_CLASS } from "../../design/tokens";

// LV-AUDIT-HISTORY-STATUS-SOURCE-SINGLE-SELECT: filters like Status/Source/Event type are naturally
// multi-valued ("show me Active OR Inactive", "show me Dispatch OR Safety events") — a QuickBooks-style
// single native <select> can only ever isolate one value at a time, forcing a re-query per value to see
// the full picture. Checkbox-list dropdown, immediate-apply (no separate Apply button — a filter toggle
// should take effect the moment it's checked, matching every other checkbox filter in the app).
export type MultiSelectOption = { value: string; label: string };

type Props = {
  label: string;
  options: MultiSelectOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  allLabel?: string;
  className?: string;
  /** Overrides the trigger button's own classes (default box below) — a caller with its own
   *  locked control tokens (e.g. banking's BankingControlBox) passes its full recipe here instead
   *  of fighting the default className with overrides. */
  triggerClassName?: string;
  "data-testid"?: string;
  /** FILTER-MULTI-01: large reference lists (Vendor/Customer/Unit/Trailer/Driver/Load/Account/Class)
   *  need a type-to-narrow box inside the open panel — a plain checkbox list of hundreds/thousands
   *  of options is unusable. Small enumerated fields (Status/Category/Type) can omit this. */
  searchable?: boolean;
  searchPlaceholder?: string;
  onSearch?: (query: string) => void;
  serverSearch?: boolean;
  disabled?: boolean;
  loading?: boolean;
  listNotice?: string;
  selectedChips?: boolean;
  /** V3 board trigger (docs/design/v3/Reports-*.dc.html "Status ▾"): 28px · 6px · 600 12px Inter · #DDE1E7 border. */
  board?: boolean;
  /**
   * Board mode only: no wrapper — the trigger is a direct child of the caller's bar, as the report-family designs draw it
   * (Dispatch-LoadHistory / Reports-*: a <button> straight inside the white filter bar). The menu opens in a portal at the
   * trigger. Reader 11-16: report filter buttons read their wrapper as parent (block, no padding), not the bar.
   */
  flat?: boolean;
};

// ROUND 12 (reader 11-16 00:48Z): the report-family designs (Dispatch-LoadHistory, Reports-*) draw these as <button>, whose
// box is border-box: 28px tall including the border (ours drew 30). #29725's content-box was the wrong reading.
const BOARD_TRIGGER = { height: 28, boxSizing: "border-box", padding: "0 12px", display: "inline-flex", alignItems: "center", borderRadius: 6, fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif", fontSize: 12, fontWeight: 600, background: "#fff", color: "#111827", border: "1px solid #DDE1E7", lineHeight: "normal", flexShrink: 0, cursor: "pointer" } as const; // white-space normal as drawn; never shrinks, so never wraps

export function MultiSelectDropdown({
  label,
  options,
  selected,
  onChange,
  allLabel = "All",
  className,
  triggerClassName,
  searchable = false,
  searchPlaceholder = "Type to narrow…",
  onSearch,
  serverSearch = false,
  disabled = false,
  loading = false,
  listNotice,
  selectedChips = false,
  board = false,
  flat = false,
  ...rest
}: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const flatBoard = board && flat;
  const [menuAt, setMenuAt] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (flatBoard) {
        if (!btnRef.current?.contains(t) && !menuRef.current?.contains(t)) setOpen(false);
        return;
      }
      if (ref.current && !ref.current.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, flatBoard]);

  useEffect(() => {
    if (!open || !flatBoard || !btnRef.current) { setMenuAt(null); return; }
    const r = btnRef.current.getBoundingClientRect();
    setMenuAt({ top: r.bottom + 4, left: r.left });
  }, [open, flatBoard]);

  useEffect(() => {
    if (!open) { setQuery(""); onSearch?.(""); }
  }, [open, onSearch]);

  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);

  const toggle = (value: string) => {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  };

  // FILTER-MULTI-01: the closed label must never render a truncated value list — always the
  // filter's own name plus a count, e.g. "Status (3)". Zero selected reads as the plain label
  // (or allLabel, when the caller wants an explicit "All" state) so an untouched filter never
  // looks like it's already narrowing anything.
  const summary = selected.length === 0 ? allLabel : `${label} (${selected.length})`;

  const visibleOptions = useMemo(() => {
    if (serverSearch || !searchable || !query.trim()) return options;
    const q = query.trim().toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query, searchable, serverSearch]);

  const menuEl = (
        <div
          role="group"
          aria-label={label}
          className={`${flatBoard ? "" : "absolute z-20 mt-1 "}max-h-72 w-56 overflow-y-auto rounded-sm border border-gray-300 bg-white p-1 shadow-lg`}
        >
          {searchable ? (
            <input
              autoFocus
              value={query}
              onChange={(e) => { setQuery(e.target.value); onSearch?.(e.target.value); }}
              placeholder={searchPlaceholder}
              className={`mb-1 w-full rounded-sm border border-gray-300 px-2 text-xs ${FILTER_CONTROL_HEIGHT_CLASS}`}
              data-testid={rest["data-testid"] ? `${rest["data-testid"]}-search` : undefined}
            />
          ) : null}
          {loading ? <p role="status" className="px-2 py-1 text-xs">{t("common.loading_options", "Loading options…")}</p> : null}
          {listNotice ? <p className="px-2 py-1 text-xs">{listNotice}</p> : null}
          {visibleOptions.length ? <button type="button" onClick={() => onChange([...new Set([...selected, ...visibleOptions.map(option => option.value)])])} className="flex w-full rounded-sm px-2 py-1 text-left text-xs hover:bg-gray-100">{t("common.select_shown", "Select shown")}</button> : null}
          <button
            type="button"
            aria-pressed={selected.length === 0}
            onClick={() => onChange([])}
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left text-xs hover:bg-gray-100"
          >
            <input type="checkbox" readOnly tabIndex={-1} aria-hidden="true" checked={selected.length === 0} className="pointer-events-none" />
            {allLabel}
          </button>
          {visibleOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              aria-pressed={selected.includes(opt.value)}
              onClick={() => toggle(opt.value)}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left text-xs hover:bg-gray-100"
            >
              <input type="checkbox" readOnly tabIndex={-1} aria-hidden="true" checked={selected.includes(opt.value)} className="pointer-events-none" />
              <span className="truncate">{opt.label}</span>
            </button>
          ))}
          {searchable && visibleOptions.length === 0 ? (
            <p className="px-2 py-1 text-xs text-gray-500">No matches for &ldquo;{query}&rdquo;</p>
          ) : null}
        </div>
  );

  if (flatBoard) {
    return (
      <>
      <button
        ref={btnRef}
        data-testid={rest["data-testid"]}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        style={board ? BOARD_TRIGGER : undefined}
        className={board ? undefined : 
          triggerClassName ??
          // ONE CONTROL HEIGHT (OWNER DESIGN LAW 2026-10-02 rule 2, owner report 2026-10-04: "ALL BOXES,
          // DATES, FILTERS ETC MUST BE UNIFORM FOLLOWING STANDARD DESIGN HEIGHTS"). This trigger carried
          // NO height class at all -- py-1 let the glyph set its own height, so every one of the 27 call
          // sites rendered a multi-select a few pixels shorter than the Combobox/date/search controls
          // beside it. Take the height from the one token every other filter control takes it from.
          `mt-1 flex items-center justify-between gap-1 rounded-sm border border-gray-300 bg-white px-2 text-gray-900 hover:bg-gray-50 ${FILTER_CONTROL_SIZE_CLASS}`
        }
        aria-haspopup="true"
        aria-expanded={open}
      >
        {board ? (
          <>{selected.length === 0 ? (allLabel?.endsWith("▾") ? allLabel.replace(/\s*▾$/, "") : label) : `${label} (${selected.length})`} ▾</>
        ) : (
          <>
            <span className="max-w-[10rem] truncate">{summary}</span>
            <ChevronDown className="h-3.5 w-3.5 text-gray-500" />
          </>
        )}
      </button>
        {open && menuAt && typeof document !== "undefined"
          ? createPortal(<div ref={menuRef} style={{ position: "fixed", top: menuAt.top, left: menuAt.left, zIndex: 60 }}>{menuEl}</div>, document.body)
          : null}
      </>
    );
  }

  return (
    <div ref={ref} className={`relative ${className ?? ""}`} data-testid={rest["data-testid"]}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        style={board ? BOARD_TRIGGER : undefined}
        className={board ? undefined : 
          triggerClassName ??
          // ONE CONTROL HEIGHT (OWNER DESIGN LAW 2026-10-02 rule 2, owner report 2026-10-04: "ALL BOXES,
          // DATES, FILTERS ETC MUST BE UNIFORM FOLLOWING STANDARD DESIGN HEIGHTS"). This trigger carried
          // NO height class at all -- py-1 let the glyph set its own height, so every one of the 27 call
          // sites rendered a multi-select a few pixels shorter than the Combobox/date/search controls
          // beside it. Take the height from the one token every other filter control takes it from.
          `mt-1 flex items-center justify-between gap-1 rounded-sm border border-gray-300 bg-white px-2 text-gray-900 hover:bg-gray-50 ${FILTER_CONTROL_SIZE_CLASS}`
        }
        aria-haspopup="true"
        aria-expanded={open}
      >
        {board ? (
          <>{selected.length === 0 ? (allLabel?.endsWith("▾") ? allLabel.replace(/\s*▾$/, "") : label) : `${label} (${selected.length})`} ▾</>
        ) : (
          <>
            <span className="max-w-[10rem] truncate">{summary}</span>
            <ChevronDown className="h-3.5 w-3.5 text-gray-500" />
          </>
        )}
      </button>
      {selectedChips && selected.length ? <div className="flex flex-wrap gap-1" aria-label={`${label} selections`}>
        {selected.map(value => <button key={value} type="button" disabled={disabled}
          onClick={() => onChange(selected.filter(id => id !== value))}
          aria-label={`Remove ${options.find(option => option.value === value)?.label ?? label}`}
          className={`max-w-full truncate rounded-sm border border-gray-300 px-2 text-xs ${FILTER_CONTROL_HEIGHT_CLASS}`}>
          {options.find(option => option.value === value)?.label ?? label} ×
        </button>)}
      </div> : null}
      {open ? menuEl : null}
      {/* Board mode: the trigger's own text ("Status ▾") names it — a second, hidden "Status" would be a stray node the
          V3 board does not draw. */}
      {board ? null : <span className="sr-only">{label}</span>}
    </div>
  );
}
