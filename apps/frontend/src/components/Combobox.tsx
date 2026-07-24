import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";

export type ComboboxOption = {
  value: string;
  label: string;
  sublabel?: string;
  disabled?: boolean;
};

type ComboboxProps = {
  options: ComboboxOption[];
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  loading?: boolean;
  error?: string;
  disabled?: boolean;
  allowClear?: boolean;
  allowAddNew?: { label: string; onAdd: (query: string) => void };
  /**
   * SAF-F31 — server-side type-ahead. Pickers that fetch a capped page (limit 200) silently hide
   * everything past the cap: with 300 units, the 250th could not be selected at all and nothing told
   * the operator. When provided, this fires on every query change so the parent can refetch from the
   * server, and local filtering is skipped (the server already filtered — filtering again would drop
   * server matches whose label does not literally contain the typed text).
   * Optional and additive: every existing call site keeps its current client-side behaviour.
   */
  onSearch?: (query: string) => void;
  filterMode?: "contains" | "startsWith" | "fuzzy";
  /** Focus target for form validation (`[data-field="…"]`). */
  dataField?: string;
  className?: string;
};

const MAX_VISIBLE_OPTIONS = 50;
const LISTBOX_MAX_HEIGHT = 256;

function scoreOption(label: string, query: string, filterMode: NonNullable<ComboboxProps["filterMode"]>) {
  const normalizedLabel = label.trim().toLowerCase();
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return 0;

  if (filterMode === "startsWith") {
    return normalizedLabel.startsWith(normalizedQuery) ? 0 : null;
  }
  if (filterMode === "fuzzy") {
    let score = 0;
    let position = 0;
    for (const character of normalizedQuery) {
      const nextPosition = normalizedLabel.indexOf(character, position);
      if (nextPosition === -1) return null;
      score += nextPosition === position ? 1 : 2;
      position = nextPosition + 1;
    }
    return score;
  }

  if (normalizedLabel.startsWith(normalizedQuery)) return 0;
  const containsAt = normalizedLabel.indexOf(normalizedQuery);
  if (containsAt >= 0) return 100 + containsAt;
  return null;
}

function measureListboxStyle(anchor: HTMLElement): CSSProperties {
  const rect = anchor.getBoundingClientRect();
  const gap = 4;
  const spaceBelow = window.innerHeight - rect.bottom - gap;
  const spaceAbove = rect.top - gap;
  const openUp = spaceBelow < 180 && spaceAbove > spaceBelow;
  const maxHeight = Math.min(LISTBOX_MAX_HEIGHT, Math.max(120, openUp ? spaceAbove : spaceBelow));
  const width = Math.max(rect.width, 200);

  if (openUp) {
    return {
      position: "fixed",
      left: rect.left,
      width,
      bottom: window.innerHeight - rect.top + gap,
      maxHeight,
      zIndex: 80,
    };
  }
  return {
    position: "fixed",
    left: rect.left,
    width,
    top: rect.bottom + gap,
    maxHeight,
    zIndex: 80,
  };
}

