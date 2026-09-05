import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { listBills, listDriverBills, listExpenses, type ExpenseListRow, type VendorBill } from "../../api/accounting";
import { listCashAdvances } from "../../api/cashAdvances";
import { apiRequest } from "../../api/client";
import { ListErrorState } from "../../components/ListErrorState";
import { DrillKpiCard } from "../../components/layout/DrillKpiCard";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { formatDateUS } from "../../lib/formatDate";

type FilterPill = "in_motion" | "delivered_open" | "all_open" | "this_week";
// LOAD-COSTS-COMPLETE item (3) (owner's exact board-column list, 2026-09-04): Load · Unit · Driver ·
// PU Date · Del Date · Status · Revenue · Late Fee · Lumper · Fuel · R&M Exp · Other · Short Miles ·
// Rate Loaded · Loaded Pay · Empty Miles · Rate Empty · Deadhead Pay · Gross. Drafts never shown;
// voided (cancelled) hidden by default -- both enforced server-side (load-costs-board.routes.ts).
type BoardRow = {
  load_id: string; load_number: string; status: string; customer_name: string | null; driver_name: string | null;
  unit_number: string | null; trailer_number: string | null; pickup_city: string | null; delivery_city: string | null;
  pickup_date: string | null; scheduled_delivery_at: string | null; actual_delivery_at: string | null; created_at: string;
  revenue_cents: string; expense_cents: string; bill_cents: string; repairs_maintenance_cents: string; driver_pay_cents: string;
  expense_count: number; bill_count: number;
  fuel_cents: string; lumper_cents: string; late_fee_cents: string; other_cost_cents: string;
  /** null = no short-route figure exists for this bill's own basis (never invented -- honest blank, not zero). */
  short_miles: string | null;
  rate_loaded_cents: string | null;
  loaded_pay_cents: string;
  /** null = this load's driver bill(s) never tracked a deadhead-miles figure -- BLANK, never 0 (a
   * zero would claim the driver ran no empty miles and understate what he's owed). */
  empty_miles: string | null;
  rate_empty_cents: string | null;
  /** null for the same reason as empty_miles -- see honesty rule above. */
  deadhead_pay_cents: string | null;
};
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const fmt = (c: number) => money.format(c / 100);
/** Honesty rule (owner order 2026-09-04): Empty Miles / Deadhead Pay render BLANK, never zero, when
 * untracked -- a zero claims he ran no empty miles and underpays him. */
const fmtBlank = (c: string | null) => (c == null ? "" : fmt(Number(c)));
// DESIGN-CONTRACT §20 / reference note "A dash is not a zero": the trip-expense columns (Late Fee,
// Lumper, Fuel, R&M, Other) render a dash when nothing of that kind was recorded. A "$0.00" would
// assert the cost was measured and found to be nothing; a dash says it was never recorded. Revenue
// and Gross are always numbers (0 revenue is a fact); this is only for the recorded-cost columns.
const DASH = "—";
const fmtDash = (c: number) => (c ? fmt(c) : DASH);
// DESIGN-CONTRACT §20 / lead 03:06Z FAIL-3: an UNTRACKED mileage cell (null) shows a dash, never a
// blank ("blank reads as broken; dash reads as not-measured") and never 0 (honesty rule — a 0 would
// claim he ran no empty miles and underpay him). A genuine tracked 0 still renders "0 mi".
const fmtMiles = (m: string | null) => (m == null ? DASH : `${Number(m).toLocaleString("en-US", { maximumFractionDigits: 1 })} mi`);
// STEP-1.3a defect 4 (lead 2026-09-05, live-measured): Rate Loaded/Empty rendered "0.48¢/mi" — wrong
// unit + wrong precision. Spec: dollars per mile, four decimals (0.4800). rate_*_cents is
// cents-per-mile, so /100 gives dollars-per-mile.
const fmtRate = (c: string | null) => (c == null ? DASH : `$${(Number(c) / 100).toFixed(4)}`);
// STEP-1.3a defect 1/6: money & mileage cells must never wrap (ParityTable's td carries
// wrap-break-word). nowrap + tabular-nums; the column auto-fits to its widest value.
const NUM = "text-center whitespace-nowrap [font-variant-numeric:tabular-nums]";
// DESIGN-CONTRACT totals row bg (--grp-bg); the Gross cell uses the .tot-c shade (#EDF1F5).
const TOTBG = "#E4EAF1";
const CLOSED = ["cancelled", "abandoned", "closed", "paid", "driver_walkoff", "driver_no_show"];
const MOTION = ["draft", "booked", "planned", "unassigned", "assigned", "assigned_not_dispatched", "dispatched", "at_pickup", "in_transit", "at_delivery"];
const DELIVERED = ["delivered", "delivered_pending_docs", "completed_docs_received", "invoiced"];
export const LOAD_COSTS_ELEMENT_MANIFEST = [
  "load-costs-shell", "load-costs-back", "load-costs-title", "load-costs-topbar",
  "load-costs-pill-in_motion", "load-costs-pill-delivered_open", "load-costs-pill-all_open", "load-costs-pill-this_week",
  "load-costs-show-voided",
  "kpi-loads-in-motion", "kpi-revenue-booked", "kpi-costs-recorded", "kpi-driver-pay", "kpi-approx-margin", "kpi-bank-unmatched",
  "col-load", "col-unit", "col-driver-name", "col-pu-date", "col-del-date", "col-status", "col-revenue",
  "col-late-fee", "col-lumper", "col-fuel", "col-repairs-maintenance", "col-other",
  "col-short-miles", "col-rate-loaded", "col-loaded-pay", "col-empty-miles", "col-rate-empty", "col-deadhead-pay", "col-gross",
  "load-costs-expand", "panel-costs-on-load",
  "panel-approx-settlement", "btn-add-cost", "btn-receipt-photo", "btn-fuel-advance",
] as const;
const rowCosts = (r: BoardRow) => Number(r.expense_cents) + Number(r.bill_cents);
const rowPay = (r: BoardRow) => Number(r.driver_pay_cents);
const rowMargin = (r: BoardRow) => Number(r.revenue_cents) - rowCosts(r) - rowPay(r);

