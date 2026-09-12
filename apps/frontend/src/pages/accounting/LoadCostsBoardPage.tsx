import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { listBills, listBrokerAdvances, listCoaRoles, listDriverBills, listExpenses, type BrokerAdvanceRow } from "../../api/accounting";
import { listCashAdvances } from "../../api/cashAdvances";
import { apiRequest } from "../../api/client";
import { getAttachmentDownloadUrl } from "../../api/attachments";
import { getDownloadUrl } from "../../api/docs";
import { ListErrorState } from "../../components/ListErrorState";
import { DrillKpiCard } from "../../components/layout/DrillKpiCard";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { hasInAppHistory } from "../../lib/smart-back";
import { formatDateUS } from "../../lib/formatDate";
import { useDispatchLoad, listAllLoads, updateLoadStatus, type DispatchLoadRow, type LoadStatus } from "../../api/loads";
import { listUnitsWithoutLoad } from "../../api/dispatch";
import { pairOutboundReturn, NEEDS_RETURN_STATUSES } from "../dispatch/roundTripsLegs";
import { LoadDetailCostsTab } from "../../components/dispatch/LoadDetailCostsTab";
import { TourPreSettlementTab } from "../../components/dispatch/TourPreSettlementTab";
import { TourSettlementTab } from "../../components/dispatch/TourSettlementTab";
import { listTours } from "../../api/tourReadout";
import { flattenTourRows, TOUR_LOAD_COLUMNS, tourLoadFooter } from "../../components/dispatch/TourLoadRows";
import { EntityLink } from "../../components/shared/EntityLink";
import { ReceiptAttach } from "../../components/documents/ReceiptAttach";
import { useToast } from "../../components/Toast";
import { parseExpenseMemo } from "../../lib/expense-memo";
import { STATUS_LABEL } from "../../components/dispatch/constants";
import { InlineStatusPicker } from "../../components/dispatch/InlineStatusPicker";
import { userFacingApiError } from "../../lib/api-error-message";

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
  /** NEW-08: the real driver_finance.driver_settlements this load is already linked to (assigned at
   * booking time, SET-01/SET-02) -- null only for a load with no driver bill yet (e.g. unassigned). */
  settlement_display_id: string | null;
  settlement_id: string | null;
  /** NEW-09: true when a real, issued (non-draft, non-proforma, non-void) accounting.invoices row
   * exists for this load -- the ground truth for "already invoiced, belongs in resettlement, not
   * open items." mdata.loads.status never actually reaches 'invoiced' (0 rows system-wide), so
   * that literal string in CLOSED below never matched anything -- this is the real signal. */
  is_invoiced: boolean;
  is_resettlement?: boolean;
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
// DESIGN-CONTRACT totals row bg (--grp-bg) — DSP-TBL migrated this to ParityTable.tsx's own
// footerCells row styling (colors.tableGroupBandBg, the same value), so every footerCells table
// gets it uniformly; no longer set per-cell here. The Gross cell's extra .tot-c shade (#EDF1F5)
// distinguishing it from the rest of the row is not reproducible per-cell in the new column-keyed
// model (footerCells has no per-cell background override) — an accepted, honest simplification.
// NEW-09 (owner raw findings 2026-09-07): "unit 168 / a load already invoiced should not still be
// sitting in Load Costs as an open item -- it belongs in resettlement". A 2026-09-07 pass added the
// literal 'invoiced' status here, reasoning a load reaches mdata.loads.status='invoiced' once
// accounting.invoices has a real row for it -- but live-reconfirmed 2026-09-08: NOTHING in the
// codebase ever sets mdata.loads.status='invoiced' (0 rows system-wide carry it, across every
// entity). That fix never actually fired; load 13569 (unit T168, real signed invoice already SENT)
// stayed in `delivered_pending_docs`, still an open bucket. `invoiced` is kept in this list (a
// future write path could legitimately use it and this must not silently stop honoring it), but the
// real fix is isClosed() below, which checks the load's actual invoice existence server-computed
// (`is_invoiced`, load-costs-board.routes.ts's invoice_info CTE) instead of a status value that
// nothing writes.
const CLOSED = ["cancelled", "abandoned", "closed", "paid", "invoiced", "driver_walkoff", "driver_no_show"];
const MOTION = ["draft", "booked", "planned", "unassigned", "assigned", "assigned_not_dispatched", "dispatched", "at_pickup", "in_transit", "at_delivery"];
const DELIVERED = ["delivered", "delivered_pending_docs", "completed_docs_received"];
// ROUND 18.1 (owner ruling, 2026-09-11 20:40 CT / 01:40 UTC 09-12 — OVERTURNS REG-040/#21692's
// is_resettlement inclusion here): 7 genuinely in-route USMCA loads (13587 SB, 13590 NB, 13591 SB,
// 13592 SB, 13593 SB, 13594 SB, 13595 SB — all status='dispatched', none invoiced) went INVISIBLE
// on every Costs pill because is_resettlement is a TOUR-level flag load-costs-board.routes.ts's
// settlement_info CTE sets whenever the tour's FIRST load is closed/invoiced (13578/13569/13571/
// 13526/13576/13563 respectively) — a load that is still in route must show as current regardless
// of what already happened to an earlier load on the same tour. A load's own state decides whether
// it is current, never a sibling load's state. is_resettlement stays load-costs-board.routes.ts's
// signal for the SEPARATE Resettlement tab (isResettlement() below, unchanged) — just no longer a
// reason to hide an otherwise-active load from Costs.
const isClosed = (r: BoardRow) => CLOSED.includes(r.status) || r.is_invoiced;
// An issued invoice moves the original load out of every active bucket, independent of tour close.
const isResettlement = (r: BoardRow) => r.is_resettlement === true || r.status === "invoiced" || (r.is_invoiced && !CLOSED.includes(r.status));
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
type CostTab = "costs" | "expenses" | "bills" | "fuel_advances" | "broker_advances" | "driver_pay" | "repairs_maintenance" | "documents" | "pre_settlement" | "settlement" | "resettlement";
const COST_TABS: Array<{ id: CostTab; label: string; measured: boolean; has: (r: BoardRow) => boolean }> = [
  { id: "costs", label: "Costs", measured: true, has: () => true },
  { id: "resettlement", label: "Resettlement", measured: true, has: isResettlement },
  { id: "expenses", label: "Expenses", measured: true, has: (r) => r.expense_count > 0 },
  { id: "bills", label: "Bills", measured: true, has: (r) => r.bill_count > 0 },
  { id: "fuel_advances", label: "Fuel advances", measured: true, has: (r) => Number(r.fuel_cents) > 0 },
  { id: "broker_advances", label: "Broker advances", measured: false, has: () => true },
  { id: "driver_pay", label: "Driver pay", measured: true, has: (r) => Number(r.driver_pay_cents) > 0 },
  { id: "repairs_maintenance", label: "Repairs & maintenance", measured: true, has: (r) => Number(r.repairs_maintenance_cents) > 0 },
  { id: "documents", label: "Documents", measured: false, has: () => true },
  // LDT-TABS (owner 2026-09-06 02:4xZ): Pre-Settlement = every OPEN tour (legs, Ready-to-close, the Close button);
  // Settlement = every CLOSED tour (driver + company settlement, frozen). Rows come from the tour readout, not the
  // per-load board rows, so the badge is the tour count (TourRegister supplies it) — `has` keeps every load in view.
  { id: "pre_settlement", label: "Pre-Settlement", measured: false, has: () => true },
  { id: "settlement", label: "Settlement", measured: false, has: () => true },
];
function matches(r: BoardRow, f: FilterPill) { if (f === "in_motion") return MOTION.includes(r.status) && !isClosed(r); if (f === "delivered_open") return DELIVERED.includes(r.status) && !isClosed(r); if (f === "this_week") return !isClosed(r) && Date.parse(r.created_at) >= Date.now() - 604800000; return !isClosed(r); }
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