export function Combobox({
  options,
  value,
  onChange,
  placeholder = "Select...",
  loading = false,
  error,
  disabled = false,
  allowClear = false,
  allowAddNew,
  filterMode = "contains",
  dataField,
  className,
  onSearch,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const [listboxStyle, setListboxStyle] = useState<CSSProperties>({});
  const containerRef = useRef<HTMLDivElement | null>(null);
  const listboxRef = useRef<HTMLDivElement | null>(null);
  const listboxId = useMemo(() => `combobox-list-${Math.random().toString(36).slice(2, 10)}`, []);

  const selectedOption = useMemo(() => options.find((option) => option.value === value) ?? null, [options, value]);
  const displayValue = open ? query : selectedOption?.label ?? "";

  // SAF-F31: tell the parent what was typed so it can refetch server-side. Effect (not inline in the
  // input handler) so a programmatic query reset also reaches the parent and cannot leave the picker
  // showing results for a term the box no longer contains.
  useEffect(() => {
    if (!onSearch) return;
    onSearch(query);
  }, [onSearch, query]);

  const filteredOptions = useMemo(() => {
    const sourceOptions = options.filter((option) => !option.disabled);
    // When the server did the filtering, do not filter again — a server match whose label does not
    // literally contain the typed text (a unit matched by VIN, a load matched by customer) would be
    // dropped on the way to the screen.
    if (onSearch) return sourceOptions.slice(0, MAX_VISIBLE_OPTIONS);
    if (!query.trim()) {
      return sourceOptions.slice(0, MAX_VISIBLE_OPTIONS);
    }
    return sourceOptions
      .map((option) => ({
        option,
        score: scoreOption(option.label, query, filterMode),
      }))
      .filter((entry): entry is { option: ComboboxOption; score: number } => entry.score !== null)
      .sort((a, b) => {
        if (a.score !== b.score) return a.score - b.score;
        return a.option.label.localeCompare(b.option.label);
      })
      .map((entry) => entry.option)
      .slice(0, MAX_VISIBLE_OPTIONS);
  }, [filterMode, onSearch, options, query]);

  // QB-STD-1/2: "+ Add new" is always the FIRST row when allowAddNew is configured — visible
  // the moment the dropdown opens, before any keystroke. No typed-query gate.
  const showAddNew = Boolean(allowAddNew);

  // Add row label: generic when no query; includes typed name when the user is creating a new one.
  const hasExactMatch = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return false;
    return options.some((option) => option.label.trim().toLowerCase() === normalizedQuery);
  }, [options, query]);

  const addRowLabel = allowAddNew
    ? query.trim() && !hasExactMatch
      ? `${allowAddNew.label} "${query.trim()}"`
      : allowAddNew.label
    : "";

  // Layout: add row is index 0 (when showAddNew), filtered options are 1..n.
  // totalRows drives ArrowUp/ArrowDown wrap-around.
  const totalRowCount = filteredOptions.length + (showAddNew ? 1 : 0);

  useLayoutEffect(() => {
    if (!open || !containerRef.current) return;
    setListboxStyle(measureListboxStyle(containerRef.current));
  }, [open, filteredOptions.length, loading, showAddNew]);

  useEffect(() => {
    if (!open) return;
    function reposition() {
      if (!containerRef.current) return;
      setListboxStyle(measureListboxStyle(containerRef.current));
    }
    window.addEventListener("resize", reposition);
    // Capture: ParityTable and other overflow-x-auto ancestors scroll without bubbling.
    document.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      document.removeEventListener("scroll", reposition, true);
    };
  }, [open]);

  useEffect(() => {
    function onDocumentClick(event: MouseEvent) {
      const target = event.target as Node | null;
      if (!target) return;
      if (containerRef.current?.contains(target)) return;
      if (listboxRef.current?.contains(target)) return;
      setOpen(false);
      setQuery("");
      setActiveIndex(-1);
    }
    document.addEventListener("mousedown", onDocumentClick);
    return () => document.removeEventListener("mousedown", onDocumentClick);
  }, []);

  // Single-open coordinator (app-wide): only one Combobox stays open at a time. When this one
  // opens it broadcasts its id; every other currently-open Combobox (which has a live listener
  // while open) hears it and closes. Complements the outside-click/Escape handlers above.
  useEffect(() => {
    if (!open) return;
    function onOtherOpen(event: Event) {
      const openedId = (event as CustomEvent<string>).detail;
      if (openedId !== listboxId) {
        setOpen(false);
        setQuery("");
        setActiveIndex(-1);
      }
    }
    window.addEventListener("ih35:combobox-open", onOtherOpen);
    window.dispatchEvent(new CustomEvent("ih35:combobox-open", { detail: listboxId }));
    return () => window.removeEventListener("ih35:combobox-open", onOtherOpen);
  }, [open, listboxId]);

  useEffect(() => {
    if (!open) {
      setActiveIndex(-1);
      return;
    }
    // Start on the add row (index 0) when present (QB-STD-7: reachable as row 0); otherwise on the
    // first option, or -1 when neither is present.
    setActiveIndex(showAddNew ? 0 : filteredOptions.length > 0 ? 0 : -1);
  }, [showAddNew, filteredOptions.length, open]);

  function commitSelection(nextValue: string | null) {
    onChange(nextValue);
    setOpen(false);
    setQuery("");
    setActiveIndex(-1);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (disabled) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      if (totalRowCount === 0) return;
      setActiveIndex((current) => (current + 1) % totalRowCount);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      if (totalRowCount === 0) return;
      setActiveIndex((current) => (current <= 0 ? totalRowCount - 1 : current - 1));
      return;
    }
    if (event.key === "Enter") {
      if (!open) return;
      event.preventDefault();
      if (activeIndex < 0) return;
      // Add row is index 0 when showAddNew; options are at 1..n.
      if (showAddNew && activeIndex === 0) {
        allowAddNew!.onAdd(query.trim());
        setOpen(false);
        setQuery("");
        return;
      }
      const optionIndex = showAddNew ? activeIndex - 1 : activeIndex;
      if (optionIndex >= 0 && optionIndex < filteredOptions.length) {
        commitSelection(filteredOptions[optionIndex]?.value ?? null);
      }
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      setQuery("");
      setActiveIndex(-1);
    }
  }

  const listbox =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={listboxRef}
            id={listboxId}
            role="listbox"
            data-combobox-listbox="portal"
            style={listboxStyle}
            className="overflow-auto rounded-sm border border-gray-200 bg-white shadow-md"
          >
            {loading ? (
              <div className="flex items-center gap-2 px-2 py-2 text-[13px] text-gray-600">
                <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-gray-300 border-t-gray-500" />
                Loading...
              </div>
            ) : null}
            {/* QB-STD-1: add row is FIRST — always visible before any typing. */}
            {!loading && showAddNew && allowAddNew ? (
              <button
                type="button"
                role="option"
                aria-selected={activeIndex === 0}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  allowAddNew.onAdd(query.trim());
                  setOpen(false);
                  setQuery("");
                }}
                onMouseEnter={() => setActiveIndex(0)}
                className={`w-full border-b border-gray-100 px-2 py-1.5 text-left text-[13px] font-medium ${
                  activeIndex === 0 ? "bg-slate-100 text-slate-700" : "text-slate-600 hover:bg-gray-50"
                }`}
              >
                {addRowLabel}
              </button>
            ) : null}
            {!loading && filteredOptions.length === 0 && !showAddNew ? (
              <div className="px-2 py-2 text-[13px] text-gray-500">No matches</div>
            ) : null}
            {!loading &&
              filteredOptions.map((option, index) => {
                // Options are at listbox indices 1..n when the add row occupies index 0.
                const listIndex = showAddNew ? index + 1 : index;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={value === option.value}
                    // Commit on CLICK (not mouseDown) so touch taps, automation, and assistive
                    // interactions all select — mouseDown-only left the field empty on touch/click-only
                    // input (the load-cancel reason couldn't be picked). mouseDown still preventDefaults to
                    // keep the input focused so the dropdown doesn't blur-close before the click lands.
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => commitSelection(option.value)}
                    onMouseEnter={() => setActiveIndex(listIndex)}
                    className={`w-full px-2 py-1.5 text-left text-[13px] ${
                      activeIndex === listIndex ? "bg-slate-100 text-slate-700" : "text-gray-800 hover:bg-gray-50"
                    }`}
                  >
                    <div>{option.label}</div>
                    {option.sublabel ? <div className="text-[11px] text-gray-500">{option.sublabel}</div> : null}
                  </button>
                );
              })}
          </div>,
          document.body,
        )
      : null;

  return (
    <div ref={containerRef} className={`relative ${className ?? ""}`}>
      <div
        className={`flex h-9 items-center gap-1 rounded border bg-white px-2 text-[13px] ${
          disabled
            ? "cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400"
            : error
            ? "border-red-400 focus-within:border-red-500 focus-within:ring-2 focus-within:ring-red-200"
            : "border-gray-300 focus-within:border-slate-300 focus-within:ring-2 focus-within:ring-slate-400"
        }`}
      >
        <input
          type="text"
          data-field={dataField}
          value={displayValue}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            if (!disabled) {
              setOpen(true);
              setQuery("");
            }
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-invalid={Boolean(error)}
          className="w-full bg-transparent text-[13px] outline-hidden placeholder:text-gray-400 disabled:cursor-not-allowed"
        />
        {allowClear && value ? (
          <button
            type="button"
            onClick={() => commitSelection(null)}
            disabled={disabled}
            aria-label="Clear selection"
            className="rounded-sm px-1 text-gray-500 hover:bg-gray-100 disabled:hover:bg-transparent"
          >
            ×
          </button>
        ) : null}
      </div>
      {error ? <p className="mt-1 text-[11px] text-red-600">{error}</p> : null}
      {listbox}
    </div>
  );
}
