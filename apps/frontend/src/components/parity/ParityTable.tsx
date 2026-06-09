/**
 * ParityTable — shared QBO-parity table grammar (A1).
 *
 * Additive: a NEW shared component (does not modify the existing DataTable or
 * its usages). B1–B3 pages consume this. Non-financial UI only.
 *
 * Grammar (all optional props, default to a plain dense table):
 *  - sortable columns
 *  - density toggle: Regular / Compact / Ultra compact
 *  - gear popover: column show/hide checklist + density + "Save as default"
 *  - advanced pager: First/Prev + numbered pages + "Page [input] of N" + Next/Last
 *    + configurable per-page selector + "N–M of TOTAL"
 *  - optional select-all + per-row checkboxes → batch-actions bar
 *  - optional row 3-dots action menu
 *  - toolbar slot (Print / Export / etc.)
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { colors, typography } from "../../design/tokens";

export type ParityDensity = "regular" | "compact" | "ultra";

export type ParityColumn<T> = {
  key: keyof T | string;
  label: string;
  sortable?: boolean;
  render?: (row: T) => ReactNode;
  className?: string;
  cellClass?: string;
  /** Initial hidden state in the gear column-toggle (still toggleable on). */
  defaultHidden?: boolean;
  /** Exclude from the gear column-toggle list (always shown). */
  alwaysVisible?: boolean;
};

export type ParityTableProps<T> = {
  columns: Array<ParityColumn<T>>;
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  onRowClick?: (row: T) => void;
  emptyText?: string;

  density?: ParityDensity;
  pageSizeOptions?: number[];
  initialPageSize?: number;
  /** localStorage key to persist column visibility + density + per-page. */
  storageKey?: string;

  /** Left-of-gear toolbar slot (Print / Export / More actions). */
  toolbar?: ReactNode;
  /** Header select-all + per-row checkboxes. */
  selectable?: boolean;
  /** Batch-actions bar content, shown when ≥1 row selected. */
  batchActions?: (selected: T[]) => ReactNode;
  /** Per-row 3-dots action menu content. */
  rowActions?: (row: T) => ReactNode;
};

const DENSITY: Record<ParityDensity, { rowH: number; padY: number; font: number }> = {
  regular: { rowH: 30, padY: 6, font: 12 },
  compact: { rowH: 24, padY: 3, font: 12 },
  ultra: { rowH: 20, padY: 1, font: 11 },
};

const DENSITY_LABEL: Record<ParityDensity, string> = {
  regular: "Regular",
  compact: "Compact",
  ultra: "Ultra compact",
};

type Persisted = { hidden?: string[]; density?: ParityDensity; pageSize?: number };

function loadPersisted(storageKey?: string): Persisted {
  if (!storageKey || typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(`paritytable:${storageKey}`);
    return raw ? (JSON.parse(raw) as Persisted) : {};
  } catch {
    return {};
  }
}

function savePersisted(storageKey: string | undefined, value: Persisted) {
  if (!storageKey || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`paritytable:${storageKey}`, JSON.stringify(value));
  } catch {
    /* ignore quota/serialization errors */
  }
}

