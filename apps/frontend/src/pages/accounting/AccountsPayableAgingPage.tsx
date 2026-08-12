import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { EntityLink } from "../../components/shared/EntityLink";
import { Button } from "../../components/Button";
import { DatePicker } from "../../components/forms/DatePicker";
import { ListErrorState } from "../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { CollapsedListFilters, TableSearch } from "../../components/table";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { getApAgingByVendor, type ApAgingVendor, type ApAgingDisplayGroup } from "../../api/accounting";
import { formatDateUS } from "../../lib/formatDate";
import { useUrlSort } from "../../hooks/useUrlSort";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";
import { companyToday } from "../../lib/businessDate";
import { apAgingBillsListHref } from "../reports/agingDrillThrough";
import { entityLabel } from "../../lib/entity-label";

type ApAgingView = "by_vendor" | "by_type";

const AP_AGING_VIEW_IDS = new Set<string>(["by_vendor", "by_type"]);

export function parseApAgingView(raw: string | null): ApAgingView {
  if (raw && AP_AGING_VIEW_IDS.has(raw)) return raw as ApAgingView;
  return "by_vendor";
}

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
}
function today() {
  return companyToday();
}

const MONEY_KEYS = ["current", "d1_30", "d31_60", "d61_90", "d90_plus", "total"] as const;
const MONEY_LABELS: Record<(typeof MONEY_KEYS)[number], string> = {
  current: "Current",
  d1_30: "1-30",
  d31_60: "31-60",
  d61_90: "61-90",
  d90_plus: "91+",
  total: "Total",
};
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