// LDT-1B (owner 2026-09-06 01:3xZ: "click on Load costs in Dispatch, then it takes you to this overview, then all
// the tabs within it" — the design lives HERE, not one click deeper). Expanding a load row renders the SAME
// cost cards the load drawer renders (LoadDetailCostsTab): number derived, Expense·paid now | Bill·owed, Paid
// with = bank/card/fuel card, Receipt on every card, English posting hint, fixed totals footer, bank section.
// One component, one write path (createExpense / createVendorBill) — a cost saved here IS the row Accounting →
// Expenses / Bills lists. The legacy panel ids stay (element manifest) around the cards.
function ExpandPanel({ row, companyId }: { row: BoardRow; companyId: string }) {
  const load = useDispatchLoad(row.load_id, companyId);
  const params = new URLSearchParams({ load_id: row.load_id, load_number: row.load_number }).toString();
  return <div className="ldt-body" style={{ padding: 10 }} data-testid="load-costs-expand" data-surface="load-detail">
    <section className="ldt-card" data-testid="panel-costs-on-load">
      <div className="ldt-ch"><span>Costs on load {row.load_number}</span><span className="ldt-open">{row.expense_count + row.bill_count} saved</span></div>
      <div style={{ padding: 10 }}>
        {load.data ? <LoadDetailCostsTab load={load.data} canEdit={true} />
          : load.isError ? <p className="ldt-bad-text">Could not load {row.load_number} — {String((load.error as { message?: string })?.message ?? "error")}.</p>
          : <p className="ldt-muted">Loading load {row.load_number}…</p>}
      </div>
      <div className="ldt-actions" style={{ padding: "0 10px 10px" }}>
        <Link data-testid="btn-add-cost" className="ldt-btn" to={`/accounting/expenses/new?${params}`}>Open the full expense form</Link>
        <Link data-testid="btn-receipt-photo" className="ldt-btn g" to={`/accounting/receipts?${params}`}>Receipts inbox</Link>
        <Link data-testid="btn-fuel-advance" className="ldt-btn g" to={`/cash-advances?${params}`}>Cash advances</Link>
      </div>
    </section>
    <section className="ldt-card" data-testid="panel-approx-settlement">
      <div className="ldt-ch"><span>Approximate settlement (board figures)</span><span className="ldt-open">not final</span></div>
      <div className="ldt-rows">
        {([["Line haul revenue", Number(row.revenue_cents)], ["Costs on this load", rowCosts(row)], ["Driver pay", rowPay(row)]] as Array<[string, number]>).map(([k, v]) => <div className="ldt-row" key={k}><span>{k}</span><span className="ldt-m">{fmt(v)}</span></div>)}
        <div className="ldt-row big"><span>Approximate margin</span><span className="ldt-m">{fmt(rowMargin(row))}</span></div>
      </div>
    </section>
  </div>;
}

// ── Per-tab transaction registers (owner 2026-09-05: "what the fuck are all the boxes inside costs,
// expenses, bills… they all show the same"). ROOT CAUSE: the tab row only FILTERED which loads showed
// on the same 19-column board — it never showed the type's own transactions. FIX: each non-"costs" tab
// renders ITS OWN register of that transaction type (real rows), scoped to USMCA. "Costs" stays the
// per-load overview board. Read-only — this board never posts (create is the header + New menu, which
// routes to the create screens).
type RegisterRow = {
  id: string; number: string; date: string | null; party: string; loadNumber: string | null; loadId: string | null;
  detail: string; amountCents: number; status: string; receiptEntity?: "expense" | "bill";
  /** REG-PARSE (owner 2026-09-06): the seed's composite memo split into its own columns — never one messy string. */
  address?: string | null; receiptNumber?: string | null; settlementNumber?: string | null; settlementId?: string | null;
  // LCB-REG (owner 2026-09-05) additions — each optional block is populated by exactly one tab's
  // own fetcher; ParityTable columns for a tab read only the fields that tab writes.
  /** driver_pay: SET-RATE law breakdown -- loaded/empty miles × their own per-mile rates. */
  loadedMiles?: string | null; loadedRateCents?: string | null;
  emptyMiles?: string | null; emptyRateCents?: string | null; grossCents?: number;
  /** broker_advances */
  category?: string; instrument?: string; instrumentReference?: string; appliedStatus?: string;
  /** documents */
  docType?: string; filename?: string; sizeBytes?: number | null; docSource?: "docs.files" | "documents.attachments";
  attachmentEntityType?: "expense" | "bill"; attachmentEntityId?: string;
};
const REGISTER_COLUMNS: Array<ParityColumn<RegisterRow>> = [
  { key: "number", label: "Number", testId: "reg-col-number", sortable: true, className: "whitespace-nowrap", sortValue: r => r.number, render: r => <span className="font-semibold text-slate-700">{r.number}</span> },
  { key: "date", label: "Date", testId: "reg-col-date", sortable: true, className: "whitespace-nowrap", sortValue: r => r.date ?? "", render: r => r.date ? formatDateUS(r.date) : DASH },
  { key: "party", label: "Vendor / Driver", testId: "reg-col-party", sortable: true, sortValue: r => r.party, render: r => r.party || DASH },
  { key: "load", label: "Load Number", testId: "reg-col-load", sortable: true, className: "whitespace-nowrap", sortValue: r => r.loadNumber ?? "", render: r => r.loadId ? <Link className="font-semibold text-slate-700 underline" to={`/accounting/load-costs/${r.loadId}?tab=Costs`}>{r.loadNumber ?? r.loadId}</Link> : DASH },
  { key: "detail", label: "Description", testId: "reg-col-detail", sortable: true, sortValue: r => r.detail, render: r => <span className="text-[#4B5563]">{r.detail || DASH}</span> },
  // REG-PARSE (owner 2026-09-06 05:2xZ): receipt number, address and settlement number are their own columns.
  { key: "receipt_number", label: "Receipt no.", testId: "reg-col-receipt-number", sortable: true, className: "whitespace-nowrap", sortValue: r => r.receiptNumber ?? "", render: r => r.receiptNumber ? <span className="ldt-k">{r.receiptNumber}</span> : DASH },
  { key: "address", label: "Address", testId: "reg-col-address", sortable: true, sortValue: r => r.address ?? "", render: r => <span className="text-[#4B5563]">{r.address || DASH}</span> },
  { key: "settlement_number", label: "Source settlement reference", testId: "reg-col-source-settlement", sortable: true, className: "whitespace-nowrap", sortValue: r => r.settlementNumber ?? "", render: r => r.settlementNumber ? <span className="ldt-k">{r.settlementNumber}</span> : DASH },
  { key: "amount", label: "Amount", testId: "reg-col-amount", sortable: true, className: NUM, sortValue: r => r.amountCents, render: r => fmt(r.amountCents) },
  { key: "status", label: "Status", testId: "reg-col-status", sortable: true, className: "whitespace-nowrap text-center", sortValue: r => r.status, render: r => <span className="inline-block rounded-sm border border-[#C7D2DC] bg-[#EEF2F6] px-2 py-px font-bold uppercase text-[#4B5563]" style={{ fontSize: 10 }}>{r.status}</span> },
];
/** LDT-1B: receipt on every expense/bill row of the Dispatch → Load costs registers (documents.attachments). */
function receiptColumn(companyId: string): ParityColumn<RegisterRow> {
  return { key: "receipt", label: "Receipt", testId: "reg-col-receipt", sortable: false, render: r => r.receiptEntity ? <ReceiptAttach operatingCompanyId={companyId} entityType={r.receiptEntity} entityId={r.id} testId="reg-receipt" /> : <span className="text-slate-400">{DASH}</span> };
}

// LCB-REG — Driver pay register (owner 2026-09-05, "loaded mi × rate · empty mi × rate · gross per
// bill"): SET-RATE law -- a rate/miles figure a driver bill never tracked renders "—", never a
// fabricated 0 (same honesty rule as the board's own Empty Miles/Deadhead Pay columns above).
/** LCB-REG palette rule: .ldt-* classes only, no new hex — .ldt-pill carries its own ok/warn/bad
 *  tokens (--ldt-accent / --ldt-warn / --ldt-bad) instead of a literal colour per status word. */