// L.3 STEP-4 (owner order 2026-09-05): the board's tab row. "Costs" is the default (every load).
// Each other tab narrows the visible loads to those carrying that cost type; the count badge is the
// number of loads in the current status filter that match. `measured: false` tabs (Broker advances,
// Documents) have no per-load aggregate on the board read shape yet — they stay visible, keep every
// load in view, and show a dash badge + an honest caption instead of fabricating a zero.
type CostTab = "costs" | "expenses" | "bills" | "fuel_advances" | "broker_advances" | "driver_pay" | "repairs_maintenance" | "documents";
const COST_TABS: Array<{ id: CostTab; label: string; measured: boolean; has: (r: BoardRow) => boolean }> = [
  { id: "costs", label: "Costs", measured: true, has: () => true },
  { id: "expenses", label: "Expenses", measured: true, has: (r) => r.expense_count > 0 },
  { id: "bills", label: "Bills", measured: true, has: (r) => r.bill_count > 0 },
  { id: "fuel_advances", label: "Fuel advances", measured: true, has: (r) => Number(r.fuel_cents) > 0 },
  { id: "broker_advances", label: "Broker advances", measured: false, has: () => true },
  { id: "driver_pay", label: "Driver pay", measured: true, has: (r) => Number(r.driver_pay_cents) > 0 },
  { id: "repairs_maintenance", label: "Repairs & maintenance", measured: true, has: (r) => Number(r.repairs_maintenance_cents) > 0 },
  { id: "documents", label: "Documents", measured: false, has: () => true },
];
function matches(r: BoardRow, f: FilterPill) { if (f === "in_motion") return MOTION.includes(r.status); if (f === "delivered_open") return DELIVERED.includes(r.status); if (f === "this_week") return !CLOSED.includes(r.status) && Date.parse(r.created_at) >= Date.now() - 604800000; return !CLOSED.includes(r.status); }
function chip(style: { backgroundColor: string; color: string; borderColor?: string }) { return style; }
// LOAD-COSTS-COMPLETE item (3) (owner order 2026-09-04), spec 09-04-2026 §2.2: Status on this board
// is SERVICE performance (In transit / On Time / Late / Delivered — no appointment on file), computed
// from actual delivery vs the scheduled appointment -- NOT the load's lifecycle state (that already
// renders on every other dispatch surface). The fourth branch is mandatory: never render "On Time"
// when there is no appointment to be on time for -- that would be a zero asserting a fact nobody
// measured.
function serviceStatus(r: BoardRow): { label: string; style: { backgroundColor: string; color: string; borderColor: string } } {
  if (!r.actual_delivery_at) {
    // STEP-1.3a defect 5 (lead 2026-09-05, live-measured on 13508): a truck that has not departed
    // its pickup cannot be "In transit". Only a load whose lifecycle has actually left the shipper
    // (in_transit / at_delivery) is in transit; everything before that reads "Booked".
    const departed = r.status === "in_transit" || r.status === "at_delivery";
    return departed
      ? { label: "In transit", style: { backgroundColor: "#FEF9E7", color: "#8A6D1D", borderColor: "#F5E1A8" } }
      : { label: "Booked", style: { backgroundColor: "#EEF2F6", color: "#4B5563", borderColor: "#C7D2DC" } };
  }
  if (!r.scheduled_delivery_at) return { label: "Delivered — no appointment on file", style: { backgroundColor: "#F3F4F6", color: "#4B5563", borderColor: "#E5E7EB" } };
  const onTime = Date.parse(r.actual_delivery_at) <= Date.parse(r.scheduled_delivery_at);
  // DESIGN-CONTRACT status pill palette: on-time posbg/pos/posbd, late negbg/neg/negbd.
  return onTime
    ? { label: "On Time", style: { backgroundColor: "#F0FDF4", color: "#166534", borderColor: "#86EFAC" } }
    : { label: "Late", style: { backgroundColor: "#FEF2F2", color: "#991B1B", borderColor: "#FCA5A5" } };
}

