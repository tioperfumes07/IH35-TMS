import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { fetchFilingsDashboard, type FilingItem, type FilingStatus } from "../../api/compliance";
import { formatDateUS } from "../../lib/formatDate";

type Props = {
  operatingCompanyId: string;
};

type SortKey = "program" | "entity_code" | "due_date" | "status" | "detail";

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

function compareRows(a: FilingItem, b: FilingItem, key: SortKey, dir: "asc" | "desc") {
  let cmp = 0;
  if (key === "due_date") {
    const da = a.due_date ? new Date(a.due_date).getTime() : Number.POSITIVE_INFINITY;
    const db = b.due_date ? new Date(b.due_date).getTime() : Number.POSITIVE_INFINITY;
    cmp = da - db;
  } else if (key === "status") {
    const order: Record<FilingStatus, number> = { overdue: 0, due: 1, upcoming: 2, not_yet_tracked: 3 };
    cmp = order[a.status] - order[b.status];
  } else {
    cmp = String(a[key] ?? "").localeCompare(String(b[key] ?? ""));
  }
  return dir === "asc" ? cmp : -cmp;
}

function Th({
  label,
  sortKey,
  sort,
  onClick,
}: {
  label: string;
  sortKey: SortKey;
  sort: { key: SortKey; dir: "asc" | "desc" };
  onClick: () => void;
}) {
  const active = sort.key === sortKey;
  return (
    <th
      className="cursor-pointer select-none px-2 py-1.5 text-left font-semibold text-slate-600 hover:text-slate-900"
      onClick={onClick}
    >
      {label}
      {active ? <span className="ml-0.5 text-slate-400">{sort.dir === "asc" ? "▲" : "▼"}</span> : null}
    </th>
  );
}

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
  const [debouncedFilter, setDebouncedFilter] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "due_date", dir: "asc" });

  useEffect(() => {
    const t = setTimeout(() => setDebouncedFilter(filterText), 200);
    return () => clearTimeout(t);
  }, [filterText]);

  const dashboardQ = useQuery({
    queryKey: ["compliance-filings-dashboard", operatingCompanyId],
    queryFn: () => fetchFilingsDashboard(operatingCompanyId),
    enabled: Boolean(operatingCompanyId),
    refetchInterval: 5 * 60 * 1000,
  });

  const items = dashboardQ.data?.items ?? [];
  const counts = dashboardQ.data?.counts ?? { upcoming: 0, due: 0, overdue: 0, not_yet_tracked: 0 };

  const programs = useMemo(() => Array.from(new Set(items.map((i) => i.program))).sort(), [items]);

  const filteredSorted = useMemo(() => {
    let rows = items;
    if (statusFilter) rows = rows.filter((r) => r.status === statusFilter);
    if (categoryFilter) rows = rows.filter((r) => r.program === categoryFilter);
    if (debouncedFilter.trim()) {
      const needle = debouncedFilter.trim().toLowerCase();
      rows = rows.filter((r) => `${r.program} ${r.detail} ${r.entity_code}`.toLowerCase().includes(needle));
    }
    return [...rows].sort((a, b) => compareRows(a, b, sort.key, sort.dir));
  }, [items, statusFilter, categoryFilter, debouncedFilter, sort]);

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  }

  if (!operatingCompanyId) {
    return <div className="rounded-sm border bg-white p-4 text-sm">Select an operating company.</div>;
  }

  return (
    <div className="space-y-4" data-testid="compliance-filings-dashboard">
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

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Filter by program, entity, detail…"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          className="rounded-sm border px-2 py-1 text-sm"
        />
        <label className="text-sm">
          Program{" "}
          <select
            className="ml-1 rounded-sm border px-2 py-1"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
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

      <div className="overflow-x-auto rounded-sm border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="sticky top-0 z-10 bg-slate-100 text-left text-slate-600">
            <tr>
              <Th label="Program" sortKey="program" sort={sort} onClick={() => toggleSort("program")} />
              <Th label="Entity" sortKey="entity_code" sort={sort} onClick={() => toggleSort("entity_code")} />
              <Th label="Detail" sortKey="detail" sort={sort} onClick={() => toggleSort("detail")} />
              <Th label="Due Date" sortKey="due_date" sort={sort} onClick={() => toggleSort("due_date")} />
              <Th label="Status" sortKey="status" sort={sort} onClick={() => toggleSort("status")} />
              <th className="px-2 py-1.5 text-left font-semibold">Go To</th>
            </tr>
          </thead>
          <tbody>
            {dashboardQ.isLoading ? (
              <tr>
                <td className="p-3 text-slate-500" colSpan={6}>
                  Loading…
                </td>
              </tr>
            ) : filteredSorted.length === 0 ? (
              <tr>
                <td className="p-3 text-slate-500" colSpan={6}>
                  Nothing pending.
                </td>
              </tr>
            ) : (
              filteredSorted.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-2 py-1.5">{row.program}</td>
                  <td className="px-2 py-1.5">{row.entity_code || "—"}</td>
                  <td className="px-2 py-1.5">{row.detail}</td>
                  <td className="px-2 py-1.5">{row.due_date ? formatDateUS(row.due_date) : "—"}</td>
                  <td className={`px-2 py-1.5 ${STATUS_CLASS[row.status]}`}>{STATUS_LABEL[row.status]}</td>
                  <td className="px-2 py-1.5">
                    {row.drill_through ? (
                      <Link className="text-slate-700 underline" to={row.drill_through}>
                        Open
                      </Link>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
