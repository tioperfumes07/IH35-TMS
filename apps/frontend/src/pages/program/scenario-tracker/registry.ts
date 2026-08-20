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
    href: "/dispatch/book-load",
  },
  {
    order: 2,
    key: "hop.assign",
    title: "Assign driver & truck",
    lane: "money",
    doing: "Pay resolves as rate-per-mile × shortest miles (per-load flat alternate), never the customer rate.",
    je: "driver pay = rate_per_mile × miles_shortest (fails closed if no rate/miles)",
    spec_ref: "WIRE-02",
    href: "/dispatch",
  },
  {
    order: 3,
    key: "hop.dispatch",
    title: "Dispatch / in transit",
    lane: "screens",
    doing: 'The "Delivered" drag stamps actual_departure_at (the recognition evidence) instead of bypassing it.',
    spec_ref: "WIRE-07",
    href: "/dispatch",
  },
  {
    order: 4,
    key: "hop.deliver",
    title: "Deliver — record time",
    lane: "screens",
    doing: "Delivery flips the load to delivered_pending_docs and records the departure — the source event the revenue latch reads.",
    spec_ref: "delivery latch",
    href: "/dispatch",
  },
  {
    order: 5,
    key: "hop.pod_bol",
    title: "POD + BOL paperwork",
    lane: "screens",
    doing: "POD/BOL upload flips the load to completed_docs_received — the billing trigger for Event 2.",
    spec_ref: "POD billing readiness",
    href: "/dispatch",
  },
  {
    order: 6,
    key: "hop.revenue",
    title: "Earn the revenue",
    lane: "money",
    doing: "Event 1 fires at delivery (ASC 606). Driver-capture path must call the same poster.",
    je: "DR Unbilled Revenue / CR Line-Haul Income",
    spec_ref: "WIRE-05",
    href: "/accounting/invoices",
  },
  {
    order: 7,
    key: "hop.invoice",
    title: "Make the invoice",
    lane: "money",
    doing: "Event 2 fires at POD — the real invoice off the delivered load, accessorials each to their own account.",
    je: "DR Accounts Receivable / CR Unbilled Revenue",
    spec_ref: "A/R + accessorials",
    href: "/accounting/invoices",
  },
  {
    order: 8,
    key: "hop.gl",
    title: "Money in the books (GL)",
    lane: "money",
    doing: "Every hop's JE lands in the entity ledger, balanced, entity-scoped.",
    spec_ref: "parallel double-books",
    href: "/accounting/journal-entries",
  },
  {
    order: 9,
    key: "hop.bank",
    title: "Match the bank",
    lane: "money",
    doing: "Customer payment on the invoice, then reconcile against the bank feed.",
    je: "DR Cash / CR Accounts Receivable → RECON-01",
    spec_ref: "RECON-01",
    href: "/banking/transactions",
  },
];

export const SCENARIO_IDENTITY: Array<
  Omit<ScenarioTrackerItem, "stage" | "state"> & { kind: "money" | "ops" | "risk"; links?: string }
