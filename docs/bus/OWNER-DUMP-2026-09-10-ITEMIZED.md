# OWNER DUMP 2026-09-10 — ITEMIZED + NUMBERED + PENDING (Cursor lead)

Every distinct issue in the owner's 2026-09-10 message, numbered and mapped to the canonical register
`~/Downloads/09-09-2026-Claude-Lead-DEFECT-REGISTER.md` (REG-001..034). New items minted REG-035…REG-047.
Status reconciled LIVE against Neon (tiny-field-89581227 / br-fancy-credit-akjnd07a, bypass_rls=lucia,
USMCA 5c854333) + merged PR history. "REPEAT" = owner has said this before; it is still open.

LIVE GROUNDING THIS PASS (Neon, USMCA, is_sample_data IS NOT TRUE):
- Load status spread: closed 49 · invoiced 8 · dispatched 7 · delivered_pending_docs 7 · cancelled 3.
- Units with >1 active load (proves the "truck appears twice" complaint): **T152** (13531 delivered_pending_docs
  + 13575 dispatched), **T156** (13539+13578), **T171** (13517+13576), **T173** (13524+13540 both
  delivered_pending_docs). Real defect — REG-035.

═══════════════════════════════════════════════════════════════════════════════
DISPATCH — LOAD BOARD / LOAD COSTS / SETTLEMENTS
═══════════════════════════════════════════════════════════════════════════════

REG-035 (NEW · Cursor) — Dispatch List/Table shows a unit TWICE with two loads. Must show only the ONE
  true current in-transit load per unit; do NOT show a not-yet-in-transit booked load, nor a trailing
  delivered_pending_docs load, as a second "current" row. LIVE: 4 units double-shown (above). Owner
  verbatim: "how can a truck appear twice and have two loads, it should only be the real current load."
  Related to REG-019 (assigned/unassigned split, already merged #21589).

REG-036 (NEW · Cursor) — Round Trips: for units whose current leg is a NB (northbound), there is no
  "Book a Return" action. Every NB unit must expose Book-a-Return. Owner: "for those vehicles that have
  a nb there is no book a return for it."

REG-037 (NEW · Cursor) — Round Trips → Timeline view: not all units appear. Timeline must show every
  unit with a current, future, OR past load in the selected window; the calendar set Aug 25→present is
  not rendering loads dated in that window. Owner: "not all units appear… it does not show loads from
  those dates."

REG-038 (NEW · CC-1 owns Dispatch Home KPIs; Cursor assists layout) — Dispatch Home KPI tiles are not
  real numbers, and each KPI must break into its own clean columns: one column each for Unit, Driver,
  Load (as "Roundtrip Exposure" already does). "Units Need Return", "Days Since Last Delivery",
  "Unassigned Units" each need their own columns. Define/label what "Roundtrip Exposure" means on-screen.
  Owner: "The kpis in dispatch home are not real… each kpi must have its own columns and look clean."

REG-039 (NEW · Cursor) — Approximate Load Costs: add a Truck/Unit-number column and make it sortable
  ascending/descending (with the rest of the grid). Owner: "we also need to show the truck number and
  be able to organize in ascending or descending order."

REG-040 (NEW · CC-1 + Cursor) — Invoiced loads must LEAVE the active Load Costs board and appear under
  Resettlement once invoiced; a new NB load must auto-assign the SAME settlement as its tour. LIVE: 8
  loads are status=invoiced. Owner example: "unit like 168, Mecor, 1356 must have already been invoiced,
  so it should not really be here, it should be in resettlement and 13577 should already automatically
  be assigned that same settlement." Ties to REG-008 (presettlement auto-link) + REG-032.

REG-041 (NEW · Cursor/CC-3) — Resettlement rows must show the Start Date and Delivery Date of the
  ORIGINAL load that created the resettlement. Owner: "In resettlement we need to have the date started
  and delivery date, that shows one of the loads, the original load that created the resettlement."

REG-024 (REPEAT · Cursor · already open) — Driver Settlement + Company Settlement views (Dispatch >
  Load Costs > Settlement tab) must render EXACTLY like the AlwaysTrack company/driver settlement PDFs
  in ~/Downloads, plus add any additional significant data. Owner rejected the current views again:
  "do not give me this current shit." Binding source = docs/bus/settlement-entry-2026-09-04/
  cc-3-extracted/settlement-57xx.json + the Downloads PDFs.

REG-010/011 (REPEAT · CC-3 · RE-ESCALATE) — SYSTEMIC: the entire app still renders the settlement/tour
  as "S-"+load-number and puts multiple data (e.g. "load × rate") in ONE column. Each datum gets its
  OWN column, app-wide (Costs, Pre-Settlements, Settlements, Factoring, Bills). Owner: "EACH DATA GETS
  ITS OWN COLUMN… THROUGHOUT THE ENTIRE FUCKING APP." Root cause already found (two settlement-number
  schemes; presettlement-link.service uses the shared LOAD counter → S-<loadnum>). OWNER DECISION
  CONFIRMED live 2026-09-10: S-<loadnumber> is rejected — a settlement/tour is its own entity; move the
  live path to the real S-YYYY-NNNN sequence.