const PAGE_LIMIT = 200;
async function fetchAllExpenses(companyId: string, loadId: string) {
  const all: ExpenseListRow[] = []; let offset = 0;
  while (true) { const res = await listExpenses(companyId, { load_id: loadId, limit: PAGE_LIMIT, offset }); const rows = res.rows ?? []; all.push(...rows); if (rows.length < PAGE_LIMIT) break; offset += PAGE_LIMIT; }
  return all;
}
async function fetchAllBills(companyId: string, loadId: string) {
  const all: VendorBill[] = []; let offset = 0;
  while (true) { const res = await listBills(companyId, { load_id: loadId, limit: PAGE_LIMIT, offset }); const rows = res.rows ?? []; all.push(...rows); if (rows.length < PAGE_LIMIT) break; offset += PAGE_LIMIT; }
  return all;
}

function ExpandPanel({ row, companyId }: { row: BoardRow; companyId: string }) {
  const expenses = useQuery({ queryKey: ["load-costs-board", "expenses", companyId, row.load_id], queryFn: () => fetchAllExpenses(companyId, row.load_id) });
  const bills = useQuery({ queryKey: ["load-costs-board", "bills", companyId, row.load_id], queryFn: () => fetchAllBills(companyId, row.load_id) });
  const entries = [
    ...(expenses.data ?? []).filter(x => x.status !== "void").map(x => ({ id: x.id, number: x.expense_number ?? row.load_number, label: x.vendor_name ?? "Vendor not set", detail: x.line_description ?? x.memo ?? "Expense · paid now", amount: Number(x.total_amount_cents), owed: false })),
    ...(bills.data ?? []).filter(x => x.status !== "voided").map(x => ({ id: x.id, number: x.display_id ?? row.load_number, label: x.vendor_name ?? "Vendor not set", detail: x.bill_number ? `Vendor invoice ${x.bill_number}` : "Bill · owed", amount: Number(x.amount_cents), owed: x.status !== "paid" })),
  ];
  const params = new URLSearchParams({ load_id: row.load_id, load_number: row.load_number }).toString();
  return <div className="grid gap-3 bg-[#F7F8FA] p-3 md:grid-cols-[1.55fr_1fr]" data-testid="load-costs-expand">
    <section className="overflow-hidden rounded border border-[#E5E7EB] bg-white" data-testid="panel-costs-on-load"><header className="flex justify-between border-b px-3 py-[7px] font-bold uppercase text-[#4B5563]"><span>Costs on this load</span><span>{entries.length} entries</span></header>{entries.length === 0 ? <p className="p-3 text-xs text-[#6B7280]">No costs on this load yet.</p> : entries.map(e => <div key={e.id} className="grid grid-cols-[76px_1fr_80px_96px] gap-2 border-b px-3 py-2 text-xs"><b>{e.number}</b><span>{e.label}<small className="block text-[#6B7280]">{e.detail}</small></span><b className="text-center uppercase">{e.owed ? "Owed" : "Paid"}</b><b className="text-right">{fmt(e.amount)}</b></div>)}<div className="flex flex-wrap gap-2 p-3"><Link data-testid="btn-add-cost" className="rounded bg-[#16A34A] px-2.5 py-1.5 text-xs font-semibold text-white" to={`/accounting/expenses/new?${params}`}>+ Add a cost</Link><Link data-testid="btn-receipt-photo" className="rounded border border-[#16A34A] px-2.5 py-1.5 text-xs font-semibold text-[#16A34A]" to={`/accounting/receipts?${params}`}>+ From a receipt photo</Link><Link data-testid="btn-fuel-advance" className="rounded border border-[#16A34A] px-2.5 py-1.5 text-xs font-semibold text-[#16A34A]" to={`/cash-advances?${params}`}>+ Fuel advance</Link></div></section>
    <section className="overflow-hidden rounded border border-[#E5E7EB] bg-white" data-testid="panel-approx-settlement"><header className="flex justify-between border-b px-3 py-[7px] font-bold uppercase text-[#4B5563]"><span>Approximate settlement</span><span>not final</span></header>{[["Line haul revenue", Number(row.revenue_cents)], ["Costs on the load", -rowCosts(row)], ["Driver pay accruing", -rowPay(row)]].map(([l, v]) => <div key={String(l)} className="flex justify-between border-b px-3 py-[7px] text-xs"><span>{l}</span><span>{fmt(Number(v))}</span></div>)}<div className="flex justify-between bg-[#DCFCE7] px-3 py-[7px] text-xs font-bold text-[#16A34A]"><span>Approximate margin</span><span>{fmt(rowMargin(row))}</span></div></section>
  </div>;
}

