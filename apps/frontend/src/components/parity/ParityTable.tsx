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
import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type TouchEvent as ReactTouchEvent,
} from "react";
import { colors, typography } from "../../design/tokens";
import { UniversalListToolbar, applyUniversalListFilters, type UniversalRange } from "../table/UniversalListToolbar";

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
  /**
   * Optional sort-value extractor for columns whose sort key isn't a plain `row[key]` lookup
   * (e.g. a computed/derived display column like a running balance). Default: `row[key]`.
   */
  sortValue?: (row: T) => string | number | null | undefined;
  /**
   * PARITY-EXPORT-COMPUTED-COLUMN-BLANK: `exportCsv` used to read `row[key]` directly, never
   * calling `render`. Any column whose value only exists through `render` — a computed field
   * with no matching row property (an HOS event's duration, a module's open-item count), or a
   * `_cents` integer formatted for display — exported blank or a raw, unit-less number under a
   * dollar-labeled header while the on-screen table looked complete. Same precedent as
   * `sortValue` above: an optional plain-text extractor for export, default `row[key]`.
   */
  exportValue?: (row: T) => string | number | null | undefined;
};

export type ParityTableProps<T> = {
  columns: Array<ParityColumn<T>>;
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  onRowClick?: (row: T) => void;
  /** Optional row-level context-menu handler (e.g. right-click quick actions). Additive — omitting it renders no listener. */
  onRowContextMenu?: (row: T, event: ReactMouseEvent<HTMLTableRowElement>) => void;
  /** Optional extra className per row (e.g. highlight the currently-open record). Additive — merged with the base row class. */
  rowClassName?: (row: T) => string;
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
  /** Max selectable rows at once (mirrors useBulkSelection's cap). Unset = unlimited. Additive. */
  maxSelectable?: number;
  /** Fired when a selection toggle/select-all-on-page would exceed maxSelectable; the toggle is a no-op in that case. */
  onSelectionCapExceeded?: (attempted: number) => void;
  /**
   * OPTIONAL controlled row selection (ParityTable Phase A5).
   * Omitting keeps today's internal Set selection for existing selectable call sites.
   * Presence of `onSelectionChange` = controlled mode: page owns `selectedKeys`;
   * checkbox / select-all toggles call `onSelectionChange(nextKeys)` and never mutate
   * internal selection state. `selectedKeys` is the source of truth when controlled.
   * Keys are row ids from `rowKey` / existing key extractor (match current selection keying).
   */
  selectedKeys?: string[];
  onSelectionChange?: (keys: string[]) => void;

  /** Filter toolbar slot (search + dropdowns), rendered above the table per the universal-list standard. */
  filterBar?: ReactNode;
  /**
   * When true, hide UniversalListToolbar TableSearch (page owns server-side search in filterBar).
   * Prevents competing client search over a single page of server results (LV-WORK-ORDERS-CONSOLE-DUPLICATE-SEARCH).
   */
  suppressToolbarSearch?: boolean;
  /** Hide the Range popover when the page already owns date/unit filters. */
  suppressToolbarRange?: boolean;
  /** When set, a ⤓ Export button appears that downloads the (sorted, visible-column) rows as CSV. */
  exportFilename?: string;
  /** Sticky header row on vertical scroll (universal-list standard). Default true. */
  stickyHeader?: boolean;
  /** Drag-to-resize columns (widths persist with storageKey). Default true. */
  enableColumnResize?: boolean;
  /**
   * Optional per-row expandable detail. When provided, a ▸/▾ toggle column is prepended; clicking it
   * reveals renderExpanded(row) in a full-width detail row beneath the parent row. Additive — existing
   * consumers that omit it are unchanged.
   */
  renderExpanded?: (row: T) => ReactNode;
  /**
   * Optional data-testid for the outer table container. Lets a migrated page keep the test/e2e hook
   * that its former hand-rolled `<table>` carried. Additive — omitting it renders no testid.
   */
  tableTestId?: string;
  /**
   * Optional per-row data-testid on the rendered `<tr>`. Lets a migrated page preserve existing
   * row-level test/e2e selectors. Additive — omitting it renders no per-row testid.
   */
  rowTestId?: (row: T) => string;

  /**
   * OPTIONAL controlled-sort mode (BANK-SORT-ROLLOUT-ACCT). Omitting these three props keeps the
   * existing uncontrolled internal-state sort (unchanged default for the ~130 existing call
   * sites). Pass all three from a page that persists sort in the URL (see `useUrlSort`) — the
   * page owns sortKey/sortDirection and is notified via onSortChange on every header click;
   * ParityTable still performs the actual row sort (using each column's `sortValue` or a
   * `row[key]` default) so pages don't have to re-implement comparison logic.
   */
  sortKey?: string;
  sortDirection?: "asc" | "desc";
  onSortChange?: (key: string, direction: "asc" | "desc") => void;
  /**
   * OPTIONAL external-sort passthrough (ParityTable Phase A4).
   * Default "internal" (current behavior): when sortKey is set, ParityTable sorts rows itself.
   * "external": ParityTable NEVER reorders rows — it only paints the sort indicator from
   * sortKey/sortDirection and fires onSortChange on header clicks. Caller owns the order
   * (server-side sort, or a pre-sorted pipeline like bankTxnSortGroup's sort→group→page).
   * Only meaningful with controlled sort (onSortChange present) — external mode requires
   * controlled sort; if onSortChange is absent, "external" falls back to "internal" so an
   * uncontrolled table can never paint a sort state nobody applied.
   */
  sortMode?: "internal" | "external";

  /**
   * OPTIONAL controlled row-expansion (ParityTable Phase A1) — mirrors the controlled-sort
   * precedent above. Omitting these props keeps the existing uncontrolled multi-expand via the
   * internal `expanded` Set (unchanged default for the ~130 existing call sites). Presence of
   * `onExpandedChange` = controlled mode (mirrors `isSortControlled = onSortChange != null`):
   * the page owns `expandedKeys` and is notified via `onExpandedChange` on every ▸/▾ toggle.
   * Only meaningful when `renderExpanded` is provided (as today).
   */
  expandedKeys?: string[];
  onExpandedChange?: (keys: string[]) => void;
  /**
   * "multi" (default, current behavior) keeps every expanded row open; "single" collapses any
   * other row when one expands. Applies in both controlled and uncontrolled modes.
   */
  expandMode?: "multi" | "single";

  /**
   * OPTIONAL QBO-style group bands (ParityTable Phase A2). Omitting keeps byte-identical current
   * behavior for the ~130 existing call sites. When provided, the CURRENT page's rows are grouped
   * in their CURRENT order by getKey (stable — never re-sorted), and each group is preceded by one
   * full-width band <tr> (colSpan across all rendered columns) produced by renderHeader. Bands are
   * computed over the current page only — pagination math is unchanged. Collapse follows the
   * controlled-sort / A1 controlled-expansion precedents: presence of onCollapsedChange = controlled
   * mode (caller owns collapsedKeys); otherwise an internal Set drives uncontrolled collapse.
   */
  groupBy?: {
    /** Stable group key per row; rows keep their current order (no re-sort). */
    getKey: (row: T) => string;
    /** Full-width band row rendered above each group (spans all rendered columns). */
    renderHeader: (key: string, rows: T[]) => ReactNode;
    /** Band gets a ▸/▾ chevron toggle; collapsed groups hide their rows. Default false. */
    collapsible?: boolean;
    /** Controlled collapse — only meaningful with onCollapsedChange (mirrors expandedKeys). */
    collapsedKeys?: string[];
    /** Presence = controlled mode (mirrors onExpandedChange / onSortChange). */
    onCollapsedChange?: (keys: string[]) => void;
  };

  /**
   * OPTIONAL controlled / external pagination (ParityTable Phase A3) — mirrors the controlled-sort
   * and A1 controlled-expansion precedents. Omitting ALL of these keeps today's internal pagination
   * byte-identical for the ~130 existing call sites.
   *
   * PAGE — presence of `onPageChange` = controlled page mode (mirrors onSortChange /
   * onExpandedChange): pager clicks never mutate internal page state; ParityTable calls
   * `onPageChange(nextPage)` and renders from the `page` prop (default 1 when undefined).
   *
   * PAGE SIZE — presence of the `pageSize` VALUE = controlled page-size mode (value-presence
   * rule, deliberately NOT notifier-presence): the prop is the source of truth for slicing, the
   * built-in per-page selector fires `onPageSizeChange(size)` without mutating internal state.
   * Value-presence (not `onPageSizeChange != null`) is required so the recommended pre-paged
   * combination below works with no callback at all.
   *
   * `hidePager: true` suppresses the built-in pager / per-page chrome entirely (works in
   * controlled AND uncontrolled modes) so an external toolbar pager can own the UI. Internal page
   * slicing still applies unless the caller also feeds pre-paged rows. Recommended combinations:
   *  - "external chrome + ParityTable slices": pass full row set + page/onPageChange
   *    (+ pageSize/onPageSizeChange) + hidePager — the table slices, the page owns the chrome.
   *  - "external chrome + caller pre-pages" (e.g. server-paged): pass the CURRENT page's rows as
   *    `rows`, pageSize = rows.length (or the server page size), hidePager — no double slicing.
   */
  page?: number;
  onPageChange?: (page: number) => void;
  pageSize?: number;
  onPageSizeChange?: (size: number) => void;
  hidePager?: boolean;
  /**
   * When true, omit the outer rounded border frame so the table sits flush inside a parent
   * section card (BOX-IN-BOX flatten). Additive — default false preserves all existing surfaces.
   */
  embedded?: boolean;
};

