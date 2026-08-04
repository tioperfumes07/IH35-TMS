import type { ScenarioTrackerItem } from "./types";

/** Static identity only — never status (spec §4 / §8). Status comes from the live endpoint. */
export const HOP_IDENTITY: Array<Omit<ScenarioTrackerItem, "stage" | "state"> & { order: number }> = [
  {
    order: 1,
    key: "hop.book",
    title: "Book the load",
    lane: "screens",
    doing:
      "Book Load screen persists load + inline customer; booking auto-creates the proforma invoice via the single writer, with a loud audit row if a projection can't be sourced.",
    spec_ref: "WIRE-01",
  },
  {
    order: 2,
    key: "hop.assign",
    title: "Assign driver & truck",
    lane: "money",
    doing: "Pay resolves as rate-per-mile × shortest miles (per-load flat alternate), never the customer rate.",
    je: "driver pay = rate_per_mile × miles_shortest (fails closed if no rate/miles)",
    spec_ref: "WIRE-02",
  },
  {
    order: 3,
    key: "hop.dispatch",
    title: "Dispatch / in transit",
    lane: "screens",
    doing: 'The "Delivered" drag stamps actual_departure_at (the recognition evidence) instead of bypassing it.',
    spec_ref: "WIRE-07",
  },
  {
    order: 4,
    key: "hop.deliver",
    title: "Deliver — record time",
    lane: "screens",
    doing: "Delivery flips the load to delivered_pending_docs and records the departure — the source event the revenue latch reads.",
    spec_ref: "delivery latch",
  },
  {
    order: 5,
    key: "hop.pod_bol",
    title: "POD + BOL paperwork",
    lane: "screens",
    doing: "POD/BOL upload flips the load to completed_docs_received — the billing trigger for Event 2.",
    spec_ref: "POD billing readiness",
  },
  {
    order: 6,
    key: "hop.revenue",
    title: "Earn the revenue",
    lane: "money",
    doing: "Event 1 fires at delivery (ASC 606). Driver-capture path must call the same poster.",
    je: "DR Unbilled Revenue / CR Line-Haul Income",
    spec_ref: "WIRE-05",
  },
  {
    order: 7,
    key: "hop.invoice",
    title: "Make the invoice",
    lane: "money",
    doing: "Event 2 fires at POD — the real invoice off the delivered load, accessorials each to their own account.",
    je: "DR Accounts Receivable / CR Unbilled Revenue",
    spec_ref: "A/R + accessorials",
  },
  {
    order: 8,
    key: "hop.gl",
    title: "Money in the books (GL)",
    lane: "money",
    doing: "Every hop's JE lands in the entity ledger, balanced, entity-scoped.",
    spec_ref: "parallel double-books",
  },
  {
    order: 9,
    key: "hop.bank",
    title: "Match the bank",
    lane: "money",
    doing: "Customer payment on the invoice, then reconcile against the bank feed.",
    je: "DR Cash / CR Accounts Receivable → RECON-01",
    spec_ref: "RECON-01",
  },
];

export const SCENARIO_IDENTITY: Array<Omit<ScenarioTrackerItem, "stage" | "state"> & { kind: "money" | "ops" | "risk" }> = [
  { key: "scenario.customer", title: "New Customer", lane: "ops", kind: "ops", trigger: "create customer (universal picker/creator)", spec_ref: "QBO Lists parity" },
  { key: "scenario.driver_onboarding", title: "New Driver onboarding", lane: "ops", kind: "ops", trigger: "onboard driver", spec_ref: "MUST 3.13.1" },
  { key: "scenario.coa", title: "Chart of Accounts", lane: "money", kind: "money", trigger: "CoA setup / edit", spec_ref: "accounting skill §6" },
  { key: "scenario.settlement", title: "Driver Settlement", lane: "money", kind: "money", trigger: "delivered loads in the period", je: "Header + pay lines + deductions + escrow = Net", spec_ref: "settlement blueprint" },
  { key: "scenario.advance", title: "Driver Advance / Loan", lane: "money", kind: "money", trigger: "cash advance to driver", je: "DR Driver Cash Advance / CR Cash", spec_ref: "accounting skill §4" },
  { key: "scenario.deductions", title: "Deductions", lane: "money", kind: "money", trigger: "fine / damage / advance payback", spec_ref: "settlement blueprint §1" },
  { key: "scenario.escrow", title: "Escrow", lane: "money", kind: "money", trigger: "escrow deposit / separation payout", je: "DR Cash / CR Driver Escrow (LIABILITY)", spec_ref: "accounting skill §4" },
  { key: "scenario.ap", title: "Expense / Bill / AP", lane: "money", kind: "money", trigger: "vendor bill or expense", je: "Bill: DR Expense / CR A/P · Pay: DR A/P / CR Cash", spec_ref: "standards parity §1" },
  { key: "scenario.fuel", title: "Fuel", lane: "money", kind: "money", trigger: "fuel card txn (ComData / Relay)", spec_ref: "QBO parity §6 · IFTA" },
  { key: "scenario.maintenance", title: "Maintenance Work Order", lane: "ops", kind: "ops", trigger: "WO on a unit", je: "Parts + labor → Maint Expense + A/P", spec_ref: "test battery step 17" },
  { key: "scenario.accident", title: "Full Accident chain", lane: "risk", kind: "risk", trigger: "accident / safety incident", spec_ref: "DIRE-ACCIDENT linkage" },
  { key: "scenario.insurance", title: "Insurance", lane: "risk", kind: "risk", trigger: "claim filed / insurer pays", je: "Deductible · recovery credits same expense", spec_ref: "test battery step 22" },
  { key: "scenario.legal", title: "Legal Matter + Civil Fine", lane: "risk", kind: "risk", trigger: "lawsuit or civil/safety fine", spec_ref: "civil_fines_expense" },
  { key: "scenario.factoring", title: "Factoring", lane: "money", kind: "money", trigger: "factor an invoice (Faro → RTS)", je: "DR Cash + Fee/Reserve / CR Factoring Advance", spec_ref: "ASC 860 recourse" },
  { key: "scenario.banking", title: "Banking / Reconciliation", lane: "money", kind: "money", trigger: "bank feed + twice daily", spec_ref: "RECON-01" },
];

export function mergeLiveItem(
  identity: Omit<ScenarioTrackerItem, "stage" | "state">,
  live: ScenarioTrackerItem | undefined,
  stale: boolean,
): ScenarioTrackerItem {
  if (stale || !live) {
    return { ...identity, stage: "spec", state: "go" };
  }
  return {
    ...identity,
    ...live,
    title: live.title || identity.title,
    lane: live.lane || identity.lane,
    key: identity.key,
  };
}
