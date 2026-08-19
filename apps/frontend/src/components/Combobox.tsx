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
  /**
   * Reference/FK pickers set this: editing the text of a COMMITTED selection clears it, so the visible
   * text and the committed id can never disagree. Filter comboboxes leave it off — see the input's
   * onChange for the measured reason.
   */
  clearCommittedOnEdit?: boolean;
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
  /**
   * C1: `data-testid` for the text input. Additive. A call site that REPLACES a plain `<input
   * data-testid="…">` with this picker must be able to keep the exact id its existing tests and any
   * e2e selector already target — converting a control must never silently break a test's handle.
   */
  dataTestId?: string;
  /**
   * C1-A11Y: `id` for the text input. Additive, and the same precedent as `dataTestId` above but for a
   * STRONGER reason: `id` is what `<label htmlFor>` binds to. Without it every call site that renders
   * `<label htmlFor="x"> + <SelectCombobox id="x">` produces a label bound to NOTHING — the control is
   * unlabelled for screen readers, and `getByLabelText` cannot address it in tests (which is how this
   * was found: a DailyTasks picker test could not reach its own Assignee field).
   */
  id?: string;
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

  // Two independent z-index tiers exist in this codebase: the ParityDrawer/Modal scale tops out at
  // z-[70] (see Modal.tsx), and a separate, higher slide-over tier used by full-record detail drawers
  // (e.g. LoadDetailDrawer's backdrop/panel) runs z-[200]/z-[210]. This portal's zIndex used to be 80 —
  // correctly above the first tier, but a full tier BELOW the second one, so any Combobox/ReferenceSelect
  // opened inside a z-[200]+ drawer (e.g. MultiStopEditor's "Pickup / appointment type" picker) rendered
  // its listbox with real, matching options — confirmed reachable and clickable in the accessibility
  // tree, with the underlying catalog fetch returning 200 — but the drawer's own opaque panel painted
  // over it, so the dropdown was invisible and unusable to an actual user. 220 sits above every explicit
  // z-index in the codebase (max found: z-[210]) so no known drawer/modal can occlude it again.
  const LISTBOX_Z_INDEX = 220;
  if (openUp) {
    return {
      position: "fixed",
      left: rect.left,
      width,
      bottom: window.innerHeight - rect.top + gap,
      maxHeight,
      zIndex: LISTBOX_Z_INDEX,
    };
  }
  return {
    position: "fixed",
    left: rect.left,
    width,
    top: rect.bottom + gap,
    maxHeight,
    zIndex: LISTBOX_Z_INDEX,
  };
}

