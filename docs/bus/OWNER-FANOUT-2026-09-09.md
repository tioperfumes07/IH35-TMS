# OWNER FAN-OUT — defect register 2026-09-09 (REG-034…REG-055)

Source: owner live message 2026-09-09 ~22:58Z (Cursor lead intake) + the Claude-coder BNK/FAC/SET
pending-items reconciliation the owner pasted the same night. Every row is a verbatim owner issue,
given a stable REG id, a seat owner, and the measured/target/guard/deadline shape the VERDICT FORMAT
LAW requires. **Cursor is lead: this register is the single source; INBOX-<SEAT> points here.**

Standing constraints for every row: USMCA only (`5c854333-6ea5-4faa-af31-67cb272fef80`); verify LIVE
(Neon bypass_rls=lucia + Chrome on app.ih35dispatch.com), never from memory; void-never-delete; **no
seat rewrites production data without an explicit owner go** (this register was opened because the
owner believes data was changed without permission — see REG-034); each fix is a vertical slice with a
guard + live proof; fast-merge law.

Seat map for this fan-out (owner live 2026-09-09): **CC-2 is on MAINTENANCE bugs/discrepancies right
now** — do not route Banking to CC-2 until it clears; Banking rows below sit with Cursor/CC-1 in the
interim. CC-1 = money/GL/factoring/settlement math. CC-3 = dispatch/settlement/fleet UI. Cursor =
frontend lane + lead coordination.

---

## REG-034 — DATA INTEGRITY: `USMCA-APD-*` trailers relabeled to real numbers + duplicates retired  ·  DONE (Cursor, live 2026-09-10)
**RESOLVED — owner authorized "REG-034 TO THEIR REAL NUMBERS" 2026-09-10.** Applied live on Neon USMCA:
18 VIN-matched APD trailers relabeled to real numbers (equipment+asset), 12 duplicate vin=NULL dry_van
rows retired (void-not-delete). Post-state: 2 APD left (APD-25/28, no CSV map — owner confirm), 12 dups
retired. Record + proof: `docs/reconcile/REG-034-APD-TRAILER-RELABEL-2026-09-10.md`. OPEN: confirm
APD-25→10870? and APD-28→FB-56710? (VINs differ by 1 char — not guessed). Original detail below.


- **MEASURED (Neon, bypass_rls=lucia, USMCA):** `mdata.equipment` holds 20 rows `USMCA-APD-16..35`
  (created 2026-08-31, all with VIN, Reefer/Flatbed, `is_sample_data=false`) AND separate real-number
  rows `10202/10209/10218/10222/10224/10380/10870/10876…` (created 2026-09-05/07, `vin=NULL`). The
  owner's `docs/reconcile/AT-TMS-TRAILERS-2026-09-01.csv` maps them by VIN (APD-19=10202, APD-16=10209,
  APD-17=10218, APD-22=10113, APD-24=10380, APD-33=10222, APD-18=10224, APD-31=10876…).