REG-023 (REPEAT · Cursor · already open) — Load detail page: (a) each TAB gets its own scoped Edit
  button (Stops edits stops only; Costs edits current load only; Driver Pay adds/edits here only) — NOT
  the whole Load Wizard; (b) "Open Driver Bill" button is unwired (no driver_bills/:id route exists);
  (c) "More" button does nothing; (d) a single load view must render ONLY that load's data, not NB/TR/SB
  legs of other loads. Owner: "each load renders data related to that load, this is not a history view."

REG-032 (REPEAT · Cursor · already open) — Load header must auto-show the Pre-Settlement/Settlement
  number next to the Load Number, assigned automatically the moment an NB load is created.

REG-033 (REPEAT · Cursor · already open) — "Add Expense" vs "Record Expense": clarify/consolidate the
  difference; presettlement chart inside a load must be scoped to the current load + its own settlement
  number + dates, not styled as a generic all-loads "Settlements" list.

═══════════════════════════════════════════════════════════════════════════════
FACTORING (owner: "you must inspect all factoring")
═══════════════════════════════════════════════════════════════════════════════

REG-015 (REPEAT · Devin A · already open) — Build the missing factoring pages/tabs: Account Summary,
  Aging, Chargebacks & Overpayments, "Payment To You" report, Purchase report (the 6 confirmed stubs:
  request_debtor_credit_check, debtor_receipts, loan_save, unapplied_cash, invoice_status_report,
  messages_support). Each wired to real data.

REG-042 (NEW · Devin A/CC-2 design) — Factoring proportions: KPI boxes + Factor Company Profile view
  are out of proportion (must auto-adjust like the rest of the app); Customer/Load boxes are too large,
  out of proportion and misaligned; the filter range box + gear must sit in the SAME ROW as the
  Customer/Load boxes. Owner: "the kiwi [KPI] boxes and the factoring company profile view are out of
  proportion."

REG-043 (NEW · Devin A) — Factoring DEFAULT columns must be factoring data (Original Invoice Amount →
  Advance → Reserve → Fees → chargeback/fee history), in EVERY factoring tab/window. Profit and Trip
  Expenses columns must be OFF by default (gear-add only). Chargebacks & Fee History currently shows
  fees/driver-pay/margin — remove; those don't belong to factoring. Settlement number is missing in
  factoring — add it. Owner: "in factoring… the default must be data related to factoring."

REG-044 (NEW · Devin A) — QuickBooks-style filters (date/period range) + a Summary-totals vs Detailed
  view toggle on ALL factoring tabs (Account Summary, Aging, Chargebacks/Overpayments, Payment-To-You,
  Purchase report, Statements & Settings, Faro Daily Import). Owner: "we are missing quickbooks filters,
  date, etc on all of them."

REG-045 (NEW · Devin A) — Chargebacks & Fee History must NOT be split-screen with Monthly Fee Summaries.
  Either give each its own tab/window, or put Monthly Fee Summaries ABOVE Chargebacks & Fee History.

