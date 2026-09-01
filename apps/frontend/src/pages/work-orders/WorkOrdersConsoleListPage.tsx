import { entityLabel } from "../../lib/entity-label";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { listWorkOrdersConsole, type WoConsoleRow } from "../../api/workOrdersConsole";
import { ListErrorState } from "../../components/ListErrorState";
import { PageHeader } from "../../components/layout/PageHeader";
import { NavyPageSubNav } from "../../components/layout/NavyPageSubNav";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { formatQueryErrorDetail } from "../../lib/tableError";
import { SelectCombobox } from "../../components/shared/SelectCombobox";
import { EntityLink } from "../../components/shared/EntityLink";
import { useUrlSort } from "../../hooks/useUrlSort";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";

type SegmentId = "all" | "open" | "in_progress" | "completed" | "cancelled";
type WoSort = "created_desc" | "cost_desc" | "wo_number_asc" | "labor_cost_desc";
type ConsoleView = "list" | "kanban";
type KanbanSortKey = "unit_number" | "display_id";

const WO_CONSOLE_HEADER_SORTABLE = new Set(["unit_number", "display_id", "opened_at"]);
const DEFAULT_HEADER_SORT_KEY = "opened_at";
const PAGE_SIZE = 100;

function mapHeaderSortToServer(sortKey: string, sortDir: "asc" | "desc"): WoSort {
  if (sortKey === "display_id" && sortDir === "asc") return "wo_number_asc";
  if (sortKey === "total_estimated_cost" && sortDir === "desc") return "cost_desc";
  if (sortKey === "labor_cost_cents" && sortDir === "desc") return "labor_cost_desc";
  return "created_desc";
}

function consoleSortValue(row: WoConsoleRow, key: string): string | number {
  switch (key) {
    case "unit_number":
      return String(row.unit_number ?? "");
    case "display_id":
      return String(row.display_id ?? "");
    case "opened_at":
      return String(row.opened_at ?? row.created_at ?? "");
    case "total_estimated_cost":
      return Number(row.total_estimated_cost ?? 0);
    case "labor_cost_cents":
      return Number(row.labor_cost_cents ?? 0);
    default:
      return String((row as Record<string, unknown>)[key] ?? "");
  }
}

function compareConsoleRows(a: WoConsoleRow, b: WoConsoleRow, key: string): number {
  const va = consoleSortValue(a, key);
  const vb = consoleSortValue(b, key);
  if (typeof va === "number" && typeof vb === "number") return va - vb;
  return String(va).localeCompare(String(vb), undefined, { numeric: true, sensitivity: "base" });
}

function sortKanbanRows(rows: WoConsoleRow[], sort?: { key: KanbanSortKey; direction: "asc" | "desc" }): WoConsoleRow[] {
  if (!sort) return rows;
  return [...rows].sort((a, b) => {
    const cmp = compareConsoleRows(a, b, sort.key);
    return sort.direction === "asc" ? cmp : -cmp;
  });
}

function WoKanbanColumnSortControls({
  columnKey,
  sort,
  onToggleSort,
}: {
  columnKey: string;
  sort?: { key: KanbanSortKey; direction: "asc" | "desc" };
  onToggleSort: (columnKey: string, sortKey: KanbanSortKey) => void;
}) {
  const renderButton = (label: string, sortKey: KanbanSortKey) => {
    const active = sort?.key === sortKey;
    return (
      <button
        type="button"
        className={`inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-semibold normal-case tracking-normal ${
          active ? "bg-slate-200 text-slate-900" : "text-gray-500 hover:bg-gray-100 hover:text-gray-800"
        }`}
        onClick={() => onToggleSort(columnKey, sortKey)}
      >
        {label}
        {active ? (sort?.direction === "asc" ? " ▲" : " ▼") : null}
      </button>
    );
  };
  return (
    <div className="mt-1 flex flex-wrap gap-1" data-testid={`work-orders-console-kanban-sort-${columnKey}`}>
      {renderButton("Unit", "unit_number")}
      {renderButton("WO #", "display_id")}
    </div>
  );
}

export function WorkOrdersConsoleListPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [segment, setSegment] = useState<SegmentId>("all");
  const [billing, setBilling] = useState<"all" | "internal" | "external">("all");
  const [svc, setSvc] = useState<
    "all" | "pm" | "corrective" | "accident" | "inspection_dot" | "inspection_state" | "warranty" | "other"
  >("all");
  const [search, setSearch] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();
  const { onSortChange } = useUrlSort();
  // Page reads its own ?sort= directly (WO-CONSOLE-PARITYTABLE contract) — same underlying
  // searchParams instance useUrlSort reads, just read here too so the URL-sort contract is visible
  // in this file's own source, not only inside the shared hook.
  const sortParam = searchParams.get("sort");
  const effectiveSortKey = sortParam || DEFAULT_HEADER_SORT_KEY;
  const effectiveSortDir: "asc" | "desc" = sortParam ? (searchParams.get("dir") === "desc" ? "desc" : "asc") : "desc";
  const serverSort = mapHeaderSortToServer(effectiveSortKey, effectiveSortDir);
  const viewParam = String(searchParams.get("view") ?? "").trim().toLowerCase();
  const view: ConsoleView = viewParam === "kanban" ? "kanban" : "list";
  const setView = (next: ConsoleView) => {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (next === "list") params.delete("view");
        else params.set("view", "kanban");
        return params;
      },
      { replace: true },
    );
  };
  const [page, setPage] = useState(0);
  const [kanbanColumnSorts, setKanbanColumnSorts] = useState<
    Record<string, { key: KanbanSortKey; direction: "asc" | "desc" }>
  >({});

  useEffect(() => {
    setPage(0);
  }, [segment, billing, svc, search, effectiveSortKey, effectiveSortDir]);

  const listQuery = useQuery({
    queryKey: ["work-orders-console", companyId, segment, billing, svc, search, serverSort, page],
    queryFn: () =>
      listWorkOrdersConsole({
        operating_company_id: companyId,
        status: segment,
        wo_billing_type: billing === "all" ? undefined : billing,
        wo_service_class: svc === "all" ? undefined : svc,
        search: search.trim() || undefined,
        sort: serverSort,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      }),
    enabled: Boolean(companyId),
  });

  const rows = useMemo(() => listQuery.data?.work_orders ?? [], [listQuery.data?.work_orders]);

  const sortedRows = useMemo(() => {
    if (
      !WO_CONSOLE_HEADER_SORTABLE.has(effectiveSortKey) &&
      effectiveSortKey !== "total_estimated_cost" &&
      effectiveSortKey !== "labor_cost_cents"
    ) {
      return rows;
    }
    return [...rows].sort((a, b) => {
      const cmp = compareConsoleRows(a, b, effectiveSortKey);
      return effectiveSortDir === "asc" ? cmp : -cmp;
    });
  }, [rows, effectiveSortKey, effectiveSortDir]);

  const tabCounts = listQuery.data?.tab_counts;
  const total = tabCounts?.[segment] ?? 0;
  const pageStart = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const pageEnd = Math.min((page + 1) * PAGE_SIZE, total);
  const hasNext = (page + 1) * PAGE_SIZE < total;

  // SORT-A1-FALSE-POSITIVE: `text` not `label` on tabs/kanbanColumns — see the SEGMENTS comment in
  // TripPairingBoardPage.tsx for why (neither is a ParityTable column; the guard's heuristic can't
  // tell once this file imports ParityTable elsewhere).
  const tabs = useMemo(
    () => [
      { id: "all", text: `All (${tabCounts?.all ?? 0})` },
      { id: "open", text: `Open (${tabCounts?.open ?? 0})` },
      { id: "in_progress", text: `In Progress (${tabCounts?.in_progress ?? 0})` },
      { id: "completed", text: `Completed (${tabCounts?.completed ?? 0})` },
      { id: "cancelled", text: `Cancelled (${tabCounts?.cancelled ?? 0})` },
    ],
    [tabCounts],
  );

  const kanbanColumns = useMemo(() => {
    const defs: Array<{ id: string; text: string; match: (status: string) => boolean }> = [
      { id: "open", text: "Open", match: (s) => s === "open" || s === "draft" || s === "approved" },
      {
        id: "in_progress",
        text: "In Progress",
        match: (s) => s === "in_progress" || s === "in-progress" || s === "started",
      },
      { id: "completed", text: "Completed", match: (s) => s === "completed" || s === "closed" },
      {
        id: "cancelled",
        text: "Cancelled",
        match: (s) => s === "cancelled" || s === "canceled" || s === "void",
      },
    ];
    const buckets = defs.map((d) => ({ ...d, rows: [] as WoConsoleRow[] }));
    const other: WoConsoleRow[] = [];
    for (const row of sortedRows) {
      const status = String(row.status ?? "").toLowerCase();
      const hit = buckets.find((b) => b.match(status));
      if (hit) hit.rows.push(row);
      else other.push(row);
    }
    if (other.length) buckets.push({ id: "other", text: "Other", match: () => false, rows: other });
    return buckets;
  }, [sortedRows]);

  // WO-CONSOLE-PARITYTABLE (GO-05 wave 1): resize/reorder/persistence now come from ParityTable
  // itself (storageKey="work-orders-console-list") — the old useTablePref/useColumnReorder pair is
  // redundant with that and dropped. Kanban view (below) is untouched.
  const consoleColumns = useMemo<ParityColumn<WoConsoleRow>[]>(
    () => [
      {
        key: "unit_number",
        label: "Unit",
        sortable: true,
        sortValue: (row) => consoleSortValue(row, "unit_number"),
        render: (row) => (
          <span className="font-mono text-xs text-slate-800">{String(row.unit_number ?? "—")}</span>
        ),
      },
      {
        key: "display_id",
        label: "WO #",
        sortable: true,
        sortValue: (row) => consoleSortValue(row, "display_id"),
        render: (row) => (
          <EntityLink
            kind="work_order"
            id={String(row.id)}
            label={entityLabel(row.display_id, row.id, "Work order")}
            className="font-mono text-xs"
            data-testid="work-order-console-record-link"
          />
        ),
      },
      {
        key: "wo_billing_type",
        label: "Billing",
        sortable: false,
        render: (row) => (
          <span className="capitalize">{String(row.wo_billing_type ?? row.bucket ?? "")}</span>
        ),
      },
      {
        key: "wo_service_class",
        label: "Class",
        sortable: false,
        render: (row) => String(row.wo_service_class ?? row.wo_type ?? ""),
      },
      {
        key: "status",
        label: "Status",
        sortable: false,
        render: (row) => String(row.status ?? ""),
      },
      {
        key: "total_estimated_cost",
        label: "Est / Act",
        sortable: true,
        sortValue: (row) => consoleSortValue(row, "total_estimated_cost"),
        render: (row) => {
          const est = row.total_estimated_cost ?? "—";
          const act = row.total_actual_cost ?? "—";
          return (
            <>
              {String(est)} / {String(act)}
            </>
          );
        },
      },
      {
        key: "labor_cost_cents",
        label: "Labor ¢",
        sortable: true,
        sortValue: (row) => consoleSortValue(row, "labor_cost_cents"),
        className: "text-right",
        cellClass: "text-right font-mono text-[11px] text-slate-700",
        render: (row) => (row.labor_cost_cents != null ? String(row.labor_cost_cents) : "0"),
      },
      {
        key: "opened_at",
        label: "Opened",
        sortable: true,
        sortValue: (row) => consoleSortValue(row, "opened_at"),
        render: (row) => (
          <span className="text-xs text-slate-600">
            {String(row.opened_at ?? row.created_at ?? "").slice(0, 10)}
          </span>
        ),
      },
      {
        key: "actions",
        label: "Actions",
        sortable: false,
        className: "text-right",
        cellClass: "text-right",
        render: (row) => {
          const id = String(row.id ?? "");
          return (
            <EntityLink
              kind="work_orders_console"
              id={id}
              label="View"
              className="text-[#1f2a44] hover:underline"
            />
          );
        },
      },
    ],
    [],
  );

  const toggleKanbanColumnSort = (columnKey: string, sortKey: KanbanSortKey) => {
    setKanbanColumnSorts((current) => {
      const prior = current[columnKey];
      if (prior?.key === sortKey) {
        return { ...current, [columnKey]: { key: sortKey, direction: prior.direction === "asc" ? "desc" : "asc" } };
      }
      return { ...current, [columnKey]: { key: sortKey, direction: "asc" } };
    });
  };

  const filterBar = (
    <div className="flex flex-wrap items-center gap-2">
      <SelectCombobox
        value={billing}
        onChange={(event) => setBilling(event.target.value as typeof billing)}
        className="h-8 rounded-sm border border-gray-300 px-2 text-xs"
      >
        <option value="all">Billing: All</option>
        <option value="internal">Internal</option>
        <option value="external">External</option>
      </SelectCombobox>
      <SelectCombobox
        value={svc}
        onChange={(event) => setSvc(event.target.value as typeof svc)}
        className="h-8 rounded-sm border border-gray-300 px-2 text-xs"
      >
        <option value="all">Service class: All</option>
        <option value="pm">PM</option>
        <option value="corrective">Corrective</option>
        <option value="accident">Accident</option>
        <option value="inspection_dot">DOT inspection</option>
        <option value="inspection_state">State inspection</option>
        <option value="warranty">Warranty</option>
        <option value="other">Other</option>
      </SelectCombobox>
      <input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search WO #, unit, vendor, driver…"
        className="h-8 min-w-[240px] flex-1 rounded-sm border border-gray-300 px-2 text-[13px]"
      />
    </div>
  );

  const renderListTable = () => (
    <div className="space-y-2" data-testid="work-orders-console-list">
      {filterBar}
      <ParityTable<WoConsoleRow>
        columns={consoleColumns}
        rows={sortedRows}
        rowKey={(row) => String(row.id)}
        loading={listQuery.isLoading}
        emptyText="No work orders match the current filters."
        tableTestId="work-orders-console-headers"
        storageKey="work-orders-console-list"
        sortKey={effectiveSortKey}
        sortDirection={effectiveSortDir}
        onSortChange={onSortChange}
        sortMode="external"
        suppressToolbarSearch
        suppressToolbarRange
        hidePager
        pageSize={sortedRows.length || 1}
      />
    </div>
  );

  return (
    <div className="flex flex-col gap-3 px-3 py-3">
      <PageHeader title="Work orders" subtitle="Operational console for vendor-ready work order PDFs" />

      {!companyId ? (
        <div className="rounded-sm border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Select a company.
        </div>
      ) : null}

      <NavyPageSubNav
        items={tabs.map((t) => ({ label: t.text, to: `#${t.id}` }))}
        activeId={segment}
        onTabChange={(id) => setSegment(id as SegmentId)}
        itemIds={tabs.map((t) => t.id)}
      />

      <div className="flex flex-wrap items-center gap-2" data-testid="work-orders-console-view-toggle">
        <button
          type="button"
          className={`rounded-sm border px-2 py-1 text-xs font-semibold ${
            view === "list" ? "border-slate-500 bg-slate-50 text-slate-800" : "border-gray-300 bg-white text-gray-600"
          }`}
          aria-pressed={view === "list"}
          onClick={() => setView("list")}
        >
          List
        </button>
        <button
          type="button"
          className={`rounded-sm border px-2 py-1 text-xs font-semibold ${
            view === "kanban" ? "border-slate-500 bg-slate-50 text-slate-800" : "border-gray-300 bg-white text-gray-600"
          }`}
          aria-pressed={view === "kanban"}
          onClick={() => setView("kanban")}
          data-testid="work-orders-console-kanban-tab"
        >
          Kanban
        </button>
      </div>

      {listQuery.isError ? (
        <ListErrorState
          title="Couldn't load work orders"
          {...formatQueryErrorDetail(listQuery.error)}
          onRetry={() => void listQuery.refetch()}
        />
      ) : view === "kanban" ? (
        <div className="space-y-2" data-testid="work-orders-console-kanban">
          {filterBar}
          {listQuery.isLoading ? (
            <div className="rounded-sm border border-gray-200 bg-white p-3 text-sm text-slate-600">Loading work orders…</div>
          ) : sortedRows.length === 0 ? (
            <div className="rounded-sm border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-700">
              No work orders match the current filters.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
              {kanbanColumns.map((col) => {
                const columnRows = sortKanbanRows(col.rows, kanbanColumnSorts[col.id]);
                return (
                  <section
                    key={col.id}
                    className="rounded-sm border border-gray-200 bg-white"
                    data-testid={`work-orders-console-kanban-col-${col.id}`}
                  >
                    <header className="border-b border-gray-100 px-2 py-1.5 text-xs font-semibold text-slate-700">
                      <div>
                        {col.text} ({columnRows.length})
                      </div>
                      <WoKanbanColumnSortControls
                        columnKey={col.id}
                        sort={kanbanColumnSorts[col.id]}
                        onToggleSort={toggleKanbanColumnSort}
                      />
                    </header>
                    <ul className="max-h-[28rem] space-y-1 overflow-y-auto p-2">
                      {columnRows.map((row) => (
                        <li key={String(row.id)} className="rounded-sm border border-gray-100 bg-slate-50 px-2 py-1.5 text-xs">
                          <EntityLink
                            kind="work_order"
                            id={String(row.id)}
                            label={entityLabel(row.display_id, row.id, "Work order")}
                            className="font-mono font-semibold text-slate-800"
                          />
                          <div className="mt-0.5 font-mono text-[10px] text-slate-500">{String(row.unit_number ?? "—")}</div>
                          <div className="mt-0.5 text-[11px] capitalize text-slate-600">{String(row.status ?? "")}</div>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        renderListTable()
      )}

      <div className="flex items-center justify-between gap-2 text-xs text-slate-600">
        <span>{total === 0 ? "No work orders" : `Showing ${pageStart}–${pageEnd} of ${total}`}</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-sm border border-gray-300 px-2 py-1 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
          >
            Prev
          </button>
          <span>Page {page + 1}</span>
          <button
            type="button"
            className="rounded-sm border border-gray-300 px-2 py-1 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => setPage((p) => p + 1)}
            disabled={!hasNext}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