// By Vendor grid — shared ParityTable grammar (display-only migration). Same 8 columns, same
// order, same cell renderers (vendor + Open bills deep-links, type chip, money buckets with the
// 61-90 / 91+ red flags) the former hand-rolled table markup carried; 61-90 and 91+ stay red per the
// QBO-grade spec. ParityTable's padding comes from its density style, so the cell classes here
// carry only alignment/color (moneyCellClass keeps padding for the hand-rolled By Vendor Type
// rollup below).
const parityMoneyCellClass = (key: string) => `text-right tabular-nums ${RED_KEYS.has(key) ? "text-red-600" : ""}`;
const VENDOR_COLUMNS: Array<ParityColumn<ApAgingVendor>> = [
  {
    key: "vendor",
    label: "Vendor",
    alwaysVisible: true,
    sortable: true,
    sortValue: (v) => v.vendor_name,
    render: (v) =>
      v.vendor_id ? (
        <span className="inline-flex flex-col gap-0.5">
          <EntityLink kind="vendor" id={v.vendor_id} label={entityLabel(v.vendor_name, v.vendor_id, "Vendor")} className="font-medium text-slate-700" />
          <Link to={apAgingBillsListHref(v.vendor_id)} className="text-[10px] font-medium text-slate-500 hover:underline">
            Open bills
          </Link>
        </span>
      ) : (
        <span className="font-medium">{entityLabel(v.vendor_name, v.vendor_id, "Vendor")}</span>
      ),
  },
  {
    key: "type",
    label: "Vendor type",
    sortable: true,
    sortValue: (v) => v.display_group,
    render: (v) => (
      <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${GROUP_CHIP[v.display_group]}`}>{v.display_group}</span>
    ),
  },
  {
    key: "current",
    label: "Current",
    sortable: true,
    cellClass: parityMoneyCellClass("current"),
    sortValue: (v) => amount(v, "current"),
    render: (v) => money(amount(v, "current")),
  },
  {
    key: "d1_30",
    label: "1-30",
    sortable: true,
    cellClass: parityMoneyCellClass("d1_30"),
    sortValue: (v) => amount(v, "d1_30"),
    render: (v) => money(amount(v, "d1_30")),
  },
  {
    key: "d31_60",
    label: "31-60",
    sortable: true,
    cellClass: parityMoneyCellClass("d31_60"),
    sortValue: (v) => amount(v, "d31_60"),
    render: (v) => money(amount(v, "d31_60")),
  },
  {
    key: "d61_90",
    label: "61-90",
    sortable: true,
    cellClass: parityMoneyCellClass("d61_90"),
    sortValue: (v) => amount(v, "d61_90"),
    render: (v) => money(amount(v, "d61_90")),
  },
  {
    key: "d90_plus",
    label: "91+",
    sortable: true,
    cellClass: parityMoneyCellClass("d90_plus"),
    sortValue: (v) => amount(v, "d90_plus"),
    render: (v) => money(amount(v, "d90_plus")),
  },
  {
    key: "total",
    label: "Total",
    sortable: true,
    cellClass: parityMoneyCellClass("total"),
    sortValue: (v) => amount(v, "total"),
    render: (v) => money(amount(v, "total")),
  },
];

export function AccountsPayableAgingPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [asOf, setAsOf] = useState(today());
  const [searchParams, setSearchParams] = useSearchParams();
  const view = parseApAgingView(searchParams.get("view"));
  const setView = (next: ApAgingView) => {
    const params = new URLSearchParams(searchParams);
    if (next === "by_vendor") params.delete("view");
    else params.set("view", next);
    setSearchParams(params, { replace: true });
  };
  const [typeFilter, setTypeFilter] = useState<ApAgingDisplayGroup | "all">("all");  const [search, setSearch] = useState("");
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
  // (same contract as FleetTable / dispatch board), now feeding ParityTable's controlled-sort
  // props (sortKey / sortDirection / onSortChange) so every header click mirrors into the URL
  // and ParityTable performs the row sort via each column's sortValue.
  const { sortKey, sortDirection, onSortChange } = useUrlSort();

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
      <div className="mb-3 flex flex-wrap items-end gap-3 print:hidden" data-ap-aging-filter-toolbar="collapsed">
        <div className="inline-flex overflow-hidden rounded-sm border border-slate-300">
          <button type="button" className={`px-3 py-1.5 text-sm ${view === "by_vendor" ? "bg-slate-800 text-white" : "bg-white text-slate-700"}`} onClick={() => setView("by_vendor")}>By Vendor</button>
          <button type="button" className={`px-3 py-1.5 text-sm ${view === "by_type" ? "bg-slate-800 text-white" : "bg-white text-slate-700"}`} onClick={() => setView("by_type")}>By Vendor Type</button>
        </div>

        <CollapsedListFilters
          activeFilterCount={(asOf !== today() ? 1 : 0) + (typeFilter !== "all" ? 1 : 0)}
          testIdPrefix="ap-aging"
        >
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs font-semibold text-slate-600">
              As of
              <div className="mt-1"><DatePicker value={asOf} onChange={(d) => setAsOf(d || today())} /></div>
            </label>
            <label className="text-xs font-semibold text-slate-600">
              Vendor type
              <select className="mt-1 block h-9 rounded-sm border border-slate-300 px-2 text-sm" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as ApAgingDisplayGroup | "all")}>
                <option value="all">All types</option>
                {GROUP_ORDER.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </label>
          </div>
        </CollapsedListFilters>

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
        <ListErrorState
          title="Couldn't load A/P aging"
          status={0}
          message={(query.error as Error)?.message ?? "Failed to load A/P aging."}
          onRetry={() => void query.refetch()}
        />
      ) : view === "by_vendor" ? (
        <div className="space-y-2">
          <ParityTable<ApAgingVendor>
            columns={VENDOR_COLUMNS}
            rows={filtered}
            rowKey={(v) => v.vendor_id ?? v.vendor_name}
            storageKey="acct-ap-aging-by-vendor"
            tableTestId="ap-aging-by-vendor-table"
            initialPageSize={100}
            emptyText={emptyMessage}
            sortKey={sortKey}
            sortDirection={sortDirection}
            onSortChange={onSortChange}
            filterBar={
              <div className="flex flex-wrap items-center gap-2">
                <div className="w-56"><TableSearch value={search} onChange={setSearch} placeholder="Search vendor…" /></div>
                <span className="text-[11px] text-slate-500">
                  {filtered.length === typeFiltered.length ? `${typeFiltered.length}` : `${filtered.length} of ${typeFiltered.length}`} rows
                </span>
              </div>
            }
          />
          {/* TOTAL row — same values the former <tfoot> carried (sum of the filtered vendor rows),
              with the 61-90 / 91+ buckets kept red. ParityTable has no footer-row grammar, so the
              totals render as a strip directly under the grid (same pattern as ArApAgingPage). */}
          <div
            data-testid="ap-aging-by-vendor-total"
            className="flex flex-wrap items-center justify-end gap-x-5 gap-y-1 rounded-sm border border-slate-200 border-t-2 border-t-slate-300 bg-slate-50 px-3 py-2 text-xs font-semibold"
          >
            <span className="mr-auto">TOTAL</span>
            {MONEY_KEYS.map((k) => (
              <span key={k} className="whitespace-nowrap">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{MONEY_LABELS[k]}</span>{" "}
                <span className={`tabular-nums ${RED_KEYS.has(k) ? "text-red-600" : ""}`}>{money(amount(totals, k))}</span>
              </span>
            ))}
          </div>
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
                    <EntityLink kind="vendor" id={v.vendor_id} label={entityLabel(v.vendor_name, v.vendor_id, "Vendor")} className="text-slate-700" />
                    <Link to={apAgingBillsListHref(v.vendor_id)} className="text-[10px] font-medium text-slate-500 hover:underline">
                      Open bills
                    </Link>
                  </span>
                ) : (
                  entityLabel(v.vendor_name, v.vendor_id, "Vendor")
                )}
              </td>
              {MONEY_KEYS.map((k) => <td key={k} className={moneyCellClass(k)}>{money(amount(v, k))}</td>)}
            </tr>
          ))
        : null}
    </>
  );
}