// ── Per-tab transaction registers (owner 2026-09-05: "what the fuck are all the boxes inside costs,
// expenses, bills… they all show the same"). ROOT CAUSE: the tab row only FILTERED which loads showed
// on the same 19-column board — it never showed the type's own transactions. FIX: each non-"costs" tab
// renders ITS OWN register of that transaction type (real rows), scoped to USMCA. "Costs" stays the
// per-load overview board. Read-only — this board never posts (create is the header + New menu, which
// routes to the create screens).
type RegisterRow = { id: string; number: string; date: string | null; party: string; loadNumber: string | null; loadId: string | null; detail: string; amountCents: number; status: string };
const REGISTER_COLUMNS: Array<ParityColumn<RegisterRow>> = [
  { key: "number", label: "Number", testId: "reg-col-number", sortable: true, className: "whitespace-nowrap", sortValue: r => r.number, render: r => <span className="font-semibold text-slate-700">{r.number}</span> },
  { key: "date", label: "Date", testId: "reg-col-date", sortable: true, className: "whitespace-nowrap", sortValue: r => r.date ?? "", render: r => r.date ? formatDateUS(r.date) : DASH },
  { key: "party", label: "Vendor / Driver", testId: "reg-col-party", sortable: true, sortValue: r => r.party, render: r => r.party || DASH },
  { key: "load", label: "Load", testId: "reg-col-load", sortable: true, className: "whitespace-nowrap", sortValue: r => r.loadNumber ?? "", render: r => r.loadId ? <Link className="font-semibold text-slate-700 underline" to={`/dispatch/loads/${r.loadId}?tab=Costs`}>{r.loadNumber ?? r.loadId}</Link> : DASH },
  { key: "detail", label: "Description", testId: "reg-col-detail", sortable: false, render: r => <span className="text-[#4B5563]">{r.detail || DASH}</span> },
  { key: "amount", label: "Amount", testId: "reg-col-amount", sortable: true, className: NUM, sortValue: r => r.amountCents, render: r => fmt(r.amountCents) },
  { key: "status", label: "Status", testId: "reg-col-status", sortable: true, className: "whitespace-nowrap text-center", sortValue: r => r.status, render: r => <span className="inline-block rounded-sm border border-[#C7D2DC] bg-[#EEF2F6] px-2 py-px font-bold uppercase text-[#4B5563]" style={{ fontSize: 10 }}>{r.status}</span> },
];

const REGISTER_LIMIT = 500;
function TransactionRegister({ tab, companyId }: { tab: CostTab; companyId: string }) {
  const q = useQuery({
    queryKey: ["load-costs-board", "register", tab, companyId],
    enabled: Boolean(companyId) && tab !== "costs" && tab !== "documents" && tab !== "broker_advances",
    retry: false,
    queryFn: async (): Promise<RegisterRow[]> => {
      if (tab === "bills") {
        const res = await listBills(companyId, { limit: REGISTER_LIMIT });
        return (res.rows ?? []).filter(b => b.status !== "voided").map(b => ({ id: b.id, number: b.display_id ?? "—", date: b.bill_date, party: b.vendor_name ?? "Vendor not set", loadNumber: null, loadId: null, detail: b.bill_number ? `Vendor invoice ${b.bill_number}` : (b.memo ?? "Bill · owed"), amountCents: Number(b.amount_cents), status: b.status === "paid" ? "Paid" : "Owed" }));
      }
      if (tab === "driver_pay") {
        const res = await listDriverBills(companyId, { limit: REGISTER_LIMIT }) as { rows?: Array<Record<string, unknown>> };
        return (res.rows ?? []).map(d => ({ id: String(d.id), number: String(d.display_id ?? d.bill_number ?? d.load_number ?? "—"), date: (d.bill_date ?? d.created_at ?? null) as string | null, party: String((d.driver_name ?? `${d.driver_first_name ?? ""} ${d.driver_last_name ?? ""}`.trim()) || "Driver"), loadNumber: (d.load_number ?? null) as string | null, loadId: (d.load_id ?? null) as string | null, detail: "Driver pay", amountCents: Number(d.amount_cents ?? d.total_amount_cents ?? 0), status: String(d.status ?? "—") }));
      }
      if (tab === "fuel_advances") {
        const res = await listCashAdvances(companyId, {}) as { advances?: Array<Record<string, unknown>> };
        return (res.advances ?? []).filter(a => a.purpose === "fuel_deposit").map(a => ({ id: String(a.id), number: String(a.display_id ?? a.reference ?? "—"), date: (a.disbursed_at ?? a.created_at ?? null) as string | null, party: String(a.driver_name ?? a.recipient_name ?? "Driver"), loadNumber: (a.load_number ?? null) as string | null, loadId: (a.load_id ?? null) as string | null, detail: "Fuel advance", amountCents: Number(a.amount_cents ?? a.amount ?? 0), status: String(a.status ?? "—") }));
      }
      // expenses + repairs_maintenance both read from expenses; R&M narrows to work-order-linked lines.
      const res = await listExpenses(companyId, { limit: REGISTER_LIMIT });
      const rows = (res.rows ?? []).filter(x => x.status !== "void");
      const filtered = tab === "repairs_maintenance" ? rows.filter(x => x.linked_work_order_uuid != null) : rows;
      return filtered.map(x => ({ id: x.id, number: x.expense_number ?? "—", date: x.transaction_date, party: x.vendor_name ?? ([x.driver_first_name, x.driver_last_name].filter(Boolean).join(" ") || "Vendor not set"), loadNumber: x.load_number, loadId: x.load_id, detail: tab === "repairs_maintenance" && x.work_order_display_id ? `Work order ${x.work_order_display_id}` : (x.line_description ?? x.memo ?? "Expense"), amountCents: Number(x.total_amount_cents), status: x.status === "posted" ? "Posted" : x.status === "active" ? "Recorded" : x.status === "draft" ? "Draft" : x.status }));
    },
  });
  if (tab === "documents") return <p data-testid="reg-note" className="p-4 text-xs text-[#6B7280]">Documents are attached per load — open a load to see its documents.</p>;
  if (tab === "broker_advances") return <p data-testid="reg-note" className="p-4 text-xs text-[#6B7280]">Broker advances are recorded against a load — open a load, or the Cash Advances register, to see them.</p>;
  const rows = q.data ?? [];
  const total = rows.reduce((n, r) => n + r.amountCents, 0);
  return <div data-testid="load-costs-register"><ParityTable columns={REGISTER_COLUMNS} rows={rows} rowKey={r => r.id} loading={q.isLoading} emptyText={`No ${tab.replaceAll("_", " ")} transactions found.`} storageKey={`load-costs-register-${tab}`} exportFilename={`load-costs-${tab}`} tableTestId={`load-costs-register-${tab}`} footer={<><td className="px-2 py-1.5 font-semibold uppercase tracking-[0.4px] text-gray-600" style={{ fontSize: 11, backgroundColor: TOTBG }} colSpan={5} data-testid="reg-totals-label">Totals ({rows.length})</td><td className="px-2 py-1.5 text-center font-mono text-gray-900" style={{ backgroundColor: TOTBG }} data-testid="reg-totals-amount">{fmt(total)}</td><td className="px-2 py-1.5" style={{ backgroundColor: TOTBG }} /></>} /></div>;
}

