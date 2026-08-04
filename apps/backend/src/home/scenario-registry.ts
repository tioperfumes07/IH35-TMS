/**
 * HOMEPAGE LIVE SCENARIO TRACKER §4.1 — the static REGISTRY.
 *
 * This file holds the IDENTITY of each hop/scenario and nothing else: key, title, lane, the JE text,
 * the spec reference, and which live sources it depends on. Identity does not go stale, so it may
 * live in code.
 *
 * NO STATUS LIVES HERE. That is the entire point of the rewrite: the old board read
 * docs/audit/program-scoreboard.json — a committed snapshot generated once by parsing a markdown
 * ledger — so it kept showing green long after the truth moved. Every dot is computed by a live
 * predicate at request time (see ./probes/), never read from a file or from this array.
 */

export type ScenarioLane = "screens" | "money" | "audit";

export type ScenarioDefinition = {
  /** Stable key, also the audit.scenario_status.scenario_key. */
  key: string;
  title: string;
  lane: ScenarioLane;
  /** What starts this hop in the real world. */
  trigger: string;
  /** The journal entry (or "—" when the hop posts nothing). */
  je: string;
  /** Spec/card reference so a dot can be traced back to its requirement. */
  spec_ref: string;
  /** Canonical prod relations this hop's predicate reads — surfaced as source_health. */
  sources: string[];
};

/**
 * The 9-hop walking skeleton, in the order a real load travels it. Book → deliver read
 * mdata.loads: confirmed canonical (docs/trackers/FINAL-TABLES-WIRING-FOR-CODER labels it
 * "(canonical)", dispatch.loads does not exist on prod, and 73 FKs point at mdata.loads).
 */
export const SCENARIO_REGISTRY: ScenarioDefinition[] = [
  {
    key: "hop.book",
    title: "Book the load",
    lane: "screens",
    trigger: "Dispatcher books a load with a customer and a rate",
    je: "— (proforma invoice is a non-posting projection)",
    spec_ref: "WIRE-01",
    sources: ["mdata.loads", "accounting.invoices"],
  },
  {
    key: "hop.assign",
    title: "Assign driver / unit",
    lane: "money",
    trigger: "Driver and unit assigned to the booked load",
    je: "— (driver bill is a payable artifact, not a posting)",
    spec_ref: "WIRE-02 / ACCT-F63",
    sources: ["driver_finance.driver_pay_rates", "driver_finance.driver_bills"],
  },
  {
    key: "hop.dispatch",
    title: "Dispatch → in transit",
    lane: "screens",
    trigger: "Load status moves to in-transit",
    je: "—",
    spec_ref: "WIRE-06",
    sources: ["mdata.loads"],
  },
  {
    key: "hop.deliver",
    title: "Deliver",
    lane: "screens",
    trigger: "Final active delivery stop departs",
    je: "—",
    spec_ref: "WIRE-07",
    sources: ["mdata.load_stops"],
  },
  {
    key: "hop.evidence",
    title: "POD + BOL evidence",
    lane: "screens",
    trigger: "Driver captures POD / BOL",
    je: "—",
    spec_ref: "WIRE-03 / WIRE-09",
    sources: ["mdata.loads"],
  },
  {
    key: "hop.revenue",
    title: "Revenue recognition latch",
    lane: "money",
    trigger: "Delivery evidence exists and the entity flag is ON",
    je: "DR Unbilled Revenue / CR Line-Haul Income",
    spec_ref: "WIRE-05",
    sources: ["lib.feature_flag_overrides", "accounting.journal_entries"],
  },
  {
    key: "hop.invoice",
    title: "Invoice + evidence gate",
    lane: "money",
    trigger: "POD received; proforma converts and sends",
    je: "DR A/R / CR Unbilled Revenue",
    spec_ref: "WIRE-04 / ACCT-F61",
    sources: ["accounting.invoices", "audit.audit_events"],
  },
  {
    key: "hop.gl",
    title: "GL / JE balanced",
    lane: "money",
    trigger: "Postings land in the ledger",
    je: "Balanced double entry (DR = CR)",
    spec_ref: "WIRE-08",
    sources: ["accounting.journal_entries"],
  },
  {
    key: "hop.bank",
    title: "Bank path",
    lane: "money",
    trigger: "Customer payment matched and categorized",
    je: "DR Cash / CR A/R",
    spec_ref: "WIRE-10",
    sources: ["banking.bank_transactions"],
  },
];

export const SCENARIO_KEYS = SCENARIO_REGISTRY.map((s) => s.key);

/** Every distinct source across the registry — the source_health probe set. */
export const ALL_SOURCES: string[] = Array.from(
  new Set(SCENARIO_REGISTRY.flatMap((s) => s.sources))
).sort();
