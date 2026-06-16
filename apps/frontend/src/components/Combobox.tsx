import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";

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
  filterMode?: "contains" | "startsWith" | "fuzzy";
  /** Focus target for form validation (`[data-field="…"]`). */
  dataField?: string;
  className?: string;
};

const MAX_VISIBLE_OPTIONS = 50;

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
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const listboxId = useMemo(() => `combobox-list-${Math.random().toString(36).slice(2, 10)}`, []);

  const selectedOption = useMemo(() => options.find((option) => option.value === value) ?? null, [options, value]);
  const displayValue = open ? query : selectedOption?.label ?? "";

  const filteredOptions = useMemo(() => {
    const sourceOptions = options.filter((option) => !option.disabled);
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
  }, [filterMode, options, query]);

  const hasExactMatch = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return false;
    return options.some((option) => option.label.trim().toLowerCase() === normalizedQuery);
  }, [options, query]);

  const canAddNew = Boolean(allowAddNew && query.trim() && !hasExactMatch);

  useEffect(() => {
    function onDocumentClick(event: MouseEvent) {
      const target = event.target as Node | null;
      if (!target || !containerRef.current) return;
      if (!containerRef.current.contains(target)) {
        setOpen(false);
        setQuery("");
        setActiveIndex(-1);
      }
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
    if (filteredOptions.length === 0) {
      setActiveIndex(canAddNew ? 0 : -1);
      return;
    }
    setActiveIndex(0);
  }, [canAddNew, filteredOptions.length, open]);

  function commitSelection(nextValue: string | null) {
    onChange(nextValue);
    setOpen(false);
    setQuery("");
    setActiveIndex(-1);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (disabled) return;
    const totalRows = filteredOptions.length + (canAddNew ? 1 : 0);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      if (totalRows === 0) return;
      setActiveIndex((current) => (current + 1) % totalRows);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      if (totalRows === 0) return;
      setActiveIndex((current) => (current <= 0 ? totalRows - 1 : current - 1));
      return;
    }
    if (event.key === "Enter") {
      if (!open) return;
      event.preventDefault();
      if (activeIndex < 0) return;
      if (activeIndex < filteredOptions.length) {
        commitSelection(filteredOptions[activeIndex]?.value ?? null);
        return;
      }
      if (allowAddNew && canAddNew) {
        allowAddNew.onAdd(query.trim());
        setOpen(false);
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

  return (
    <div ref={containerRef} className={`relative ${className ?? ""}`}>
      <div
        className={`flex h-9 items-center gap-1 rounded border bg-white px-2 text-[13px] ${
          disabled
            ? "cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400"
            : error
            ? "border-red-400 focus-within:border-red-500 focus-within:ring-2 focus-within:ring-red-200"
            : "border-gray-300 focus-within:border-sky-500 focus-within:ring-2 focus-within:ring-sky-200"
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
          className="w-full bg-transparent text-[13px] outline-none placeholder:text-gray-400 disabled:cursor-not-allowed"
        />
        {allowClear && value ? (
          <button
            type="button"
            onClick={() => commitSelection(null)}
            disabled={disabled}
            aria-label="Clear selection"
            className="rounded px-1 text-gray-500 hover:bg-gray-100 disabled:hover:bg-transparent"
          >
            ×
          </button>
        ) : null}
      </div>
      {error ? <p className="mt-1 text-[11px] text-red-600">{error}</p> : null}
      {open ? (
        <div id={listboxId} role="listbox" className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded border border-gray-200 bg-white shadow-md">
          {loading ? (
            <div className="flex items-center gap-2 px-2 py-2 text-[13px] text-gray-600">
              <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-gray-300 border-t-gray-500" />
              Loading...
            </div>
          ) : null}
          {!loading && filteredOptions.length === 0 && !canAddNew ? (
            <div className="px-2 py-2 text-[13px] text-gray-500">No matches</div>
          ) : null}
          {!loading &&
            filteredOptions.map((option, index) => (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={value === option.value}
                onMouseDown={(event) => {
                  event.preventDefault();
                  commitSelection(option.value);
                }}
                onMouseEnter={() => setActiveIndex(index)}
                className={`w-full px-2 py-1.5 text-left text-[13px] ${
                  activeIndex === index ? "bg-sky-50 text-sky-900" : "text-gray-800 hover:bg-gray-50"
                }`}
              >
                <div>{option.label}</div>
                {option.sublabel ? <div className="text-[11px] text-gray-500">{option.sublabel}</div> : null}
              </button>
            ))}
          {!loading && canAddNew && allowAddNew ? (
            <button
              type="button"
              role="option"
              aria-selected={activeIndex === filteredOptions.length}
              onMouseDown={(event) => {
                event.preventDefault();
                allowAddNew.onAdd(query.trim());
                setOpen(false);
                setQuery("");
              }}
              onMouseEnter={() => setActiveIndex(filteredOptions.length)}
              className={`w-full border-t border-gray-100 px-2 py-1.5 text-left text-[13px] ${
                activeIndex === filteredOptions.length ? "bg-sky-50 text-sky-900" : "text-gray-700 hover:bg-gray-50"
              }`}
            >
              + {allowAddNew.label} "{query.trim()}"
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