export function ParityTable<T>({
  columns,
  rows,
  rowKey,
  loading = false,
  onRowClick,
  emptyText = "No records found.",
  density: densityProp = "regular",
  pageSizeOptions = [15, 50, 100, 300],
  initialPageSize,
  storageKey,
  toolbar,
  selectable = false,
  batchActions,
  rowActions,
}: ParityTableProps<T>) {
  const persisted = useMemo(() => loadPersisted(storageKey), [storageKey]);

  const [sortKey, setSortKey] = useState<string>("");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState("");
  const [density, setDensity] = useState<ParityDensity>(persisted.density ?? densityProp);
  const [pageSize, setPageSize] = useState<number>(
    persisted.pageSize ?? initialPageSize ?? pageSizeOptions[0] ?? 15,
  );
  const [hidden, setHidden] = useState<Set<string>>(
    () =>
      new Set(
        persisted.hidden ??
          columns.filter((c) => c.defaultHidden).map((c) => String(c.key)),
      ),
  );
  const [gearOpen, setGearOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const gearRef = useRef<HTMLDivElement>(null);

  // Close gear popover on outside click.
  useEffect(() => {
    if (!gearOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (gearRef.current && !gearRef.current.contains(e.target as Node)) setGearOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [gearOpen]);

  const visibleColumns = columns.filter((c) => c.alwaysVisible || !hidden.has(String(c.key)));

  const sortedRows = useMemo(() => {
    if (!sortKey) return rows;
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = String((a as Record<string, unknown>)[sortKey] ?? "");
      const bv = String((b as Record<string, unknown>)[sortKey] ?? "");
      const cmp = av.localeCompare(bv, undefined, { numeric: true });
      return sortDirection === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [rows, sortKey, sortDirection]);

  const total = sortedRows.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount);
  const offset = (safePage - 1) * pageSize;
  const pageRows = sortedRows.slice(offset, offset + pageSize);
  const d = DENSITY[density];

  const selectedRows = useMemo(
    () => rows.filter((r) => selected.has(rowKey(r))),
    [rows, selected, rowKey],
  );
  const pageAllSelected = pageRows.length > 0 && pageRows.every((r) => selected.has(rowKey(r)));

  function persist(next: Partial<Persisted>) {
    savePersisted(storageKey, {
      hidden: [...hidden],
      density,
      pageSize,
      ...next,
    });
  }

  function toggleColumn(key: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleSort(key: string) {
    if (sortKey === key) setSortDirection((c) => (c === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDirection("asc");
    }
  }

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function togglePageAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (pageAllSelected) pageRows.forEach((r) => next.delete(rowKey(r)));
      else pageRows.forEach((r) => next.add(rowKey(r)));
      return next;
    });
  }

  // Windowed numbered pages (max 7 buttons).
  const pageButtons = useMemo(() => {
    const out: number[] = [];
    const span = 7;
    let start = Math.max(1, safePage - 3);
    const end = Math.min(pageCount, start + span - 1);
    start = Math.max(1, end - span + 1);
    for (let p = start; p <= end; p += 1) out.push(p);
    return out;
  }, [safePage, pageCount]);

  const colSpan = visibleColumns.length + (selectable ? 1 : 0) + (rowActions ? 1 : 0);

  return (
    <div className="overflow-visible rounded-md border border-gray-200 bg-white">
      {/* Toolbar: optional slot + gear */}
      <div className="flex items-center justify-between gap-2 border-b border-gray-200 px-2 py-1.5">
        <div className="flex items-center gap-2 text-[11px] text-gray-600">
          {selectable && selected.size > 0 ? (
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-800">{selected.size} selected</span>
              {batchActions ? batchActions(selectedRows) : null}
              <button
                type="button"
                className="rounded border border-gray-300 px-1.5 py-0.5"
                onClick={() => setSelected(new Set())}
              >
                Clear
              </button>
            </div>
          ) : (
            <span className="text-gray-400">{toolbar ? null : ""}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {toolbar}
          <div className="relative" ref={gearRef}>
            <button
              type="button"
              aria-label="Table settings"
              className="min-h-11 rounded border border-gray-300 px-2 py-1 text-[12px] text-gray-700 hover:bg-gray-50 sm:min-h-0"
              onClick={() => setGearOpen((o) => !o)}
            >
              ⚙
            </button>
            {gearOpen ? (
              <div className="absolute right-0 z-20 mt-1 w-60 rounded-md border border-gray-200 bg-white p-2 shadow-lg">
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  Density
                </div>
                <div className="mb-2 flex flex-col gap-0.5">
                  {(Object.keys(DENSITY) as ParityDensity[]).map((opt) => (
                    <label key={opt} className="flex items-center gap-2 text-[12px] text-gray-700">
                      <input
                        type="radio"
                        name="parity-density"
                        checked={density === opt}
                        onChange={() => setDensity(opt)}
                      />
                      {DENSITY_LABEL[opt]}
                    </label>
                  ))}
                </div>
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  Columns
                </div>
                <div className="max-h-48 overflow-auto">
                  {columns
                    .filter((c) => !c.alwaysVisible)
                    .map((c) => {
                      const key = String(c.key);
                      return (
                        <label
                          key={key}
                          className="flex items-center gap-2 py-0.5 text-[12px] text-gray-700"
                        >
                          <input
                            type="checkbox"
                            checked={!hidden.has(key)}
                            onChange={() => toggleColumn(key)}
                          />
                          {c.label}
                        </label>
                      );
                    })}
                </div>
                <button
                  type="button"
                  className="mt-2 w-full rounded border border-gray-300 px-2 py-1 text-[12px] text-gray-700 hover:bg-gray-50"
                  onClick={() => {
                    persist({});
                    setGearOpen(false);
                  }}
                >
                  Save as default
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
      <table className="w-full table-fixed text-left" style={{ fontSize: d.font }}>
        <thead className="bg-gray-50">
          <tr style={{ height: DENSITY[density].rowH }}>
            {selectable ? (
              <th className="w-8 px-2">
                <input
                  type="checkbox"
                  aria-label="Select all on page"
                  checked={pageAllSelected}
                  onChange={togglePageAll}
                />
              </th>
            ) : null}
            {visibleColumns.map((column) => (
              <th
                key={String(column.key)}
                className={`px-2 font-semibold uppercase text-gray-600 ${column.className ?? ""}`}
                style={{ fontSize: typography.kpiLabel ?? 11, letterSpacing: 0.3 }}
              >
                {column.sortable ? (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1"
                    onClick={() => toggleSort(String(column.key))}
                  >
                    {column.label}
                    {sortKey === String(column.key)
                      ? sortDirection === "asc"
                        ? "▲"
                        : "▼"
                      : null}
                  </button>
                ) : (
                  column.label
                )}
              </th>
            ))}
            {rowActions ? <th className="w-10 px-2" /> : null}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={colSpan} className="px-2 py-3 text-center text-[11px] text-gray-500">
                Loading…
              </td>
            </tr>
          ) : pageRows.length === 0 ? (
            <tr>
              <td colSpan={colSpan} className="px-2 py-3 text-center text-[11px] text-gray-500">
                {emptyText}
              </td>
            </tr>
          ) : (
            pageRows.map((row) => {
              const id = rowKey(row);
              return (
                <tr
                  key={id}
                  className={`border-t border-gray-100 ${
                    onRowClick ? "cursor-pointer hover:bg-gray-50" : ""
                  } ${selected.has(id) ? "bg-blue-50" : ""}`}
                  style={{ height: d.rowH }}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {selectable ? (
                    <td className="px-2" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label="Select row"
                        checked={selected.has(id)}
                        onChange={() => toggleRow(id)}
                      />
                    </td>
                  ) : null}
                  {visibleColumns.map((column) => (
                    <td
                      key={String(column.key)}
                      className={`overflow-hidden break-words px-2 align-top text-gray-800 ${
                        column.cellClass ?? column.className ?? ""
                      }`}
                      style={{ paddingTop: d.padY, paddingBottom: d.padY }}
                    >
                      {column.render
                        ? column.render(row)
                        : String((row as Record<string, unknown>)[String(column.key)] ?? "")}
                    </td>
                  ))}
                  {rowActions ? (
                    <td className="px-2 text-right" onClick={(e) => e.stopPropagation()}>
                      {rowActions(row)}
                    </td>
                  ) : null}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
      </div>

      {/* Advanced pager */}
      <div
        className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 px-2 py-1.5 text-[11px]"
        style={{ color: colors.mutedText }}
      >
        <div className="flex items-center gap-2">
          <span>{total === 0 ? "0 of 0" : `${offset + 1}–${Math.min(offset + pageSize, total)} of ${total}`}</span>
          <label className="flex items-center gap-1">
            <span>Per page</span>
            <select
              className="h-6 rounded border border-gray-300 px-1"
              value={pageSize}
              onChange={(e) => {
                const next = Number(e.target.value);
                setPageSize(next);
                setPage(1);
              }}
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="h-6 rounded border border-gray-300 px-1.5 disabled:opacity-40"
            onClick={() => setPage(1)}
            disabled={safePage <= 1}
          >
            «
          </button>
          <button
            type="button"
            className="h-6 rounded border border-gray-300 px-1.5 disabled:opacity-40"
            onClick={() => setPage((c) => Math.max(1, c - 1))}
            disabled={safePage <= 1}
          >
            ‹
          </button>
          {pageButtons.map((p) => (
            <button
              key={p}
              type="button"
              className={`h-6 min-w-6 rounded border px-1.5 ${
                p === safePage
                  ? "border-blue-500 bg-blue-500 text-white"
                  : "border-gray-300 text-gray-700 hover:bg-gray-50"
              }`}
              onClick={() => setPage(p)}
            >
              {p}
            </button>
          ))}
          <button
            type="button"
            className="h-6 rounded border border-gray-300 px-1.5 disabled:opacity-40"
            onClick={() => setPage((c) => Math.min(pageCount, c + 1))}
            disabled={safePage >= pageCount}
          >
            ›
          </button>
          <button
            type="button"
            className="h-6 rounded border border-gray-300 px-1.5 disabled:opacity-40"
            onClick={() => setPage(pageCount)}
            disabled={safePage >= pageCount}
          >
            »
          </button>
          <span className="ml-1 flex items-center gap-1">
            Page
            <input
              className="h-6 w-12 rounded border border-gray-300 px-1 text-center"
              value={pageInput}
              placeholder={String(safePage)}
              onChange={(e) => setPageInput(e.target.value.replace(/[^0-9]/g, ""))}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const n = Number(pageInput);
                  if (n >= 1 && n <= pageCount) setPage(n);
                  setPageInput("");
                }
              }}
            />
            of {pageCount}
          </span>
        </div>
      </div>
    </div>
  );
}