function compareSortValues(
  a: string | number | null | undefined,
  b: string | number | null | undefined,
): number {
  const aNull = a == null || a === "";
  const bNull = b == null || b === "";
  if (aNull && bNull) return 0;
  if (aNull) return 1; // ASC: nulls last; ParityTable applies nulls before ASC/DESC flip
  if (bNull) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

const DENSITY: Record<ParityDensity, { rowH: number; padY: number; font: number }> = {
  regular: { rowH: 30, padY: 6, font: 12 },
  compact: { rowH: 24, padY: 3, font: 12 },
  ultra: { rowH: 20, padY: 1, font: 11 },
};

// LINK-F5171-PARITYTABLE-NESTED-DRILL — a clickable row is only the fallback target.
// Every nested control owns its own action; otherwise an EntityLink/customer/load drill can
// navigate correctly and then be overwritten by the row's detail navigation in the same click.
// Keeping this in the shared table fixes the class across every module/leaf that uses ParityTable.
const ROW_CLICK_INTERACTIVE_SELECTOR =
  "a, button, input, select, textarea, [role='button'], [role='link'], [data-row-click-ignore]";

function isParityTableInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest(ROW_CLICK_INTERACTIVE_SELECTOR));
}

const DENSITY_LABEL: Record<ParityDensity, string> = {
  regular: "Regular",
  compact: "Compact",
  ultra: "Ultra compact",
};

