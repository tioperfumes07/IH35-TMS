import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { listBills, listExpenses } from "../../api/accounting";
import { apiRequest } from "../../api/client";
import { listAllLoads, type DispatchLoadRow, type LoadStatus } from "../../api/loads";
import { ListErrorState } from "../../components/ListErrorState";
import { EntityLink } from "../../components/shared/EntityLink";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { entityLabel } from "../../lib/entity-label";
import { formatDateUS } from "../../lib/formatDate";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";

type CostAggregate = {
  load_id: string;
  expense_cents: string;
  bill_cents: string;
  driver_pay_cents?: string;
  expense_count: number;
  bill_count: number;
  unpaid_bill_count: number;
};

type BoardRow = CostAggregate & { load: DispatchLoadRow };
type FilterPill = "in_motion" | "delivered_open" | "all_open" | "this_week";
type SortKey = "load" | "revenue" | "costs" | "driver" | "margin";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const formatMoney = (cents: number) => money.format(cents / 100);

const CLOSED: LoadStatus[] = ["cancelled", "abandoned", "closed", "paid", "driver_walkoff", "driver_no_show"];
const IN_MOTION: LoadStatus[] = [
  "draft",
  "booked",
  "planned",
  "unassigned",
  "assigned",
  "assigned_not_dispatched",
  "dispatched",
  "at_pickup",
  "in_transit",
  "at_delivery",
];
const DELIVERED_OPEN: LoadStatus[] = ["delivered", "delivered_pending_docs", "completed_docs_received", "invoiced"];

function statusLabel(status: LoadStatus): string {
  if (status === "in_transit") return "In transit";
  if (status === "at_pickup") return "Loading";
  if (status === "at_delivery") return "At delivery";
  if (status === "delivered" || status === "delivered_pending_docs") return "Delivered";
  if (status === "assigned_not_dispatched") return "Assigned";
  return status.replaceAll("_", " ");
}

function lane(load: DispatchLoadRow): string {
  const origin = [load.first_pickup_city].filter(Boolean).join("");
  const dest = [load.first_delivery_city].filter(Boolean).join("");
  if (origin && dest) return `${origin} → ${dest}`;
  return origin || dest || "Route not set";
}

function costCents(row: BoardRow): number {
  return Number(row.expense_cents) + Number(row.bill_cents);
}

function driverPayCents(row: BoardRow): number {
  return Number(row.driver_pay_cents ?? 0);
}

function marginCents(row: BoardRow): number {
  return Number(row.load.rate_total_cents) - costCents(row) - driverPayCents(row);
}

function matchesFilter(row: BoardRow, filter: FilterPill): boolean {
  const status = row.load.status;
  if (filter === "in_motion") return IN_MOTION.includes(status);
  if (filter === "delivered_open") return DELIVERED_OPEN.includes(status);
  if (filter === "this_week") {
    const created = Date.parse(row.load.created_at);
    return !CLOSED.includes(status) && created >= Date.now() - 7 * 24 * 60 * 60 * 1000;
  }
  return !CLOSED.includes(status);
}

function loadQuery(load: DispatchLoadRow): string {
  const query = new URLSearchParams({ load_id: load.id, load_number: load.load_number });
  if (load.assigned_primary_driver_id) query.set("driver_id", load.assigned_primary_driver_id);
  if (load.assigned_unit_id) query.set("unit_id", load.assigned_unit_id);
  if (load.trailer_id) query.set("trailer_id", load.trailer_id);
  return query.toString();
}