- **PROVENANCE (not Cursor, not tampering):** the `USMCA-APD` labels came from the owner's SIGNED
  Lloyd's APD quote 437539, loaded 2026-08-31 by Claude's GO-01 migration
  `202613320000_go01_usmca_insurance_acv_trailers_drivers.sql` (PR #19315), whose own comment states
  the label is an intake placeholder, NOT an owner trailer number, and that it must never synthesize or
  overwrite the real number. Nothing was deleted/renamed; every row `is_sample_data=false`.
- **TARGET:** de-duplicate — stamp the REAL owner trailer number (from the reconcile CSV, matched by
  VIN) onto the APD asset/equipment + insurance policy_unit, collapse the duplicate `10xxx` (vin=NULL)
  row into it, and make Fleet show the real number. Owner-entered/authorized data write only.
- **GUARD:** a verify-step asserting zero `USMCA-APD-*` labels remain visible in the Fleet trailer list
  once reconciled, and no two equipment rows share a VIN.
- **BLOCKER / OWNER GO REQUIRED:** relabeling live trailer data is exactly the unauthorized-change
  class the owner flagged — Cursor will NOT write until the owner approves the VIN→number map. Map is
  ready to paste from the CSV.

## REG-035 — Banking: account REORDER UI missing (transactions view, bank-accounts list)  ·  CC-2 (after Maintenance) / Cursor interim
- **MEASURED:** `banking.bank_accounts.display_order` column EXISTS; the transactions screen's account
  list offers no drag/reorder control to put one account ahead of another.
- **TARGET:** wire a reorder control that persists `display_order`; account list + register honor it.
- **GUARD:** verify-step asserting the reorder mutation writes `display_order` and the list reads it.

## REG-036 — Banking: running balance wrong (received $100 on 12/08/25 shows −$13,062.53, oldest→newest)  ·  CC-1 / Cursor interim (CC-2 owns after Maintenance)
- **MEASURED (owner, live):** ordered oldest→newest, the 12/08/2025 +$100 received row shows a running
  balance of −$13,062.53. USMCA opening balance is $0 (standing law) so an oldest-first +$100 cannot be
  negative — the running-balance accumulation/opening-balance basis is wrong.
- **TARGET:** running balance = opening $0 + Σ(txn signed amount) in true chronological order; re-measure
  the first-row balance == the first txn amount.
- **GUARD:** verify-step on the running-balance builder (oldest-first cumulative, $0 open).

## REG-037 — Load board: List→(List/Table/Assignment) shows booked-not-in-transit loads; a truck appears twice with two loads  ·  CC-3 / Cursor
- **MEASURED (owner, live):** the List sub-views show booked loads not yet in transit, and the same
  truck renders twice carrying two loads.
- **TARGET:** each truck shows only its real CURRENT load (active dispatch); booked-not-in-transit are
  filtered from the "current" view (own view/toggle if needed). No unit duplicated.
- **GUARD:** verify-step asserting one current-load row per active unit.

## REG-038 — Round Trips: no "Book a return" for NB units; Timeline missing units with loads in range; Dispatch-home KPIs not real  ·  CC-3
- **MEASURED (owner, live):** round-trip board view is fine, but NB-flagged units have no "Book a
  return" action; Timeline (calendar Aug 25→present) omits units that have current/future/past loads in
  that window; Dispatch-home KPIs are not real numbers.
- **TARGET:** "Book a return" action on NB units; Timeline renders every unit with a load in range;
  Dispatch-home KPIs computed from live data.
- **GUARD:** verify-step on the timeline unit set (all units with a load in [start,end]) + KPI live source.

## REG-039 — Load Costs: columns — Unit # (sortable ↑/↓), units-need-return, days-since-last-delivery, unassigned-units each own column; define "roundtrip exposure"; each KPI its own clean columns (unit · driver · load)  ·  CC-3 / Cursor
- **MEASURED (owner, live):** Load Costs lacks a sortable Unit # column; "units need return",
  "days since last delivery", "unassigned units" are not their own columns; "roundtrip exposure" is
  unexplained; KPIs are not laid out as clean per-column (unit/driver/load).
- **TARGET + GUARD:** add the columns (Unit # sortable asc/desc); one datum per column; document
  "roundtrip exposure"; guard asserts the column set + sortability.

## REG-040 — Settlement assignment at creation + Load Costs settlement column; already-invoiced loads belong in re-settlement  ·  CC-1 + CC-3
- **MEASURED (owner, live):** loads leaving Laredo are not assigned a (pre)settlement the moment they're
  created; Load Costs has no settlement-number column; an already-invoiced unit (e.g. 13566/Mecor)
  still shows in pre-settlement instead of re-settlement; 13577 not auto-assigned the same settlement.
- **TARGET:** every Laredo-departing load auto-linked to a (pre)settlement at creation (owner: this is
  the re-settlement seed); Load Costs shows the settlement number column; invoiced loads move to
  re-settlement; sibling loads auto-share the settlement.
- **GUARD:** verify-step: new NB load ⇒ presettlement link exists at create; Load Costs row carries the
  settlement display id.
- **STATUS UPDATE (CC-1, 2026-09-10, live-verified, Neon `br-fancy-credit-akjnd07a`):** three of the
  four measured symptoms do not reproduce on current live data — most of this item is already built:
  1. **Settlement assignment at creation — DONE, already shipped (REG-008 this session).**
     `linkLoadToPresettlementAtBookingInClientTx` is wired into `book-load.service.ts`'s create
     transaction (gated on driver+trip_type present at booking); a deferred case is picked up by
     `linkLoadToPresettlementAfterAssignmentInClientTx`, wired into all 4 post-booking assignment
     paths. Confirmed live: **both** 13566 and 13577 carry a non-null `presettlement_link_id`.
  2. **"13577 not auto-assigned the same settlement" — does not reproduce.** Traced both tours live:
     13566's tour (`00918f46-…`, 8 loads: 13471/13480/13565/13566/13492/13499/13503/13509) all share
     settlement `6cd53f62-…`; 13577's tour (`4e78cfed-…`, 13569+13577) all share settlement
     `68bfd169-…`. Every load in each tour has the correct shared settlement — sibling auto-share is
     working. (13566 and 13577 are NOT siblings of each other — different tours/drivers — so they
     were never expected to share one settlement with each other.)
  3. **"13566/Mecor shows in pre-settlement instead of re-settlement" — does not reproduce.** Live:
     13566's settlement `trip_closed_at = 2026-09-06T07:56:00Z` (closed), `driver_settlements.status
     = 'closed'`, and it has a real sent invoice (`accounting.invoices.status='sent'`,
     `source_load_id` = 13566). The Pre-Settlement tab's own query
     (`pre-settlement.routes.ts`) filters `trip_closed_at IS NULL` — a closed tour cannot appear
     there today. Whatever the owner saw, it isn't reproducible against current state (most likely
     the tour closed in the ordinary course between the observation and now).
  4. **Load Costs settlement-number column — already exists, just hidden by default.**
     `LoadCostsBoardPage.tsx` has a real `Settlement #` column (`col-settlement`,
     `r.settlement_display_id`, links to the settlement) wired to `load-costs-board.routes.ts`'s
     `settlement_info` CTE — shipped in the 09-04-2026 locked 19-column default spec as
     `defaultHidden: true` (opt-in via the column gear, not in the default view). If the ask is "show
     it by default," that is a one-line CC-3 flip + needs owner sign-off (it's outside the locked
     default set), not new backend build.
  - **REMAINING — genuine, needs an OWNER DECISION, not a guess (per §0):** there is **no
    "re-settlement" concept anywhere in the codebase** (grep: zero matches outside this doc's own
    prose). Today a load only has two states — open tour (Pre-Settlement) or closed tour
    (Settlement) — with **no link at all between invoice status and tour-close state**: an invoice
    can be sent while a tour is still open, and nothing currently reacts to that. Two live options,
    neither built without an owner ruling on what "re-settlement" should mean: **(a)** a new distinct
    bucket/flag that an invoiced-but-still-open tour routes into (a third state alongside
    open/closed), or **(b)** treat "invoiced" as an implicit auto-close trigger for the tour (changes
    `trip_closed_at`'s existing meaning as a separate human-confirmed act — SET-01 spec). CC-1 will
    build whichever the owner picks; not building either blind. Item stays OPEN on this one point.

## REG-041 — Re-settlement: show date-started + delivery-date of the ORIGINAL load that created it; fix incorrect pre-settlement data; margin & % must be SEPARATE columns  ·  CC-3 / Cursor
- **MEASURED (owner, live):** re-settlement/pre-settlement omits the originating load's start+delivery
  dates; some pre-settlement figures are wrong; margin and margin-% are crammed into one column.
- **TARGET + GUARD:** originating-load start/delivery dates shown; margin and % are their own columns;
  guard asserts separate columns + the dates render.  (Partly started: REG-033(b) added tour dates.)

## REG-042 — Settlement tab (Driver + Company) must render EXACTLY like the Downloads PDFs; kill the current layout  ·  CC-3 + Cursor (NEEDS the reference PDF)
- **OWNER:** "Show them exactly as they render in the company settlement and driver settlement PDF from
  ['always'/Alvys] in my downloads folder … do not give me this current shit." Add more data if needed.
- **BLOCKER:** need the exact PDF file(s) from the owner's Downloads to transcribe the layout. Cursor to
  request/locate the PDF, then build the driver + company settlement views to match 1:1.

## REG-043 — Load-scoped selection outline: selecting a load anywhere (costs, re-settlement, settlement) must clearly outline THIS load/tour ONLY + only its related/soon-to-be expenses  ·  Cursor / CC-3
- **TARGET + GUARD:** selection highlights only the current load/tour and its expenses; guard asserts
  scoping (no cross-load expense attribution surface).

## REG-044 — SYSTEMIC: each datum its OWN column — no compound single-column values ("Load × Rate", "margin/%") ANYWHERE  ·  Cursor lead + all seats
- **OWNER (hardline):** "HOW THE FUCK ARE YOU GOING TO HAVE LOAD X RATE IN ONE SINGLE COLUMN … throughout
  the entire app." Applies to load costs, pre-settlement, settlement, factoring, lists.
- **TARGET + GUARD:** a ratchet-style guard that flags compound multi-datum cells in register/table
  components; drive the count to zero across the app.

## REG-045 — SYSTEMIC: each load renders ONLY its own data — a load view is NOT a history/other-load/whole-tour view  ·  Cursor / CC-3 (DESIGN TENSION — owner decision on tour model)
- **MEASURED (owner, live, load 13568):** its pre-settlement rendered 11 tour legs (NB 13517/13558/
  13522/13541, TR 13495/13496/13528/13536, SB 13518/13568…) — "it should ONLY be rendering for that
  current load and current presettlement." Opening 13558 from there shows unrelated data (expense
  mis-attribution risk).
