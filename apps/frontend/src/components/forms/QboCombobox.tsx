import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { searchQboMasterData, type QboAutocompleteRow } from "../../api/qbo-mdata";

export type QboEntityType = "vendor" | "customer" | "item" | "account";
const MIN_CHARS_TO_SEARCH = 2;

type Props = {
  entityType: QboEntityType;
  value: string | null;
  displayValue: string;
  onChange: (qboId: string | null, displayName: string) => void;
  /** Fires when the user commits a concrete suggestion row (Enter / click). Includes TMS mirror PK `id`. */
  onPick?: (row: QboAutocompleteRow) => void;
  operatingCompanyId: string;
  placeholder?: string;
  allowFreeText?: boolean;
  includeInactive?: boolean;
};

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handle = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(handle);
  }, [value, delayMs]);
  return debounced;
}

function renderLabel(row: QboAutocompleteRow, entityType: QboEntityType) {
  const base = row.display_name;
  const suffix = row.active ? "" : " [INACTIVE]";
  if (entityType === "item" && row.sku) return `${base} · SKU ${row.sku}${suffix}`;
  if (entityType === "account" && row.full_qualified_name) return `${base} · ${row.full_qualified_name}${suffix}`;
  return `${base}${suffix}`;
}

export function QboCombobox({
  entityType,
  value,
  displayValue,
  onChange,
  onPick,
  operatingCompanyId,
  placeholder,
  allowFreeText = true,
  includeInactive = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(displayValue);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const debouncedDraft = useDebouncedValue(draft, 250);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setDraft(displayValue);
  }, [displayValue]);

  const trimmedQuery = debouncedDraft.trim();
  const enabled = Boolean(operatingCompanyId) && open && trimmedQuery.length >= MIN_CHARS_TO_SEARCH;

  const resultsQuery = useQuery({
    queryKey: ["qbo-mdata-autocomplete", entityType, operatingCompanyId, trimmedQuery, includeInactive],
    queryFn: () =>
      searchQboMasterData(entityType, operatingCompanyId, {
        q: trimmedQuery,
        active_only: includeInactive ? false : true,
      }),
    enabled,
    staleTime: 30_000,
  });

  const rows = resultsQuery.data?.results ?? [];

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current) return;
      if (event.target instanceof Node && !rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  useEffect(() => {
    setHighlightIndex(0);
  }, [rows.length, trimmedQuery]);

  return (
    <div ref={rootRef} className="relative w-full">
      <input
        className="h-9 w-full rounded border border-gray-300 px-2 text-sm"
        placeholder={placeholder ?? "Type to search QuickBooks…"}
        value={draft}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          const next = event.target.value;
          setDraft(next);
          setOpen(true);
          onChange(null, next);
        }}
        onBlur={() => {
          if (!allowFreeText) return;
          onChange(value, draft.trim());
        }}
        onKeyDown={(event) => {
          if (!open) return;
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setHighlightIndex((idx) => Math.min(idx + 1, Math.max(rows.length - 1, 0)));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setHighlightIndex((idx) => Math.max(idx - 1, 0));
          } else if (event.key === "Escape") {
            event.preventDefault();
            setOpen(false);
          } else if (event.key === "Enter") {
            event.preventDefault();
            const row = rows[highlightIndex];
            if (!row) return;
            const label = renderLabel(row, entityType);
            setDraft(label.replace(" [INACTIVE]", ""));
            onChange(row.qbo_id, row.display_name);
            onPick?.(row);
            setOpen(false);
          }
        }}
        aria-autocomplete="list"
      />

      {open ? (
        <div className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded border border-gray-200 bg-white shadow-md">
          {resultsQuery.isLoading ? <div className="px-2 py-2 text-xs text-gray-600">Searching QuickBooks mirror…</div> : null}
          {resultsQuery.isError ? (
            <div className="px-2 py-2 text-xs text-red-600">Could not load suggestions.</div>
          ) : null}
          {!resultsQuery.isLoading && trimmedQuery.length < MIN_CHARS_TO_SEARCH ? (
            <div className="px-2 py-2 text-xs text-gray-600">Keep typing to search ({MIN_CHARS_TO_SEARCH}+ chars, 250ms debounce).</div>
          ) : null}
          {!resultsQuery.isLoading && trimmedQuery.length >= MIN_CHARS_TO_SEARCH && rows.length === 0 ? (
            <div className="px-2 py-2 text-xs text-gray-600">No matches. Will be saved as free text.</div>
          ) : null}
          {rows.map((row, idx) => {
            const label = renderLabel(row, entityType);
            const inactive = !row.active;
            return (
              <button
                key={`${row.qbo_id}-${row.id}`}
                type="button"
                className={`flex w-full flex-col items-start px-2 py-2 text-left text-xs ${
                  idx === highlightIndex ? "bg-blue-50" : "bg-white"
                }`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  setDraft(row.display_name);
                  onChange(row.qbo_id, row.display_name);
                  onPick?.(row);
                  setOpen(false);
                }}
              >
                <span className={inactive ? "text-gray-400" : "text-gray-900"}>{inactive ? `${row.display_name} [INACTIVE]` : label}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