function ExpandPanel({ row, companyId }: { row: BoardRow; companyId: string }) {
  const expensesQuery = useQuery({
    queryKey: ["load-costs-board", "expenses", companyId, row.load.id],
    queryFn: () => listExpenses(companyId, { load_id: row.load.id, limit: 200 }),
  });
  const billsQuery = useQuery({
    queryKey: ["load-costs-board", "bills", companyId, row.load.id],
    queryFn: () => listBills(companyId, { load_id: row.load.id, limit: 200 }),
  });
  const expenses = (expensesQuery.data?.rows ?? []).filter((item) => item.status !== "void");
  const bills = (billsQuery.data?.rows ?? []).filter((item) => item.status !== "voided");
  const entries = [
    ...expenses.map((source) => ({
      key: `e-${source.id}`,
      number: source.expense_number ?? row.load.load_number,
      vendor: source.vendor_name ?? "Vendor not set",
      detail: source.line_description ?? source.memo ?? "Expense · paid now",
      owed: false,
      due: null as string | null,
      cents: Number(source.total_amount_cents || 0),
    })),
    ...bills.map((source) => ({
      key: `b-${source.id}`,
      number: source.display_id ?? source.bill_number ?? row.load.load_number,
      vendor: source.vendor_name ?? "Vendor not set",
      detail: source.bill_number ? `Vendor invoice ${source.bill_number}` : (source.memo ?? "Bill · owed"),
      owed: source.status !== "paid",
      due: source.due_date,
      cents: Number(source.amount_cents || 0),
    })),
  ];
  const query = loadQuery(row.load);
  const revenue = Number(row.load.rate_total_cents);
  const costs = costCents(row);
  const pay = driverPayCents(row);
  const margin = marginCents(row);
  const pct = revenue > 0 ? (margin / revenue) * 100 : 0;

  return (
    <div className="grid gap-3 border-b border-[#E5E7EB] bg-[#F7F8FA] px-3 py-[7px] md:grid-cols-[1.55fr_1fr]" data-testid="load-costs-expand">
      <div className="overflow-hidden rounded border border-[#E5E7EB] bg-white">
        <div className="flex justify-between gap-2 border-b border-[#E5E7EB] bg-white px-3 py-[7px] text-center font-bold uppercase tracking-wide text-[#4B5563]" style={{ fontSize: 11 }}>
          <span>Costs on this load</span>
          <span>{entries.length} entries · every one carries the load number</span>
        </div>
        {expensesQuery.isError || billsQuery.isError ? (
          <div className="px-3 py-2 text-xs text-[#6B7280]">Could not load costs for this load.</div>
        ) : null}
        {entries.length === 0 && !expensesQuery.isLoading && !billsQuery.isLoading ? (
          <div className="px-3 py-2 text-xs text-[#6B7280]">No costs on this load yet.</div>
        ) : null}
        {entries.map((entry) => (
          <div key={entry.key} className="grid grid-cols-[78px_1fr_84px_96px] items-center gap-2 border-b border-[#E5E7EB] px-3 py-2 text-xs last:border-b-0">
            <span className="font-semibold text-[#0F1219]">{entry.number}</span>
            <span>
              <span className="block text-[#0F1219]">{entry.vendor}</span>
              <span className="block text-xs text-[#6B7280]">{entry.detail}{entry.due ? ` · due ${formatDateUS(entry.due)}` : ""}</span>
            </span>
            <span className={`justify-self-center rounded-sm px-1.5 py-0.5 text-center font-bold uppercase ${entry.owed ? "bg-[#FEF3C7] text-[#92400E]" : "bg-[#DCFCE7] text-[#16A34A]"}`} style={{ fontSize: 11 }}>
              {entry.owed ? "Owed" : "Paid"}
            </span>
            <span className="text-right font-semibold tabular-nums">{formatMoney(entry.cents)}</span>
          </div>
        ))}
        <div className="flex flex-wrap gap-2 border-t border-[#E5E7EB] px-3 py-2">
          <Link className="rounded border border-[#16A34A] bg-[#16A34A] px-2.5 py-1.5 text-xs font-semibold text-white" to={`/accounting/expenses/new?${query}`}>+ Add a cost</Link>
          <Link className="rounded border border-[#16A34A] px-2.5 py-1.5 text-xs font-semibold text-[#16A34A]" to={`/accounting/receipts?${query}`}>+ From a receipt photo</Link>
          <Link className="rounded border border-[#16A34A] px-2.5 py-1.5 text-xs font-semibold text-[#16A34A]" to={`/cash-advances?${query}`}>+ Fuel advance</Link>
        </div>
      </div>
      <div className="overflow-hidden rounded border border-[#E5E7EB] bg-white">
        <div className="flex justify-between gap-2 border-b border-[#E5E7EB] px-3 py-[7px] text-center font-bold uppercase tracking-wide text-[#4B5563]" style={{ fontSize: 11 }}>
          <span>Approximate settlement</span>
          <span>not final</span>
        </div>
        <div className="flex justify-between border-b border-[#E5E7EB] px-3 py-[7px] text-xs"><span>Line haul revenue</span><span className="tabular-nums">{formatMoney(revenue)}</span></div>
        <div className="flex justify-between border-b border-[#E5E7EB] px-3 py-[7px] text-xs text-[#6B7280]"><span>Costs on the load</span><span className="tabular-nums">−{formatMoney(costs)}</span></div>
        <div className="flex justify-between border-b border-[#E5E7EB] px-3 py-[7px] text-xs"><span>Driver pay accruing</span><span className="tabular-nums">−{formatMoney(pay)}</span></div>
        <div className="flex justify-between bg-[#DCFCE7] px-3 py-[7px] text-xs font-bold text-[#16A34A]">
          <span>Approximate margin</span>
          <span className="tabular-nums">{formatMoney(margin)} · {pct.toFixed(1)}%</span>
        </div>
      </div>
    </div>
  );
}