type Persisted = { hidden?: string[]; density?: ParityDensity; pageSize?: number; colWidths?: Record<string, number> };

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
  rows: sourceRows,
  rowKey,
  loading = false,
  onRowClick,
  onRowContextMenu,
  rowClassName,
  emptyText = "No records found.",
  density: densityProp = "regular",
  pageSizeOptions = [25, 50, 100, 300],
  initialPageSize,
  storageKey,
  toolbar,
  selectable = false,
  batchActions,
  rowActions,
  maxSelectable,
  onSelectionCapExceeded,
  selectedKeys: controlledSelectedKeys,
  onSelectionChange,
  filterBar,
  suppressToolbarSearch = false,
  suppressToolbarRange = false,
  exportFilename,
  stickyHeader = true,
  enableColumnResize = true,
  renderExpanded,
  tableTestId,
  rowTestId,
  sortKey: controlledSortKey,
  sortDirection: controlledSortDirection,
  onSortChange,
  sortMode = "internal",
  expandedKeys: controlledExpandedKeys,
  onExpandedChange,
  expandMode = "multi",
  groupBy,
  page: controlledPage,
  onPageChange,
  pageSize: controlledPageSize,
  onPageSizeChange,
  hidePager = false,
  embedded = false,
}: ParityTableProps<T>) {
  const persisted = useMemo(() => loadPersisted(storageKey), [storageKey]);

  const isSortControlled = onSortChange != null;
  // Phase A4: external sort passthrough REQUIRES controlled sort — without onSortChange the
  // caller could never apply an order, so "external" falls back to today's internal sort.
  const isSortExternal = sortMode === "external" && isSortControlled;
  const [internalSortKey, setInternalSortKey] = useState<string>("");
  const [internalSortDirection, setInternalSortDirection] = useState<"asc" | "desc">("asc");
  const sortKey = isSortControlled ? controlledSortKey ?? "" : internalSortKey;
  const sortDirection = isSortControlled ? controlledSortDirection ?? "asc" : internalSortDirection;
  // Controlled pagination (Phase A3) mirrors the controlled-sort split: presence of onPageChange
  // switches the page source of truth from internal state to the caller-owned `page` prop.
  const isPageControlled = onPageChange != null;
  const [internalPage, setInternalPage] = useState(1);
  const page = isPageControlled ? controlledPage ?? 1 : internalPage;
  const [pageInput, setPageInput] = useState("");
  const [density, setDensity] = useState<ParityDensity>(persisted.density ?? densityProp);
  // Page size uses VALUE-presence (pageSize != null = controlled) — see the A3 prop docs — so a
  // pre-paged caller can pin the size with no callback. Internal state is unchanged otherwise.
  const isPageSizeControlled = controlledPageSize != null;
  const [internalPageSize, setInternalPageSize] = useState<number>(
    persisted.pageSize ?? initialPageSize ?? pageSizeOptions[0] ?? 25,
  );
  const pageSize = isPageSizeControlled ? controlledPageSize : internalPageSize;
  const [hidden, setHidden] = useState<Set<string>>(
    () =>
      new Set(
        persisted.hidden ??
          columns.filter((c) => c.defaultHidden).map((c) => String(c.key)),
      ),
  );
  const [gearOpen, setGearOpen] = useState(false);
  const [draftHidden, setDraftHidden] = useState<Set<string>>(() => new Set(hidden));
  const [draftDensity, setDraftDensity] = useState<ParityDensity>(density);
  const [draftPageSize, setDraftPageSize] = useState<number>(pageSize);
  const [toolbarSearch, setToolbarSearch] = useState("");
  const [toolbarRange, setToolbarRange] = useState<UniversalRange | null>(null);
  // Controlled selection (Phase A5) mirrors A1 expansion: presence of onSelectionChange
  // switches the source of truth from internal state to the caller-owned selectedKeys prop.
  const isSelectionControlled = onSelectionChange != null;
  const [internalSelected, setInternalSelected] = useState<Set<string>>(new Set());
  const selected = useMemo(
    () => (isSelectionControlled ? new Set(controlledSelectedKeys ?? []) : internalSelected),
    [isSelectionControlled, controlledSelectedKeys, internalSelected],
  );
  // Controlled expansion mirrors the controlled-sort pattern above: presence of the change
  // notifier switches the source of truth from internal state to the caller-owned prop.
  const isExpandControlled = onExpandedChange != null;
  const [internalExpanded, setInternalExpanded] = useState<Set<string>>(new Set());
  const expanded = useMemo(
    () => (isExpandControlled ? new Set(controlledExpandedKeys ?? []) : internalExpanded),
    [isExpandControlled, controlledExpandedKeys, internalExpanded],
  );
  // Group-band collapse (Phase A2) mirrors the same controlled/uncontrolled split: presence of
  // onCollapsedChange switches the source of truth from internal state to caller-owned collapsedKeys.
  const isCollapseControlled = groupBy?.onCollapsedChange != null;
  const [internalCollapsed, setInternalCollapsed] = useState<Set<string>>(new Set());
  const controlledCollapsedKeys = groupBy?.collapsedKeys;
  const collapsedGroups = useMemo(
    () => (isCollapseControlled ? new Set(controlledCollapsedKeys ?? []) : internalCollapsed),
    [isCollapseControlled, controlledCollapsedKeys, internalCollapsed],
  );
  const [colWidths, setColWidths] = useState<Record<string, number>>(persisted.colWidths ?? {});
  const gearRef = useRef<HTMLDivElement>(null);
  const resizing = useRef<{ key: string; startX: number; startW: number } | null>(null);

  const cancelGear = () => {
    setDraftHidden(new Set(hidden));
    setDraftDensity(density);
    setDraftPageSize(pageSize);
    setGearOpen(false);
  };

  const openGear = () => {
    setDraftHidden(new Set(hidden));
    setDraftDensity(density);
    setDraftPageSize(pageSize);
    setGearOpen(true);
  };

  const applyGear = () => {
    setHidden(new Set(draftHidden));
    setDensity(draftDensity);
    changePageSize(draftPageSize);
    savePersisted(storageKey, { hidden: [...draftHidden], density: draftDensity, pageSize: draftPageSize, colWidths });
    setGearOpen(false);
  };

  const resetGear = () => {
    setDraftHidden(new Set(columns.filter((column) => column.defaultHidden).map((column) => String(column.key))));
    setDraftDensity(densityProp);
    setDraftPageSize(pageSizeOptions[0] ?? 25);
  };

  // Outside click / Escape cancels uncommitted gear edits.
  useEffect(() => {
    if (!gearOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (gearRef.current && !gearRef.current.contains(e.target as Node)) cancelGear();
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") cancelGear(); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [density, gearOpen, hidden]);

  const visibleColumns = columns.filter((c) => c.alwaysVisible || !hidden.has(String(c.key)));
  const toolbarFilteredRows = useMemo(
    () => applyUniversalListFilters(sourceRows, toolbarSearch, toolbarRange),
    [sourceRows, toolbarRange, toolbarSearch],
  );
  // Keep the external-sort identity contract: toolbar filtering preserves caller order, then the
  // sort pipeline receives that filtered array as its canonical `rows` input.
  const rows = toolbarFilteredRows;

  const sortedRows = useMemo(() => {
    // Phase A4 external passthrough: identity — the caller owns row order (server-side sort or a
    // pre-sorted pipeline like bankTxnSortGroup). No copy, no sort; indicator + onSortChange only.
    if (isSortExternal) return rows;
    if (!sortKey) return rows;
    const column = columns.find((c) => String(c.key) === sortKey);
    const extract = (row: T): string | number | null | undefined =>
      column?.sortValue
        ? column.sortValue(row)
        : ((row as Record<string, unknown>)[sortKey] as string | number | null | undefined);
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = extract(a);
      const bv = extract(b);
      const aNull = av == null || av === "";
      const bNull = bv == null || bv === "";
      // Nulls/blanks always last — do not flip with DESC (negating compareSortValues would).
      if (aNull && bNull) return 0;
      if (aNull) return 1;
      if (bNull) return -1;
      const cmp = compareSortValues(av, bv);
      return sortDirection === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [rows, columns, sortKey, sortDirection, isSortExternal]);

  const total = sortedRows.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount);
  const offset = (safePage - 1) * pageSize;
  const pageRows = sortedRows.slice(offset, offset + pageSize);
  const d = DENSITY[density];

  // Phase A2: group the CURRENT page's rows in their CURRENT order (stable — first appearance of
  // each key sets group order; rows are never re-sorted). Pagination math above is untouched.
  const groupGetKey = groupBy?.getKey;
  const groupedPageRows = useMemo(() => {
    if (!groupGetKey) return null;
    const order: string[] = [];
    const byKey = new Map<string, T[]>();
    for (const row of pageRows) {
      const key = groupGetKey(row);
      const bucket = byKey.get(key);
      if (bucket) bucket.push(row);
      else {
        byKey.set(key, [row]);
        order.push(key);
      }
    }
    return order.map((key) => ({ key, rows: byKey.get(key)! }));
  }, [groupGetKey, pageRows]);

  const selectedRows = useMemo(
    () => rows.filter((r) => selected.has(rowKey(r))),
    [rows, selected, rowKey],
  );
  const pageAllSelected = pageRows.length > 0 && pageRows.every((r) => selected.has(rowKey(r)));

  // Drag-to-resize: capture the column + start geometry on mousedown, update width on mousemove,
  // persist on mouseup. Widths drive the table-fixed column widths and survive reloads (storageKey).
  function startResize(key: string, e: ReactMouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const th = (e.currentTarget as HTMLElement).closest("th");
    const startW = colWidths[key] || th?.getBoundingClientRect().width || 120;
    resizing.current = { key, startX: e.clientX, startW };
    const onMove = (ev: MouseEvent) => {
      if (!resizing.current) return;
      const delta = ev.clientX - resizing.current.startX;
      const w = Math.max(48, Math.round(resizing.current.startW + delta));
      setColWidths((prev) => ({ ...prev, [resizing.current!.key]: w }));
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      resizing.current = null;
      // Persist the LATEST widths (read via the state setter to avoid a stale closure value).
      setColWidths((cur) => {
        savePersisted(storageKey, { hidden: [...hidden], density, pageSize, colWidths: cur });
        return cur;
      });
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  // Touch drag mirrors the mouse path so column resize works on tablets. Additive — the mouse
  // drag in startResize is unchanged.
  function startResizeTouch(key: string, e: ReactTouchEvent) {
    e.stopPropagation();
    const th = (e.currentTarget as HTMLElement).closest("th");
    const startX = e.touches[0]?.clientX ?? 0;
    const startW = colWidths[key] || th?.getBoundingClientRect().width || 120;
    const onMove = (ev: TouchEvent) => {
      const delta = (ev.touches[0]?.clientX ?? startX) - startX;
      const w = Math.max(48, Math.round(startW + delta));
      setColWidths((prev) => ({ ...prev, [key]: w }));
    };
    const onEnd = () => {
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      setColWidths((cur) => {
        savePersisted(storageKey, { hidden: [...hidden], density, pageSize, colWidths: cur });
        return cur;
      });
    };
    document.addEventListener("touchmove", onMove, { passive: true });
    document.addEventListener("touchend", onEnd);
  }

  // Keyboard resize: ←/→ nudge the focused column ±8px (Shift = ±32px). Additive a11y path so the
  // resize handle is reachable without a mouse; widths persist exactly like a drag.
  function nudgeWidth(key: string, delta: number, thEl: HTMLElement | null) {
    setColWidths((prev) => {
      const base = prev[key] || thEl?.getBoundingClientRect().width || 120;
      const w = Math.max(48, Math.round(base + delta));
      const next = { ...prev, [key]: w };
      savePersisted(storageKey, { hidden: [...hidden], density, pageSize, colWidths: next });
      return next;
    });
  }

  function onResizeKey(key: string, e: ReactKeyboardEvent) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    e.stopPropagation();
    const step = (e.shiftKey ? 32 : 8) * (e.key === "ArrowLeft" ? -1 : 1);
    nudgeWidth(key, step, (e.currentTarget as HTMLElement).closest("th"));
  }

  function exportCsv() {
    const cols = visibleColumns;
    const esc = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = cols.map((c) => esc(c.label)).join(",");
    const body = sortedRows
      .map((row) =>
        cols
          .map((c) => esc(c.exportValue ? c.exportValue(row) : (row as Record<string, unknown>)[String(c.key)]))
          .join(",")
      )
      .join("\n");
    const blob = new Blob([`${header}\n${body}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${exportFilename}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function toggleDraftColumn(key: string) {
    setDraftHidden((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleSort(key: string) {
    const nextDirection: "asc" | "desc" = sortKey === key && sortDirection === "asc" ? "desc" : "asc";
    if (isSortControlled) {
      onSortChange?.(key, nextDirection);
      return;
    }
    setInternalSortKey(key);
    setInternalSortDirection(nextDirection);
  }

  function changePage(next: number) {
    // Controlled (A3): notify the owner, never mutate internal page state — the `page` prop drives render.
    if (isPageControlled) {
      onPageChange?.(next);
      return;
    }
    setInternalPage(next);
  }

  function changePageSize(next: number) {
    onPageSizeChange?.(next);
    if (!isPageSizeControlled) setInternalPageSize(next);
    // Reset to page 1 (pre-A3 behavior); in controlled page mode this notifies onPageChange(1).
    changePage(1);
  }

  function toggleRow(id: string) {
    const applyToggle = (prev: Set<string>): Set<string> => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        return next;
      }
      next.add(id);
      if (maxSelectable != null && next.size > maxSelectable) {
        onSelectionCapExceeded?.(next.size);
        return prev;
      }
      return next;
    };
    if (isSelectionControlled) {
      const prev = new Set(controlledSelectedKeys ?? []);
      const next = applyToggle(prev);
      // Cap no-op returns the same Set reference — do not notify (mirrors uncontrolled setState bail).
      if (next === prev) return;
      onSelectionChange?.([...next]);
      return;
    }
    setInternalSelected((prev) => applyToggle(prev));
  }

  function toggleExpanded(id: string) {
    // Shared toggle math for both modes: collapse if open; expand (alone in "single" mode) if closed.
    const computeNext = (prev: Set<string>): Set<string> => {
      if (prev.has(id)) {
        const next = new Set(prev);
        next.delete(id);
        return next;
      }
      if (expandMode === "single") return new Set([id]);
      const next = new Set(prev);
      next.add(id);
      return next;
    };
    if (isExpandControlled) {
      onExpandedChange?.([...computeNext(new Set(controlledExpandedKeys ?? []))]);
      return;
    }
    setInternalExpanded(computeNext);
  }

  function toggleGroupCollapsed(key: string) {
    const computeNext = (prev: Set<string>): Set<string> => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    };
    if (isCollapseControlled) {
      groupBy?.onCollapsedChange?.([...computeNext(new Set(controlledCollapsedKeys ?? []))]);
      return;
    }
    setInternalCollapsed(computeNext);
  }

  function togglePageAll() {
    const applyPageAll = (prev: Set<string>): Set<string> => {
      const next = new Set(prev);
      if (pageAllSelected) {
        pageRows.forEach((r) => next.delete(rowKey(r)));
        return next;
      }
      pageRows.forEach((r) => next.add(rowKey(r)));
      if (maxSelectable != null && next.size > maxSelectable) {
        onSelectionCapExceeded?.(next.size);
        return prev;
      }
      return next;
    };
    if (isSelectionControlled) {
      const prev = new Set(controlledSelectedKeys ?? []);
      const next = applyPageAll(prev);
      // Cap no-op returns the same Set reference — do not notify.
      if (next === prev) return;
      onSelectionChange?.([...next]);
      return;
    }
    setInternalSelected((prev) => applyPageAll(prev));
  }

  function clearSelection() {
    if (isSelectionControlled) {
      onSelectionChange?.([]);
      return;
    }
    setInternalSelected(new Set());
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

  const colSpan =
    visibleColumns.length + (selectable ? 1 : 0) + (rowActions ? 1 : 0) + (renderExpanded ? 1 : 0);

  // Shared per-row renderer so the grouped (A2) and ungrouped paths emit IDENTICAL row markup —
  // selection, expansion (incl. A1 controlled expansion), density, and row actions all compose.
  const renderDataRow = (row: T) => {
    const id = rowKey(row);
    const isExpanded = expanded.has(id);
    return (
      <Fragment key={id}>
      <tr
        data-testid={rowTestId ? rowTestId(row) : undefined}
        className={`border-t border-gray-100 ${
          onRowClick ? "cursor-pointer hover:bg-gray-50" : ""
        } ${rowClassName ? rowClassName(row) : ""}`}
        style={{ height: d.rowH, ...(selected.has(id) ? { backgroundColor: colors.accentTint } : {}) }}
        onClick={onRowClick ? (event) => {
          if (isParityTableInteractiveTarget(event.target)) return;
          onRowClick(row);
        } : undefined}
        onContextMenu={onRowContextMenu ? (event) => onRowContextMenu(row, event) : undefined}
      >
        {renderExpanded ? (
          <td className="px-2 align-top" onClick={(e: { stopPropagation(): void }) => e.stopPropagation()}>
            <button
              type="button"
              aria-label={isExpanded ? "Collapse row" : "Expand row"}
              aria-expanded={isExpanded}
              className="text-gray-500 hover:text-gray-800"
              onClick={() => toggleExpanded(id)}
            >
              {isExpanded ? "▾" : "▸"}
            </button>
          </td>
        ) : null}
        {selectable ? (
          <td className="px-2" onClick={(e: { stopPropagation(): void }) => e.stopPropagation()}>
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
            className={`overflow-hidden wrap-break-word px-2 align-top text-gray-800 ${
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
          <td className="px-2 text-right" onClick={(e: { stopPropagation(): void }) => e.stopPropagation()}>
            {rowActions(row)}
          </td>
        ) : null}
      </tr>
      {renderExpanded && isExpanded ? (
        <tr className="bg-gray-50/60">
          <td colSpan={colSpan} className="px-3 py-2">
            {renderExpanded(row)}
          </td>
        </tr>
      ) : null}
      </Fragment>
    );
  };

  const shellClass = embedded
    ? "overflow-visible bg-white"
    : "overflow-visible rounded-md border border-gray-200 bg-white";

  return (
    <div className={shellClass} data-testid={tableTestId}>
      {/* Canonical list toolbar: search + applied range filter + optional slot + gear. */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-2 py-1.5">
        <UniversalListToolbar
          search={toolbarSearch}
          onSearchChange={(value) => { setToolbarSearch(value); changePage(1); }}
          columns={columns.map((column) => ({ key: String(column.key), label: column.label }))}
          range={toolbarRange}
          onRangeApply={(value) => { setToolbarRange(value); changePage(1); }}
          resultCount={rows.length}
          totalCount={sourceRows.length}
          hideSearch={suppressToolbarSearch}
          hideRange={suppressToolbarRange}
          className="min-w-0 flex-1"
        />
        <div className="flex items-center gap-2 text-[11px] text-gray-600">
          {selectable && selected.size > 0 ? (
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-800">{selected.size} selected</span>
              {batchActions ? batchActions(selectedRows) : null}
              <button
                type="button"
                className="rounded-sm border border-gray-300 px-1.5 py-0.5"
                onClick={clearSelection}
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
          {exportFilename ? (
            <button
              type="button"
              aria-label="Export CSV"
              className="min-h-11 rounded-sm border border-gray-300 px-2 py-1 text-[12px] text-gray-700 hover:bg-gray-50 sm:min-h-0"
              onClick={exportCsv}
            >
              ⤓ Export
            </button>
          ) : null}
          <div className="relative" ref={gearRef}>
            <button
              type="button"
              aria-label="Table settings"
              className="min-h-11 rounded-sm border border-gray-300 px-2 py-1 text-[12px] text-gray-700 hover:bg-gray-50 sm:min-h-0"
              onClick={() => { if (gearOpen) cancelGear(); else openGear(); }}
            >
              ⚙
            </button>
            {gearOpen ? (
              <div className="absolute right-0 z-20 mt-1 w-60 rounded-md border border-gray-200 bg-white p-2 shadow-lg">
                <div className="mb-2">
                  <label htmlFor="parity-gear-page-size" className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                    Rows per page
                  </label>
                  <select
                    id="parity-gear-page-size"
                    aria-label="Rows per page"
                    className="h-8 w-full rounded-sm border border-gray-300 px-1 text-[12px]"
                    value={draftPageSize}
                    onChange={(e) => {
                      const next = Number(e.target.value);
                      setDraftPageSize(next);
                      changePageSize(next);
                      savePersisted(storageKey, { hidden: [...draftHidden], density: draftDensity, pageSize: next, colWidths });
                    }}
                  >
                    {pageSizeOptions.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  Density
                </div>
                <div className="mb-2 flex flex-col gap-0.5">
                  {(Object.keys(DENSITY) as ParityDensity[]).map((opt) => (
                    <label key={opt} className="flex items-center gap-2 text-[12px] text-gray-700">
                      <input
                        type="radio"
                        name="parity-density"
                        checked={draftDensity === opt}
                        onChange={() => setDraftDensity(opt)}
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
                            checked={!draftHidden.has(key)}
                            onChange={() => toggleDraftColumn(key)}
                          />
                          {c.label}
                        </label>
                      );
                    })}
                </div>
                <div className="mt-2 flex items-center justify-end gap-2 border-t border-gray-200 pt-2">
                  <button type="button" className="rounded-sm px-2 py-1 text-[12px] font-semibold text-gray-600 hover:bg-gray-100" onClick={resetGear}>Reset</button>
                  <button type="button" className="rounded-sm border border-gray-300 bg-white px-2 py-1 text-[12px] font-semibold text-gray-700 hover:bg-gray-50" onClick={cancelGear}>Cancel</button>
                  <button type="button" className="rounded-sm bg-[#1F2A44] px-2 py-1 text-[12px] font-semibold text-white hover:bg-[#172036]" onClick={applyGear}>Apply</button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {filterBar ? (
        <div className="border-b border-gray-200 px-2 py-1.5">{filterBar}</div>
      ) : null}

      <div className="overflow-x-auto">
      <table className="w-full table-fixed text-left" style={{ fontSize: d.font }}>
        <thead className={stickyHeader ? "sticky top-0 z-10 bg-gray-50" : "bg-gray-50"}>
          <tr style={{ height: DENSITY[density].rowH }}>
            {renderExpanded ? <th className={`w-8 px-2 ${stickyHeader ? "bg-gray-50" : ""}`} /> : null}
            {selectable ? (
              <th className={`w-8 px-2 ${stickyHeader ? "bg-gray-50" : ""}`}>
                <input
                  type="checkbox"
                  aria-label="Select all on page"
                  checked={pageAllSelected}
                  onChange={togglePageAll}
                />
              </th>
            ) : null}
            {visibleColumns.map((column) => {
              const key = String(column.key);
              const w = colWidths[key];
              return (
                <th
                  key={key}
                  className={`relative px-2 font-semibold uppercase text-gray-600 ${stickyHeader ? "bg-gray-50" : ""} ${column.className ?? ""}`}
                  style={{ fontSize: typography.kpiLabel ?? 11, letterSpacing: 0.3, ...(w ? { width: w } : {}) }}
                >
                  {column.sortable ? (
                    <button
                      type="button"
                      // GLOBAL-SORT / Cascade 2026-08-31: hit target must be the full <th> cell
                      // (DataTable already uses w-full). Label-only inline-flex left most of the
                      // header dead; enableColumnResize grip still owns the right w-2 edge.
                      className={`inline-flex w-full items-center gap-1 ${
                        /\btext-right\b/.test(column.className ?? "") ? "justify-end" : "justify-start"
                      }`}
                      onClick={() => toggleSort(key)}
                    >
                      {column.label}
                      {sortKey === key ? (sortDirection === "asc" ? "▲" : "▼") : null}
                    </button>
                  ) : (
                    column.label
                  )}
                  {enableColumnResize ? (
                    // CUST-CHROME-03: discoverable QBO-style column grip — opaque slate strip +
                    // 8px hit target (was 4–6px near-transparent). Keyboard ←/→ still works.
                    <span
                      role="separator"
                      aria-orientation="vertical"
                      aria-label={`Resize ${column.label}`}
                      title={`Drag to resize ${column.label}`}
                      aria-valuenow={w ? Math.round(w) : undefined}
                      tabIndex={0}
                      data-testid="parity-table-col-resize"
                      onMouseDown={(e) => startResize(key, e)}
                      onTouchStart={(e) => startResizeTouch(key, e)}
                      onKeyDown={(e) => onResizeKey(key, e)}
                      onClick={(e: { stopPropagation(): void }) => e.stopPropagation()}
                      className="absolute right-0 top-0 flex h-full w-2 cursor-col-resize touch-none select-none items-center justify-center border-r border-slate-400 bg-slate-200/90 hover:bg-slate-300 focus:bg-slate-400 focus:outline-hidden"
                    >
                      <span aria-hidden className="block h-3 w-px bg-slate-500" />
                    </span>
                  ) : null}
                </th>
              );
            })}
            {rowActions ? <th className={`w-10 px-2 ${stickyHeader ? "bg-gray-50" : ""}`} /> : null}
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
          ) : groupBy && groupedPageRows ? (
            // Phase A2 group bands: one full-width band <tr> above each group, rows in their
            // current order. Collapsed groups hide their rows (band stays visible).
            groupedPageRows.map((group) => {
              const isCollapsed = collapsedGroups.has(group.key);
              return (
                <Fragment key={`parity-group:${group.key}`}>
                  <tr
                    className="border-t border-gray-200 bg-gray-50"
                    data-parity-group={group.key}
                  >
                    <td
                      colSpan={colSpan}
                      className="px-2 font-semibold text-gray-800"
                      style={{ paddingTop: d.padY, paddingBottom: d.padY }}
                    >
                      <div className="flex items-center gap-1.5">
                        {groupBy.collapsible ? (
                          <button
                            type="button"
                            aria-label={isCollapsed ? `Expand group ${group.key}` : `Collapse group ${group.key}`}
                            aria-expanded={!isCollapsed}
                            className="text-gray-500 hover:text-gray-800"
                            onClick={() => toggleGroupCollapsed(group.key)}
                          >
                            {isCollapsed ? "▸" : "▾"}
                          </button>
                        ) : null}
                        <div className="min-w-0 flex-1">{groupBy.renderHeader(group.key, group.rows)}</div>
                      </div>
                    </td>
                  </tr>
                  {isCollapsed ? null : group.rows.map((row) => renderDataRow(row))}
                </Fragment>
              );
            })
          ) : (
            pageRows.map((row) => renderDataRow(row))
          )}
        </tbody>
      </table>
      </div>

      {/* Advanced pager — hidePager (A3) suppresses the built-in chrome so an external pager can own the UI. */}
      {hidePager ? null : (
      <div
        className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 px-2 py-1.5 text-[11px]"
        style={{ color: colors.mutedText }}
      >
        <div className="flex items-center gap-2">
          <span>{total === 0 ? "0 of 0" : `${offset + 1}–${Math.min(offset + pageSize, total)} of ${total}`}</span>
          <label className="flex items-center gap-1">
            <span>Per page</span>
            <select
              className="h-6 rounded-sm border border-gray-300 px-1"
              value={pageSize}
              onChange={(e) => changePageSize(Number(e.target.value))}
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
            className="h-6 rounded-sm border border-gray-300 px-1.5 disabled:opacity-40"
            onClick={() => changePage(1)}
            disabled={safePage <= 1}
          >
            «
          </button>
          <button
            type="button"
            className="h-6 rounded-sm border border-gray-300 px-1.5 disabled:opacity-40"
            onClick={() => changePage(Math.max(1, safePage - 1))}
            disabled={safePage <= 1}
          >
            ‹
          </button>
          {pageButtons.map((p) => (
            <button
              key={p}
              type="button"
              className={`h-6 min-w-6 rounded border px-1.5 ${
                p === safePage ? "text-white" : "border-gray-300 text-gray-700 hover:bg-gray-50"
              }`}
              style={p === safePage ? { backgroundColor: colors.navy, borderColor: colors.navy } : undefined}
              onClick={() => changePage(p)}
            >
              {p}
            </button>
          ))}
          <button
            type="button"
            className="h-6 rounded-sm border border-gray-300 px-1.5 disabled:opacity-40"
            onClick={() => changePage(Math.min(pageCount, safePage + 1))}
            disabled={safePage >= pageCount}
          >
            ›
          </button>
          <button
            type="button"
            className="h-6 rounded-sm border border-gray-300 px-1.5 disabled:opacity-40"
            onClick={() => changePage(pageCount)}
            disabled={safePage >= pageCount}
          >
            »
          </button>
          <span className="ml-1 flex items-center gap-1">
            Page
            <input
              className="h-6 w-12 rounded-sm border border-gray-300 px-1 text-center"
              value={pageInput}
              placeholder={String(safePage)}
              // ARIA-COMBOBOX-NO-NAME: the "Page"/"of N" text around this input is plain sibling
              // text, not linked via htmlFor/aria-labelledby — this backs 33+ list pages app-wide.
              aria-label="Jump to page"
              onChange={(e) => setPageInput(e.target.value.replace(/[^0-9]/g, ""))}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const n = Number(pageInput);
                  if (n >= 1 && n <= pageCount) changePage(n);
                  setPageInput("");
                }
              }}
            />
            of {pageCount}
          </span>
        </div>
      </div>
      )}
    </div>
  );
}