function statusPill(status: string) {
  const tone = /paid|applied|posted|active/i.test(status) ? "ok" : /void|not applied|—/i.test(status) ? "bad" : "warn";
  return <span className={`ldt-pill ${tone}`}>{status || DASH}</span>;
}
const DRIVER_PAY_COLUMNS: Array<ParityColumn<RegisterRow>> = [
  { key: "number", label: "Number", testId: "reg-col-number", sortable: true, className: "whitespace-nowrap", sortValue: r => r.number, render: r => <span className="font-semibold">{r.number}</span> },
  { key: "date", label: "Date", testId: "reg-col-date", sortable: true, className: "whitespace-nowrap", sortValue: r => r.date ?? "", render: r => r.date ? formatDateUS(r.date) : DASH },
  { key: "party", label: "Driver", testId: "reg-col-party", sortable: true, sortValue: r => r.party, render: r => r.party || DASH },
  { key: "load", label: "Load Number", testId: "reg-col-load", sortable: true, className: "whitespace-nowrap", sortValue: r => r.loadNumber ?? "", render: r => r.loadId ? <Link className="ldt-link" style={{ display: "inline" }} to={`/accounting/load-costs/${r.loadId}?tab=Costs`}>{r.loadNumber ?? r.loadId}</Link> : DASH },
  { key: "loaded_miles", label: "Loaded miles", testId: "reg-col-loaded_miles", sortable: true, className: `${NUM} ldt-m`, sortValue: r => r.loadedMiles == null ? -Infinity : Number(r.loadedMiles), render: r => fmtMiles(r.loadedMiles ?? null) },
  { key: "loaded_rate", label: "Loaded rate", testId: "reg-col-loaded_rate", sortable: true, className: `${NUM} ldt-m`, sortValue: r => r.loadedRateCents == null ? -Infinity : Number(r.loadedRateCents), render: r => fmtRate(r.loadedRateCents ?? null) },
  { key: "empty_miles", label: "Empty miles", testId: "reg-col-empty_miles", sortable: true, className: `${NUM} ldt-m`, sortValue: r => r.emptyMiles == null ? -Infinity : Number(r.emptyMiles), render: r => fmtMiles(r.emptyMiles ?? null) },
  { key: "empty_rate", label: "Empty rate", testId: "reg-col-empty_rate", sortable: true, className: `${NUM} ldt-m`, sortValue: r => r.emptyRateCents == null ? -Infinity : Number(r.emptyRateCents), render: r => fmtRate(r.emptyRateCents ?? null) },
  { key: "settlement_number", label: "Settlement/Tour", testId: "reg-col-settlement", sortable: true, sortValue: r => r.settlementNumber ?? "", render: r => r.settlementId ? <EntityLink kind="settlement" id={r.settlementId} label={r.settlementNumber ?? "Settlement"} /> : r.settlementNumber ?? DASH },
  { key: "gross", label: "Gross", testId: "reg-col-gross", sortable: true, className: `${NUM} ldt-m`, sortValue: r => r.grossCents ?? 0, render: r => r.grossCents == null ? DASH : fmt(r.grossCents) },
  { key: "status", label: "Status", testId: "reg-col-status", sortable: true, className: "whitespace-nowrap text-center", sortValue: r => r.status, render: r => statusPill(r.status) },
];

/** LCB-REG — the "load" cell for tabs whose own API doesn't return load_number (broker advances,
 *  documents): resolved from the board's own rows, at RENDER time via this closure, never baked
 *  into the row during the tab's own queryFn. The board query and a register's own query race
 *  independently -- baking the lookup in at fetch time would freeze on whichever finished first
 *  (a real bug caught live: the board query resolving after the register left "load" permanently
 *  blank even once the board data arrived, since React Query never re-runs a settled queryFn just
 *  because an outside value it once read has since changed). */
function loadCell(loadsById: Map<string, string>): ParityColumn<RegisterRow> {
  return {
    key: "load", label: "Load Number", testId: "reg-col-load", sortable: true, className: "whitespace-nowrap",
    sortValue: r => (r.loadId ? loadsById.get(r.loadId) : null) ?? r.loadNumber ?? "",
    render: r => {
      if (!r.loadId) return DASH;
      const label = loadsById.get(r.loadId) ?? r.loadNumber ?? r.loadId;
      return <Link className="ldt-link" style={{ display: "inline" }} to={`/accounting/load-costs/${r.loadId}?tab=Costs`}>{label}</Link>;
    },
  };
}

// LCB-REG — Broker advances register: "date · load · category · instrument · amount ·
// applied-to-invoice status" (owner's exact column list).
const BROKER_ADVANCE_COLUMNS = (loadsById: Map<string, string>): Array<ParityColumn<RegisterRow>> => [
  { key: "date", label: "Date", testId: "reg-col-date", sortable: true, className: "whitespace-nowrap", sortValue: r => r.date ?? "", render: r => r.date ? formatDateUS(r.date) : DASH },
  loadCell(loadsById),
  { key: "advance_category", label: "Category", testId: "reg-col-category", sortable: true, sortValue: r => r.category ?? "", render: r => r.category ? r.category.replaceAll("_", " ") : DASH },
  { key: "instrument", label: "Instrument", testId: "reg-col-instrument", sortable: true, sortValue: r => r.instrument ?? "", render: r => r.instrument || DASH },
  { key: "instrument_reference", label: "Instrument reference", testId: "reg-col-instrument-reference", sortable: true, sortValue: r => r.instrumentReference ?? "", render: r => r.instrumentReference || DASH },
  { key: "amount", label: "Amount", testId: "reg-col-amount", sortable: true, className: `${NUM} ldt-m`, sortValue: r => r.amountCents, render: r => fmt(r.amountCents) },
  { key: "status", label: "Applied to invoice", testId: "reg-col-status", sortable: true, className: "whitespace-nowrap text-center", sortValue: r => r.appliedStatus ?? "", render: r => statusPill(r.appliedStatus ?? "") },
];