REG-046 (NEW · Devin A) — Factoring invoice table semantics: label the table and state what it shows
  (are these invoices awaiting purchase?). Each invoice row must show: when invoiced, which settlement,
  delivery date, then Original Invoice Amount → Advance → Reserve → Fees. Owner: "what is the name of
  the table, what data is it supposed to be showing."

REG-047 (NEW · Devin A) — Faro Daily Import: add Detailed/Summary view + date range; balances differ
  from the other tabs and it is not fully wired — reconcile Faro import balances against the factoring
  summary. Owner: "in faro daily import… the balances are different… not fully wired."

═══════════════════════════════════════════════════════════════════════════════
REEFER / LUMPER (owner: never lose control of lumpers)
═══════════════════════════════════════════════════════════════════════════════

REG-024b (folded into REG-024 · Cursor) — Reefer loads: on dispatch the app must ASK if there is a
  lumper and WHO pays (broker / customer / us); click-to-confirm; if broker/customer pays, confirm and
  flag whether the customer will be invoiced for it; always confirm the lumper RECEIPT is sent. Late
  driver: the app must ask whether a penalty applies. (Guard already exists: verify-step 11109
  reefer-lumper-confirmation-captured — verify it covers the dispatch prompt, not just capture.)

═══════════════════════════════════════════════════════════════════════════════
BANKING
═══════════════════════════════════════════════════════════════════════════════

REG-027 (REPEAT · CC-2 · MERGED #21620) — Transactions view: reorder bank accounts (drag one ahead of
  another). Owner re-reported it today → CC-2 must confirm the merged reorder control is LIVE on the
  deployed bundle (deploy/visual proof), not just merged.

REG-028/030 (REPEAT · CC-2 · CLOSING) — Real balances: ordered oldest→newest, 12/08/25 shows a $100
  received next to a running balance of -$13,062.53 — owner says wrong. CC-2 claims the figure is
  mathematically correct against the real chain; Lead (and now Cursor) still need CC-2's exact
  running-balance query/output pasted before this closes. Owner re-reported it today → do NOT mark
  closed until the trace is pasted AND the corrected/explained balance is visible live.

═══════════════════════════════════════════════════════════════════════════════
FLEET (owner furious — repeat)
═══════════════════════════════════════════════════════════════════════════════

REG-025 (REPEAT · Codex/Cursor · DATA DONE, DEPLOY/VERIFY OPEN) — "USMCA-APD-*" trailers are not the
  owner's data; his trailers have real numbers. DATA FIXED live by Cursor #21647 (18 APD rows relabeled
  to real numbers by VIN, 12 dup rows retired). Owner still SEES the placeholders → this is now a
  FRONTEND DEPLOY + live-verify item (Cursor deploys FE), plus the 2 unresolved (APD-25/APD-28) need
  owner VIN confirm. NOTE for owner: the placeholders were loaded by the signed-insurance GO-01
  migration #19315, NOT changed by Cursor — nothing was deleted or renamed maliciously.

REG-026 (REPEAT · Codex · REOPEN) — Fleet: (a) clicking a unit → profile page has NO edit button;
  (b) Fleet Home's edit button opens a huge popup → must be a SIDE modal; (c) the unit profile page is
  out of proportion / takes the whole page → real redesign (edit control, box sizes, professional
  layout). Cascade previously reported this CLOSED, but owner re-reports it live today → REOPEN, Codex
  (Fleet owner) re-verifies on the deployed bundle and fixes what is actually still wrong.

═══════════════════════════════════════════════════════════════════════════════
CARRIED-FORWARD PENDING (Claude 09-06 reconciliation, still open — fold in)
═══════════════════════════════════════════════════════════════════════════════