export function Combobox({
  options,
  value,
  onChange,
  clearCommittedOnEdit = false,
  placeholder = "Select...",
  loading = false,
  error,
  disabled = false,
  allowClear = false,
  allowAddNew,
  filterMode = "contains",
  dataField,
  dataTestId,
  id,
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
    // When the server did the filtering, do not filter OR re-cap — FE-COMBOBOX-50-DISPLAY-CAP:
    // ACCT-F209 returned the full roster from the API, then this slice hid everyone past 50 with
    // no notice (DriverPicker browse: 51 rows = 50 drivers + Create). Server owns the page size.
    if (onSearch) return sourceOptions;
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

  // Local (non-server) browse still caps for scroll perf — tell the operator instead of silent hide.
  const localBrowseTruncated = useMemo(() => {
    if (onSearch) return false;
    const enabledCount = options.filter((option) => !option.disabled).length;
    return enabledCount > MAX_VISIBLE_OPTIONS;
  }, [onSearch, options]);

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
    // A fixed-position portal does not follow an anchor moved by a drawer/modal CSS transform.
    // Neither ResizeObserver nor scroll/resize fires for that motion. Re-measure through the opening
    // animation, then once more on transitionend, so a picker opened while a drawer is sliding in
    // cannot remain painted at its pre-transition coordinates.
    let animationFrame = 0;
    let remainingOpeningFrames = 30;
    function followOpeningTransition() {
      reposition();
      remainingOpeningFrames -= 1;
      if (remainingOpeningFrames > 0) animationFrame = window.requestAnimationFrame(followOpeningTransition);
    }
    animationFrame = window.requestAnimationFrame(followOpeningTransition);
    window.addEventListener("resize", reposition);
    // Capture: ParityTable and other overflow-x-auto ancestors scroll without bubbling.
    document.addEventListener("scroll", reposition, true);
    document.addEventListener("transitionend", reposition, true);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", reposition);
      document.removeEventListener("scroll", reposition, true);
      document.removeEventListener("transitionend", reposition, true);
    };
  }, [open]);

  function closeListbox() {
    setOpen(false);
    setQuery("");
    setActiveIndex(-1);
  }

  useEffect(() => {
    function onDocumentClick(event: MouseEvent) {
      const target = event.target as Node | null;
      if (!target) return;
      if (containerRef.current?.contains(target)) return;
      if (listboxRef.current?.contains(target)) return;
      closeListbox();
    }
    document.addEventListener("mousedown", onDocumentClick);
    return () => document.removeEventListener("mousedown", onDocumentClick);
  }, []);

  function handleInputBlur() {
    // Tab/click to another control must dismiss the portal listbox — mousedown-only left Payment Terms
    // (and every other Combobox) open until a row was picked. Defer so list option mousedown can commit.
    window.setTimeout(() => {
      const active = document.activeElement;
      if (containerRef.current?.contains(active)) return;
      if (listboxRef.current?.contains(active)) return;
      closeListbox();
    }, 0);
  }

  // Single-open coordinator (app-wide): only one Combobox stays open at a time. When this one
  // opens it broadcasts its id; every other currently-open Combobox (which has a live listener
  // while open) hears it and closes. Complements the outside-click/Escape handlers above.
  useEffect(() => {
    if (!open) return;
    function onOtherOpen(event: Event) {
      const openedId = (event as CustomEvent<string>).detail;
      if (openedId !== listboxId) {
        closeListbox();
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
    closeListbox();
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
        closeListbox();
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
      event.stopPropagation();
      closeListbox();
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
                  closeListbox();
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
            {!loading && localBrowseTruncated ? (
              <div
                className="border-b border-slate-100 bg-slate-50 px-2 py-1.5 text-[11px] text-slate-600"
                data-testid="combobox-truncated-notice"
              >
                Showing first {MAX_VISIBLE_OPTIONS} — type to search the rest
              </div>
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
          data-testid={dataTestId}
          value={displayValue}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            // ★ For REFERENCE pickers, typing over a COMMITTED selection invalidates it. Without this, the
            // input showed the edited text while the parent still held the OLD id: Book Load let a
            // dispatcher pick "LIVE TEST CUSTOMER LLC", type over it, see "LIVE TEST CUSTOMER LLCXYZ" — a
            // customer that does not exist — and book the load against the ORIGINAL customer's FK. Verified
            // live before the fix: after typing, `input[name="customer_id"]` still held 61111111-…
            // Re-selecting commits again via commitSelection, so the only state this drops is the stale one.
            //
            // ★ WHY THIS IS OPT-IN AND NOT THE DEFAULT — I tried it as the default first and MEASURED a
            // regression: the full FE suite went 58 red files → 59 (+5 tests), all in
            // drivers-reference-catalog, which uses this Combobox as a plain ARCHIVE FILTER. Clearing a
            // filter's committed value on edit is wrong; clearing a foreign key's is right. So the flag
            // lives here and `ReferenceSelect` (the FK/reference picker, 96 call sites) turns it on, while
            // the 13 raw-Combobox filter sites keep the old behaviour. Same invariant, correct layer.
            if (clearCommittedOnEdit && value !== null && value !== "") onChange(null);
          }}
          onFocus={() => {
            if (!disabled) {
              setOpen(true);
              setQuery("");
            }
          }}
          onBlur={handleInputBlur}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          id={id}
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