> = [
  { key: "scenario.customer", title: "New Customer", lane: "ops", kind: "ops", trigger: "create customer (universal picker/creator)", spec_ref: "QBO Lists parity" , links: "Canonical entity-scoped write; A/R-ready; links ⇄ loads, invoices, factoring. Relationship health live (LV-001 fixed, proven on prod).", href: "/customers" },
  { key: "scenario.driver_onboarding", title: "New Driver onboarding", lane: "ops", kind: "ops", trigger: "onboard driver", spec_ref: "MUST 3.13.1" , links: "One txn: driver + driver-vendor + W-8BEN + escrow ledger + pay_basis + Driver Receivable.", href: "/drivers" },
  { key: "scenario.coa", title: "Chart of Accounts", lane: "money", kind: "money", trigger: "CoA setup / edit", spec_ref: "accounting skill §6" , links: "Additive only (never delete/rename); roles bound (unbilled_revenue, ar_control, revenue_default) per entity.", href: "/lists/accounting/chart-of-accounts" },
  { key: "scenario.settlement", title: "Driver Settlement", lane: "money", kind: "money", trigger: "delivered loads in the period", je: "Header + pay lines + deductions + escrow = Net", spec_ref: "settlement blueprint" , links: "Gross (rate × shortest miles) − deductions + reimbursements = net; 5% floor; debt shown in red.", href: "/driver-finance/settlements" },
  { key: "scenario.advance", title: "Driver Advance / Loan", lane: "money", kind: "money", trigger: "cash advance to driver", je: "DR Driver Cash Advance / CR Cash", spec_ref: "accounting skill §4" , links: "Recovered through settlement, capped by the net-pay floor; links ⇄ driver, bill_payment.", href: "/drivers/cash-advances" },
  { key: "scenario.deductions", title: "Deductions", lane: "money", kind: "money", trigger: "fine / damage / advance payback", spec_ref: "settlement blueprint §1" , links: "Separate itemized ledger, running balance per obligation (not negative pay lines); driver acknowledgement required before settlement closes.", href: "/drivers/deductions" },
  { key: "scenario.escrow", title: "Escrow", lane: "money", kind: "money", trigger: "escrow deposit / separation payout", je: "DR Cash / CR Driver Escrow (LIABILITY)", spec_ref: "accounting skill §4" , links: "Held-in-trust sub-ledger, control = Σ per-driver balances; returned 60–90d post-separation.", href: "/banking/driver-escrow" },
  { key: "scenario.ap", title: "Expense / Bill / AP", lane: "money", kind: "money", trigger: "vendor bill or expense", je: "Bill: DR Expense / CR A/P · Pay: DR A/P / CR Cash", spec_ref: "standards parity §1" , links: "Per-line load/unit/driver cost tags; vendor is a real FK; A/P aging by vendor.", href: "/accounting/bills" },
  { key: "scenario.fuel", title: "Fuel", lane: "money", kind: "money", trigger: "fuel card txn (ComData / Relay)", spec_ref: "QBO parity §6 · IFTA" , links: "Chain: fuel card → driver → unit → IFTA (miles/gallons by state) → settlement; fuel expense FK to the load.", href: "/fuel" },
  { key: "scenario.maintenance", title: "Maintenance Work Order", lane: "ops", kind: "ops", trigger: "WO on a unit", je: "Parts + labor → Maint Expense + A/P", spec_ref: "test battery step 17" , links: "WO ⇄ unit ⇄ vendor ⇄ GL, both-way; parts ⇄ inventory.", href: "/maintenance/work-orders" },
  { key: "scenario.accident", title: "Full Accident chain", lane: "risk", kind: "risk", trigger: "accident / safety incident", spec_ref: "DIRE-ACCIDENT linkage" , links: "Depth: accident ⇄ driver ⇄ unit ⇄ trailer ⇄ load → claim ⇄ policy → at-fault: driver liability carries the full company-funded repair (driver acknowledgement required) → damage recovery is a contra-expense, never income.", href: "/safety" },
  { key: "scenario.insurance", title: "Insurance", lane: "risk", kind: "risk", trigger: "claim filed / insurer pays", je: "Deductible · recovery credits same expense", spec_ref: "test battery step 22" , links: "Claim ⇄ accident ⇄ policy ⇄ unit ⇄ driver.", href: "/safety/insurance" },
  { key: "scenario.legal", title: "Legal Matter + Civil Fine", lane: "risk", kind: "risk", trigger: "lawsuit or civil/safety fine", spec_ref: "civil_fines_expense" , links: "Legal stores documents/consents; Accounting posts (separation of duties). Fine ⇄ safety event.", href: "/legal/matters" },
  { key: "scenario.factoring", title: "Factoring", lane: "money", kind: "money", trigger: "factor an invoice (Faro → RTS)", je: "DR Cash + Fee/Reserve / CR Factoring Advance", spec_ref: "ASC 860 recourse" , links: "A/R stays on IH35 books as pledged collateral — no derecognition; secured borrowing, not a sale.", href: "/factoring" },
  { key: "scenario.banking", title: "Banking / Reconciliation", lane: "money", kind: "money", trigger: "bank feed + twice daily", spec_ref: "RECON-01" , links: "AM count/sum 06:00 CT, PM categorization diff 19:00 CT; every divergence flagged (no $ threshold); read-only.", href: "/banking/transactions" },
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
    href: identity.href,
  };
}
