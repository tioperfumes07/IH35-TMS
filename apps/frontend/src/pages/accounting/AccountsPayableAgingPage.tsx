import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Button } from "../../components/Button";
import { DatePicker } from "../../components/forms/DatePicker";
import { TableControls, TableSearch, TableHeaderCell, useTableController, type TableColumn } from "../../components/table";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { getApAgingByVendor, type ApAgingVendor, type ApAgingDisplayGroup } from "../../api/accounting";
import { formatDateUS } from "../../lib/formatDate";
import { useUrlSort } from "../../hooks/useUrlSort";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";
import { companyToday } from "../../lib/businessDate";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
}
function today() {
  return companyToday();
}

// Aging columns; 61-90 and 91+ are flagged red per the QBO-grade spec.
const COLUMNS: TableColumn[] = [
  { key: "vendor", label: "Vendor", alwaysVisible: true },
  { key: "type", label: "Vendor type" },
  { key: "current", label: "Current" },
  { key: "d1_30", label: "1-30" },
  { key: "d31_60", label: "31-60" },
  { key: "d61_90", label: "61-90" },
  { key: "d90_plus", label: "91+" },
  { key: "total", label: "Total" },
];
const MONEY_KEYS = ["current", "d1_30", "d31_60", "d61_90", "d90_plus", "total"] as const;
const RED_KEYS = new Set(["d61_90", "d90_plus"]);
const GROUP_ORDER: ApAgingDisplayGroup[] = ["Driver", "Repair", "Diesel", "Insurance", "Intercompany", "Other"];
const GROUP_CHIP: Record<ApAgingDisplayGroup, string> = {
  Driver: "bg-slate-100 text-slate-700",
  Repair: "bg-slate-100 text-slate-700",
  Diesel: "bg-slate-100 text-slate-700",
  Insurance: "bg-slate-100 text-slate-700",
  Intercompany: "bg-slate-100 text-slate-700",
  Other: "bg-slate-100 text-slate-600",
};

type Buckets = { current: number; d1_30: number; d31_60: number; d61_90: number; d90_plus: number; total_outstanding: number };
function emptyBuckets(): Buckets {
  return { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0, total_outstanding: 0 };
}
function addBuckets(acc: Buckets, v: ApAgingVendor): Buckets {
  acc.current += v.current;
  acc.d1_30 += v.d1_30;
  acc.d31_60 += v.d31_60;
  acc.d61_90 += v.d61_90;
  acc.d90_plus += v.d90_plus;
  acc.total_outstanding += v.total_outstanding;
  return acc;
}
function amount(b: Buckets | ApAgingVendor, key: string): number {
  switch (key) {
    case "current": return b.current;
    case "d1_30": return b.d1_30;
    case "d31_60": return b.d31_60;
    case "d61_90": return b.d61_90;
    case "d90_plus": return b.d90_plus;
    case "total": return b.total_outstanding;
    default: return 0;
  }
}
const moneyCellClass = (key: string) => `px-2 py-1.5 text-right tabular-nums ${RED_KEYS.has(key) ? "text-red-600" : ""}`;

