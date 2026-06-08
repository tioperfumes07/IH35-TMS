import { useMemo, useState } from "react";
import { ListView } from "../ListView";
import type { ActiveFilter, ListViewColumn, ListViewFilter, PaginationConfig, SortConfig } from "../types";

interface DemoRow {
  id: string;
  name: string;
  type: string;
  status: string;
  balance: string;
  transactions: number;
  lastActivity: string;
  currency: string;
  region: string;
}

function makeRows(count: number): DemoRow[] {
  const types = ["Asset", "Liability", "Equity", "Revenue", "Expense"];
  const statuses = ["Active", "Active", "Active", "Inactive"];
  const regions = ["North", "South", "East", "West", "Central"];
  return Array.from({ length: count }, (_, i) => ({
    id: String(i + 1),
    name: `Account ${String(i + 1).padStart(4, "0")}`,
    type: types[i % types.length] ?? "Asset",
    status: statuses[i % statuses.length] ?? "Active",
    balance: (Math.random() * 100000 - 20000).toFixed(2),
    transactions: Math.floor(Math.random() * 500),
    lastActivity: new Date(Date.now() - Math.random() * 365 * 86400000).toLocaleDateString(),
    currency: i % 5 === 0 ? "MXN" : "USD",
    region: regions[i % regions.length] ?? "North",
  }));
}

const ALL_ROWS = makeRows(200);

const COLUMNS: ListViewColumn<DemoRow>[] = [
  { id: "name", label: "Account Name", width: 200, sortType: "text", pinned: true },
  { id: "type", label: "Type", width: 110, sortType: "text" },
  { id: "status", label: "Status", width: 90, sortType: "text" },
  { id: "balance", label: "Balance", width: 130, sortType: "currency" },
  { id: "transactions", label: "Txns", width: 80, sortType: "number" },
  { id: "lastActivity", label: "Last Activity", width: 130, sortType: "date" },
  { id: "currency", label: "Currency", width: 90, sortType: "text" },
  { id: "region", label: "Region", width: 90, sortType: "text" },
];

const FILTERS: ListViewFilter[] = [
  { id: "type", label: "Type", type: "multiselect" },
  { id: "status", label: "Status", type: "multiselect" },
  { id: "currency", label: "Currency", type: "multiselect" },
  { id: "region", label: "Region", type: "multiselect" },
];

const PAGE_SIZE = 50;

export function ListViewDemo() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [sortKey, setSortKey] = useState("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([]);

  const filteredRows = useMemo(() => {
    let rows = ALL_ROWS;
    for (const { filterId, values } of activeFilters) {
      if (values.length === 0) continue;
      rows = rows.filter((r) => values.includes(String((r as unknown as Record<string, unknown>)[filterId] ?? "")));
    }
    if (sortKey) {
      const col = COLUMNS.find((c) => c.id === sortKey);
      rows = [...rows].sort((a, b) => {
        const av = String((a as unknown as Record<string, unknown>)[sortKey] ?? "");
        const bv = String((b as unknown as Record<string, unknown>)[sortKey] ?? "");
        let cmp: number;
        if (col?.sortType === "number" || col?.sortType === "currency") {
          cmp = (parseFloat(av.replace(/[$,]/g, "")) || 0) - (parseFloat(bv.replace(/[$,]/g, "")) || 0);
        } else if (col?.sortType === "date") {
          cmp = Date.parse(av) - Date.parse(bv);
        } else {
          cmp = av.localeCompare(bv);
        }
        return sortDir === "asc" ? cmp : -cmp;
      });
    }
    return rows;
  }, [activeFilters, sortKey, sortDir]);

  const pageRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, page, pageSize]);

  const pagination: PaginationConfig = {
    page,
    pageSize,
    total: filteredRows.length,
    onPageChange: setPage,
    onPageSizeChange: (s) => { setPageSize(s); setPage(1); },
  };

  const sort: SortConfig = {
    key: sortKey,
    dir: sortDir,
    onChange: (k, d) => { setSortKey(k); setSortDir(d); setPage(1); },
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50 p-4">
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-gray-800">ListView Demo</h1>
        <p className="text-sm text-gray-500 mt-1">
          200-row synthetic dataset · resize, reorder, sort, filter, gear, multi-select, totals, export
        </p>
      </div>
      <div className="flex-1 bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
        <ListView
          columns={COLUMNS}
          rows={pageRows}
          rowKey={(r) => r.id}
          pagination={pagination}
          sort={sort}
          filters={FILTERS}
          onFilterChange={(af) => { setActiveFilters(af); setPage(1); }}
          showTotals
          savedViewsKey="demo"
          density="cozy"
          badgeSlot={(r) =>
            r.status === "Inactive" ? (
              <span className="ml-1 text-[9px] bg-gray-200 text-gray-600 rounded px-1 py-0.5">
                Inactive
              </span>
            ) : null
          }
          batchActions={
            <button
              type="button"
              className="px-3 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600"
            >
              Archive selected
            </button>
          }
        />
      </div>
    </div>
  );
}