BANKING still open: BNK-01 fuzzy fuel-card match (now REG-029, MERGED #21625 — confirm live), BNK-06
  Description column 0px, BNK-10 unposted transactions (figure was STALE — real ~287 / -$2,077.09, not
  362 / -$686,503.95; re-measure before acting), BNK-12 no September reconciliation session, BNK-17
  bank-fee-recovery role live proof. Owner-decision/data: BNK-14, BNK-15, BNK-18, BNK-20.
FACTORING still open: FAC-02 assign FARO to 5 real customers, FAC-03 quarantine 11 test customers
  (unconfirmed), FAC-09 (= REG-015 stubs), FAC-11 factoring out of Dispatch subnav, FAC-12 LDT-4 guard.
SETTLEMENTS still open/partial: SET-01 editable lines (partial), SET-07 button heights, SET-16 admin-fee
  typed deduction, SET-25 non-deferrable loan pop-up, SET-28 vehicle-swap cost split, SET-29 fixed-
  monthly-cost attribution (CC-1), SET-30 company settlement PDF (= REG-024), SET-17/33 live proof.

═══════════════════════════════════════════════════════════════════════════════
SEAT FAN-OUT (who fixes what)
═══════════════════════════════════════════════════════════════════════════════
- Cursor: REG-035, 036, 037, 039, 041(w/CC-3), 023, 024(+24b lumper/late), 032, 033, 007, 005; REG-025
  frontend deploy + live-verify; REG-018 kanban deploy.
- CC-1: REG-040 (invoiced→resettlement + auto-assign), REG-038 (Dispatch Home KPI real numbers),
  REG-008, REG-031, SET-29.
- CC-3: REG-010/011 (systemic S-YYYY-NNNN + one-datum-per-column), REG-009/016, REG-041 dates.
- CC-2: REG-027 deploy-verify, REG-028/030 paste running-balance trace, REG-021 legacy drawers,
  Maintenance audit (owner-assigned), BNK-06/10/12/17.
- Devin A: REG-015 (6 stubs) + REG-042/043/044/045/046/047 (all-factoring rebuild — this IS the "inspect
  all factoring" order; sequence stubs first, then filters/columns/proportion).
- Devin B: REG-002 vendor data-completeness, Lists/Reports sweep, PlannerGrid outside-range.
- Codex: REG-026 (Fleet edit/side-modal/redesign — REOPENED) + finish REG-025 trailer-identity guard
  (11177/#21626) + Maintenance.
- GPT (ChatGPT seat, /Users/jorgemunoz/IH35-TMS-cascade): REG-010/011 (owner #1) then REG-040/041/009.

═══════════════════════════════════════════════════════════════════════════════
NEW ROWS MINTED 2026-09-10 PM (measured live, Neon USMCA, bypass_rls=lucia)
═══════════════════════════════════════════════════════════════════════════════
- REG-035 [Cursor] DONE #21664 — a truck no longer appears twice on the Dispatch board; Table +
  Assignment views collapse to one CURRENT load per unit (currentLoadPerUnit). Guard
  verify-dispatch-table-view-distinct extended (REG-019/REG-035). LIVE was T152/T156/T171/T173 each 2 rows.
- REG-048 [Codex] — maintenance.work_orders USMCA = 17 rows; 13 have display_id containing PEND0 (V5 never
  finalized) and 2 have unit_id IS NULL (Rule 03 §WO violation). Wire refresh_wo_display_id to set V5 from
  first vendor/parts invoice + block null-unit WO creation (E_UNIT_HAS_NO_NUMBER). Guard + live proof.
- REG-049 [Codex] — Fleet unit profile "Maintenance History" tab must list that unit's WOs (forward+reverse
  linkage per Blueprint §9), each clickable to WO detail; WO detail back-links unit+load+vendor+GL.
- CASHFLOW-KPI [CC-1] — apps/frontend/src/pages/cash-flow/tabs/CashFlowKpiStrip.tsx:43 "Projected closing"
  renders a missing/failed value as a confident 0 (guard verify-no-dead-kpi-cards FAILS on main). Must be
  null → "—". (Also blocks clean pushes until fixed.)
- COMMS: docs/bus/COMMS-PROTOCOL-2026-09-10.md — all seats post ship/blocker deltas to OUTBOX-<SEAT>.md,
  read others' OUTBOX + STATUS-NOW before starting, file cross-lane defects to the register (don't fix).