export function LoadCostsBoardPage() {
  const navigate = useNavigate(); const { selectedCompanyId } = useCompanyContext(); const companyId = selectedCompanyId ?? "";
  const [filter, setFilter] = useState<FilterPill>("in_motion");
  const [showVoided, setShowVoided] = useState(false);
  const [costTab, setCostTab] = useState<CostTab>("costs");
  // Spec 09-04-2026 (Load Costs Board 19 Columns) §3/DoD-2: "every one of the 19 is server-side
  // sortable... A column the owner cannot sort is not delivered." sortKey defaults to the column key
  // the backend also defaults to ("load") so the first paint and an explicit ?load_costs_sort=load
  // request match; ParityTable is controlled (sortKey/sortDirection/onSortChange all passed) with
  // sortMode="external" -- the table never re-orders rows itself, it only paints the ▲/▼ indicator
  // and calls onSortChange, and the actual order comes back from the server on every click.
  const [sortKey, setSortKey] = useState("load");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const query = useQuery({ queryKey: ["accounting", "load-costs-board", companyId, showVoided, sortKey, sortDirection], queryFn: () => apiRequest<{ rows: BoardRow[]; unmatched_bank_count: number }>(`/api/v1/accounting/load-costs-board?operating_company_id=${encodeURIComponent(companyId)}&show_voided=${showVoided}&load_costs_sort=${encodeURIComponent(sortKey)}&sort_direction=${sortDirection}`), enabled: Boolean(companyId), retry: false });
  const rows = query.data?.rows ?? [];
  const statusFiltered = useMemo(() => rows.filter(r => matches(r, filter)), [rows, filter]);
  const activeTab = COST_TABS.find(t => t.id === costTab) ?? COST_TABS[0];
  const visible = useMemo(() => statusFiltered.filter(r => activeTab.has(r)), [statusFiltered, activeTab]);
  const tabCount = (t: typeof COST_TABS[number]) => (t.measured ? statusFiltered.filter(t.has).length : null);
  const revenue = visible.reduce((n, r) => n + Number(r.revenue_cents), 0); const costs = visible.reduce((n, r) => n + rowCosts(r), 0); const driver = visible.reduce((n, r) => n + rowPay(r), 0); const margin = revenue - costs - driver;
  // Spec §4 "A totals row that foots every money column": sums the CURRENTLY VISIBLE (filtered)
  // rows for every money column, in the same left-to-right order as the columns themselves, so the
  // footer literally is Late Fee+Lumper+Fuel+R&M+Other summed across rows -- the same footing
  // identity the backend guarantees per-row (verify-load-costs-cost-split-foots, live).
  const totals = useMemo(() => ({
    revenue, late_fee: visible.reduce((n, r) => n + Number(r.late_fee_cents), 0), lumper: visible.reduce((n, r) => n + Number(r.lumper_cents), 0),
    fuel: visible.reduce((n, r) => n + Number(r.fuel_cents), 0), rm: visible.reduce((n, r) => n + Number(r.repairs_maintenance_cents), 0),
    other: visible.reduce((n, r) => n + Number(r.other_cost_cents), 0), loaded_pay: visible.reduce((n, r) => n + Number(r.loaded_pay_cents), 0),
    deadhead_pay: visible.reduce((n, r) => n + (r.deadhead_pay_cents == null ? 0 : Number(r.deadhead_pay_cents)), 0), gross: driver,
  }), [visible, revenue, driver]);
  const columns: Array<ParityColumn<BoardRow>> = [
    { key: "load", label: "Load", testId: "col-load", sortable: true, alwaysVisible: true, sortValue: r => r.load_number, render: r => <Link className="font-semibold text-slate-700 underline" to={`/dispatch/loads/${r.load_id}?tab=Costs`}>{r.load_number}</Link> },
    { key: "unit", label: "Unit", testId: "col-unit", sortable: true, className: "whitespace-nowrap", sortValue: r => r.unit_number ?? "", render: r => r.unit_number ?? "—" },
    { key: "driver_name", label: "Driver", testId: "col-driver-name", sortable: true, className: "whitespace-nowrap", sortValue: r => r.driver_name ?? "", render: r => r.driver_name ?? "Not assigned" },
    { key: "pu_date", label: "PU Date", testId: "col-pu-date", sortable: true, className: "whitespace-nowrap", sortValue: r => r.pickup_date ?? "", render: r => r.pickup_date ? formatDateUS(r.pickup_date) : "—" },
    { key: "del_date", label: "Del Date", testId: "col-del-date", sortable: true, className: "whitespace-nowrap", sortValue: r => r.actual_delivery_at ?? "", render: r => r.actual_delivery_at ? formatDateUS(r.actual_delivery_at) : "—" },
    { key: "status", label: "Status", testId: "col-status", sortable: true, className: "whitespace-nowrap", sortValue: r => serviceStatus(r).label, render: r => { const s = serviceStatus(r); return <span className="inline-block rounded-[9px] border px-2 py-px font-bold uppercase tracking-[0.3px]" style={{ ...chip(s.style), fontSize: 10 }}>{s.label}</span>; } },
    { key: "revenue", label: "Revenue", testId: "col-revenue", sortable: true, className: NUM, sortValue: r => Number(r.revenue_cents), render: r => fmt(Number(r.revenue_cents)) },
    { key: "late_fee", label: "Late Fee", testId: "col-late-fee", sortable: true, className: NUM, sortValue: r => Number(r.late_fee_cents), render: r => fmtDash(Number(r.late_fee_cents)) },
    { key: "lumper", label: "Lumper", testId: "col-lumper", sortable: true, className: NUM, sortValue: r => Number(r.lumper_cents), render: r => fmtDash(Number(r.lumper_cents)) },
    { key: "fuel", label: "Fuel", testId: "col-fuel", sortable: true, className: NUM, sortValue: r => Number(r.fuel_cents), render: r => fmtDash(Number(r.fuel_cents)) },
    { key: "repairs_maintenance", label: "R&M Exp", testId: "col-repairs-maintenance", sortable: true, className: NUM, sortValue: r => Number(r.repairs_maintenance_cents), render: r => fmtDash(Number(r.repairs_maintenance_cents)) },
    { key: "other", label: "Other", testId: "col-other", sortable: true, className: NUM, sortValue: r => Number(r.other_cost_cents), render: r => fmtDash(Number(r.other_cost_cents)) },
    { key: "short_miles", label: "Short Miles", testId: "col-short-miles", sortable: true, className: NUM, sortValue: r => r.short_miles == null ? -1 : Number(r.short_miles), render: r => fmtMiles(r.short_miles) },
    { key: "rate_loaded", label: "Rate Loaded", testId: "col-rate-loaded", sortable: true, className: NUM, sortValue: r => r.rate_loaded_cents == null ? -1 : Number(r.rate_loaded_cents), render: r => fmtRate(r.rate_loaded_cents) },
    { key: "loaded_pay", label: "Loaded Pay", testId: "col-loaded-pay", sortable: true, className: NUM, sortValue: r => Number(r.loaded_pay_cents), render: r => fmt(Number(r.loaded_pay_cents)) },
    // Honesty rule (owner order 2026-09-04): Empty Miles / Deadhead Pay render BLANK, never 0, when
    // this load's driver bill(s) never tracked a deadhead-miles figure -- a 0 would claim he ran no
    // empty miles and underpay him against rate_empty_per_mile_cents (from the driver's own rate
    // config, never hardcoded here -- see load-costs-board.routes.ts driver_pay_detail CTE).
    { key: "empty_miles", label: "Empty Miles", testId: "col-empty-miles", sortable: true, className: NUM, sortValue: r => r.empty_miles == null ? -1 : Number(r.empty_miles), render: r => fmtMiles(r.empty_miles) },
    { key: "rate_empty", label: "Rate Empty", testId: "col-rate-empty", sortable: true, className: NUM, sortValue: r => r.rate_empty_cents == null ? -1 : Number(r.rate_empty_cents), render: r => fmtRate(r.rate_empty_cents) },
    { key: "deadhead_pay", label: "Deadhead Pay", testId: "col-deadhead-pay", sortable: true, className: NUM, sortValue: r => r.deadhead_pay_cents == null ? -1 : Number(r.deadhead_pay_cents), render: r => (r.deadhead_pay_cents == null ? DASH : fmtBlank(r.deadhead_pay_cents)) },
    { key: "gross", label: "Gross", testId: "col-gross", sortable: true, className: NUM, sortValue: r => rowPay(r), render: r => fmt(rowPay(r)) },
    // Kept as an opt-in extra (never in the owner's exact default list) rather than deleted --
    // additive-only law (Rule 07): hidden by default, still reachable from the gear chooser.
    { key: "margin", label: "Margin", testId: "col-margin", sortable: true, className: NUM, defaultHidden: true, sortValue: r => rowMargin(r), render: r => Number(r.revenue_cents) ? `${(rowMargin(r) / Number(r.revenue_cents) * 100).toFixed(1)}%` : "—" },
  ];
  // Spec §2.2 "the piece the owner keeps pointing at" -- a second header row banding the 19 columns.
  // Hex values are the design law's own literal tokens (--grp-bg / --rev / --cost / --pay), applied
  // directly here because design/tokens.ts (CC-2's file) has not landed them yet -- do not hard-code
  // a colour that duplicates a token CC-2 already owns; these are net-NEW values with no token yet.
  // Migrate to token references the moment CC-2 ships them.
  // DESIGN-CONTRACT-LOAD-COSTS-BOARD-2026-09-05 (owner-approved reference
  // docs/design/reference/LOAD-COSTS-BOARD-REFERENCE-2026-09-04.html). The band ROW is one uniform
  // --grp-bg shade (ParityTable paints it); these `bg`/`bgEven` colours tint the BODY cells only,
  // odd/even. "The trip" columns carry NO body tint in the reference (plain zebra) -- band label only.
  const COLUMN_GROUPS = [
    { label: "The trip", keys: ["load", "unit", "driver_name", "pu_date", "del_date", "status"] },
    { label: "Revenue", keys: ["revenue"], bg: "#EEF4FA", bgEven: "#E4EDF6" },
    { label: "Trip expense", keys: ["late_fee", "lumper", "fuel", "repairs_maintenance", "other"], bg: "#FDF6F3", bgEven: "#F8EDE8" },
    { label: "Driver pay", keys: ["short_miles", "rate_loaded", "loaded_pay", "empty_miles", "rate_empty", "deadhead_pay"], bg: "#F4F1FA", bgEven: "#EDE7F5" },
    { label: "", keys: ["gross"], bg: "#EDF1F5", bgEven: "#E6EBF1" },
  ];
  return <main className="space-y-4 bg-[#F7F8FA]" data-testid="load-costs-shell"><button type="button" data-testid="load-costs-back" className="text-xs font-semibold text-slate-700" onClick={() => navigate(-1)}>← Back</button><header data-testid="load-costs-title"><h1 className="font-semibold text-[#0F1219]" style={{ fontSize: 22 }}>Load costs</h1><p className="text-xs text-[#6B7280]">Live loads, recorded costs, and approximate margin. This board reads; it never posts.</p></header>{query.isError ? <ListErrorState title="Could not load the costs board." status={(query.error as { status?: number })?.status ?? 0} onRetry={() => void query.refetch()} /> : null}<section className="overflow-hidden rounded border border-[#E5E7EB] bg-white"><div data-testid="load-costs-topbar" className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3"><h2 className="font-semibold" style={{ fontSize: 22 }}>Costs</h2><div className="flex flex-wrap items-center gap-2"><div className="flex gap-1">{/* DESIGN-CONTRACT chips: radius 2px, height 22px, border 1px --line2; ACTIVE = #14314F white
    (the contract's own active-chip value -- distinct from the header row, which stays light ink). */}
{(["in_motion", "delivered_open", "all_open", "this_week"] as const).map(id => <button key={id} data-testid={`load-costs-pill-${id}`} type="button" onClick={() => setFilter(id)} className={`inline-flex h-[22px] items-center rounded-sm border px-2 text-xs capitalize ${filter === id ? "border-[#14314F] bg-[#14314F] font-semibold text-white" : "border-[#C7D2DC] bg-white text-[#6B7280] hover:bg-gray-50"}`}>{id.replaceAll("_", " ")}</button>)}</div><label className="flex items-center gap-1.5 text-xs text-[#4B5563]"><input data-testid="load-costs-show-voided" type="checkbox" checked={showVoided} onChange={e => setShowVoided(e.target.checked)} />Show voided</label></div></div><div data-testid="load-costs-tabs" className="flex flex-wrap gap-1 border-b border-[#E5E7EB] px-4 py-2">{COST_TABS.map(t => { const c = tabCount(t); return <button key={t.id} type="button" data-testid={`load-costs-tab-${t.id}`} aria-selected={costTab === t.id} onClick={() => setCostTab(t.id)} className={`inline-flex h-[28px] items-center gap-1.5 rounded-sm border px-2 text-xs font-semibold ${costTab === t.id ? "border-[#14314F] bg-[#14314F] text-white" : "border-[#C7D2DC] bg-white text-[#4B5563] hover:bg-gray-50"}`}>{t.label}<span className={`inline-flex min-w-[16px] items-center justify-center rounded-sm px-1 ${costTab === t.id ? "bg-white/20 text-white" : "bg-gray-100 text-[#6B7280]"}`} style={{ fontSize: 10 }}>{c == null || c === 0 ? "—" : c}</span></button>; })}</div>{!activeTab.measured ? <p data-testid="load-costs-tab-note" className="px-4 pb-2 pt-1 text-xs text-[#6B7280]">Open a load to see its {activeTab.label.toLowerCase()} — this total is not yet aggregated on the board.</p> : null}<div className="grid grid-cols-2 gap-2 p-2 sm:grid-cols-3 lg:grid-cols-6" data-note="KPI-TILE-SIZE LAW 2026-09-04: gap-2 + padding replaces border-b, matching Safety's own KPI-row grid (was over the 101px ceiling with no gap)"><DrillKpiCard testId="kpi-loads-in-motion" label="Loads in motion" value={rows.filter(r => MOTION.includes(r.status)).length} hint={`${visible.length} rows`} onClick={() => setFilter("in_motion")} /><DrillKpiCard testId="kpi-revenue-booked" label="Revenue booked" value={fmt(revenue)} hint={`${visible.length} loads`} onClick={() => setFilter(filter)} /><DrillKpiCard testId="kpi-costs-recorded" label="Costs recorded" value={fmt(costs)} hint={`${visible.reduce((n, r) => n + r.expense_count + r.bill_count, 0)} entries`} onClick={() => setFilter(filter)} /><DrillKpiCard testId="kpi-driver-pay" label="Driver pay accruing" value={fmt(driver)} hint={`${visible.length} loads`} onClick={() => setFilter(filter)} /><DrillKpiCard testId="kpi-approx-margin" label="Approximate margin" value={revenue ? `${(margin / revenue * 100).toFixed(1)}%` : "—"} hint={fmt(margin)} onClick={() => setFilter(filter)} /><DrillKpiCard testId="kpi-bank-unmatched" label="Bank items unmatched" value={query.data?.unmatched_bank_count ?? 0} hint="Open bank items" to="/banking/transactions" /></div>{costTab !== "costs" ? <TransactionRegister tab={costTab} companyId={companyId} /> : <div><ParityTable columns={columns} rows={visible} rowKey={r => r.load_id} loading={query.isLoading} emptyText="No loads found for this company." storageKey="load-costs-board-v3" enableColumnReorder enableColumnResize renderExpanded={r => <ExpandPanel row={r} companyId={companyId} />} expandMode="single" suppressToolbarRange exportFilename="load-costs" tableTestId="accounting-load-costs-board" sortKey={sortKey} sortDirection={sortDirection} onSortChange={(key, direction) => { setSortKey(key); setSortDirection(direction); }} sortMode="external" columnGroups={COLUMN_GROUPS} headerBg="#EEF2F6" headerInk="#1F2937" minWidthPx={1660} columnLayout="auto" footer={<>
              <td className="px-2 py-1.5 font-semibold uppercase tracking-[0.4px] text-gray-600" style={{ fontSize: 11, backgroundColor: TOTBG }} colSpan={6} data-testid="load-costs-totals-label">Totals ({visible.length} loads)</td>
              <td className="px-2 py-1.5 text-center font-mono text-gray-900" style={{ backgroundColor: TOTBG }} data-testid="load-costs-totals-revenue">{fmt(totals.revenue)}</td>
              <td className="px-2 py-1.5 text-center font-mono text-gray-900" style={{ backgroundColor: TOTBG }} data-testid="load-costs-totals-late-fee">{fmtDash(totals.late_fee)}</td>
              <td className="px-2 py-1.5 text-center font-mono text-gray-900" style={{ backgroundColor: TOTBG }} data-testid="load-costs-totals-lumper">{fmtDash(totals.lumper)}</td>
              <td className="px-2 py-1.5 text-center font-mono text-gray-900" style={{ backgroundColor: TOTBG }} data-testid="load-costs-totals-fuel">{fmtDash(totals.fuel)}</td>
              <td className="px-2 py-1.5 text-center font-mono text-gray-900" style={{ backgroundColor: TOTBG }} data-testid="load-costs-totals-rm">{fmtDash(totals.rm)}</td>
              {/* Other IS the honest remainder -- foots by construction: Late Fee+Lumper+Fuel+R&M+Other
                  summed across these visible rows equals total costs summed across the same rows. */}
              <td className="px-2 py-1.5 text-center font-mono text-gray-900" style={{ backgroundColor: TOTBG }} data-testid="load-costs-totals-other">{fmtDash(totals.other)}</td>
              <td className="px-2 py-1.5" style={{ backgroundColor: TOTBG }} />
              <td className="px-2 py-1.5" style={{ backgroundColor: TOTBG }} />
              <td className="px-2 py-1.5 text-center font-mono text-gray-900" style={{ backgroundColor: TOTBG }} data-testid="load-costs-totals-loaded-pay">{fmt(totals.loaded_pay)}</td>
              <td className="px-2 py-1.5" style={{ backgroundColor: TOTBG }} />
              <td className="px-2 py-1.5" style={{ backgroundColor: TOTBG }} />
              <td className="px-2 py-1.5 text-center font-mono text-gray-900" style={{ backgroundColor: TOTBG }} data-testid="load-costs-totals-deadhead-pay">{fmt(totals.deadhead_pay)}</td>
              <td className="px-2 py-1.5 text-center font-mono font-bold text-gray-900" style={{ backgroundColor: "#EDF1F5" }} data-testid="load-costs-totals-gross">{fmt(totals.gross)}</td>
            </>} /></div>}</section></main>;
}