export function AccountsPayableAgingPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [asOf, setAsOf] = useState(today());
  const [view, setView] = useState<"by_vendor" | "by_type">("by_vendor");
  const [typeFilter, setTypeFilter] = useState<ApAgingDisplayGroup | "all">("all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(GROUP_ORDER));

  const query = useQuery({
    queryKey: ["ap-aging-by-vendor", companyId, asOf],
    queryFn: () => getApAgingByVendor(companyId, asOf),
    enabled: Boolean(companyId),
    staleTime: 30_000,
  });
  const vendors = useMemo(() => query.data?.vendors ?? [], [query.data?.vendors]);

  // ACCOUNTING-2: TMS bills are the internal aging basis. QBO mirror status is separate provenance —
  // never invent a QBO tie; never claim matched when as_of is historical or mirror N/A.
  const qboMirror = query.data?.qbo_mirror;
  const qboSyncedAt = qboMirror?.last_synced_at ?? query.data?.qbo_synced_at ?? null;
  const apSubtitle = "What we owe vendors — from TMS bills (canonical A/P subledger).";
  const emptyMessage = (() => {
    switch (query.data?.empty_state) {
      case "no_unpaid_bills_mirror_disabled":
        return "No open A/P in TMS bills. QBO A/P mirror pull is OFF for this entity — empty is not proof QBO has $0.";
      case "no_unpaid_bills_mirror_absent":
        return "No open A/P in TMS bills. QBO A/P mirror has never synced — empty is not proof QBO has $0.";
      case "no_unpaid_bills_mirror_stale":
        return "No open A/P in TMS bills. QBO A/P mirror is stale — re-check after the next inbound pull.";
      default:
        return "No open A/P in TMS bills.";
    }
  })();
  const freshnessLabel =
    qboMirror?.freshness === "fresh" ? "fresh" : qboMirror?.freshness === "stale" ? "stale" : "never-synced";
  const signedDelta = qboMirror?.reconcile.delta_cents;
  const deltaLabel =
    signedDelta == null
      ? "n/a"
      : `${signedDelta > 0 ? "+" : ""}${(signedDelta / 100).toLocaleString("en-US", {
          style: "currency",
          currency: "USD",
        })}`;
  const reconcileLabel = (() => {
    const status = qboMirror?.reconcile.status;
    if (!status || status === "unavailable") return "n/a (mirror unavailable)";
    if (status === "incomparable") return "n/a (historical as-of — mirror is current-only)";
    if (status === "uncompared") return "n/a (not yet comparable)";
    if (status === "matched") return "matched";
    return "divergent";
  })();

  const typeFiltered = useMemo(
    () => (typeFilter === "all" ? vendors : vendors.filter((v) => v.display_group === typeFilter)),
    [vendors, typeFilter]
  );
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? typeFiltered.filter((v) => v.vendor_name.toLowerCase().includes(q)) : typeFiltered;
  }, [typeFiltered, search]);
  const totals = useMemo(() => filtered.reduce(addBuckets, emptyBuckets()), [filtered]);

  // BANK-SORT-ROLLOUT-ACCT-AP2 — ?sort=/?dir= URL persistence via the shared useUrlSort hook
  // (same contract as FleetTable / dispatch board). Hand-rolled <table> + TableHeaderCell stack;
  // seeds useTableController from the URL and mirrors every header click back into it.
  const urlSort = useUrlSort();

  // By Vendor — shared QBO-grade table (sort / resize / gear). Search is the page-level `search` state.
  const table = useTableController<ApAgingVendor>({
    rows: filtered,
    columns: COLUMNS,
    tableKey: "ap-aging-by-vendor",
    searchText: (v) => v.vendor_name, // controller search stays inert; page-level `search` drives filtering
    sortValue: (v, key) => (key === "vendor" ? v.vendor_name : key === "type" ? v.display_group : amount(v, key)),
    initialSortKey: urlSort.sortKey || null,
    initialSortDir: urlSort.sortDirection,
    onSortChange: (key, dir) => urlSort.onSortChange(key ?? "", dir),
    defaultPageSize: 100,
  });

  // By Vendor Type — grouped rollups with subtotals.
  const groups = useMemo(() => {
    const byGroup = new Map<ApAgingDisplayGroup, ApAgingVendor[]>();
    for (const v of filtered) {
      const list = byGroup.get(v.display_group) ?? [];
      list.push(v);
      byGroup.set(v.display_group, list);
    }
    return GROUP_ORDER.filter((g) => byGroup.has(g)).map((g) => {
      const rows = (byGroup.get(g) ?? []).slice().sort((a, b) => b.total_outstanding - a.total_outstanding);
      return { group: g, rows, subtotal: rows.reduce(addBuckets, emptyBuckets()) };
    });
  }, [filtered]);

  function toggleGroup(g: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(g)) next.delete(g);
      else next.add(g);
      return next;
    });
  }

  function exportCsv() {
    const header = ["Vendor", "Vendor type", "Current", "1-30", "31-60", "61-90", "91+", "Total"];
    const lines = filtered.map((v) =>
      [v.vendor_name, v.display_group, v.current, v.d1_30, v.d31_60, v.d61_90, v.d90_plus, v.total_outstanding]
        .map((c) => (typeof c === "number" ? (c / 100).toFixed(2) : `"${String(c).replace(/"/g, '""')}"`))
        .join(",")
    );
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ap-aging-${asOf}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AccountingSubNavWrapper title="Accounts Payable" subtitle={apSubtitle}>
      <div className="mb-3 flex flex-wrap items-end gap-3 print:hidden">
        <label className="text-xs font-semibold text-slate-600">
          As of
          <div className="mt-1"><DatePicker value={asOf} onChange={(d) => setAsOf(d || today())} /></div>
        </label>

        <div className="inline-flex overflow-hidden rounded-sm border border-slate-300">
          <button type="button" className={`px-3 py-1.5 text-sm ${view === "by_vendor" ? "bg-slate-800 text-white" : "bg-white text-slate-700"}`} onClick={() => setView("by_vendor")}>By Vendor</button>
          <button type="button" className={`px-3 py-1.5 text-sm ${view === "by_type" ? "bg-slate-800 text-white" : "bg-white text-slate-700"}`} onClick={() => setView("by_type")}>By Vendor Type</button>
        </div>

        <label className="text-xs font-semibold text-slate-600">
          Vendor type
          <select className="mt-1 block h-9 rounded-sm border border-slate-300 px-2 text-sm" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as ApAgingDisplayGroup | "all")}>
            <option value="all">All types</option>
            {GROUP_ORDER.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </label>

        <span className="text-xs text-slate-500">Basis: {query.data?.basis === "cash" ? "Cash" : "Accrual"}</span>

        <div className="ml-auto flex gap-2">
          <Button type="button" variant="secondary" onClick={exportCsv}>Export</Button>
          <Button type="button" variant="secondary" onClick={() => window.print()}>Print</Button>
        </div>
      </div>

      <div
        className="mb-3 grid gap-1 rounded-sm border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600 print:hidden"
        data-testid="ap-aging-qbo-mirror-status"
      >
        <div>
          Internal basis: <span className="font-semibold text-slate-800">TMS bills</span>
          {query.data?.as_of_is_historical ? (
            <span className="ml-2 text-slate-600">(historical as-of — open reconstructed via as-of payments + credits)</span>
          ) : null}
        </div>
        <div>
          QBO mirror pull:{" "}
          <span className="font-semibold text-slate-800">{qboMirror?.pull_enabled ? "ON" : "OFF"}</span>
          {" · "}
          projection:{" "}
          <span className="font-semibold text-slate-800">{qboMirror?.projection_enabled ? "ON" : "OFF"}</span>
          {" · "}
          freshness: <span className="font-semibold text-slate-800">{freshnessLabel}</span>
          {qboSyncedAt ? ` (${formatDateUS(qboSyncedAt)})` : ""}
        </div>
        <div>
          Reconcile: <span className="font-semibold text-slate-800">{reconcileLabel}</span>
          {qboMirror?.reconcile_applicable ? (
            <>
              {" · "}signed Δ (TMS − mirror): <span className="font-semibold tabular-nums text-slate-800">{deltaLabel}</span>
            </>
          ) : (
            <span className="ml-1 text-slate-500">— no match claim when source N/A or as-of is historical</span>
          )}
        </div>
      </div>

      {query.isLoading ? (
        <div className="px-3 py-6 text-sm text-slate-500">Loading A/P aging…</div>
      ) : query.isError ? (
        <div className="px-3 py-6 text-sm text-red-600">Failed to load A/P aging.</div>
      ) : view === "by_vendor" ? (
        <div className="space-y-2">
          <TableControls
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search vendor…"
            filteredCount={filtered.length}
            totalCount={typeFiltered.length}
            columns={COLUMNS}
            hidden={table.hidden}
            onToggleColumn={table.toggleColumn}
            pageSize={table.pageSize}
            onPageSizeChange={table.setPageSize}
          />
          <div className="overflow-x-auto rounded-sm border border-slate-200 bg-white">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 z-10 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                <tr>
                  {table.visibleColumns.map((col) => (
                    <TableHeaderCell key={col.key} columnKey={col.key} label={col.label} sortKey={table.sortKey} sortDir={table.sortDir} onToggleSort={table.toggleSort} width={table.widths[col.key]} onResize={table.setColumnWidth} />
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.paged.map((v) => (
                  <tr key={v.vendor_id ?? v.vendor_name} className="border-t border-slate-100 hover:bg-slate-50">
                    {table.visibleColumns.map((col) => (
                      <td key={col.key} className={MONEY_KEYS.includes(col.key as (typeof MONEY_KEYS)[number]) ? moneyCellClass(col.key) : "px-2 py-1.5"}>
                        {col.key === "vendor" ? (
                          v.vendor_id ? (
                            <span className="inline-flex flex-col gap-0.5">
                              <Link to={`/vendors/${v.vendor_id}`} className="font-medium text-slate-700 hover:underline">{v.vendor_name}</Link>
                              <Link to={`/accounting/bills?vendor_id=${v.vendor_id}&status=unpaid`} className="text-[10px] font-medium text-slate-500 hover:underline">
                                Open bills
                              </Link>
                            </span>
                          ) : (
                            <span className="font-medium">{v.vendor_name}</span>
                          )
                        ) : col.key === "type" ? (
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${GROUP_CHIP[v.display_group]}`}>{v.display_group}</span>
                        ) : (
                          money(amount(v, col.key))
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
                {table.paged.length === 0 ? <tr><td colSpan={table.visibleColumns.length} className="px-3 py-6 text-center text-slate-500">{emptyMessage}</td></tr> : null}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
                  {table.visibleColumns.map((col) => (
                    <td key={col.key} className={MONEY_KEYS.includes(col.key as (typeof MONEY_KEYS)[number]) ? moneyCellClass(col.key) : "px-2 py-2"}>
                      {col.key === "vendor" ? "TOTAL" : col.key === "type" ? "" : money(amount(totals, col.key))}
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
          {table.pageCount > 1 ? (
            <div className="flex items-center justify-end gap-2 text-xs text-slate-600">
              <button type="button" className="rounded-sm border px-2 py-1 disabled:opacity-40" disabled={table.page <= 1} onClick={() => table.setPage(table.page - 1)}>Prev</button>
              <span>Page {table.page} / {table.pageCount}</span>
              <button type="button" className="rounded-sm border px-2 py-1 disabled:opacity-40" disabled={table.page >= table.pageCount} onClick={() => table.setPage(table.page + 1)}>Next</button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="w-56"><TableSearch value={search} onChange={setSearch} placeholder="Search vendor…" /></div>
          <div className="overflow-x-auto rounded-sm border border-slate-200 bg-white">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 z-10 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-2 py-2">Vendor type</th>
                  {["Current", "1-30", "31-60", "61-90", "91+", "Total"].map((h, i) => (
                    <th key={h} className={`px-2 py-2 text-right ${i === 3 || i === 4 ? "text-red-600" : ""}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groups.map(({ group, rows, subtotal }) => (
                  <GroupBlock key={group} group={group} rows={rows} subtotal={subtotal} open={expanded.has(group)} onToggle={() => toggleGroup(group)} />
                ))}
                {groups.length === 0 ? <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-500">{emptyMessage}</td></tr> : null}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
                  <td className="px-2 py-2">TOTAL</td>
                  {MONEY_KEYS.map((k) => <td key={k} className={moneyCellClass(k)}>{money(amount(totals, k))}</td>)}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </AccountingSubNavWrapper>
  );
}

function GroupBlock({ group, rows, subtotal, open, onToggle }: { group: ApAgingDisplayGroup; rows: ApAgingVendor[]; subtotal: Buckets; open: boolean; onToggle: () => void }) {
  return (
    <>
      <tr className="cursor-pointer border-t border-slate-200 bg-slate-50/70 font-semibold hover:bg-slate-100" onClick={onToggle}>
        <td className="px-2 py-2">
          <span className="mr-1 inline-block w-3 text-slate-500">{open ? "▾" : "▸"}</span>
          {group} <span className="font-normal text-slate-500">({rows.length})</span>
        </td>
        {MONEY_KEYS.map((k) => <td key={k} className={moneyCellClass(k)}>{money(amount(subtotal, k))}</td>)}
      </tr>
      {open
        ? rows.map((v) => (
            <tr key={v.vendor_id ?? v.vendor_name} className="border-t border-slate-100 hover:bg-slate-50">
              <td className="px-2 py-1.5 pl-7">
                {v.vendor_id ? (
                  <span className="inline-flex flex-col gap-0.5">
                    <Link to={`/vendors/${v.vendor_id}`} className="text-slate-700 hover:underline">{v.vendor_name}</Link>
                    <Link to={`/accounting/bills?vendor_id=${v.vendor_id}&status=unpaid`} className="text-[10px] font-medium text-slate-500 hover:underline">
                      Open bills
                    </Link>
                  </span>
                ) : (
                  v.vendor_name
                )}
              </td>
              {MONEY_KEYS.map((k) => <td key={k} className={moneyCellClass(k)}>{money(amount(v, k))}</td>)}
            </tr>
          ))
        : null}
    </>
  );
}
