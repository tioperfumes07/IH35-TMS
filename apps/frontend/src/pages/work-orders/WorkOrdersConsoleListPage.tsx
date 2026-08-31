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
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { EntityLink } from "../../components/shared/EntityLink";

type SegmentId = "all" | "open" | "in_progress" | "completed" | "cancelled";
type WoSort = "created_desc" | "cost_desc" | "wo_number_asc" | "labor_cost_desc";
type ConsoleView = "list" | "kanban";

const WO_SORT_VALUES = new Set<WoSort>(["created_desc", "cost_desc", "wo_number_asc", "labor_cost_desc"]);
const PAGE_SIZE = 100;

function parseWoSort(raw: string | null): WoSort {
  return raw && WO_SORT_VALUES.has(raw as WoSort) ? (raw as WoSort) : "created_desc";
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
  // BANK-SORT-ROLLOUT-OPS — ?sort= URL persistence so a shared/bookmarked work-orders link keeps the
  // chosen sort. The backend column set here is a fixed enum (not per-column asc/desc — see the
  // header-click contract on the fleet table / dispatch board), so only the sort VALUE round-trips.
  const [searchParams, setSearchParams] = useSearchParams();
  const sort = parseWoSort(searchParams.get("sort"));
  // LV-MAINT-WO-KANBAN-VIEW: ?view=kanban must render status columns (not silently ignore → table).
  // Case-insensitive — Live FAIL when casing/stale param left the console stuck on ParityTable.
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
  const setSort = (next: WoSort) => {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (next === "created_desc") params.delete("sort");
        else params.set("sort", next);
        return params;
      },
      { replace: true },
    );
  };
  const [page, setPage] = useState(0);

  // Any filter/segment/search/sort change returns to the first page.
  useEffect(() => {
    setPage(0);
  }, [segment, billing, svc, search, sort]);

  const listQuery = useQuery({
    queryKey: ["work-orders-console", companyId, segment, billing, svc, search, sort, page],
    queryFn: () =>
      listWorkOrdersConsole({
        operating_company_id: companyId,
        status: segment,
        wo_billing_type: billing === "all" ? undefined : billing,
        wo_service_class: svc === "all" ? undefined : svc,
        search: search.trim() || undefined,
        sort,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      }),
    enabled: Boolean(companyId),
  });

  const rows = useMemo(() => listQuery.data?.work_orders ?? [], [listQuery.data?.work_orders]);

  const tabCounts = listQuery.data?.tab_counts;
  // tab_counts keys mirror the segment ids, so the active segment's count is a real total.
  const total = tabCounts?.[segment] ?? 0;
  const pageStart = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const pageEnd = Math.min((page + 1) * PAGE_SIZE, total);
  const hasNext = (page + 1) * PAGE_SIZE < total;

  const tabs = useMemo(
    () => [
      { id: "all", label: `All (${tabCounts?.all ?? 0})` },
      { id: "open", label: `Open (${tabCounts?.open ?? 0})` },
      { id: "in_progress", label: `In Progress (${tabCounts?.in_progress ?? 0})` },
      { id: "completed", label: `Completed (${tabCounts?.completed ?? 0})` },
      { id: "cancelled", label: `Cancelled (${tabCounts?.cancelled ?? 0})` },
    ],
    [tabCounts],
  );

  const kanbanColumns = useMemo(() => {
    const defs: Array<{ id: string; label: string; match: (status: string) => boolean }> = [
      { id: "open", label: "Open", match: (s) => s === "open" || s === "draft" || s === "approved" },
      {
        id: "in_progress",
        label: "In Progress",
        match: (s) => s === "in_progress" || s === "in-progress" || s === "started",
      },
      { id: "completed", label: "Completed", match: (s) => s === "completed" || s === "closed" },
      {
        id: "cancelled",
        label: "Cancelled",
        match: (s) => s === "cancelled" || s === "canceled" || s === "void",
      },
    ];
    const buckets = defs.map((d) => ({ ...d, rows: [] as WoConsoleRow[] }));
    const other: WoConsoleRow[] = [];
    for (const row of rows) {
      const status = String(row.status ?? "").toLowerCase();
      const hit = buckets.find((b) => b.match(status));
      if (hit) hit.rows.push(row);
      else other.push(row);
    }
    if (other.length) buckets.push({ id: "other", label: "Other", match: () => false, rows: other });
    return buckets;
  }, [rows]);

  const columns = useMemo<Array<ParityColumn<WoConsoleRow>>>(
    () => [
      {
        key: "display_id",
        label: "WO #",
        render: (row) => (
          <EntityLink kind="work_order" id={String(row.id)} label={entityLabel(row.display_id, row.id, "Work order")} className="font-mono text-xs" data-testid="work-order-console-record-link" />
        ),
      },
      {
        key: "wo_billing_type",
        label: "Billing",
        render: (row) => (
          <span className="capitalize">{String(row.wo_billing_type ?? row.bucket ?? "")}</span>
        ),
      },
      {
        key: "wo_service_class",
        label: "Class",
        render: (row) => String(row.wo_service_class ?? row.wo_type ?? ""),
      },
      {
        key: "status",
        label: "Status",
        render: (row) => String(row.status ?? ""),
      },
      {
        key: "total_estimated_cost",
        label: "Est / Act",
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
        className: "text-right",
        cellClass: "text-right font-mono text-[11px] text-slate-700",
        render: (row) => (row.labor_cost_cents != null ? String(row.labor_cost_cents) : "0"),
      },
      {
        key: "opened_at",
        label: "Opened",
        render: (row) => (
          <span className="text-xs text-slate-600">
            {String(row.opened_at ?? row.created_at ?? "").slice(0, 10)}
          </span>
        ),
      },
      {
        key: "actions",
        label: "Actions",
        alwaysVisible: true,
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
      <SelectCombobox
        value={sort}
        onChange={(event) => setSort(event.target.value as typeof sort)}
        className="h-8 rounded-sm border border-gray-300 px-2 text-xs"
      >
        <option value="created_desc">Sort: Newest</option>
        <option value="cost_desc">Sort: Cost</option>
        <option value="labor_cost_desc">Sort: Labor cost</option>
        <option value="wo_number_asc">Sort: WO #</option>
      </SelectCombobox>
      <input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search WO #, unit, vendor, driver…"
        className="h-8 min-w-[240px] flex-1 rounded-sm border border-gray-300 px-2 text-[13px]"
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
        items={tabs.map((t) => ({ label: t.label, to: `#${t.id}` }))}
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
          ) : rows.length === 0 ? (
            <div className="rounded-sm border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-700">
              No work orders match the current filters.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
              {kanbanColumns.map((col) => (
                <section
                  key={col.id}
                  className="rounded-sm border border-gray-200 bg-white"
                  data-testid={`work-orders-console-kanban-col-${col.id}`}
                >
                  <header className="border-b border-gray-100 px-2 py-1.5 text-xs font-semibold text-slate-700">
                    {col.label} ({col.rows.length})
                  </header>
                  <ul className="max-h-[28rem] space-y-1 overflow-y-auto p-2">
                    {col.rows.map((row) => (
                      <li key={String(row.id)} className="rounded-sm border border-gray-100 bg-slate-50 px-2 py-1.5 text-xs">
                        <EntityLink
                          kind="work_order"
                          id={String(row.id)}
                          label={entityLabel(row.display_id, row.id, "Work order")}
                          className="font-mono font-semibold text-slate-800"
                        />
                        <div className="mt-0.5 text-[11px] capitalize text-slate-600">{String(row.status ?? "")}</div>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>
      ) : (
        <ParityTable<WoConsoleRow>
          rows={rows}
          columns={columns}
          rowKey={(row) => String(row.id ?? "")}
          loading={listQuery.isLoading}
          storageKey="work-orders-console-list"
          exportFilename="work-orders"
          emptyText="No work orders match the current filters."
          initialPageSize={PAGE_SIZE}
          pageSizeOptions={[PAGE_SIZE]}
          suppressToolbarSearch
          filterBar={filterBar}
        />
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
