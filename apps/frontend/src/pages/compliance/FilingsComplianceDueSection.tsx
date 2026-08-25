import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { fetchFilingsDashboard, type FilingItem, type FilingStatus } from "../../api/compliance";
import { formatDateUS } from "../../lib/formatDate";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { ListErrorState } from "../../components/ListErrorState";
import { CollapsedListFilters, useStagedListFilters } from "../../components/table";

type Props = {
  operatingCompanyId: string;
};

const STATUS_LABEL: Record<FilingStatus, string> = {
  overdue: "Overdue",
  due: "Due Soon",
  upcoming: "Upcoming",
  not_yet_tracked: "Not Yet Tracked",
};

const STATUS_CLASS: Record<FilingStatus, string> = {
  overdue: "font-semibold text-red-700",
  due: "font-semibold text-[#1f2a44]",
  upcoming: "text-slate-600",
  not_yet_tracked: "italic text-slate-400",
};

const STATUS_TILES: Array<{ key: FilingStatus; label: string }> = [
  { key: "overdue", label: "Overdue" },
  { key: "due", label: "Due Soon" },
  { key: "upcoming", label: "Upcoming" },
  { key: "not_yet_tracked", label: "Not Yet Tracked" },
];

/**
 * Compliance & Filings aggregator — read-only cross-module "view all pending" table (owner decision
 * 2026-07-05, memory `compliance-taxes-permits-module-org`). Pulls from IFTA, Form 2290/HVUT, state
 * permits, IRP, driver CDL/medical/drug-test/Clearinghouse/MVR, and a business-property-tax placeholder.
 * Each row drills through to that program's own home — nothing here is the source of record.
 */
export function FilingsComplianceDueSection({ operatingCompanyId }: Props) {
  const [statusFilter, setStatusFilter] = useState<FilingStatus | "">("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [filterText, setFilterText] = useState("");
  const staged = useStagedListFilters({
    applied: { categoryFilter, filterText },
    empty: { categoryFilter: "", filterText: "" },
    onApply: (next) => {
      setCategoryFilter(next.categoryFilter);
      setFilterText(next.filterText);
    },
  });

  const dashboardQ = useQuery({
    queryKey: ["compliance-filings-dashboard", operatingCompanyId],
    queryFn: () => fetchFilingsDashboard(operatingCompanyId),
    enabled: Boolean(operatingCompanyId),
    refetchInterval: 5 * 60 * 1000,
  });

  const items = dashboardQ.data?.items ?? [];
  const counts = dashboardQ.data?.counts ?? { upcoming: 0, due: 0, overdue: 0, not_yet_tracked: 0 };

  const programs = useMemo(() => Array.from(new Set(items.map((i) => i.program))).sort(), [items]);

  const filteredRows = useMemo(() => {
    let rows = items;
    if (statusFilter) rows = rows.filter((r) => r.status === statusFilter);
    if (categoryFilter) rows = rows.filter((r) => r.program === categoryFilter);
    if (filterText.trim()) {
      const needle = filterText.trim().toLowerCase();
      rows = rows.filter((r) => `${r.program} ${r.detail} ${r.entity_code}`.toLowerCase().includes(needle));
    }
    // Default order (before any column-header sort) matches the prior default: due date ascending.
    return [...rows].sort((a, b) => {
      const da = a.due_date ? new Date(a.due_date).getTime() : Number.POSITIVE_INFINITY;
      const db = b.due_date ? new Date(b.due_date).getTime() : Number.POSITIVE_INFINITY;
      return da - db;
    });
  }, [items, statusFilter, categoryFilter, filterText]);

  const filingColumns = useMemo<ParityColumn<FilingItem>[]>(
    () => [
      { key: "program", label: "Program", sortable: true },
      { key: "entity_code", label: "Entity", sortable: true, render: (row) => row.entity_code || "—" },
      { key: "detail", label: "Detail", sortable: true },
      {
        key: "due_date",
        label: "Due Date",
        sortable: true,
        render: (row) => (row.due_date ? formatDateUS(row.due_date) : "—"),
      },
      {
        key: "status",
        label: "Status",
        sortable: true,
        render: (row) => <span className={STATUS_CLASS[row.status]}>{STATUS_LABEL[row.status]}</span>,
      },
      {
        key: "drill_through",
        label: "Go To",
        alwaysVisible: true,
        render: (row) =>
          row.drill_through ? (
            <Link className="text-slate-700 underline" to={row.drill_through}>
              Open
            </Link>
          ) : (
            <span className="text-slate-400">—</span>
          ),
      },
    ],
    []
  );

  if (!operatingCompanyId) {
    return <div className="rounded-sm border bg-white p-4 text-sm">Select an operating company.</div>;
  }

  return (
    <div className="space-y-4" data-testid="compliance-filings-dashboard">
      {dashboardQ.isError ? (
        <ListErrorState
          title="Couldn't load filings and compliance due"
          status={0}
          message={(dashboardQ.error as Error)?.message}
          onRetry={() => void dashboardQ.refetch()}
        />
      ) : (
      <>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {STATUS_TILES.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setStatusFilter((s) => (s === key ? "" : key))}
            className={`rounded-sm border px-3 py-2 text-left ${
              statusFilter === key ? "border-[#1f2a44] ring-1 ring-[#1f2a44]" : "border-slate-200"
            } ${key === "overdue" && counts.overdue > 0 ? "bg-red-50" : "bg-white"}`}
            data-testid={`filings-tile-${key}`}
          >
            <div className={`text-2xl font-semibold ${key === "overdue" ? "text-red-700" : "text-[#1f2a44]"}`}>
              {counts[key]}
            </div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
          </button>
        ))}
      </div>

      <ParityTable<FilingItem>
        columns={filingColumns}
        rows={filteredRows}
        rowKey={(row) => row.id}
        loading={dashboardQ.isLoading}
        emptyText="Nothing pending."
        storageKey="compliance-filings-due"
        exportFilename="filings-compliance-due"
        tableTestId="compliance-filings-due-table"
        filterBar={
          <CollapsedListFilters
            activeFilterCount={(categoryFilter ? 1 : 0) + (filterText.trim() ? 1 : 0)}
            onApply={staged.apply}
            onReset={staged.reset}
            onCancel={staged.cancel}
            applyDisabled={!staged.dirty}
            testIdPrefix="compliance-filings"
            dataAttributes={{ "data-compliance-filings-filter-toolbar": "collapsed" }}
          >
            <div className="relative flex flex-wrap items-center gap-3">
              <input
                type="text"
                placeholder="Filter by program, entity, detail…"
                value={staged.draft.filterText}
                onChange={(e) => staged.setDraft({ ...staged.draft, filterText: e.target.value })}
                className="h-8 w-full max-w-md rounded-sm border px-2 text-sm"
              />
              <label className="text-sm">
                Program{" "}
                <select
                  className="ml-1 rounded-sm border px-2 py-1"
                  value={staged.draft.categoryFilter}
                  onChange={(e) => staged.setDraft({ ...staged.draft, categoryFilter: e.target.value })}
                >
                  <option value="">All</option>
                  {programs.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </CollapsedListFilters>
        }
      />
      </>
      )}
    </div>
  );
}