export function LoadCostsBoardPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [filter, setFilter] = useState<FilterPill>("in_motion");
  const [openId, setOpenId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("load");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const query = useQuery({
    queryKey: ["accounting", "load-costs-board", companyId],
    queryFn: async () => {
      const [loads, costs] = await Promise.all([
        listAllLoads({ operating_company_id: [companyId], sort: "created_at:desc" }),
        apiRequest<{ rows: CostAggregate[]; unmatched_bank_count?: number }>(`/api/v1/accounting/load-costs-board?operating_company_id=${encodeURIComponent(companyId)}`),
      ]);
      return { loads: loads.loads, costs: costs.rows, unmatched_bank_count: costs.unmatched_bank_count ?? 0 };
    },
    enabled: Boolean(companyId),
    retry: false,
  });

  const rows = useMemo<BoardRow[]>(() => {
    const costs = new Map((query.data?.costs ?? []).map((row) => [row.load_id, row]));
    return (query.data?.loads ?? []).map((load) => ({
      load,
      load_id: load.id,
      expense_cents: costs.get(load.id)?.expense_cents ?? "0",
      bill_cents: costs.get(load.id)?.bill_cents ?? "0",
      driver_pay_cents: costs.get(load.id)?.driver_pay_cents ?? "0",
      expense_count: costs.get(load.id)?.expense_count ?? 0,
      bill_count: costs.get(load.id)?.bill_count ?? 0,
      unpaid_bill_count: costs.get(load.id)?.unpaid_bill_count ?? 0,
    }));
  }, [query.data]);

  const visible = useMemo(() => {
    const filtered = rows.filter((row) => matchesFilter(row, filter));
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av =
        sortKey === "load" ? a.load.load_number :
        sortKey === "revenue" ? a.load.rate_total_cents :
        sortKey === "costs" ? costCents(a) :
        sortKey === "driver" ? driverPayCents(a) :
        marginCents(a);
      const bv =
        sortKey === "load" ? b.load.load_number :
        sortKey === "revenue" ? b.load.rate_total_cents :
        sortKey === "costs" ? costCents(b) :
        sortKey === "driver" ? driverPayCents(b) :
        marginCents(b);
      if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv) * dir;
      return (Number(av) - Number(bv)) * dir;
    });
  }, [rows, filter, sortKey, sortDir]);

  const inMotion = rows.filter((row) => IN_MOTION.includes(row.load.status));
  const deliveredOpen = rows.filter((row) => DELIVERED_OPEN.includes(row.load.status));
  const kpiSource = filter === "all_open" ? rows.filter((row) => !CLOSED.includes(row.load.status)) : visible;
  const revenue = kpiSource.reduce((sum, row) => sum + Number(row.load.rate_total_cents), 0);
  const costs = kpiSource.reduce((sum, row) => sum + costCents(row), 0);
  const pay = kpiSource.reduce((sum, row) => sum + driverPayCents(row), 0);
  const margin = revenue - costs - pay;
  const entries = kpiSource.reduce((sum, row) => sum + row.expense_count + row.bill_count, 0);
  const unmatched = query.data?.unmatched_bank_count ?? 0;

  function clickSort(key: SortKey) {
    if (sortKey === key) setSortDir((value) => (value === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "load" ? "asc" : "desc");
    }
  }

  const headerBtn = (key: SortKey, label: string) => (
    <button
      type="button"
      className="text-center font-bold uppercase tracking-wide text-[#4B5563]"
      style={{ fontSize: 11 }}
      onClick={() => clickSort(key)}
    >
      {label}
    </button>
  );

  return (
    <AccountingSubNavWrapper title="Load costs" subtitle="Live loads, costs on the incurred date, approximate margin. This board reads. It does not post.">
      {query.isError ? <ListErrorState title="Could not load the costs board." status={(query.error as { status?: number })?.status ?? 0} onRetry={() => void query.refetch()} /> : null}
      {query.isLoading ? <div className="rounded border border-[#E5E7EB] bg-white p-4 text-xs text-[#6B7280]">Loading load costs…</div> : null}
      {!query.isLoading && !query.isError ? (
        <div className="overflow-hidden rounded border border-[#E5E7EB] bg-white" data-testid="accounting-load-costs-board">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E5E7EB] px-4 py-3">
            <div className="font-semibold text-[#0F1219]" style={{ fontSize: 22 }}>Costs</div>
            <div className="flex flex-wrap gap-1">
              {([
                ["in_motion", `In motion · ${inMotion.length}`],
                ["delivered_open", `Delivered, not settled · ${deliveredOpen.length}`],
                ["all_open", "All open"],
                ["this_week", "This week"],
              ] as const).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFilter(id)}
                  className={`rounded-full border px-3 py-1 text-xs ${filter === id ? "border-[#16A34A] bg-[#16A34A] text-white" : "border-[#E5E7EB] text-[#6B7280]"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 border-b border-[#E5E7EB] bg-white sm:grid-cols-3 lg:grid-cols-6">
            <div className="border-r border-[#E5E7EB] px-4 py-3 last:border-r-0">
              <div className="text-center font-bold uppercase tracking-wide text-[#4B5563]"
      style={{ fontSize: 11 }}>Loads in motion</div>
              <div className="mt-0.5 font-semibold tabular-nums text-[#0F1219]" style={{ fontSize: 22 }}>{inMotion.length}</div>
            </div>
            <div className="border-r border-[#E5E7EB] px-4 py-3">
              <div className="text-center font-bold uppercase tracking-wide text-[#4B5563]"
      style={{ fontSize: 11 }}>Revenue booked</div>
              <div className="mt-0.5 font-semibold tabular-nums text-[#0F1219]" style={{ fontSize: 22 }}>{formatMoney(revenue)}</div>
              <div className="text-xs text-[#6B7280]">{kpiSource.length} loads</div>
            </div>
            <div className="border-r border-[#E5E7EB] px-4 py-3">
              <div className="text-center font-bold uppercase tracking-wide text-[#4B5563]"
      style={{ fontSize: 11 }}>Costs recorded</div>
              <div className="mt-0.5 font-semibold tabular-nums text-[#0F1219]" style={{ fontSize: 22 }}>{formatMoney(costs)}</div>
              <div className="text-xs text-[#6B7280]">{entries} entries</div>
            </div>
            <div className="border-r border-[#E5E7EB] px-4 py-3">
              <div className="text-center font-bold uppercase tracking-wide text-[#4B5563]"
      style={{ fontSize: 11 }}>Driver pay accruing</div>
              <div className="mt-0.5 font-semibold tabular-nums text-[#0F1219]" style={{ fontSize: 22 }}>{formatMoney(pay)}</div>
            </div>
            <div className="border-r border-[#E5E7EB] px-4 py-3">
              <div className="text-center font-bold uppercase tracking-wide text-[#4B5563]"
      style={{ fontSize: 11 }}>Approximate margin</div>
              <div className="mt-0.5 font-semibold tabular-nums text-[#16A34A]" style={{ fontSize: 22 }}>{revenue > 0 ? `${((margin / revenue) * 100).toFixed(1)}%` : "—"}</div>
              <div className="text-xs text-[#6B7280]">{formatMoney(margin)}</div>
            </div>
            <div className="px-4 py-3">
              <div className="text-center font-bold uppercase tracking-wide text-[#4B5563]"
      style={{ fontSize: 11 }}>Bank items unmatched</div>
              <div className="mt-0.5 font-semibold tabular-nums text-[#92400E]" style={{ fontSize: 22 }}>{unmatched}</div>
            </div>
          </div>

          <div className="hidden grid-cols-[150px_88px_1fr_96px_96px_96px_104px_34px] gap-2.5 border-b border-[#E5E7EB] bg-[#F7F8FA] px-4 py-2 md:grid">
            {headerBtn("load", "Load")}
            <div className="text-center font-bold uppercase tracking-wide text-[#4B5563]" style={{ fontSize: 11 }}>Incurred</div>
            <div className="text-center font-bold uppercase tracking-wide text-[#4B5563]"
      style={{ fontSize: 11 }}>Route and crew</div>
            {headerBtn("revenue", "Revenue")}
            {headerBtn("costs", "Costs")}
            {headerBtn("driver", "Driver")}
            {headerBtn("margin", "Margin")}
            <span />
          </div>

          {visible.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-[#6B7280]">No loads found for this company.</div>
          ) : null}
          {visible.map((row) => {
            const open = openId === row.load.id;
            const marginPct = Number(row.load.rate_total_cents) > 0 ? (marginCents(row) / Number(row.load.rate_total_cents)) * 100 : 0;
            return (
              <div key={row.load.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : row.load.id)}
                  className={`grid w-full grid-cols-1 items-center gap-2 border-b border-[#E5E7EB] px-4 py-2.5 text-left text-xs md:grid-cols-[150px_88px_1fr_96px_96px_96px_104px_34px] ${open ? "bg-[#F0FDF4]" : "bg-white"}`}
                >
                  <div>
                    <Link className="font-semibold text-slate-700 underline" to={`/dispatch/loads/${encodeURIComponent(row.load.id)}?tab=Costs`} onClick={(event) => event.stopPropagation()}>
                      {row.load.load_number}
                    </Link>
                    <div className="mt-0.5 font-bold uppercase text-[#4B5563]" style={{ fontSize: 11 }}>{statusLabel(row.load.status)}</div>
                  </div>
                  <div className="text-center tabular-nums text-[#0F1219]">{formatDateUS(row.load.created_at)}</div>
                  <div>
                    <div>{lane(row.load)}</div>
                    <div className="text-xs text-[#6B7280]">
                      {row.load.customer_name ? <EntityLink kind="customer" id={row.load.customer_id} label={entityLabel(row.load.customer_name, row.load.customer_id, "Customer")} /> : "Customer not set"}
                      {" · "}
                      {row.load.assigned_primary_driver_id ? <EntityLink kind="driver" id={row.load.assigned_primary_driver_id} label={entityLabel(row.load.assigned_primary_driver_name, row.load.assigned_primary_driver_id, "Driver")} /> : "Not assigned"}
                      {" · "}
                      {row.load.assigned_unit_id ? <EntityLink kind="unit" id={row.load.assigned_unit_id} label={entityLabel(row.load.assigned_unit_number, row.load.assigned_unit_id, "Truck")} /> : "Not assigned"}
                    </div>
                  </div>
                  <div className="text-right tabular-nums">{formatMoney(Number(row.load.rate_total_cents))}</div>
                  <div className="text-right tabular-nums">{formatMoney(costCents(row))}</div>
                  <div className="text-right tabular-nums">{formatMoney(driverPayCents(row))}</div>
                  <div className={`text-right font-semibold tabular-nums ${marginPct >= 40 ? "text-[#16A34A]" : marginPct >= 25 ? "text-[#92400E]" : "text-[#B91C1C]"}`}>
                    {Number(row.load.rate_total_cents) > 0 ? `${marginPct.toFixed(1)}%` : "—"}
                  </div>
                  <div className="text-center text-[#6B7280]">{open ? "⌄" : "›"}</div>
                </button>
                {open ? <ExpandPanel row={row} companyId={companyId} /> : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </AccountingSubNavWrapper>
  );
}