- **DESIGN TENSION (flag, don't guess):** a driver "tour" legitimately aggregates several loads for one
  settlement — showing only one load may break the settlement's own basis. **Owner decision needed:**
  either (a) the load view shows ONLY the current load's numbers with the tour as a collapsed reference,
  or (b) keep the tour but make the current load unmistakably the only editable/expensable scope. Cursor
  to propose (a)/(b) with a mock, not rip out the tour unilaterally.

## REG-046 — Factoring: build the report pages — Accounts Summary (QBO filters), Invoices-for-period detail, Aging, Chargebacks & Overpayments, Payment-to-You report, Purchase report  ·  CC-1 + Cursor
## REG-047 — Factoring UI proportions: KPI boxes + factor-company profile out of proportion (auto-adjust); customer/load boxes too large + misaligned; filter range + gear on the SAME row as customer/load boxes  ·  Cursor
## REG-048 — Factoring columns/data: default columns = factoring data (original invoice → advance → reserve → fees → chargeback/fee history) + settlement number; profit/trip-expenses NOT default (gear-optional); name the table + what it shows (invoiced date, settlement, delivery date, awaiting-purchase state)  ·  CC-1 + Cursor
## REG-049 — Factoring chargebacks/fee-history & statements: stop the split-screen with monthly summaries (own tab/window, or summaries ABOVE); statements/settings summary-vs-detailed toggle; QBO filters (date etc.) on ALL; Faro daily import detailed/summary + range; balances differ — reconcile. INSPECT ALL FACTORING.  ·  CC-1 + Cursor
- **OWNER:** factoring windows must default to factoring data (reserve/fees/advance), not driver-pay/margin
  which "has nothing to do with factoring"; settlement numbers are missing; balances are different.

## REG-050 — Reefer LUMPER control  ·  CC-3 + CC-1
- **OWNER:** for reefer loads the app must ALWAYS: ask if there is a lumper and who pays
  (broker/customer/us) — confirm with a click; confirm the lumper receipt was sent; if the customer
  pays, flag it for invoicing so we don't lose control of lumpers; if the driver is late, ask whether a
  penalty applies. Confirm lumper receipts everywhere possible.
- **GUARD:** dispatching a reefer load surfaces the lumper prompt; a paid-by-customer lumper creates the
  invoice-charge intent.
- **STATUS UPDATE (CC-1, 2026-09-10, live-verified):** most of this item is already built and live,
  not new work:
  1. **"Ask who pays, confirm with a click" — DONE, live, unconditional.** `mdata.loads.lumper_payer`
     / `lumper_will_invoice_customer` / `lumper_late_penalty_applies` (migration
     `202614010000_loads_reefer_lumper_confirmation.sql`) captured at booking
     (`book-load.service.ts`); `loads.routes.ts` **blocks** a reefer load
     (`trailer_type='refrigerated_van'`) from dispatching until all three are set
     (`reefer_lumper_confirmation_required`). Guarded by
     `verify-reefer-lumper-confirmation-captured.mjs`.
  2. **"If customer pays, flag it for invoicing" (the invoice-charge intent) — DONE, live.**
     `from-load.ts` (~L380-450): when a `dispatch.stop_extra_rates` row is `rate_type='lumper'` AND
     `lumper_payer='customer'` AND `lumper_will_invoice_customer=true`, it creates the real customer
     invoice line via the existing `invoice-line-revenue-resolution.service.ts` `'lumper'` branch —
     no new GL math, reuses the existing poster. This is exactly the GUARD line's own "creates the
     invoice-charge intent."
  3. **"Confirm the lumper receipt was sent" + a second late-penalty ask, post-booking — DONE
     (Cursor #21… "no reach into CC-1's billing files"), but write-only.**
     `completion-prompts.routes.ts` asks (at dispatch/delivery time) whether receipts were sent,
     whether to invoice the customer, and whether a late penalty applies — answers land as
     `audit.audit_events` (`dispatch.lumper_receipts_sent`, `dispatch.lumper_customer_invoice_requested`,
     `dispatch.late_penalty_decision`). Nothing currently consumes these three events downstream.
  - **REMAINING — genuine, needs an OWNER DECISION before CC-1 builds it, not a guess (per §0):**
    turning `dispatch.late_penalty_decision` (penalty=true) into an actual driver settlement
    deduction is real, bounded, backend-only CC-1 work (the exact template already exists —
    `safety/fines.routes.ts`'s `convert-to-liability` → `driver_finance.driver_liabilities` →
    settlement-deduction pipeline) — **except no penalty DOLLAR AMOUNT exists anywhere in the
    system.** Grepped for `penalty_amount`/`late_penalty_amount`: zero hits. The
    `completion-prompts.routes.ts` late-penalty endpoint only ever captures `penalty: boolean` +
    an optional note — never an amount. Posting a real financial deduction requires a real number;
    inventing one would be fabricating a financial figure. Two real options, either buildable once
    the owner picks: **(a)** a fixed/policy penalty amount (a financial/GL decision, could ship
    without touching CC-3's UI), or **(b)** a dispatcher-entered amount per incident (needs a new
    UI field — CC-3's surface, not backend-only). Item stays OPEN on this one point pending the
    owner's choice.
  - **Secondary note, not acted on:** a second, largely dormant lumper-billing mechanism exists
    (`apps/backend/src/cash-advances/lumper-*.ts`, gated `LUMPER_LIFECYCLE_ENABLED=false`,
    "HOLD-FOR-JORGE") sitting alongside the already-live path in item 2 above. Flagging the overlap
    rather than wiring it — building a second live customer-billing rail without owner
    clarification on which is canonical risks double-billing.

## REG-051 — Load detail: per-tab EDIT (not the full wizard)  ·  CC-3 / Cursor
- **OWNER:** each tab gets its own Edit — Stops edit only adds/removes stops; Costs edit only this load;
  Driver Pay edit adds/edits pay lines here (e.g. early-unload bonus). Not the whole Book/Edit wizard.

## REG-052 — Load detail: "Open driver bill" button not wired; "More ▾" button does nothing  ·  CC-3 / Cursor
- **MEASURED (owner, live):** both controls are dead.

## REG-053 — Fleet: unit PROFILE has no Edit button; Fleet-home Edit opens a huge pop-up → SIDE MODAL; profile page out of proportion → redesign clean/professional  ·  CC-3 / Cursor
- **NOTE:** PR #21604 (REG-025/026) claimed to fix Fleet edit; owner still sees no edit on the unit
  profile and an oversized editor — re-verify live and finish.

## REG-054 — Settlement number next to Load, auto on NB create, EVERYWHERE; still shows S-<load#> in places  ·  Cursor (in progress)
- Cursor #21635/#21636 (deployed cefe071ba0 03:38Z) put the number next to Load in the load drawer +
  added tour dates and killed "Tour Tour". Owner's message predates that deploy AND asks for it on ALL
  surfaces + auto-on-create. Re-verify on the new bundle; extend to every header/list that still shows
  S-<load#>.

## REG-055 — Load detail: "Add expense" vs "Record expense" duplicate  ·  DONE (Cursor #21630, live)
- Merged to one "Record expense"; full-page creator kept. Owner's message predates the deploy.

---

## Claude-coder pending reconciliation the owner pasted (fold in, route to seats)
BANKING still-open: **BNK-01** fuzzy/many-to-one fuel-card + vendor-alias matching (CC-1); **BNK-06**
Description column collapsed to 0px (Cursor); **BNK-10** 362 unposted txns / −$686,503.95 live proof
(CC-1); **BNK-12** no September reconciliation session live proof (CC-1/CC-2-after-maint); **BNK-17**
bank-fee-recovery role live proof (CC-1). Owner-decisions/data-only: BNK-14/15/18/20.
FACTORING still-open: **FAC-01** Factored column live proof; **FAC-02** assign FARO to 5 real
customers; **FAC-03** quarantine 11 test customers (unconfirmed by #21157); **FAC-09** 15 FactorView
tabs (big, untouched); **FAC-11** Factoring out of Dispatch subnav (BRD-22); **FAC-12** LDT-4 stage-bar
guard. → CC-1 + Cursor, tracked under REG-046…049.
CASH FLOW: **CF-02** proforma→cash-flow bucket live measure (doc self-contradicts; treat OPEN).
SETTLEMENTS still-open: **SET-07** button heights (Cursor); **SET-16** admin-fee typed-deduction
migration (CC-1); **SET-25** non-deferrable loan pop-up; **SET-28** vehicle-swap cost split (missing);
**SET-29** attribution rung-3 fixed-monthly-cost (CC-1); **SET-30** company settlement PDF (→ REG-042);
partial: **SET-01** editable lines, **SET-17** other_recovery live proof, **SET-33** PAID chain
re-measure; **SET-31** blocked on SET-01.

---

## Cursor lane this wave (in order)
1. REG-054 re-verify on cefe071ba0 + extend settlement-number to any remaining S-<load#> surfaces.
2. REG-052 (More ▾ + Open-driver-bill dead buttons) — small, live-provable.
3. REG-044 compound-column guard + first offenders (pre-settlement/settlement/load-costs).
4. REG-047 factoring UI proportions.
5. REG-053 Fleet unit-profile edit + side-modal (verify #21604 first).
Owner-decision gates before Cursor writes: REG-034 (trailer relabel), REG-045 (tour vs per-load),
REG-042 (needs the PDF).