function formatBytes(bytes: number | null | undefined) {
  if (!bytes) return DASH;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
/** LCB-REG — Documents register: "date · load · type · filename · size · open". Open resolves the
 * download URL from whichever mechanism the row actually came from (docs.files vs the older
 * documents.attachments), or renders ReceiptAttach when the row IS an expense/bill's own receipt. */
function DocumentOpenCell({ row, companyId }: { row: RegisterRow; companyId: string }) {
  const { pushToast } = useToast();
  if (row.docSource === "documents.attachments" && row.attachmentEntityType && row.attachmentEntityId) {
    return <ReceiptAttach operatingCompanyId={companyId} entityType={row.attachmentEntityType} entityId={row.attachmentEntityId} testId="reg-receipt" />;
  }
  return (
    <button
      type="button"
      data-testid="reg-doc-open"
      className="ldt-link"
      onClick={() => {
        void (async () => {
          try {
            const result = row.docSource === "documents.attachments"
              ? await getAttachmentDownloadUrl(row.id, companyId).then(r => r.download_url)
              : await getDownloadUrl(row.id).then(r => r.presigned_url);
            window.open(result, "_blank", "noopener,noreferrer");
          } catch {
            pushToast("Could not open this document.", "error");
          }
        })();
      }}
    >
      Open
    </button>
  );
}
const DOCUMENT_COLUMNS = (companyId: string, loadsById: Map<string, string>): Array<ParityColumn<RegisterRow>> => [
  { key: "date", label: "Date", testId: "reg-col-date", sortable: true, className: "whitespace-nowrap", sortValue: r => r.date ?? "", render: r => r.date ? formatDateUS(r.date) : DASH },
  loadCell(loadsById),
  { key: "type", label: "Type", testId: "reg-col-type", sortable: true, sortValue: r => r.docType ?? "", render: r => r.docType || DASH },
  { key: "filename", label: "Filename", testId: "reg-col-filename", sortable: true, sortValue: r => r.filename ?? "", render: r => <span className="ldt-sub" style={{ display: "inline" }}>{r.filename || DASH}</span> },
  { key: "size", label: "Size", testId: "reg-col-size", sortable: true, className: NUM, sortValue: r => r.sizeBytes ?? 0, render: r => formatBytes(r.sizeBytes) },
  { key: "open", label: "Open", testId: "reg-col-open", sortable: false, render: r => <DocumentOpenCell row={r} companyId={companyId} /> },
];

const REGISTER_LIMIT = 500;
/** GET /api/v1/expenses accepts limit ≤ 200 — never ask for more in one call. */
const EXPENSES_PAGE = 200;
/** REG-400: page GET /api/v1/expenses at its own cap until exhausted (a 500 in one call is HTTP 400 → empty register). */
async function listAllExpenses(companyId: string) {
  const all: Awaited<ReturnType<typeof listExpenses>>["rows"] = [];
  for (let offset = 0; offset < 5000; offset += EXPENSES_PAGE) {
    const page = await listExpenses(companyId, { limit: EXPENSES_PAGE, offset });
    const got = page.rows ?? [];
    all.push(...got);
    if (got.length < EXPENSES_PAGE) break;
  }
  return all;
}
function TransactionRegister({ tab, companyId, loadsById, settlementsByLoad, navigate }: { tab: CostTab; companyId: string; loadsById: Map<string, string>; settlementsByLoad: Map<string, BoardRow>; navigate: (path: string) => void }) {
  const coaRoles = useQuery({ queryKey: ["load-costs-board", "coa-roles", companyId], queryFn: () => listCoaRoles(companyId), enabled: Boolean(companyId) && tab === "fuel_advances" });
  const q = useQuery({
    queryKey: ["load-costs-board", "register", tab, companyId, coaRoles.data],
    enabled: Boolean(companyId) && tab !== "costs" && (tab !== "fuel_advances" || coaRoles.isFetched),
    retry: false,
    queryFn: async (): Promise<RegisterRow[]> => {
      if (tab === "bills") {
        const res = await listBills(companyId, { limit: REGISTER_LIMIT });
        return (res.rows ?? []).filter(b => b.status !== "voided").map(b => {
          const parsed = parseExpenseMemo(b.memo, b.bill_number ?? null);
          return { receiptEntity: "bill" as const, id: b.id, number: b.display_id ?? "—", date: b.bill_date, party: b.vendor_name ?? "Vendor not set", loadNumber: null, loadId: null,
            detail: parsed.description ?? b.memo ?? "Bill · owed", address: parsed.address, receiptNumber: b.bill_number ?? parsed.receiptNumber, settlementNumber: parsed.settlementNumber,
            amountCents: Number(b.amount_cents), status: b.status === "paid" ? "Paid" : "Owed" };
        });
      }
      if (tab === "driver_pay") {
        // FIX (LCB-REG, live-measured): listDriverBills() returns { driver_bills }, not { rows } —
        // the prior read of res.rows was always undefined, so this register was silently always
        // empty regardless of how many real driver bills existed.
        const res = await listDriverBills(companyId, { limit: REGISTER_LIMIT });
        return (res.driver_bills ?? []).filter(d => d.voided_at == null).map(d => ({
          id: d.id, number: d.bill_number ?? d.load_number ?? "—", date: d.created_at,
          party: d.driver_name ?? "Driver", loadNumber: d.load_number, loadId: d.load_id,
          // ACCT-F26140 (CC-2, 2026-09-11): settled_in_settlement_id is the dead column (0/many
          // populated company-wide, same root cause the rest of the sweep fixed) -- the backend's
          // driver-bills-list.routes.ts already resolves the real, settlement_lines-backed
          // settlement_id alongside settlement_display_id; use that instead.
          settlementNumber: d.settlement_display_id, settlementId: d.settlement_id, detail: "Driver pay", amountCents: Number(d.gross_amount_cents ?? 0), status: d.status,
          loadedMiles: d.miles_basis == null ? null : String(d.miles_basis), loadedRateCents: d.rate_per_mile_cents == null ? null : String(d.rate_per_mile_cents),
          emptyMiles: d.miles_deadhead == null ? null : String(d.miles_deadhead), emptyRateCents: d.rate_empty_per_mile_cents == null ? null : String(d.rate_empty_per_mile_cents),
          grossCents: d.gross_amount_cents ?? undefined,
        }));
      }
      if (tab === "fuel_advances") {
        // LCB-REG (owner 2026-09-05): fuel advances are TWO real transaction kinds, merged and
        // labelled which is which — a cash advance the driver draws down at a truck stop, and a
        // company fuel expense (driver_id set, category = the company_fuel_advance_expense CoA
        // role, per LoadDetailCostsTab.tsx's own fuel-advance write path) posted directly.
        const [advancesRes, expenseRowsAll] = await Promise.all([
          listCashAdvances(companyId, {}) as Promise<{ advances?: Array<Record<string, unknown>> }>,
          listAllExpenses(companyId),
        ]);
        const expensesRes = { rows: expenseRowsAll };
        const cashRows: RegisterRow[] = (advancesRes.advances ?? []).filter(a => a.purpose === "fuel_deposit").map(a => ({ id: String(a.id), number: String(a.display_id ?? a.reference ?? "—"), date: (a.disbursed_at ?? a.created_at ?? null) as string | null, party: String(a.driver_name ?? a.recipient_name ?? "Driver"), loadNumber: (a.load_number ?? null) as string | null, loadId: (a.load_id ?? null) as string | null, detail: "Fuel cash advance", amountCents: Number(a.amount_cents ?? a.amount ?? 0), status: String(a.status ?? "—") }));
        const fuelRole = (coaRoles.data?.rows ?? []).find(role => role.role === "company_fuel_advance_expense" && role.is_active && role.account_number);
        const expenseRows: RegisterRow[] = fuelRole
          ? (expensesRes.rows ?? [])
              .filter(x => x.status !== "void" && x.driver_uuid != null && x.category_account_number === fuelRole.account_number)
              .map(x => ({ receiptEntity: "expense" as const, id: x.id, number: x.expense_number ?? "—", date: x.transaction_date, party: [x.driver_first_name, x.driver_last_name].filter(Boolean).join(" ") || "Driver", loadNumber: x.load_number, loadId: x.load_id, detail: "Company fuel expense", amountCents: Number(x.total_amount_cents), status: x.status === "posted" ? "Posted" : x.status === "active" ? "Recorded" : x.status === "draft" ? "Draft" : x.status }))
          : [];
        return [...cashRows, ...expenseRows];
      }
      if (tab === "broker_advances") {
        const res = await listBrokerAdvances(companyId);
        return (res.rows ?? [])
          .filter((a: BrokerAdvanceRow) => !a.voided_at)
          .map((a: BrokerAdvanceRow) => ({
            id: a.id, number: a.instrument_reference, date: a.received_at, party: "—",
            loadNumber: loadsById.get(a.load_id) ?? null, loadId: a.load_id,
            detail: `${a.category} advance`, amountCents: Number(a.amount_cents), status: a.applied_to_invoice_id ? "Applied" : "Not applied",
            category: a.category, instrument: a.instrument_type, instrumentReference: a.instrument_reference,
            appliedStatus: a.applied_to_invoice_id ? "Applied" : "Not applied",
          }));
      }
      if (tab === "documents") {
        const res = await apiRequest<{ rows: Array<Record<string, unknown>> }>(
          `/api/v1/accounting/load-costs-board/documents?operating_company_id=${encodeURIComponent(companyId)}`
        );
        return (res.rows ?? []).map(d => ({
          id: String(d.id), number: "—", date: (d.date ?? null) as string | null, party: "—",
          loadNumber: loadsById.get(String(d.load_id)) ?? null, loadId: d.load_id == null ? null : String(d.load_id),
          detail: String(d.type ?? "Document"), amountCents: 0, status: "",
          docType: String(d.type ?? "Document"), filename: String(d.filename ?? "—"),
          sizeBytes: d.size_bytes == null ? null : Number(d.size_bytes),
          docSource: d.source === "documents.attachments" ? "documents.attachments" : "docs.files",
          attachmentEntityType: d.entity_type === "expense" || d.entity_type === "bill" ? d.entity_type : undefined,
          attachmentEntityId: d.entity_id == null ? undefined : String(d.entity_id),
        }));
      }
      // expenses + repairs_maintenance both read from expenses; R&M narrows to work-order-linked lines.
      // REG-400 (owner 2026-09-06 04:5xZ "THE EXPENSES … DO NOT SHOW"): GET /api/v1/expenses caps limit at 200
      // (expenses.routes.ts z.max(200)); the register asked for 500 → HTTP 400 → the table said "No expenses
      // transactions found" over 207 real entries. Page through the API at its own cap until exhausted.
      const rows = (await listAllExpenses(companyId)).filter(x => x.status !== "void");
      const filtered = tab === "repairs_maintenance" ? rows.filter(x => x.linked_work_order_uuid != null) : rows;
      return filtered.map(x => {
        // REG-PARSE-DATA (ROUND 11): merchant_address/source_settlement_ref are the durable,
        // backfilled columns — read them (+ the now-cleaned line_description/vendor_document_number)
        // FIRST. parseExpenseMemo only runs as a fallback for a row the backfill never touched
        // (merchant_address AND source_settlement_ref both null — pre-backfill shape, or a real,
        // non-seed expense that never had a composite memo to begin with).
        const structured = x.merchant_address != null || x.source_settlement_ref != null;
        const parsed = structured ? null : parseExpenseMemo(x.line_description ?? x.memo, x.vendor_document_number ?? null);
        return { receiptEntity: "expense" as const, id: x.id, number: x.expense_number ?? "—", date: x.transaction_date, party: x.vendor_name ?? ([x.driver_first_name, x.driver_last_name].filter(Boolean).join(" ") || "Vendor not set"), loadNumber: x.load_number, loadId: x.load_id,
          detail: tab === "repairs_maintenance" && x.work_order_display_id ? `Work order ${x.work_order_display_id}` : (structured ? (x.line_description ?? "Expense") : (parsed!.description ?? x.line_description ?? x.memo ?? "Expense")),
          address: structured ? (x.merchant_address ?? null) : parsed!.address,
          receiptNumber: structured ? (x.vendor_document_number ?? null) : parsed!.receiptNumber,
          settlementNumber: structured ? (x.source_settlement_ref ?? null) : parsed!.settlementNumber,
          amountCents: Number(x.total_amount_cents), status: x.status === "posted" ? "Posted" : x.status === "active" ? "Recorded" : x.status === "draft" ? "Draft" : x.status };
      });
    },
  });
  const rows = q.data ?? [];
  const goToLoad = (r: RegisterRow) => { if (r.loadId) navigate(`/accounting/load-costs/${r.loadId}?tab=Costs`); };
  // A failed fetch must never render as "No … transactions found" (LAW: empty is a question, not an answer).
  if (q.isError) return <div data-testid="load-costs-register-error"><ListErrorState title={`Couldn't load ${tab.replaceAll("_", " ")}`} status={(q.error as { status?: number })?.status ?? 0} message={q.error instanceof Error ? q.error.message : String(q.error)} onRetry={() => void q.refetch()} /></div>;
  const baseColumns =
    tab === "driver_pay" ? DRIVER_PAY_COLUMNS
    : tab === "broker_advances" ? BROKER_ADVANCE_COLUMNS(loadsById)
    : tab === "documents" ? DOCUMENT_COLUMNS(companyId, loadsById)
    : tab === "expenses" || tab === "bills" || tab === "repairs_maintenance" ? [...REGISTER_COLUMNS, receiptColumn(companyId)]
    : REGISTER_COLUMNS;
  const canonicalSettlement = (row: RegisterRow) => {
    const load = row.loadId ? settlementsByLoad.get(row.loadId) : undefined;
    return row.settlementId ? { id: row.settlementId, number: row.settlementNumber } : { id: load?.settlement_id, number: load?.settlement_display_id };
  };
  const columns: ParityColumn<RegisterRow>[] = [...baseColumns.filter(col => !(tab === "driver_pay" && col.key === "settlement_number")), {
    key: "canonical_settlement", label: "Settlement/Tour", testId: "reg-col-settlement", sortable: true, alwaysVisible: true,
    sortValue: row => canonicalSettlement(row).number ?? "",
    render: row => { const settlement = canonicalSettlement(row); return settlement.id ? <EntityLink kind="settlement" id={settlement.id} label={settlement.number ?? "Settlement"} /> : DASH; },
  }];
  // DSP-TBL (owner ruling 2026-09-05): footerCells replaces the raw colSpan=5 footer — the
  // "Totals (N)" label now lives in the leftmost column's cell, the money total stays keyed to
  // its own column so it never drifts if a column is reordered/hidden.
  const footerCells =
    tab === "driver_pay" ? {
      number: (visibleRows: RegisterRow[]) => <span className="font-semibold uppercase tracking-[0.4px] text-gray-600" style={{ fontSize: 11 }} data-testid="reg-totals-label">Totals ({visibleRows.length})</span>,
      gross: (visibleRows: RegisterRow[]) => <span className="text-gray-900" data-testid="reg-totals-amount">{fmt(visibleRows.reduce((n, r) => n + (r.grossCents ?? 0), 0))}</span>,
    }
    : tab === "broker_advances" ? {
      date: (visibleRows: RegisterRow[]) => <span className="font-semibold uppercase tracking-[0.4px] text-gray-600" style={{ fontSize: 11 }} data-testid="reg-totals-label">Totals ({visibleRows.length})</span>,
      amount: (visibleRows: RegisterRow[]) => <span className="text-gray-900" data-testid="reg-totals-amount">{fmt(visibleRows.reduce((n, r) => n + r.amountCents, 0))}</span>,
    }
    : tab === "documents" ? {
      date: (visibleRows: RegisterRow[]) => <span className="font-semibold uppercase tracking-[0.4px] text-gray-600" style={{ fontSize: 11 }} data-testid="reg-totals-label">Totals ({visibleRows.length})</span>,
    }
    : {
      number: (visibleRows: RegisterRow[]) => <span className="font-semibold uppercase tracking-[0.4px] text-gray-600" style={{ fontSize: 11 }} data-testid="reg-totals-label">Totals ({visibleRows.length})</span>,
      amount: (visibleRows: RegisterRow[]) => <span className="text-gray-900" data-testid="reg-totals-amount">{fmt(visibleRows.reduce((n, r) => n + r.amountCents, 0))}</span>,
    };
  return <div data-testid="load-costs-register"><ParityTable
    columns={columns}
    rows={rows}
    rowKey={r => r.id}
    loading={q.isLoading || (tab === "fuel_advances" && coaRoles.isLoading)}
    emptyText={`No ${tab.replaceAll("_", " ")} transactions found.`}
    storageKey={`load-costs-register-${tab}`}
    exportFilename={`load-costs-${tab}`}
    tableTestId={`load-costs-register-${tab}`}
    enableColumnReorder
    enableColumnResize
    onRowClick={tab === "driver_pay" || tab === "broker_advances" ? goToLoad : undefined}
    footerCells={footerCells}
  /></div>;
}

// ── LDT-TABS: tour registers (Pre-Settlement = open tours · Settlement = closed tours). One row per tour; the
// expanded row is the SAME TourPreSettlementTab / TourSettlementTab (legs · costs · Ready to close? · Close tour →
// Settlement (human confirms) | driver + company settlement, frozen) keyed by settlement — one read model.

// ROUND 16.1 — the Legs cell (TourLegsCell) + header tooltip live in components/dispatch/TourLegsCell
// so this register and the /settlements Tours register render identical leg pills. Column caps
// (min 240 / max 420 on Legs; 96px dates; nowrap money) below keep any one column off the whole screen.
function TourRegister({ state, companyId, onCount }: { state: "open" | "closed"; companyId: string; onCount: (n: number | null) => void }) {
  const q = useQuery({ queryKey: ["load-costs-board", "tours", state, companyId], queryFn: () => listTours(companyId, state), enabled: Boolean(companyId) });
  // DISPATCH-ONE-ROW-PER-LOAD (owner 2026-09-11): the register is ONE ROW PER LOAD — flattened off the
  // same /tours read model (components/dispatch/TourLoadRows). The tab count stays the TOUR count.
  const rows = useMemo(() => flattenTourRows(q.data?.rows ?? []), [q.data]);
  useEffect(() => { onCount(q.data ? q.data.count : null); }, [q.data, onCount]);
  if (q.isError) return <ListErrorState status={0} message={q.error instanceof Error ? q.error.message : String(q.error)} onRetry={() => void q.refetch()} />;
  return <div data-testid={`load-costs-tours-${state}`} data-surface="load-detail"><ParityTable
    columns={TOUR_LOAD_COLUMNS(state)}
    rows={rows}
    rowKey={r => r.row_key}
    loading={q.isLoading}
    emptyText={state === "open" ? "No open tours — a tour opens when a driver is assigned to a load." : "No closed tours yet — close a tour from the Pre-Settlement tab."}
    storageKey={`load-costs-tours-${state}-v2`}
    exportFilename={`load-costs-tours-${state}`}
    tableTestId={`load-costs-tours-table-${state}`}
    enableColumnReorder
    enableColumnResize
    expandMode="single"
    expandOnRowClick
    renderExpanded={r => <div className="p-3" data-testid={`tour-expand-${state}`}>{state === "open" ? <TourPreSettlementTab settlementId={r.settlement_id} operatingCompanyId={companyId} /> : <TourSettlementTab settlementId={r.settlement_id} operatingCompanyId={companyId} />}</div>}
    footerCells={tourLoadFooter(state)}
  /></div>;
}

export function LoadCostsBoardPage() {
  const navigate = useNavigate(); const { selectedCompanyId } = useCompanyContext(); const companyId = selectedCompanyId ?? "";
  const { pushToast } = useToast();
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
  // STATUS-DROPDOWN SWEEP (owner 2026-09-10, verbatim: "the button like quickbooks has drop down
  // everywhere to change status wherever necessary") -- this board's own Status column only ever
  // rendered a derived on-time/late performance pill (serviceStatus()), never a change control, so
  // an operator scanning Load Costs had to leave the board to change a load's real lifecycle status.
  // Reuses the SAME money-aware writer (api/loads.ts updateLoadStatus) InlineStatusPicker already
  // calls on the Dispatch List/Table view -- no second status-write path.
  const queryClientForStatus = useQueryClient();
  const [statusPendingIds, setStatusPendingIds] = useState<Set<string>>(new Set());
  const handleBoardStatusChange = useCallback(
    async (row: BoardRow, next: LoadStatus) => {
      if (next === row.status) return;
      setStatusPendingIds((current) => new Set(current).add(row.load_id));
      try {
        await updateLoadStatus(row.load_id, { new_status: next }, companyId);
        pushToast(`Load ${row.load_number} → ${STATUS_LABEL[next] ?? next}`, "success");
        await queryClientForStatus.invalidateQueries({ queryKey: ["accounting", "load-costs-board"] });
      } catch (error) {
        pushToast(userFacingApiError(error, "Failed to change load status"), "error");
      } finally {
        setStatusPendingIds((current) => {
          const nextSet = new Set(current);
          nextSet.delete(row.load_id);
          return nextSet;
        });
      }
    },
    [companyId, pushToast, queryClientForStatus]
  );
  // LOAD-COSTS-RETURN-COLS (owner 2026-09-08): Days Since Delivery / Return Booked reuse the SAME
  // computed data Dispatch Home's "Units Needing Return" / round-trip pairing already produce --
  // never a second copy of the hours-since-delivery math or the NB/TR/SB pairing logic.
  const unitsWithoutLoadQuery = useQuery({
    queryKey: ["load-costs-board", "units-without-load", companyId],
    queryFn: () => listUnitsWithoutLoad(companyId),
    enabled: Boolean(companyId),
  });
  // Company-wide load set (unbounded, all statuses) purely to run pairOutboundReturn per unit --
  // the SAME pairing engine RoundTrips.tsx uses, reused rather than reimplemented so this column
  // and the Dispatch Round Trips board can never disagree about whether a unit's return is booked.
  const allLoadsForPairingQuery = useQuery({
    queryKey: ["load-costs-board", "all-loads-for-return-pairing", companyId],
    queryFn: () => listAllLoads({ operating_company_id: [companyId] }),
    enabled: Boolean(companyId),
    staleTime: 60_000,
  });
  /** unit_number -> whether that unit's most recent outbound leg is still active with no return leg
   * booked yet (pairOutboundReturn + NEEDS_RETURN_STATUSES, byte-identical to RoundTrips.tsx). */
  const returnBookedByUnit = useMemo(() => {
    const map = new Map<string, boolean>();
    const allLoads = allLoadsForPairingQuery.data?.loads ?? [];
    const byUnit = new Map<string, DispatchLoadRow[]>();
    for (const load of allLoads) {
      const unitNumber = load.assigned_unit_number;
      if (!unitNumber) continue;
      const list = byUnit.get(unitNumber) ?? [];
      list.push(load);
      byUnit.set(unitNumber, list);
    }
    for (const [unitNumber, unitLoads] of byUnit) {
      const { outbound, returnLoad } = pairOutboundReturn(unitLoads);
      const needsReturn = Boolean(outbound && !returnLoad && NEEDS_RETURN_STATUSES.has(outbound.status));
      // "Return Booked" is the inverse of "needs a return" -- No only while a real outbound leg is
      // still active with nothing booked back; otherwise (no active outbound, or a return already
      // exists) there's nothing exposed to ask about, so leave it unset (renders "—", not a false "Yes").
      if (outbound && NEEDS_RETURN_STATUSES.has(outbound.status)) map.set(unitNumber, !needsReturn);
    }
    return map;
  }, [allLoadsForPairingQuery.data]);
  /** unit_number -> days since that unit's LAST completed delivery, only while the unit is
   * currently idle (no active load) -- listUnitsWithoutLoad already scopes to exactly that state,
   * so this never claims a days-since-delivery figure for a unit that's back out on a new load. */
  const daysSinceDeliveryByUnit = useMemo(() => {
    const map = new Map<string, number>();
    for (const u of unitsWithoutLoadQuery.data?.units ?? []) {
      if (u.hours_since_last_delivery == null) continue;
      map.set(u.unit_number, Math.floor(u.hours_since_last_delivery / 24));
    }
    return map;
  }, [unitsWithoutLoadQuery.data]);
  // LCB-REG — Broker advances/Documents registers aren't filtered by the board's status pills (an
  // advance or a document on a load that's since closed is still real); they resolve a load's
  // display number from the FULL unfiltered board, not `visible`.
  const settlementsByLoad = useMemo(() => new Map(rows.map(r => [r.load_id, r])), [rows]);
  const loadsById = useMemo(() => new Map(rows.map(r => [r.load_id, r.load_number])), [rows]);
  const statusFiltered = useMemo(() => rows.filter(r => matches(r, filter)), [rows, filter]);
  const activeTab = COST_TABS.find(t => t.id === costTab) ?? COST_TABS[0];
  const visible = useMemo(() => (costTab === "resettlement" ? rows : statusFiltered).filter(r => activeTab.has(r)), [rows, statusFiltered, activeTab, costTab]);
  /** LOAD-COSTS-RETURN-COLS-FIX (live-verified 2026-09-09): the original version of this map keyed
   * off `rows` (unfiltered) matched against `r.load_id` from the actually-DISPLAYED `visible` row --
   * but the load whose delivery made a unit idle is exactly the load NEW-09 correctly hides once
   * invoiced (isClosed()), so it never appears in `visible` under ANY open filter tab. Live-checked
   * on prod: 6/6 of today's real "Units Needing Return" cases (T163/170/173/148/175/174) already
   * have their triggering load invoiced -- Days Since Delivery rendered a dash on every row, on
   * every tab, for 100% of the feature's real live cases; a full-column reference file dump confirmed
   * it. Fix: pick the badge carrier from the rows the operator can actually SEE (`visible`) instead of
   * requiring an exact match to a row that structurally can never be visible once its load is closed
   * -- the unit's newest visible row (e.g. its next booking) is a legitimate, useful place to surface
   * "this truck has been idle N days", and is exactly where a dispatcher scanning this board would
   * look for it. Still only one row per unit gets the value (the most recent by pickup/delivery date
   * among the rows currently on screen), so an older visible row for the same unit still renders a dash. */
  const latestVisibleRowIdByUnit = useMemo(() => {
    const map = new Map<string, { loadId: string; at: number }>();
    for (const r of visible) {
      if (!r.unit_number) continue;
      // A freshly-booked load (T163/13533 live-caught this: PU date not yet set, obviously no
      // delivery date either) has neither actual_delivery_at nor pickup_date -- falling through to
      // Date.parse("") = NaN silently dropped the row from this map entirely, so the idle unit's
      // ONLY visible row never got picked as a badge carrier. created_at always exists and is
      // exactly the tiebreak this board already uses elsewhere (see `matches()`'s this_week filter).
      const at = Date.parse(r.actual_delivery_at ?? r.pickup_date ?? r.created_at);
      if (Number.isNaN(at)) continue;
      const current = map.get(r.unit_number);
      if (!current || at > current.at) map.set(r.unit_number, { loadId: r.load_id, at });
    }
    return map;
  }, [visible]);
  const [tourCounts, setTourCounts] = useState<{ open: number | null; closed: number | null }>({ open: null, closed: null });
  const onOpenCount = useCallback((n: number | null) => setTourCounts(c => (c.open === n ? c : { ...c, open: n })), []);
  const onClosedCount = useCallback((n: number | null) => setTourCounts(c => (c.closed === n ? c : { ...c, closed: n })), []);
  const tabCount = (t: typeof COST_TABS[number]) => (t.id === "pre_settlement" ? tourCounts.open : t.id === "settlement" ? tourCounts.closed : t.id === "resettlement" ? rows.filter(t.has).length : t.measured ? statusFiltered.filter(t.has).length : null);
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
    { key: "load", label: "Load Number", testId: "col-load", sortable: true, alwaysVisible: true, sortValue: r => r.load_number, render: r => <Link className="font-semibold text-slate-700 underline" to={`/accounting/load-costs/${r.load_id}?tab=Costs`}>{r.load_number}</Link> },
    // LOAD-COSTS-RETURN-COLS (owner 2026-09-08, item 3): "Unassigned" is a distinct, real state
    // (no unit ever booked to this load) -- a plain "—" reads as "not measured", the same dash
    // every other untracked cell on this board already uses. Named so an operator scanning the
    // column can tell "nothing to show" apart from "nobody's driving this yet".
    { key: "unit", label: "Unit", testId: "col-unit", sortable: true, className: "whitespace-nowrap", sortValue: r => r.unit_number ?? "", render: r => r.unit_number ?? "Unassigned" },
    { key: "driver_name", label: "Driver", testId: "col-driver-name", sortable: true, className: "whitespace-nowrap", sortValue: r => r.driver_name ?? "", render: r => r.driver_name ?? "Not assigned" },
    { key: "pu_date", label: "PU Date", testId: "col-pu-date", sortable: true, className: "whitespace-nowrap", sortValue: r => r.pickup_date ?? "", render: r => r.pickup_date ? formatDateUS(r.pickup_date) : "—" },
    { key: "del_date", label: "Del Date", testId: "col-del-date", sortable: true, className: "whitespace-nowrap", sortValue: r => r.actual_delivery_at ?? "", render: r => r.actual_delivery_at ? formatDateUS(r.actual_delivery_at) : "—" },
    {
      key: "status",
      label: "Status",
      testId: "col-status",
      sortable: true,
      className: "whitespace-nowrap",
      sortValue: r => serviceStatus(r).label,
      render: r => {
        const s = serviceStatus(r);
        return (
          <div className="flex items-center gap-1">
            <span className="inline-block rounded-[9px] border px-2 py-px font-bold uppercase tracking-[0.3px]" style={{ ...chip(s.style), fontSize: 10 }}>{s.label}</span>
            {/* STATUS-DROPDOWN SWEEP (owner 2026-09-10) -- the pill above stays (on-time/late
                delivery performance, a different signal from lifecycle status); this adds the
                QuickBooks-style change control alongside it, never replacing it. */}
            <InlineStatusPicker
              loadId={r.load_id}
              status={r.status as LoadStatus}
              pending={statusPendingIds.has(r.load_id)}
              onSelect={next => void handleBoardStatusChange(r, next)}
            />
          </div>
        );
      },
    },
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
    { key: "margin", label: "Margin", testId: "col-margin", sortable: true, className: NUM, defaultHidden: true, sortValue: r => rowMargin(r), render: r => fmt(rowMargin(r)) },
    { key: "margin_pct", label: "Margin %", testId: "col-margin-pct", sortable: true, className: NUM, defaultHidden: true, sortValue: r => Number(r.revenue_cents) ? rowMargin(r) / Number(r.revenue_cents) : -Infinity, render: r => Number(r.revenue_cents) ? `${(rowMargin(r) / Number(r.revenue_cents) * 100).toFixed(1)}%` : "—" },
    // NEW-08 (owner raw findings 2026-09-07): "every load leaving Laredo must be assigned a
    // settlement number the moment it's created -- Load Costs needs a Settlement # column." The
    // assignment already happens at booking (SET-01/SET-02); this surfaces it. Was kept opt-in/
    // defaultHidden like Margin until REG-009 (owner, live, 2026-09-10): "the column exists but is
    // hidden by default -- set it visible by default." Shipped concurrently by Cursor
    // (alwaysVisible -- stronger than just flipping the default, since it can never be re-hidden
    // via the gear picker either) while this same fix was in flight here; keeping Cursor's version
    // on merge rather than shipping a duplicate/weaker one.
    { key: "settlement", label: "Settlement/Tour", testId: "col-settlement", sortable: true, className: "whitespace-nowrap", alwaysVisible: true, sortValue: r => r.settlement_display_id ?? "", render: r => r.settlement_id ? <Link className="font-semibold text-slate-700 underline" to={`/driver-finance/settlements?settlement_id=${r.settlement_id}`}>{r.settlement_display_id}</Link> : "—" },
    // LOAD-COSTS-RETURN-COLS (owner 2026-09-08): same source as Dispatch Home's "Units Needing
    // Return" tile (listUnitsWithoutLoad's own hours_since_last_delivery) -- never a second copy of
    // that math. Only the LATEST delivered row for a currently-idle unit gets a value; an older
    // load for the same now-idle unit renders a dash (it isn't what's making the truck idle today).
    // defaultHidden like Margin/Settlement # -- spec 09-04-2026 locks the exact 19-column default
    // set (Rule 07 additive-only), so a net-new column joins opt-in, never forced into the default view.
    {
      key: "days_since_delivery", label: "Days Since Delivery", testId: "col-days-since-delivery",
      sortable: true, className: NUM, defaultHidden: true,
      sortValue: r => {
        const latest = r.unit_number ? latestVisibleRowIdByUnit.get(r.unit_number) : undefined;
        if (!latest || latest.loadId !== r.load_id) return -1;
        return r.unit_number ? daysSinceDeliveryByUnit.get(r.unit_number) ?? -1 : -1;
      },
      render: r => {
        const latest = r.unit_number ? latestVisibleRowIdByUnit.get(r.unit_number) : undefined;
        if (!latest || latest.loadId !== r.load_id) return DASH;
        const days = r.unit_number ? daysSinceDeliveryByUnit.get(r.unit_number) : undefined;
        return days == null ? DASH : `${days}d`;
      },
    },
    // "Return Booked" — reuses roundTripsLegs.ts's pairOutboundReturn + NEEDS_RETURN_STATUSES
    // (the SAME functions RoundTrips.tsx uses) so this can never drift from what Dispatch's own
    // Round Trips board says about the same unit.
    {
      key: "return_booked", label: "Return Booked", testId: "col-return-booked",
      sortable: true, className: "whitespace-nowrap text-center", defaultHidden: true,
      sortValue: r => {
        const v = r.unit_number ? returnBookedByUnit.get(r.unit_number) : undefined;
        return v == null ? -1 : v ? 1 : 0;
      },
      render: r => {
        const v = r.unit_number ? returnBookedByUnit.get(r.unit_number) : undefined;
        if (v == null) return DASH;
        return v ? "Yes" : "No";
      },
    },
  ];
  if (costTab === "resettlement") {
    // These are the original load's first pickup and actual final delivery, never tour/creation dates.
    for (const column of columns) {
      if (column.key === "pu_date") { column.label = "Start Date"; column.alwaysVisible = true; }
      if (column.key === "del_date") { column.label = "Delivery Date"; column.alwaysVisible = true; }
    }
  }
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
  return <main className="space-y-4" data-surface="load-detail" style={{ background: "var(--ldt-paper)", padding: 12 }} data-testid="load-costs-shell"><button type="button" data-testid="load-costs-back" className="text-xs font-semibold text-slate-700" onClick={() => { if (hasInAppHistory(window.history.state)) { navigate(-1); return; } navigate("/dispatch"); }}>← Back</button><header data-testid="load-costs-title"><h1 className="font-semibold text-[#0F1219]" style={{ fontSize: 22 }}>Load costs</h1><p className="text-xs text-[#6B7280]">Live loads, recorded costs, and approximate margin. This board reads; it never posts.</p></header>{query.isError ? <ListErrorState title="Could not load the costs board." status={(query.error as { status?: number })?.status ?? 0} onRetry={() => void query.refetch()} /> : null}<section className="overflow-hidden rounded border border-[#E5E7EB] bg-white"><div data-testid="load-costs-topbar" className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3"><h2 className="font-semibold" style={{ fontSize: 22 }}>Costs</h2><div className="flex flex-wrap items-center gap-2"><div className="flex gap-1">{/* DESIGN-CONTRACT chips: radius 2px, height 22px, border 1px --line2; ACTIVE = #14314F white
    (the contract's own active-chip value -- distinct from the header row, which stays light ink). */}
{(["in_motion", "delivered_open", "all_open", "this_week"] as const).map(id => <button key={id} data-testid={`load-costs-pill-${id}`} type="button" onClick={() => setFilter(id)} className={`ldt-btn ${filter === id ? "p" : "g"} capitalize`} style={{ height: 22 }}>{id.replaceAll("_", " ")}</button>)}</div><label className="flex items-center gap-1.5 text-xs text-[#4B5563]"><input data-testid="load-costs-show-voided" type="checkbox" checked={showVoided} onChange={e => setShowVoided(e.target.checked)} />Show voided</label></div></div><div data-testid="load-costs-tabs" className="flex flex-wrap gap-1 border-b border-[#E5E7EB] px-4 py-2">{COST_TABS.map(t => { const c = tabCount(t); return <button key={t.id} type="button" data-testid={`load-costs-tab-${t.id}`} aria-selected={costTab === t.id} onClick={() => setCostTab(t.id)} className={`ldt-btn ${costTab === t.id ? "p" : "g"}`}>{t.label}<span className={`inline-flex min-w-[16px] items-center justify-center rounded-sm px-1 ${costTab === t.id ? "bg-white/20 text-white" : "bg-gray-100 text-[#6B7280]"}`} style={{ fontSize: 10 }}>{c == null || c === 0 ? "—" : c}</span></button>; })}</div>{!activeTab.measured && activeTab.id !== "pre_settlement" && activeTab.id !== "settlement" ? <p data-testid="load-costs-tab-note" className="px-4 pb-2 pt-1 text-xs text-[#6B7280]">Open a load to see its {activeTab.label.toLowerCase()} — this total is not yet aggregated on the board.</p> : null}<div className="grid grid-cols-2 gap-2 p-2 sm:grid-cols-3 lg:grid-cols-6" data-note="KPI-TILE-SIZE LAW 2026-09-04: gap-2 + padding replaces border-b, matching Safety's own KPI-row grid (was over the 101px ceiling with no gap)"><DrillKpiCard testId="kpi-loads-in-motion" label="Loads in motion" value={rows.filter(r => matches(r, "in_motion")).length} hint={`${visible.length} rows`} onClick={() => setFilter("in_motion")} /><DrillKpiCard testId="kpi-revenue-booked" label="Revenue booked" value={fmt(revenue)} hint={`${visible.length} loads`} onClick={() => setFilter(filter)} /><DrillKpiCard testId="kpi-costs-recorded" label="Costs recorded" value={fmt(costs)} hint={`${visible.reduce((n, r) => n + r.expense_count + r.bill_count, 0)} entries`} onClick={() => setFilter(filter)} /><DrillKpiCard testId="kpi-driver-pay" label="Driver pay accruing" value={fmt(driver)} hint={`${visible.length} loads`} onClick={() => setFilter(filter)} /><DrillKpiCard testId="kpi-approx-margin" label="Approximate margin" value={revenue ? `${(margin / revenue * 100).toFixed(1)}%` : "—"} hint={fmt(margin)} onClick={() => setFilter(filter)} /><DrillKpiCard testId="kpi-bank-unmatched" label="Bank items unmatched" value={query.data?.unmatched_bank_count ?? 0} hint="Open bank items" to="/banking/transactions" /></div>{costTab === "pre_settlement" ? <TourRegister state="open" companyId={companyId} onCount={onOpenCount} /> : costTab === "settlement" ? <TourRegister state="closed" companyId={companyId} onCount={onClosedCount} /> : costTab !== "costs" && costTab !== "resettlement" ? <TransactionRegister tab={costTab} companyId={companyId} loadsById={loadsById} settlementsByLoad={settlementsByLoad} navigate={navigate} /> : <div><ParityTable columns={columns} rows={visible} rowKey={r => r.load_id} loading={query.isLoading} emptyText="No loads found for this company." storageKey="load-costs-board-v3" enableColumnReorder enableColumnResize renderExpanded={r => <ExpandPanel row={r} companyId={companyId} />} expandMode="single"
    expandOnRowClick suppressToolbarRange exportFilename="load-costs" tableTestId="accounting-load-costs-board" sortKey={sortKey} sortDirection={sortDirection} onSortChange={(key, direction) => { setSortKey(key); setSortDirection(direction); }} sortMode="external" columnGroups={COLUMN_GROUPS} headerBg="#EEF2F6" headerInk="#1F2937" minWidthPx={1660} columnLayout="auto" footerCells={{
              // DSP-TBL (owner ruling 2026-09-05): footerCells replaces the raw colSpan=6 footer
              // — every total now stays keyed to its own column, so reordering/hiding a column
              // (enableColumnReorder is on for this board) can never desync a total from the
              // wrong number again. `totals` is unchanged — it already aggregates over `visible`,
              // the same rows passed as `rows={visible}` above.
              load: <span className="font-semibold uppercase tracking-[0.4px] text-gray-600" style={{ fontSize: 11 }} data-testid="load-costs-totals-label">Totals ({visible.length} loads)</span>,
              revenue: <span className="text-gray-900" data-testid="load-costs-totals-revenue">{fmt(totals.revenue)}</span>,
              late_fee: <span className="text-gray-900" data-testid="load-costs-totals-late-fee">{fmtDash(totals.late_fee)}</span>,
              lumper: <span className="text-gray-900" data-testid="load-costs-totals-lumper">{fmtDash(totals.lumper)}</span>,
              fuel: <span className="text-gray-900" data-testid="load-costs-totals-fuel">{fmtDash(totals.fuel)}</span>,
              // Other IS the honest remainder -- foots by construction: Late Fee+Lumper+Fuel+R&M+Other
              // summed across these visible rows equals total costs summed across the same rows.
              repairs_maintenance: <span className="text-gray-900" data-testid="load-costs-totals-rm">{fmtDash(totals.rm)}</span>,
              other: <span className="text-gray-900" data-testid="load-costs-totals-other">{fmtDash(totals.other)}</span>,
              loaded_pay: <span className="text-gray-900" data-testid="load-costs-totals-loaded-pay">{fmt(totals.loaded_pay)}</span>,
              deadhead_pay: <span className="text-gray-900" data-testid="load-costs-totals-deadhead-pay">{fmt(totals.deadhead_pay)}</span>,
              gross: <span className="font-bold text-gray-900" data-testid="load-costs-totals-gross">{fmt(totals.gross)}</span>,
            }} /></div>}</section></main>;
}
