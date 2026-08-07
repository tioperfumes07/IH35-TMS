# LIVE TRANSACTION BATTERY — 2026-08-06 (CC-3, live-verifier lane)

**Owner of this file: CC-3.** Every row is a live verdict produced by running a real business event on the
RUNNING system — Neon prod branch `br-fancy-credit-akjnd07a` **and** the app in the browser — never from
code reading alone, never from memory.

**Entity discipline:** USMCA (`5c854333-6ea5-4faa-af31-67cb272fef80`) ONLY. TRANSP
(`91e0bf0a-…`) is the real QBO book and is NEVER written by this lane.

**Proof rules in force (§0):** a `0`/empty is not a verdict without the completeness discriminator on the
SAME table — `visible == n_live_tup`, `n_tup_ins`/`n_tup_del` read, and a positive control in the SAME
statement. Exit codes read WITHOUT a pipe. Done = live proof, not CI-green, not merged.

**Session context:** deployed SHA `e6343f4` == `origin/main` `e6343f4c1` (verified
`/api/v1/healthz/shallow`). Browser confirmed `Current: USMCA Freight` before any action.

---

## CLASS UNDER DRAIN: `CLS-MONEY-HOLD` (3 surfaces — settlement pay-run, factoring reserve, insurance claims)

### LV-TXN-001 — HOLD-001 settlement pay-run: NOT a broken pay-run. It has ZERO INPUT. — **BLOCKED (not a defect)**
- **surface:** `/driver-finance/settlements` + `/drivers/pre-settlements` (USMCA)
- **browser observed:** Settlements list `0 of 0`, "No settlements found". Pre-settlements
  "PRE-SETTLEMENTS · 0 DRIVERS — No pre-settlements ready right now", Total payout this batch **$0.00**.
  Driver KPI strip: ACTIVE 1/79, ON LOADS 1, SETTLE DUE 0, DRIVERS OWE $0.00, ESCROW $0.00.
- **neon-check (prod, bypass in-statement, `current_user` asserted):**
  `driver_finance.settlement_lines` — visible **0**, `n_live_tup` **0**, **`n_tup_ins` 0**, `n_tup_del` 0.
  `n_tup_ins = 0` is conclusive: **not one settlement line has ever existed**, so this is a true empty, not
  an RLS false-empty. Positive control in the SAME statement: `accounting.bills` **16,253** visible.
  Companion baseline (same discriminator): `driver_advances` 0/0/0, `escrow_ledger` 0/0/0,
  `accounting.factoring_advances` 0/0/0, `insurance.claim` 0/0/0.
- **why it is empty — verified, not inferred:** USMCA's only load `L-20260802-0258`
  (`a6f8a7ec-942e-41a8-bc49-49c784d82aa2`) is `assigned_not_dispatched`, rate `$1.00`. No load has ever
  reached delivery, so no earnings exist, so no pre-settlement can be offered, so no settlement can be
  generated and no GL can post. The pay-run code is not the blocker — **the input is missing.**
- **verdict:** **BLOCKED — upstream dependency, NOT a settlement defect.** Do NOT open a settlement card.
  HOLD-001 cannot drain until a load is walked dispatch → in-transit → delivered on USMCA. Anything else
  would mean fabricating settlement data, which is inventing financial records (§0 row-origin law).
- **status:** OPEN — blocked on the Phase-1 walk, tracked here.

### LV-TXN-002 — the load detail drawer reports a driver-assigned load as **"Unassigned"** — **FAIL (major)**
- **surface:** `GET /api/v1/dispatch/loads/:id` → `LoadDetailDrawer.tsx` "Equipment · Driver · Trailer"
- **browser observed (USMCA, load `L-20260802-0258`):** drawer shows **DRIVER: `Unassigned`**,
  **TRUCK UNIT: `—`**, TRAILER UNIT `—`. The dispatch LIST row for the SAME load, on the same screen,
  shows driver **"Juan USMCA-Battery"** and unit **"USMCA-001"**. Two surfaces, one row, contradictory.
- **neon-check — the DATA IS CORRECT and correctly entity-scoped:**
  `assigned_primary_driver_id = 88c04cf5-9e32-455c-91e5-298a9b331b10` → "Juan USMCA-Battery",
  `operating_company_id = 5c854333` = **the load's own opco**. `assigned_unit_id = bb1e77ab-…` →
  `unit_number = USMCA-001`, `owner_company_id = b49a737b` (**TRK**),
  `currently_leased_to_company_id = 5c854333` (**USMCA**) — the normal TRK-owns / USMCA-leases case.
  So this is NOT an entity-scope leak and NOT bad data. The drawer is simply not being given the values.
- **root cause — confirmed against PROD schema, not guessed:** the route selects `l.*` from
  `views.dispatch_load_with_driver_status`. `information_schema.columns` on prod shows that view exposes
  **only** `assigned_primary_driver_id`, `assigned_secondary_driver_id`, `assigned_unit_id` — there is
  **no `assigned_primary_driver_name` and no `assigned_unit_number` column at all**. The route's own
  SELECT then joins `mdata.drivers sd` to resolve **`assigned_secondary_driver_name`** and never joins for
  the PRIMARY driver or for `mdata.units`. The frontend reads
  `load.assigned_primary_driver_name ?? "Unassigned"` and `load.assigned_unit_number ?? "—"`
  (`LoadDetailDrawer.tsx:372,374`), so `undefined` renders as **"Unassigned"**.
  **The endpoint is structurally incapable of returning these fields.**
- **PAYLOAD-LEVEL PROOF (strongest form — the API response itself, fetched live from inside the app with
  `credentials:'include'` against deployed `e6343f4`):**
  `GET /api/v1/dispatch/loads/a6f8a7ec-…?operating_company_id=5c854333-…` → **HTTP 200**, and on the
  response object:
  - `'assigned_primary_driver_name' in payload` → **false** (field ABSENT, not null)
  - `'assigned_unit_number'        in payload` → **false** (field ABSENT, not null)
  - `'assigned_secondary_driver_name' in payload` → **true**  ← the tell
  - `assigned_primary_driver_id` = `88c04cf5-…` (**non-null**), `assigned_unit_id` = `bb1e77ab-…`
    (**non-null**), `status` = `assigned_not_dispatched`
  So the ids are present and the names are structurally absent from the same payload. This is the exact
  pair of assertions the guard must make, and it is measured at the contract boundary — no UI, no DOM, no
  screenshot involved.
- **that the SECONDARY (team) driver name IS resolved while the PRIMARY is not** is the strongest evidence
  this is an oversight rather than a design choice.
- **scope — WIDER than this class:** the missing columns are on the view and the route, with no entity
  predicate involved, so this affects **every load, in every entity, always** — not a USMCA/test artifact.
  The correct sibling query already exists and is correct: `mdata/loads.routes.ts:636` resolves both, with
  `COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = l.operating_company_id` for the unit
  and `d.operating_company_id = l.operating_company_id` for the driver. That is the pattern to copy.
- **operational consequence (why this is major, not cosmetic):** the drawer is the screen a dispatcher
  opens to work a load. It states the load has no driver and no truck when it has both. That invites
  double-assignment or a "this load is uncovered" escalation on a load that is fully covered.
- **LANE: CC-2** (mechanical / routes / scope / FE). GUARD verifies, never builds — not fixed here.
- **status:** OPEN — board row filed for CC-2.

### LV-TXN-003 — `GET /api/v1/dispatch/units-without-load` appeared to hang — **RESOLVED: NOT A DEFECT**
- **observed:** in the live network trace for the dispatch board, `dispatch/units-without-load?…` appeared
  **three times, all `statusCode: pending`**, while every sibling dispatch call returned 200. This is the
  endpoint behind the "Unassigned units / Awaiting assignment" panel.
- **re-probe (authenticated, from inside the app, `credentials:'include'`, timed):**
  `dispatch/units-without-load` → **HTTP 200 in 537 ms**, 209 bytes, body
  `{"units":[{"id":"f151a7b6-…","unit_number":"TEST-U01",…}]}`. Control on the same call:
  `dispatch/dashboard` → **200 in 140 ms**.
  (An unauthenticated `curl` returns 401 in ~0.16 s for BOTH endpoints, so the unauth probe proves nothing
  about the authenticated path — recorded so nobody mistakes it for evidence.)
- **verdict:** **NOT A DEFECT.** `pending` in a captured trace means in-flight at capture time, exactly the
  caveat stated when this was first logged. The earlier 45 s `get_page_text` timeout was the browser
  waiting on `document_idle` for a raw-JSON navigation, not the API.
- **why this row is kept rather than deleted:** it is the worked example of the §0 rule — a suspicious
  observation was logged **UNVERIFIED and never promoted to a defect**, then resolved by an isolated
  live re-probe. Had it been filed on first sight, CC-2 would have chased a hang that does not exist.
- **status:** CLOSED — no card opened, no builder time spent.

### LV-TXN-004 — ★ **THE ROOT OF `CLS-MONEY-HOLD`: the office status control calls the endpoint that skips revenue recognition AND settlement creation** — **FAIL (critical)**
- **surface:** Dispatch Kanban drag → `onStatusDrop` → `updateLoadStatus()` → `PATCH /api/v1/mdata/loads/:id/status`
- **how this was found:** by *running* the business event, not by reading code. I walked USMCA load
  `L-20260802-0258` (`a6f8a7ec-…`) `assigned_not_dispatched → dispatched → at_pickup → in_transit →
  at_delivery → delivered`, all HTTP 200, using the endpoint the app's own Kanban calls. Then measured.
- **live result of that walk (Neon prod, bypass in-statement, positive control `accounting.bills` = 16,255
  in the SAME statement):**
  - `mdata.loads.status` = **`delivered`** ✓ (the walk itself worked)
  - `driver_finance.driver_settlements` = **0**, and `n_tup_ins` still **11** — *unchanged from the
    pre-walk baseline*, so the walk created **zero** settlements
  - `accounting.posting_batches` where `source_transaction_id` = this load = **0** → **no revenue
    recognition**
  - `audit.audit_events` matching `%settle%` in the last 20 min = **0**
  - `driver_finance.settlement_lines` = 0 / `n_tup_ins` 0
- **ROOT CAUSE — two status endpoints, only one of which carries the money side-effects:**
  - `PATCH /api/v1/dispatch/loads/:id/transition` (`dispatch/loads.routes.ts:1215`) calls
    **`postLoadRevenueLatch(...)`** (revrec) **and `pingSettlementOnLoadEvent(...)`** (opens the
    `load_bookended` driver settlement) — `loads.routes.ts:1335` and `:1348`.
  - `PATCH /api/v1/mdata/loads/:id/status` (`mdata/loads.routes.ts:838`) calls **only**
    `latchOnDeliveryEvidence(...)`. It does **not** import or call either of the two above — verified by
    reading the file's imports: the sole related import is `latchOnDeliveryEvidence`.
  - The frontend's only office-side status control is wired to the **second** one:
    `Dispatch.tsx:439 onStatusDrop → statusMutation` → `api/loads.ts:263 updateLoadStatus` →
    `/api/v1/mdata/loads/:id/status`.
  **So every load advanced by a dispatcher through the board silently skips revenue recognition and never
  opens a driver settlement.**
- **why the pay-run screens are empty is now fully explained (and my earlier LV-TXN-001 reading was
  incomplete):** `pre-settlements/open-by-driver` (`pre-settlement.routes.ts:51`) selects
  `FROM driver_finance.driver_settlements … WHERE settlement_model='load_bookended' AND trip_closed_at IS
  NULL` — it lists **already-open settlements**; it does NOT derive candidates from delivered loads. The
  only thing that creates that row is `pingSettlementOnLoadEvent`, which the office path never calls.
  Chain: no ping → no `driver_settlements` row → pre-settlements `[]` → no pay run → no settlement lines →
  no GL. **HOLD-001 is one missing call, not three empty tables.**
- **CORRECTION I OWE MY OWN EARLIER ROW:** LV-TXN-001 called the empty pay-run "blocked upstream, no load
  has ever been delivered." That was true but not the whole cause. A load *has* now been delivered and the
  pay-run is **still** empty. The blocker is this missing call, not the absence of delivered loads. Row
  LV-TXN-001 is superseded on that point.
- **also verified — `settlement_lines = 0` immediately after delivery is EXPECTED, not a defect:** those
  rows carry a `settlement_id` and are written by the settlement engine when a pay run generates a
  settlement (`settlement-engine.ts:147+`), never at delivery. Recorded so nobody files a card on it.
- **and the driver is NOT unconfigured** (the other legitimate explanation, ruled out): driver
  `88c04cf5-…` has **1** row in `driver_finance.driver_pay_rates`, the only USMCA driver rate of the 93
  on prod. Pay setup is not the blocker.
- **LANE: CC-1 (money)** — the consequence is financial (revrec + settlement never fire). The mechanical
  half (FE pointing at the wrong endpoint) is CC-2. Needs one decision: either the office control moves to
  `/dispatch/loads/:id/transition`, or `/mdata/loads/:id/status` gains the same two calls. Both are money
  side-effects, so the money lane should own the call.
- **status:** OPEN — board row filed.

### LV-TXN-005 — the two status endpoints accept **different status vocabularies**, and the Kanban renders a lane the API rejects — **FAIL (minor→major)**
- `PATCH /api/v1/mdata/loads/:id/status` accepted `dispatched`, `at_pickup`, `in_transit`, `at_delivery`,
  `delivered` (all HTTP 200) and **rejected `loaded` with HTTP 400 `validation_error`**.
- `PATCH /api/v1/dispatch/loads/:id/transition` rejected `delivered` outright — its enum is
  `unassigned | assigned_not_dispatched | dispatched | in_transit | delivered_pending_docs | …`. It also
  reports the same load's status as **`delivered_pending_docs`** where the mdata path calls it
  **`delivered`**.
- **The Kanban board renders a "Loaded" column** (observed live between "At pickup" and "In transit").
  Dragging a card into it calls the mdata endpoint with `new_status:'loaded'` → **400**. A dispatcher
  dragging into a lane the product itself draws would get a silent failure.
- **verdict:** one load, two endpoints, two vocabularies, one of them contradicting the rendered board.
- **LANE: CC-2** (mechanical/FE + route contract). **status:** OPEN — board row filed.

### LV-TXN-006 — HOLD-002 (factoring reserve) and HOLD-003 (insurance claims) — **BLOCKED ON AN OWNER BUSINESS DECISION, not defects**
- **HOLD-002 factoring:** USMCA home surface states, live: *"FACTORING BALANCE — Not applicable · This
  entity has no factoring contract."* `GET /accounting/factoring-advances/candidate-invoices` → 200
  `{"rows":[]}`. `accounting.factoring_advances` 0 / `n_tup_ins` 0; `factoring.reserve_movement` 0/0.
  Positive control that the schema is reachable: `factoring.factor` = **1** agreement row exists (TRANSP's).
- **HOLD-003 insurance:** `GET /insurance/claims` → 200 `{"claims":[]}` **and `GET /insurance/policies`
  → 200 `{"policies":[]}`**. `insurance.claim` 0 / `n_tup_ins` 0.
- **verdict — the prerequisite is a REAL-WORLD CONTRACT, and an agent must not invent one.** A factoring
  reserve movement requires an executed factoring agreement for USMCA; an insurance claim requires an
  in-force policy. Both are legal/financial instruments with real counterparties. Fabricating either to
  make a class go green would be inventing financial records — the exact anti-pattern §0 forbids.
- **status:** BLOCKED — **owner business decision required**, not a builder card. Do not open one.

---

## ★ CLASS VERDICT — `CLS-MONEY-HOLD`: **NOT DRAINED**, and the class label was wrong on its biggest surface

| Surface | Was labelled | Live verdict |
|---|---|---|
| **HOLD-001** settlement pay-run | "financial hold, blocked on owner/Neon/flag" | **NOT A HOLD — it is a CODE DEFECT.** Proven by walking a load to `delivered` through the app's own office control and measuring zero settlements and zero revrec. See **LV-TXN-004**. Routed to CC-1. |
| **HOLD-002** factoring reserve | financial hold | **CONFIRMED HOLD** — USMCA has no factoring contract. Owner decision. |
| **HOLD-003** insurance claims | financial hold | **CONFIRMED HOLD** — USMCA has no insurance policy at all, so a claim is impossible. Owner decision. |

**The single most important correction this lane produced:** `CLS-MONEY-HOLD` describes itself as
*"the correct money design is blocked on owner/Neon/flag; this is a financial hold, not a chrome PR."*
For 2 of 3 surfaces that is accurate. For **HOLD-001 it is wrong** — nothing was blocked on the owner, on
Neon, or on a flag. A dispatcher advancing a load on the board has *never* triggered revenue recognition
or opened a settlement, because the board calls the endpoint that does neither. It was filed as a hold and
therefore never investigated as a bug. **It cannot be drained by owner action; it needs a code fix.**

**Guard status:** `scripts/verify-money-hold-surfaces.mjs` is the registered guard for this class and
`drain_proof.guard_green` is `false`. Per the standing order a class is drained only when every instance
is proven live AND a mutation-proven guard exists — so even after LV-TXN-004 is fixed, this class stays
open until that guard is green and mutation-proven.

---

## CLASS: `CLS-DISP-WIRE-07` (actual_departure_at) — **its documented root cause is WRONG, and it is the SAME defect as LV-TXN-004**

### LV-TXN-007 — controlled A/B on two loads: the endpoint is the only variable — **FAIL (critical, same root as LV-TXN-004)**
- **the class currently says:** *"`loads.routes.ts:1285-1303` writes actual_departure_at on the final
  delivery stop at delivered_pending_docs, but reads `body.data.delivered_at` from the request — **if the
  client doesn't send it, it's NULL**."*
- **that is factually wrong.** `stampFinalActiveDeliveryDeparture`
  (`dispatch/stamp-final-delivery-departure.ts:42`) writes
  `SET actual_departure_at = COALESCE($2::timestamptz, now())`. When the client omits `delivered_at` it
  falls back to **`now()`**. It can never write NULL. A builder told to "make the client send
  `delivered_at`" would change nothing.
- **CONTROLLED EXPERIMENT (both loads USMCA, same customer, same driver `88c04cf5-…`, same unit
  `bb1e77ab-…`, same day; the ONLY variable is which endpoint advanced the status; NEITHER call sent
  `delivered_at`):**

  | load | path used to advance | stops | `actual_departure_at` stamped |
  |---|---|---|---|
  | `L-20260802-0258` | `PATCH /mdata/loads/:id/status` (**what the Kanban calls**) | 2 | **0** |
  | `LUSMCAFREIGHT-20260806-0001` (`678fc733-…`, created for this test) | `PATCH /dispatch/loads/:id/transition` | 2 | **1** ✓ |

  1 of 2 is the CORRECT result on the transition path — the stamp targets only the final active delivery
  stop by design, not every stop.
- **conclusion:** the stamp works. The office path simply never reaches it. **`CLS-DISP-WIRE-07` and
  `CLS-MONEY-HOLD`/HOLD-001 are ONE defect with one fix** (LV-TXN-004): the office status control calls
  the endpoint that does none of revrec, settlement-open, or departure-stamping.
- **why this matters beyond one class:** WIRE-07 is registered as the *"CRITICAL-PATH ROOT BLOCKER"* for
  WIRE-05 (revrec) and WIRE-04 (delivery-evidence invoice gating). Those three classes plus HOLD-001 all
  trace to the same missing call. Fixing LV-TXN-004 should be expected to move **four** open classes.
- **honest limit — one thing the transition path did NOT fix:** `accounting.posting_batches` for the
  control load = **0**. So even on the correct endpoint, revenue recognition did not post. That is a
  SEPARATE open question (flag gating, or revrec may require POD/invoice which this load has neither),
  and it is recorded as unresolved rather than folded into the win.
- **status:** OPEN — board row to be filed against LV-TXN-004 as the consolidated root.

### Test data created by this lane (disclosed)
`LUSMCAFREIGHT-20260806-0001` / `678fc733-f661-4aeb-b7c3-fb0978bdf61d` — USMCA, $1.00, Laredo TX →
Monterrey NL, notes `"CC-3 LIVE-VERIFY WIRE-07 control load (USMCA test data)"`. Created deliberately as
the positive control above. USMCA is the designated test entity (PERMANENT LAW §4: all TMS-native data is
test). Also noted in passing: its display id is `LUSMCAFREIGHT-20260806-0001` while the pre-existing load
is `L-20260802-0258` — **two different load-number formats on the same entity**, not investigated here.

---

## CLASS: `CLS-ECON-EMPTY` — two instances are misclassified, and ECON-005 is worse than filed

### LV-TXN-008 — ECON-001 / ECON-004 are dispositioned **(C) owner-hold**, which LV-TXN-004 disproves — **RECLASSIFY**
- Both instances (`driver_finance.driver_settlements = 0`, on the list and on the driver profile) carry
  `DISPOSITION: (C) owner-hold — poster code exists, no pay-run executed. Tracked under CLS-MONEY-HOLD`.
- **That disposition is inherited from HOLD-001, and LV-TXN-004 proves HOLD-001 is not an owner hold.**
  No pay-run was ever executed because no settlement was ever *opened*, because the office status control
  calls the endpoint that never calls `pingSettlementOnLoadEvent`. Nothing is waiting on the owner.
- **verdict:** ECON-001 and ECON-004 should move **(C) → (A) broken wiring**, and resolve when LV-TXN-004
  does. Left as-is they read "not actionable", which is how this stayed still.
- ECON-002 (`driver_advances` 0 / `n_tup_ins` **0**, `catalogs.cash_advance_types` = 18 seeded) and
  ECON-003 (`escrow_ledger` 0 / `n_tup_ins` **0**) are **correctly** dispositioned (B) empty state —
  confirmed live, catalogs seeded, writers exist, simply never exercised. Not defects. No card.

### LV-TXN-009 — ECON-005 is not "an empty FK column"; it is a **VACUOUS DEDUPE GUARD on a driver-money path** — **FAIL (major)**
- **filed as:** *"`fuel.fuel_transactions.overage_deduction_id` = 0 — FK column exists but no code path
  ever writes it. DISPOSITION: (A) BROKEN WIRING."* True, but it understates the consequence.
- **live:** `fuel.fuel_transactions` **1,554** rows (`n_tup_ins` 1,557), rows with
  `overage_deduction_id IS NOT NULL` = **0**. Positive control `accounting.bills` = 16,255 in the SAME
  statement.
- **the design, from the code's own comment** (`fuel/fuel-card-overage.service.ts:109-111`):
  *"BANK-DOM-06 reverse/forward FKs — still live columns on prod. FUEL-03 approve path must read them
  **so we never double-create a settlement deduction** / leave dead schema."* So there is a deliberate
  bidirectional link:
  - FORWARD `driver_finance.driver_settlement_deductions.source_fuel_transaction_id` → fuel txn
  - REVERSE `fuel.fuel_transactions.overage_deduction_id` → deduction
- **BOTH DIRECTIONS ARE DEAD — verified by exhaustive grep of non-test `apps/backend/src`:**
  - `source_fuel_transaction_id` occurs **exactly once in the entire backend**, and it is the `SELECT` at
    `fuel-card-overage.service.ts:122`. There are **four** `INSERT INTO
    driver_finance.driver_settlement_deductions` sites (`recover-from-driver.service.ts:105`,
    `deductions.service.ts:135`, `escrow-deduction-pending.service.ts:398`,
    `settlements/auto-deductions/apply.ts:141`) and **not one of them names that column**.
  - `overage_deduction_id` occurs only in the same file, only in a `SELECT`. No `INSERT`/`UPDATE`
    anywhere in `apps/backend/src` or `db/migrations`.
- **therefore `loadExistingOverageDeductionLink()` can only ever return `{deduction_id: null,
  overage_deduction_id: null}`.** The dedupe check it exists to perform **can never fire**. The
  double-create it is documented to prevent is, in fact, unprotected.
- **why this is a money finding, not a schema tidiness one:** a fuel-card overage is a **deduction taken
  from a driver's settlement**. The only guard against charging the same overage twice is a lookup on two
  columns that nothing populates. This is latent rather than realised today only because no overage has
  been approved yet (`driver_settlement_deductions` live 0) — i.e. it is protected by absence of use, not
  by the control.
- **LANE: CC-1 (money)** — driver deduction path. **status:** OPEN — board row filed.
- **cross-class note:** this is also a textbook `CLS-LINKAGE-ONEWAY` instance (LINKAGE LAW §10 requires
  both-way linkage). Here it is *zero*-way: both FKs are read-only. Whoever drains LINKAGE-ONEWAY should
  take this with them rather than count it separately.

---

## CLASS: `CLS-LINKAGE-ONEWAY` — the percentages are measured over populations that are ~100% QBO clones

### LV-TXN-010 — 5 of 9 instances are `expected-state-recorded-as-failure` at scale — **RECLASSIFY, do NOT backfill**
- The class states its instances as whole-table percentages. **Origin census, live on prod
  (bypass in-statement; `qbo_*_id IS NULL` = TMS-native):**

  | instance | filed as | TOTAL | **TMS-native** | native w/ FK |
  |---|---|---|---|---|
  | LINK-001 `bills.unit_id` | "1.8% (300/16250)" | 16,255 | **10** | 1 |
  | LINK-002 `invoices.source_load_id` | "0.01% (1/11984)" | 11,985 | **9** | **2** |
  | LINK-004 `expenses.load_id` | "0% (0/27072)" | 27,072 | **2** | 0 |
  | LINK-007 `payments.source_bank_transaction_id` | "0% (0/12124)" | 12,125 | **2** | 0 |
  | LINK-008 `bill_payments.source_bank_transaction_id` | "0% (0/6544)" | 6,544 | **1** | 0 |

- **the denominators are the finding.** These percentages divide by 16,255 / 11,985 / 27,072 / 12,125 /
  6,544 rows that are **~100% QBO-origin clones**. A 2024 QBO bill cannot link to a TMS load that never
  existed; a QBO payment cannot link to a bank transaction the TMS never matched. Under the owner ruling
  (`LOAD-LINKAGE-SCOPE-RULING-2026-08-04`) and the ledger-row-665 / LINK-F01 precedent, that is
  **EXPECTED STATE, not a defect** — and "fixing" it means **inventing financial data**.
  Two supporting numbers: **299 of the 300** unit-linked bills are QBO-origin (so LINK-001's "1.8%" is
  almost entirely describing QBO rows), and **0** QBO invoices carry `source_load_id`, exactly as they
  should.
- **corrected scale:** the actionable TMS-native population across these five instances is roughly
  **24 rows**, not ~73,000. LINK-002 is in fact **2 of 9 linked (~22%)**, not 0.01%.
- **LINK-005 (fuel) already carries the right annotation** — `N/A-PRE-OPERATIONAL, all 1,548 are QBO-origin
  pre-TMS-dispatch imports`. **The same annotation is missing from LINK-001/002/004/007/008, which are the
  identical shape.** That inconsistency is what makes the class look ~73,000 rows deep.
- **HONEST LIMIT — what I am NOT claiming.** `0 of 2` native expenses, `0 of 2` native payments and
  `0 of 1` native bill_payment carry their FK. That is *consistent with* a broken going-forward writer,
  and *equally* consistent with a writer that simply has not been exercised. **n = 1–2 cannot distinguish
  the two, and I will not call it either way.** The class cannot be judged until TMS-native volume exists
  — which is itself gated on LV-TXN-004, since that is what stops loads producing money records.
- **verdict:** **RECLASSIFY 5 instances to `N/A-PRE-OPERATIONAL` for the imported cohort**, keep a
  going-forward-only guard scoped to `qbo_*_id IS NULL`, and **do not schedule a backfill.** A guard
  written over the whole table reddens on expected state forever.
- **LANE:** Cascade for the wave-queue reclassification; CC-1 owns the going-forward guard scoping.
- **status:** OPEN — board row filed.

### LV-TXN-011 — LINK-009 is expected state with a **perfect** correlation, and LINK-003/006 complete the census — **RECLASSIFY**
- **LINK-009 `mdata.units.currently_leased_to_company_id` — filed as *"lease data incomplete, null 71.4%
  (130/182)"*. It is not incomplete. Live on prod, and the correlation is exact with ZERO exceptions
  either way:**

  | | leased | not leased |
  |---|---|---|
  | **active** (`deactivated_at IS NULL`) | **53** | **0** |
  | **inactive** | **0** | **130** |

  `currently_leased_to_company_id` is NULL **exactly** when the unit is deactivated. A retired or sold
  truck has no current lease — that is correct by design (§4: units are scoped by the
  `owner_company_id` / `currently_leased_to_company_id` pair). All 183 units carry `owner_company_id`.
  The filed "71.4% null" is measuring **deactivated units**. **NOT A DEFECT.**
- **LINK-003 `accounting.expense_lines`** — 33,980 lines total, but only **2** sit on a TMS-native expense
  (`qbo_purchase_id IS NULL`). Same denominator problem as LINK-001/002/004/007/008. Expected state.
- **LINK-006 `banking.bank_transactions`** — 11,072 rows (`n_tup_ins` 12,300), 2,742 credits, **0** matched
  to bill/payment/invoice. Bank rows are feed imports; matching is a TMS operation never performed.
  **This is a DUPLICATE of `CLS-BANK-MATCH-DENSITY`**, which exists for exactly this — it should be
  counted once, in that class, not twice.

### ★ CLASS VERDICT — `CLS-LINKAGE-ONEWAY`: **8 of 9 instances are expected-state or misclassified; the 9th is a duplicate**

| instance | verdict |
|---|---|
| LINK-001 bills, LINK-002 invoices, LINK-004 expenses, LINK-007 payments, LINK-008 bill_payments | **expected state** — denominators are ~100% QBO clones; TMS-native population ≈ 24 rows total |
| LINK-003 expense_lines | **expected state** — 2 of 33,980 lines are TMS-native |
| LINK-005 fuel | already correctly annotated `N/A-PRE-OPERATIONAL` |
| LINK-009 units | **expected state** — NULL exactly when deactivated, 53/53 and 130/130, zero exceptions |
| LINK-006 bank_transactions | **duplicate** of `CLS-BANK-MATCH-DENSITY` |

- **what this means practically:** the class as filed reads as ~73,000 unlinked money rows. The real
  TMS-native population is roughly **two dozen**. There is no backfill to schedule, and a backfill would
  be actively harmful — inventing operational FKs on QBO-origin financial records.
- **WHAT I AM NOT SAYING.** I am **not** declaring the class clean. The going-forward writers are
  **unproven**: 0 of 2 native expenses, 0 of 2 native payments, 0 of 1 native bill_payment carry their FK.
  That is too small a sample to distinguish a broken writer from an unexercised one. The correct verdict
  is *"the filed evidence does not establish a defect, and the real population is too small to judge"* —
  not *"it works."* Judgement requires TMS-native volume, which is gated on **LV-TXN-004**.
- **status:** OPEN — reclassification requested; class cannot be drained or dismissed until volume exists.

---

## CLASS: `CLS-BANK-MATCH-DENSITY` — SS-003's stated cause is wrong on **both** counts

### LV-TXN-012 — "the rule engine covers <2%" describes an engine with **ZERO rules**, and the auto-matcher **does not exist server-side** — **RECLASSIFY (feature gap, not a broken engine)**
- **filed as:** *"98.4% of bank transactions stuck in for_review… **The auto-categorization rule engine
  exists but covers <2% of volume.** Auto-categorization rule engine matches only 170/11002 (1.5%)."*
- **live status distribution (prod, bypass in-statement):**

  | status | n | `categorized_at` | `categorization_gl_account_id` | `plaid_category` | suggested match |
  |---|---|---|---|---|---|
  | `pending_categorization` | **10,902** | 0 | 0 | **10,902** | **0** |
  | `categorized` | **170** | 170 | 170 | 170 | **0** |

- **COUNT 1 — there are no rules. `accounting.banking_rules` = 0 rows.** A rule engine with **zero rules
  configured** matching zero transactions is **correct behaviour**, not an engine "covering <2%". Bank
  rules are user-authored (this is the QuickBooks model), so an empty rule set on a system nobody has
  configured is expected state. **This is an ops/configuration task, not a code defect** — and a builder
  sent to "fix the rule engine" would be hunting a bug in something behaving correctly.
- **COUNT 2 — there is no server-side auto-matcher at all.** `suggested_match_bill_id` /
  `suggested_match_invoice_id` are **0 across all 11,072 rows**, and the only writer is
  `banking/categorization.routes.ts:352-384`, which assigns them from
  **`body.data.suggested_match_invoice_id ?? null`** — i.e. the suggestion is **supplied by the client**,
  never computed. Nothing on the server proposes a match. So the empty suggestion columns are not an
  engine underperforming; **the capability that would fill them does not exist.**
- **what IS genuinely there:** all 10,902 pending rows carry a `plaid_category` from the feed, so the raw
  material for matching/categorising is present and waiting. The 170 categorised rows all carry a GL
  account, so the categorise write-path works when it is invoked.
- **corrected framing:** this class is **(a) an unbuilt feature** — server-side match suggestion, which
  QBO/NetSuite both do automatically — plus **(b) an empty rule set**, which is configuration. It is
  **not** a defective engine. Sizing it as "fix the engine" would be wrong in both direction and effort.
- **LINK-006 folds in here** per LV-TXN-011: `matched_bill_id` / `matched_payment_id` /
  `matched_invoice_id` all 0 is the same fact as this class, counted once.
- **LANE: CC-1 (money)** for the matcher; **owner/ops** for the rule set. **status:** OPEN — board row filed.

---

## CLASS: `CLS-DISP-WIRE-06` — the guard is well-built and **cannot detect a prod regression**

### LV-TXN-013 — WIRE-06's guard is mutation-proven statically but its LIVE assertion runs against an empty CI database — **GUARD-INTEGRITY (major)**
- **the guard is genuinely good, and I want that on the record:** `--selftest` → **exit 0**,
  *"4 mutations detected; scope is import-safe by construction."* Its own header states it
  *"RED only on TMS-NATIVE fuel costs (`load_required=true`) missing their load, NEVER on the 1,548
  pre-TMS-dispatch imports"* and keys on the `load_required` discriminator rather than a row count —
  exactly the origin-aware design the other classes lacked. It is registered as verify-step **2637** and
  runs selftest-then-live, in that order, deliberately.
- **but its live half cannot fail in CI.** Run with no database it prints
  *"SKIP — no DATABASE_URL/DATABASE_DIRECT_URL; live linkage cannot be asserted here"* (exit 0). In CI a
  database IS provided — `ci.yml:79` sets `DATABASE_URL: postgres://verify:verify@localhost:54329/ih35_verify`
  — so it does not skip; it connects to a **fresh ephemeral instance built from migrations**. Migrations
  create schema, not the 1,554 prod fuel rows. **The live assertion therefore evaluates an empty table
  and passes vacuously, in every CI run, forever.**
- **so the protection is asymmetric:** the selftest genuinely stops the *guard* from rotting, but nothing
  in CI can observe a *prod* linkage regression. The only environment where the live half is meaningful
  is prod, which CI never touches.
- **live prod state (bypass in-statement; positive control `accounting.bills` = 16,255 same statement):**
  `expense_attribution.expense_load_links` **0 rows, `n_tup_ins` 0** — never one row, ever;
  `fuel.fuel_transactions` 1,554 rows, **0** with `load_id`.
- **the imported cohort is correctly exempt** — all 1,548 historical fuel rows are pre-TMS-dispatch QBO
  imports, `N/A-PRE-OPERATIONAL` per the owner ruling, and the guard already refuses to redden on them.
  That part is right and should not be touched.
- **what is actually unproven:** `expense_load_links` has `n_tup_ins = 0`, so the going-forward attribution
  writer has **never executed once**. Same n=0 problem as LINKAGE-ONEWAY: I cannot distinguish "writer
  broken" from "writer never exercised", and I will not guess. It is gated on the same thing —
  **LV-TXN-004**, which is what stops loads generating downstream cost records.
- **honest limit on my own claim:** I verified `ci.yml:79` sets the ephemeral `DATABASE_URL` and that the
  CI database is built from migrations. I did **not** execute the guard against that database to watch it
  pass on empty. The vacuity is inferred from those two verified facts, not directly observed — stated so
  nobody quotes it as a measurement.
- **LANE: CC-1** (owns the WIRE-06 guard). **status:** OPEN — board row filed.

### ★ CLASS VERDICT — `CLS-DISP-WIRE-06`: **NOT DRAINED**
Per the standing order a class drains only when every instance is proven live **AND** a mutation-proven CI
guard exists so it cannot regress. Here the guard exists and is mutation-proven, but its live half is inert
in CI — so the "cannot regress" half is **not satisfied**, and the going-forward writer has never run.
Neither condition is met.

---

## ★★ LV-TXN-014 — **I WAS WRONG: HOLD-002 AND HOLD-003 ARE NOT HOLDS.** Insurance policy creation is a hard 500 on every entity — **FAIL (critical)**

**Correction first.** Earlier in this file (LV-TXN-006) I recorded HOLD-002 and HOLD-003 as *"BLOCKED ON AN
OWNER BUSINESS DECISION"* because USMCA had no factoring contract and no insurance policy. **That verdict
was wrong, and I reached it by stopping at the empty table instead of checking the answered sources the
owner had already provided.** All questions are asked-and-answered; there are no holds. What follows is the
verification I should have done first.

### HOLD-002 factoring — ANSWERED, and the agreement exists
- The executed **FACTORING AGREEMENT (V-2023-1), Faro Factoring LLC ↔ IH 35 TRANSPORTATION LLC**, is on
  the owner's Desktop (`CPA ANSWERS.docx`, also `FARO FACTORING AGREEMENT(1).docx`), with terms —
  Factoring Ratio Tier 1 **1.5%**.
- **Accounting treatment is fully answered** in the same document: reserves = **asset "Factoring
  Reserves"** (short-term, because the factor remits on a cycle while new invoices keep replenishing);
  advance = **liability "Factoring Advance"**; **"Factoring Fees"**; chargebacks booked as **"Factoring
  Recoursed Invoices"**; **C3 — Faro is also a full vendor** (advance stays a factoring liability, the
  vendor record carries fees/chargebacks A/P); **C5 — the COMPANY absorbs factoring chargebacks, NOT the
  driver** (company drivers, not owner-operators; distinct from fuel-overage/damage/fines which ARE
  driver-fault deductions); **B2d — at POD auto-convert to Official Invoice + auto-submit to factoring**;
  **F16 — factoring required-docs blocked by default, owner may override in the moment**.
- **Live:** `factoring.factor` = 1 row, `operating_company_id = 91e0bf0a-…` = **TRANSP** — matching the
  real agreement's named Seller. **USMCA having no factoring contract is CORRECT**, not a gap: the
  agreement is TRANSP's. Nothing is waiting on the owner.

### HOLD-003 insurance — ANSWERED and LOCKED, and the create path is BROKEN
- The insurance module is **locked and fully specified** in-repo
  (`docs/lockdown/01_insurance/01_INSURANCE_BLUEPRINT_ADDITION.md`): tabs Policies · Claims · Lawsuits ·
  Coverage gaps · Carriers · Settings; `+ Create policy` (locked vocabulary); the 4-step wizard; and
  exactly what one atomic transaction writes — `insurance.policy` + `insurance.policy_unit`.
  `docs/lockdown/00_LOCKED_DECISIONS.md` §3–4 locks the financial-write pattern (math delegated to
  `computeInsuranceDispersal`, **no new ledger math**) and *"Insurance OWNS; Safety READS + flags, never
  writes."* **Nothing here is unanswered.**
- **`insurance.type_catalog` is seeded for USMCA** — 45 rows, `auto_liability`, `cargo`,
  `general_liability`, `physical_damage`, `bobtail`, `occupational_accident`, … all `active = true`.
- **THE SMOKING GUN IN THE STATS:** `insurance.policy` — `n_tup_ins` **5**, `n_tup_upd` **0**,
  `n_tup_del` **0**, `n_live_tup` **0**; identical on `insurance.policy_unit`. Neither table has any
  soft-delete column. Inserts that are counted but never committed and never deleted = **transactions
  that ABORTED**. Five prior attempts to create a policy all failed.
- **REPRODUCED LIVE, on USMCA, through the product's own endpoint:**
  `POST /api/v1/insurance/policies` → **HTTP 500**, `{"code":"42501","message":"new row violates row-level
  security policy for table \"policy\""}`.
- **ROOT CAUSE — the INSERT writes the wrong tenancy column:**
  - `insurance.policy` carries **BOTH** `tenant_id` (**NOT NULL**) and `operating_company_id`
    (**nullable, no default**) — verified on prod `information_schema`.
  - `policy.routes.ts:266-296` inserts **`tenant_id`** (value `body.operating_company_id`) and **never
    inserts `operating_company_id`**.
  - The RLS policy `insurance_policy_opco_scope` (FOR ALL) has WITH CHECK
    `identity.is_lucia_bypass() OR operating_company_id::text = current_setting('app.operating_company_id', true)`.
  - So the new row's `operating_company_id` is **NULL**, `NULL::text = '5c854333-…'` evaluates to NULL —
    not true — WITH CHECK fails, the transaction aborts. **Every single time.**
  - The GUC is NOT the problem and I checked it rather than assuming: `withCompanyScope`
    (`accounting/shared.ts:24`) does `set_config('app.operating_company_id', $1, true)`, and
    `withCurrentUser` (`auth/db.ts:220`) issues `BEGIN`, so the transaction-local GUC is correctly in
    scope for the INSERT.
- **SCOPE — this is not a USMCA or test-data artifact.** No entity predicate is involved in the defect;
  the INSERT omits the column on every code path. **Insurance policy creation is impossible for TRANSP,
  TRK and USMCA alike**, which is why the whole module — policies, policy_units, and therefore claims,
  lawsuits, COI requests, refund obligations — is empty on prod.
- **FIX:** add `operating_company_id` to the INSERT column list (same value as `tenant_id`), and
  reconcile the two columns — one of them is redundant and the schema should say which is canonical
  before more tables copy the pattern. Do **not** relax the RLS policy; the policy is correct and the
  write is wrong.
- **GUARD:** assert that every INSERT into an RLS-scoped `insurance.*` table populates the column the RLS
  WITH CHECK actually tests. Mutation-prove by removing `operating_company_id` from the column list and
  confirming RED. A guard that only checks "route returns 2xx in a fixture DB" would miss this, because
  a fresh CI database with `is_lucia_bypass()` true never exercises the failing branch.
- **LANE: CC-1** (schema/RLS/migrations). **status:** OPEN — board row filed.

### What this correction is really about
Both surfaces I labelled *"owner business decision"* were answered before I looked, and one of them was
concealing a hard 500. **The empty table was not evidence of a hold — it was evidence of a crash.** The
lesson for this lane: an empty money table with `n_tup_ins > 0` and `n_tup_del = 0` is an **aborted-write
signature**, and must be treated as a defect signal, never as "never used".

---

## ★★ LV-TXN-015 — **POSITIVE CONTROL LANDED: the settlement machinery WORKS. Only the office path is wired to the wrong endpoint.** — completes LV-TXN-004

When I first walked a load I could only prove the *negative* half — the office path produced nothing. The
control load has now produced the **positive** half, and it closes the argument.

- **`driver_finance.driver_settlements` moved during this session:** baseline `n_tup_ins` **11**,
  `n_tup_upd` **0**, `n_live_tup` **0** → now `n_tup_ins` **12**, `n_tup_upd` **2**, `n_live_tup` **1**,
  `count(*)` **1**. One settlement was created and updated twice.
- **the row (read directly on prod):**
  `d3ff8ea3-4acd-4792-b3ad-fdad6383fbb2` · entity **USMCA** · driver `88c04cf5-…` **"Juan USMCA-Battery"**
  · `settlement_model` **`load_bookended`** · `status` **`closed`** · `trip_closed_at`
  **2026-08-06T17:03:35.171Z** · `created_at` **17:03:34.882Z**.
- **17:03:34 is exactly when I ran the `/dispatch/loads/:id/transition` walk** on the control load
  `LUSMCAFREIGHT-20260806-0001`. Nothing else in the session touched settlements.

### The A/B is now complete, and both halves are measured

| load | endpoint used | departure stamped | settlement opened |
|---|---|---|---|
| `L-20260802-0258` | `PATCH /mdata/loads/:id/status` — **what the Kanban calls** | **0 of 2** | **0** |
| `LUSMCAFREIGHT-20260806-0001` | `PATCH /dispatch/loads/:id/transition` | **1 of 2** ✓ | **1, opened AND auto-closed** ✓ |

- **This overturns the framing of HOLD-001 completely.** The settlement engine is not missing, not
  unbuilt, and not waiting on anyone: given the right endpoint it **opened a load-bookended settlement
  and closed it out in under 300 ms**, unprompted. `pingSettlementOnLoadEvent` → `openLoadBookendedSettlement`
  → `closeSettlementForFinalLoad` all fired correctly.
- **The entire CLS-MONEY-HOLD/HOLD-001 symptom is one frontend call pointed at the wrong endpoint.**
- **why the pay-run screen is still empty, and it is now EXPECTED not defective:**
  `pre-settlements/open-by-driver` filters `trip_closed_at IS NULL`. This settlement auto-closed on the
  final load, so it correctly does not appear as *open*. That is right behaviour, and I am recording it
  so nobody files "pre-settlements still empty" as a further defect.
- **estimate sharpened for CC-1:** the fix is a **frontend endpoint repoint**, not a money-engine build.
  `Dispatch.tsx:439 onStatusDrop` → `api/loads.ts:263 updateLoadStatus` should call
  `/dispatch/loads/:id/transition`. Note the two endpoints take **different status vocabularies**
  (LV-TXN-005), so the repoint must map the Kanban lanes onto the transition enum — that mapping is the
  real work, and it is small.

### What this does to the class
`CLS-MONEY-HOLD` HOLD-001 is **not a hold, not an engine gap, and not an owner decision** — it is a
one-line misrouting with a proven-working engine behind it. Combined with LV-TXN-014 (insurance = hard
500) and LV-TXN-006's correction, **all three HOLD surfaces are now explained and none of them is a hold.**

---

## ★★★ LV-TXN-016 — NEW CLASS `CLS-TENANT-OPCO-RLS-MISMATCH`: **13 tables write `tenant_id` while RLS enforces `operating_company_id`** — **FAIL (critical)**

LV-TXN-014 found this on `insurance.policy`. It is not one table. It is a schema-wide class, and it
explains **HOLD-002 as well as HOLD-003**.

### The census (prod `information_schema` + `pg_policy`, RLS-immune)
Tables carrying **BOTH** `tenant_id` and `operating_company_id`, where `operating_company_id` is
**NULLABLE** and the **RLS WITH CHECK tests `operating_company_id`**:

| schema | tables |
|---|---|
| `insurance.*` | `policy`, `policy_unit`, `claim`, `coi_request`, `lawsuit`, `payment_schedule`, `refund_obligation` (**7**) |
| `factoring.*` | `factor`, `batch`, `reserve_movement`, `letter_of_release`, `customer_factor_assignment`, `bank_match_suggestion` (**6**) |

**All 13: `opco_nullable = YES`, `rls_checks_opco = true`.** Any INSERT that omits
`operating_company_id` leaves it NULL, the WITH CHECK compares NULL to the GUC, yields NULL, and the
transaction aborts with **42501**.

**Correctly immune** (verified, so nobody re-checks them): `maintenance.internal_labor_log`,
`master_data.customer_terms_history`, `mdata.mx_permits`, `mdata.mx_tolls_ledger` — all have
`operating_company_id NOT NULL`, so the column cannot be silently skipped.

### The write paths confirm it
- `factoring.reserve_movement` — the single INSERT (`factoring/reserve.service.ts:118-125`) writes
  exactly `tenant_id, batch_id, factor_id, direction, amount_cents, reason`. **No
  `operating_company_id`.** Read in full, not counted by grep.
- `factoring.batch` and `factoring.letter_of_release` — one INSERT site each, **zero**
  `operating_company_id` in the column list.
- `insurance.policy` — proven live at 42501 (LV-TXN-014).

### ★ This re-explains HOLD-002
`CLS-MONEY-HOLD` HOLD-002 is filed as *"factor agreement exists, 0 reserve movement"* and I earlier
called it an owner hold. **Both readings are wrong.** The agreement exists (Faro ↔ IH 35
TRANSPORTATION LLC; `factoring.factor` = 1 TRANSP row), and the reason `reserve_movement` is empty is
that **its INSERT cannot satisfy its own RLS policy.** Reserve movement is not waiting on a contract or
on an owner — it is a write that would 500 on first use.

### Honest distinction between the two, because the evidence differs
- **`insurance.policy` — PROVEN.** `n_tup_ins` **5** with `n_tup_del` **0** and `n_live_tup` **0** (five
  aborted attempts), **plus** a live reproduction: HTTP 500 / `42501`.
- **`factoring.reserve_movement` — PRESENT IN CODE, NOT YET FIRED.** `n_tup_ins` is **0**, so nothing has
  ever attempted the insert; there is no aborted-write evidence and I did **not** reproduce a 500. The
  defect is established by reading the schema, the RLS policy and the INSERT column list — it would fire
  on first use. **I am not claiming a reproduction I did not run.**

### Why this survived
Every one of these tables is empty on prod, so the class reads as "module never used" — the same
misreading that produced my own false HOLD verdict. **An empty table downstream of a broken write is
indistinguishable from an unused one until you either attempt the write or read the column list against
the RLS policy.**

- **FIX:** add `operating_company_id` to all 13 INSERT paths (same value already passed as `tenant_id`),
  then make the column **NOT NULL** so the class cannot recur silently. Do **not** relax the RLS
  policies — they are correct; the writes are wrong. Decide which of the two columns is canonical before
  any further table copies the pattern.
- **GUARD:** static — assert that every INSERT into a table whose RLS WITH CHECK references
  `operating_company_id` includes that column in its column list. Mutation-prove by removing it from one
  site and confirming RED. This is exactly the guard that would have caught all 13 at once.
- **LANE: CC-1** (schema/RLS/migrations). **status:** OPEN — board row filed.

---

## Entity-safety note
No write has been performed on TRANSP in this session. All observation above is read-only; the only
mutation contemplated (walking `L-20260802-0258` forward) is on USMCA test data.

---

# ⚠ TWO CC-3 SESSIONS WROTE TO THIS FILENAME — BOTH RECORDS ARE KEPT BELOW

**Merge note, 2026-08-07.** `origin/main` already carried a CC-3 battery log at this exact path
(11 items: `CLS-MONEY-HOLD`, `CLS-DISP-WIRE-07`, `CLS-ECON-EMPTY`, `CLS-LINKAGE-ONEWAY`,
`CLS-BANK-MATCH-DENSITY`, `CLS-DISP-WIRE-06`, `LV-TXN-014/015/016`, entity-safety note), while this
branch carried a different 48-item log from a separate CC-3 session. **Neither is a superset of the
other — verified by comparing every item header, not by line count.** They are independent live
findings that happened to share a filename.

**Nothing was discarded.** The `origin/main` record is preserved ABOVE this divider exactly as it
stood; the second session's record follows BELOW. Deleting either would destroy live evidence, which
this lane does not do.

**Both sets of IDs are live and non-overlapping** — `LV-TXN-*` / `CLS-*` above, `LV-*` (item 29-58)
below. Future CC-3 sessions should append to ONE record and namespace their IDs to avoid recurrence.

---

# LIVE TRANSACTION BATTERY — USMCA — 2026-08-06 (CC-3 / LIVE VERIFIER lane)

**Owner-directed (2026-08-06):** run every transaction type end-to-end through the ACTUAL app UI on the
**USMCA test entity only** — never TRANSP (real QBO books) — and for each confirm (a) it persists on reload
and (b) the expected balanced GL / subledger row appears on Neon prod.

This file is the CC-3 live-verifier handoff record. A FAIL here becomes an OPEN row on
`docs/audit/GUARD-WORKORDERS.md` for the owning builder lane (CC-1 money / CC-3 mechanical).
**Findings flow agent → board → agent, never through the owner** (PERMANENT LAW §1).

## Session context (verified live, not from memory)

| Fact | Value | How proven |
|---|---|---|
| Local branch / SHA | `main` @ `e6343f4c1` | `git rev-parse` after `git pull --ff-only` |
| Deployed prod SHA | `e6343f4` | `GET /api/v1/healthz/shallow` → `{"ok":true,"version":"e6343f4"}` |
| Deploy == tip of main | YES | SHAs match |
| Neon branch | `br-fancy-credit-akjnd07a` (project `tiny-field-89581227`, db `neondb`) | MCP `run_sql` |
| Entity under test | **USMCA** `5c854333-6ea5-4faa-af31-67cb272fef80` | `org.companies`; app header reads `Current: USMCA Freight` |
| TRANSP (NOT touched) | `91e0bf0a-133f-4ce8-a734-2586cfa66d96` | — |
| MCP role | **alternates** `ih35_app` / `neondb_owner` | `current_user` asserted in every statement |

**USMCA baseline before the battery:** vendors 4 · customers 2 · drivers 85 · bills 6 · invoices 4 ·
payments 1 · journal_entries 16.

## Results

| # | Item | Id | Persists on reload | GL / subledger | Verdict |
|---|---|---|---|---|---|
| 01 | Create vendor | `308f6434-0a51-4109-953e-c86ffb1f0999` | YES | N/A (master data — no posting expected) | **PASS** |
| 02 | Vendor-type picker (encountered during 01) | — | — | — | **FAIL → board row `LV-CAT-500`** |
| 03 | Edit vendor | `308f6434-…` | YES | N/A | **PASS** |
| 04 | Create bill (Repair, Section-A category line) | `5a1d7268-a5d8-4bc4-9ffe-50187674dd19` | YES | **balanced** DR 5400 / CR 2000 $743.21 | **PASS** |
| 05 | Duplicate bill accepted (same vendor+number+amount+date) | `55997ecb-2a81-4b01-ab70-c23f41d3829d` | YES | balanced, but **duplicates 04** | **FAIL → board row `LV-AP-DUP`** |

---

### 01 — Create vendor — PASS

- Created via `/vendors` → `+ Create Vendor` drawer → Save. App redirected to
  `/vendors/308f6434-0a51-4109-953e-c86ffb1f0999`.
- **Persistence:** re-navigated to the detail URL; page renders `CC3 Battery Vendor 20260806-01` with the
  Profile / A-P / Documents / Audit History / Tasks / W-9-1099 tabs.
- **Prod row (`mdata.vendors`):** `vendor_name = 'CC3 Battery Vendor 20260806-01'`,
  `operating_company_id = 5c854333-…` (**USMCA — correct entity, no cross-entity write**),
  `qbo_vendor_id IS NULL` (TMS-native, not a QBO clone), `created_at 2026-08-06T16:30:24.775Z`.
- **Count moved 4 → 5** for USMCA. UI list had shown `1-4 of 4` before the create, matching the prod count
  exactly — independent confirmation the list predicate is correctly entity-scoped.
- No GL row expected or required: creating a vendor is master data, not a transaction.

### 02 — `LV-CAT-500`: 21 of 22 generic catalog list endpoints return HTTP 500 — FAIL

Surfaced while doing 01: the **Vendor type** dropdown rendered **zero options**, offering only
`+ Add new vendor type`, even though USMCA has 8 active vendor types on prod.

**This is not an empty catalog — the endpoint is throwing.** Full detail, root cause and the
19/2/1 partition are in the board row `LV-CAT-500` on `docs/audit/GUARD-WORKORDERS.md`.

Live proof (authenticated browser session against `https://api.ih35dispatch.com`, deploy `e6343f4`):

```
500 42703 column t.deactivated_at does not exist  ==> [19] lumper_providers, accident_types,
    workplace_incident_types, leave_types, cash_advance_types, pm_intervals, repair_locations,
    work_order_templates, air_bag_catalog, battery_catalog, tire_catalog, trailer_parts, truck_parts,
    def_stations, fuel_stations, relay_accounts, toll_providers, load_trailer_equipment, mx_customs_brokers
500 42703 column t.name does not exist            ==> [2]  vendor_types, customer_types
200 OK                                            ==> [1]  equipment_types  (POSITIVE CONTROL)
```

**Positive control passes:** `GET /api/v1/catalogs/fleet/equipment-types?operating_company_id=<USMCA>` →
**200**, 5 rows, first row `{code: "DRY_VAN", operating_company_id: "5c854333-…"}`. Auth, entity scoping and
the factory itself all work — the 21 failures are the two column bugs, not a session or permissions artifact.

**Not a false-empty.** The `catalogs.vendor_types` "no rows" read was re-run with the §0 completeness
discriminator on the same table: `visible = n_live_tup = 24`, `n_tup_ins = 24`, `n_tup_del = 0`,
`relrowsecurity = t`, `relforcerowsecurity = t`. Per entity: TRANSP 8 active / TRK 8 / **USMCA 8** /
`operating_company_id IS NULL` = 0. The data is there and correctly scoped; the API cannot read it.

**Not expected state.** These are seeded reference catalogs, not import-origin transactional rows, so the
origin test (owner ruling 2026-08-04) does not exempt them — a picker that cannot list a seeded catalog is a
defect, not legitimate emptiness.

### 03 — Edit vendor — PASS

Edited via `/vendors/308f6434-…` → Edit → set Vendor Code + Tax ID → Save.
Prod (`mdata.vendors`, txn with `SET app.operating_company_id` = USMCA): `vendor_code = 'CC3-BAT-01'`,
`tax_id = '99-8877665'`, `updated_at > created_at`, `operating_company_id` still USMCA.
Reload renders both values in the header and the profile rows.

Methodology note: the first read returned `[]` — a **false empty** from the MCP role alternating to
`ih35_app` under FORCED RLS with no company context. Re-run per §0 gave
`visible = n_live_tup = 2835`, `target_visible = 1`. A `SELECT current_user` in a zero-row result set
projects nothing, so the role is invisible exactly when you most need it — always assert it via a
scalar subquery.

### 04 — Create vendor bill (Repair, Section-A category line) — PASS

`+ Create → Bill → Repair Bill`. Vendor = the item-01 vendor (**master-data → transaction linkage
confirmed**: the newly created vendor was selectable in the bill picker). A/P Account = `2000 Accounts
Payable (A/P)`. Section A category line: `Repairs & maintenance`, qty 1, cost **$743.21**.

- **Persists:** `accounting.bills` id `5a1d7268-…`, `bill_number CC3-BILL-20260806-01`, `status unpaid`,
  `amount_cents 74321`, `total_amount 743.21`, `operating_company_id` USMCA, `qbo_bill_id IS NULL`
  (TMS-native), `voided_at IS NULL`.
- **GL — BALANCED and correctly scoped:** 2 postings via `accounting.transaction_source_links`
  (`linked_object_type = 'bill'`, `relationship_role = 'source_transaction'`) →
  `accounting.journal_entry_postings`:

  | seq | dr/cr | amount | account |
  |---|---|---|---|
  | 1 | debit | $743.21 | **5400** Truck Repairs & Maintenance |
  | 2 | credit | $743.21 | **2000** Accounts Payable (A/P) |

  DR = CR exactly. Both the posting **and** the account row are `operating_company_id` = USMCA
  (`acct_same_entity = true`) — no cross-entity account FK.
- **Vendor linkage both ways:** `vendor_uuid` AND `mdata_vendor_id` both = `308f6434-…`. Note this
  **contradicts the "bills `mdata_vendor_id` NULL" board card for the post-#4062 save path** — on this
  run the denormalized mirror column IS populated. Recorded so that card can be re-scoped rather than
  built against a stale premise.
- Tax is display-only ($61.31 at 8.25%) and correctly **excluded** from the bill total — total equals
  the sum of lines, no invented tax GL, matching the form's own contract note.

### 05 — `LV-AP-DUP`: duplicate vendor bill accepted with no warning and posted twice — FAIL

Two bills now exist with the **same vendor, same bill number, same amount, same date**, created
10.3 s apart (`16:41:28.897Z` and `16:41:39.161Z`), both `status unpaid`, both USMCA, **both posted to
the GL**. Net effect: **$1,486.42** of expense and A/P recognised for a single $743.21 vendor invoice.

- `5a1d7268-a5d8-4bc4-9ffe-50187674dd19` (item 04)
- `55997ecb-2a81-4b01-ab70-c23f41d3829d` (the duplicate) — DR 5400 / CR 2000 $743.21, also balanced

No warning, no confirmation, no blocking. Confirmed on prod there is **no unique index** on
`accounting.bills` covering `bill_number` (`pg_indexes` filtered to UNIQUE + `bill_number` → `NONE`).

This is the classic AP duplicate-payment control gap. QuickBooks Online warns
*"Bill number already exists for this vendor"*; McLeod and NetSuite block or force an override.
Full board row: `LV-AP-DUP`.

**Note on how it surfaced:** this was not a scripted double-submit — the two submissions were 10 s
apart, so the gap is a missing duplicate-detection rule, not merely a missing button-disable. Both
would be worth fixing; the duplicate check is the material one.

### 06 — Create driver (TEST driver #1) — PASS

`/drivers` → `+ Create Driver`. Drawer correctly pre-defaults **Operating Company = USMCA - USMCA
Freight** and **Status = Probation**.

- **Prod (`mdata.drivers`):** id `10b66f79-fa2e-4e6e-aeb8-2eb9546cb419`, `first_name TEST`,
  `last_name Driver-One-20260806`, `cdl_number TEST-CDL-20260806-01`, `status Probation`,
  `operating_company_id` = USMCA.
- **Counts moved:** USMCA drivers 85 → 86; table-wide `visible_all` 180 → 181 **and
  `visible_all = n_live_tup`** (complete read, not an RLS-masked partial).
- **Persists on reload:** drivers list `All (79)` → `All (80)`, header shows `1 new in last 3 days`.

**RLS methodology note (important for anyone repeating this).** `mdata.drivers` returned **0 rows under
`ih35_app` even WITH `SET app.operating_company_id`** — the company GUC alone is not sufficient for this
table; `visible_all = 0` against `n_live_tup = 180` proved it was masking, not emptiness. Adding
`SET app.bypass_rls = 'lucia'` in the same transaction made the read complete. So on `mdata.drivers` the
lucia bypass IS effective (contrast with the AND-gated tables where §0 warns it is inert). Any battery
read of this table without the bypass will silently report zero.

### 07 — `LV-DRV-TAB`: drivers with the default `Probation` status appear in NO status tab — FAIL

The drivers list offers exactly four status tabs — `Active` / `Inactive` / `On Leave` / `Terminated` —
plus `All`. After creating TEST driver #1 the tabs read
`All (80) · Active (1) · Inactive (77) · On Leave (0) · Terminated (0)`: **the four tabs sum to 78 while
All is 80.** Two drivers are reachable only through `All`.

Prod confirms exactly why (`mdata.drivers`, USMCA, non-archived, `bypass_rls='lucia'`,
`current_user = neondb_owner`, complete read):

| status | rows (not archived) |
|---|---|
| Inactive | 78 |
| **Probation** | **2** |
| Active | 1 |

`Probation` is the **default status the Create Driver drawer itself assigns**, and there is no tab for it.
So every driver created through the UI lands, by default, in a bucket that no status filter surfaces — a
dispatcher or safety reviewer filtering by status will never see newly created drivers.

**Residual, honestly flagged:** the tab math still does not fully tie — prod shows 78 non-archived
`Inactive` but the tab reads 77, and non-archived total is 81 vs `All (80)`. So there is a second,
narrower filter in play beyond `archived_at` that I have **not** isolated. **UNVERIFIED — needs live
check**; the `Probation`-has-no-tab gap above is fully proven and is the reportable defect. Recorded
rather than guessed.

### 08 — Create customer (TEST customer #1) — PASS (after a real validation block)

`/customers` → `+ Create Customer`. First save attempt did **nothing and fired no network request** —
the cause was a genuine required-field block: **"Customer type is required"**. That is correct behaviour,
not a defect (the `Customer type` options `Broker` / `Direct shipper` are hardcoded in the form, NOT served
by the broken `customer_types` catalog endpoint — checked, because `LV-CAT-500` would otherwise have made
this required field unsatisfiable and blocked customer creation entirely).

- **Prod (`mdata.customers`):** id `01a29250-9bc1-4679-9613-79331056294d`,
  `customer_name TEST-Customer-One-20260806`, `operating_company_id` = USMCA,
  `qbo_customer_id IS NULL` (TMS-native).
- **Counts:** USMCA 2 → 3; `visible_all` 2697 → 2698 **and `visible_all = n_live_tup`** (complete read).

**Minor UX observation (recorded, not boarded):** the validation message renders at the very TOP of a long
scrolling drawer while the Save button sits at the very BOTTOM, with no scroll-to-error. The form looks
inert when it is in fact correctly refusing. Worth a fix, but it is a usability nit, not a data defect.

### 09 — Create unit (TEST unit #1) — PASS · entity-ownership model verified correct

`/fleet` → `+ Create Unit`. USMCA fleet already held `USMCA-001` (truck) and `USMCA-T01` (dry van).

- **Prod (`mdata.units`):** id `240be73b-d02e-4205-a566-bb0000d66180`,
  `unit_number TEST-UNIT-20260806-01`, `vin 1XKTESTUSMCA080601`.
- **`visible_all = n_live_tup = 183`** (complete read).
- **★ ENTITY MODEL CORRECT — this is the notable result:**
  `owner_company_id = b49a737b-…` = **TRK** (the asset holder) and
  `currently_leased_to_company_id = 5c854333-…` = **USMCA** (the lessee).

  The Create Unit drawer exposes **no** owner or lease field at all, yet the write landed on the correct
  two columns in the correct direction. This is live confirmation that **PERMANENT LAW §4 — "TRANSP /
  USMCA own no assets today"** is actually enforced by the create path, not merely documented, and that
  `mdata.units` is correctly keyed on `owner_company_id` / `currently_leased_to_company_id` rather than
  the `operating_company_id` that §4 warns is a recurring 500 source.

**`TEST-` unit-name guard — checked before creating, no conflict.** `scripts/verify-no-test-units-in-prod.mjs`
forbids `unit_number LIKE 'TEST-%'`, which on its face collides with the owner's standing order to name
records `TEST-…`. It does not, for two independent reasons: (a) its live DB scan is gated behind
`ENABLE_LIVE_DB_UNIT_TEST_GUARD === "true"`, and the script's own comment records that no workflow has ever
set it, so that branch has never run; (b) when it does run it sets
`app.operating_company_id = TRANSP_COMPANY_ID` and scans only TRANSP. A `TEST-` unit on **USMCA** is
outside its scope either way. Verified by reading the guard, not assumed.

## ★★ 10 — DISPATCH CHAIN — book → assign → dispatch — PASS, and it DRAINS the WF064 board cards

Booked through the real Book Load wizard on USMCA. Load `L-20260806-0005`,
id `a0b1df25-e49e-4853-b8ee-a26b407e88ba`.

- **Prod (`mdata.loads`):** `status assigned_not_dispatched`, `trip_type NB`,
  **`rate_total_cents 245000` = $2,450.00** (GROSS customer rate, per §4), `operating_company_id` USMCA.
  `visible_all = n_live_tup = 7` (complete read).
- **★ TOTAL-CONNECTIVITY (§10) SATISFIED — every hop resolves, and to the records I created:**

  | link | value |
  |---|---|
  | driver | `88c04cf5-…` **Juan USMCA-Battery** |
  | customer | `01a29250-…` **TEST-Customer-One-20260806** (created in item 08) |
  | unit | `240be73b-…` **TEST-UNIT-20260806-01** (created in item 09) |
  | stops | **2** (pickup Laredo TX 78040 → delivery San Antonio TX 78201) |

### 10a — Pre-dispatch FMCSA/DOT compliance gate — PASS (works, and works well)

The wizard **blocked** the dispatch with `Active blocker(s) — override required`:

- `[WF-CDL-MISSING]` Juan USMCA-Battery: no CDL expiry on file — DOT requirement for dispatch
- `[WF-MED-CARD-MISSING]` Juan USMCA-Battery: no DOT medical card on file
- `[GAP-14-FMCSA-NO-NUMBER]` (advisory) customer has no MC#/DOT# for FMCSA verification

`6 of 7 checks pass`. Override required a ≥10-char reason and states it is audit-logged. This is
best-in-class behaviour and is a genuine PASS for the compliance gate. Overridden deliberately with a
reason naming this as a USMCA live-verifier test; the **override textarea accepted keystrokes**, which
independently corroborates the merged owner-override keystroke fix (#4036) still working on prod.

### 10b — ★ WF064 / dispatch outbox: PRODUCER **AND** CONSUMER BOTH WORK — board cards are WRONG

Two board cards state the WF064 lifecycle is dead — *"the whole WF064 lifecycle is inert end-to-end —
wired, never executed"*, *"0 of 31,646 outbox events match `dispatch.*` / `%wf064%`"*, and
*"WF064-consumer dead (P1) … the settlement cycle never fires."*

**Live on prod, immediately after this single dispatch:**

| event_type | created_at | delivered_at | retry | outcome |
|---|---|---|---|---|
| `dispatch.load.dispatched` | 17:02:41.402Z | **17:02:46.213Z** | 0 | `driver_instructions_distributed` |
| `dispatch.wf064.override_notice` | 17:02:41.402Z | **17:03:10.184Z** | 1 | `override_notice_delivered_to_3_owner(s)` |

`dispatch.*` total went **0 → 2**; `%wf064%` total went **0 → 1**. Both rows have
`delivered_at NOT NULL` and `failed_at NULL` — i.e. **both were produced AND consumed successfully**,
within 5 and 29 seconds respectively.

**Correct conclusion: the WF064 lifecycle was never EXERCISED, not broken.** The prior "0 rows"
reading was accurate but was interpreted as "the producer never fires / the consumer is disconnected."
The real cause was simply that **no load had ever been dispatched in the TMS**, so nothing had ever
produced the event. This run is the exercise, and the chain works end to end. The cards should be
closed as *not-a-defect / never-exercised*, not built against.

This is the textbook shape of the `expected-state-recorded-as-failure` anti-pattern applied to an
event stream: an empty queue on a system that has never performed the triggering action is expected
state, and a zero there is not evidence of a broken consumer.

### 10c — `LV-OUTBOX-ERRCOL`: success detail is written into `last_error` — FAIL (minor, observability)

Both delivered rows carry a **success** string in **`last_error`** (`driver_instructions_distributed`,
`override_notice_delivered_to_3_owner(s)`). `last_error` is the failure-diagnosis column; putting
success detail there means any triage query of the form `WHERE last_error IS NOT NULL` returns healthy
rows, and — worse — the override-notice row has **`retry_count = 1`**, so its first attempt genuinely
did fail, and that real error message has been **overwritten by the later success string and is now
unrecoverable**. Board row `LV-OUTBOX-ERRCOL`.

### 10d — "Auto-create driver bill with short miles" did NOT produce a bill — UNVERIFIED

The wizard's ON SAVE panel promises five effects: create load with assigned status · **auto-create
driver bill with short miles** · queue QBO outbox invoice + bill · send driver dispatch message ·
prepare factoring packet. After dispatch: USMCA `accounting.bills` unchanged at **8** (0 new), and
`driver_finance.settlement_lines` = **0**.

**Deliberately NOT filed as a defect.** This load was booked with **0 miles** (no PC*MILER routing
entered) and **driver pay rate/mi = 0**, so suppressing a $0 driver bill may be correct behaviour. To
settle it, re-run the chain with real stop mileage and a non-zero pay rate and re-check. **UNVERIFIED —
needs live check.** Recorded rather than guessed.

### 11 — `LV-LOAD-UNASSIGNED`: load detail renders an ASSIGNED load as "Unassigned" — FAIL (major)

Opened the load detail for `L-20260806-0005` (`a0b1df25-…`). The Overview panel shows:

- **DRIVER: `Unassigned`**
- **TRUCK UNIT: `—`**
- **TRIP TYPE: `—`**

…while the load-board row *directly beside it on the same screen* correctly shows
`TEST-UNIT-20260806-01` / `Juan USMCA-Battery`, and prod has all three populated
(`assigned_primary_driver_id 88c04cf5-…`, `assigned_unit_id 240be73b-…`, `trip_type NB`).

**Root cause — isolated to the API, and the asymmetry is the smoking gun.**
`GET /api/v1/dispatch/loads/:id?operating_company_id=…` returns **200** with:

```
assigned_unit_id            : "240be73b-…"   <-- id present
assigned_primary_driver_id  : "88c04cf5-…"   <-- id present
assigned_secondary_driver_name : null        <-- a *_name field EXISTS for the SECONDARY driver
customer_name               : "TEST-Customer-One-20260806"   <-- customer IS resolved
drivers                     : []             <-- empty despite an assigned primary
```

There is **no `assigned_primary_driver_name`**, **no unit-number field**, and **no `trip_type`** key
anywhere in the payload. So the endpoint resolves `customer_id → customer_name` and even carries a
name field for the *secondary* driver, but never resolves the **primary** driver or the unit — the
frontend receives only UUIDs for those and correctly falls back to "Unassigned" / "—".

This is **not** a frontend rendering bug and **not** an RLS/entity-scope bug (the ids are correct and
correctly scoped) — it is a missing projection in the detail query.

**Why it matters:** a dispatcher opening an assigned load is told it is *Unassigned*. That invites a
double-assignment of the same driver/truck, which is the exact failure the assignment board exists to
prevent. It also silently hides `trip_type`, which drives NB/TR/SB settlement closure.

Board row `LV-LOAD-UNASSIGNED` (CC-3).

**Corroborating positive — total connectivity is otherwise well wired here.** Loading this one screen
fired scoped reads for `insurance/claims?load_id=`, `safety/incidents` (damage_report,
trailer_interchange, cargo_claim), `safety/accidents?load_id=` and `loads/:id/expenses`, each carrying
`operating_company_id=5c854333-…`. The §10 cross-module linkage from a load out to insurance, safety
and expenses is present and entity-scoped.

### 12 — `LV-STOPS-NOSAVE`: "Save stops" persists nothing and issues no request — FAIL (major)

On load `L-20260806-0005`, prod held pickup `100 Bridge Rd / Laredo / state ''` and a **completely
empty delivery stop** (`address_line1 ''`, `city ''`, `state ''`, `postal_code NULL`), even though the
Book Load wizard had been given `200 Commerce St / San Antonio / 78201`.

**Isolation test.** Rather than guess, I re-entered the values in the load detail **Stops** tab (which
has no load-number reservation timer, unlike the create wizard) and clicked **`Save stops`**:

1. All six fields visibly populated in the UI (pickup TX, dropoff `200 Commerce St / San Antonio / TX`).
2. `Save stops` clicked.
3. **Prod unchanged** — re-read as `neondb_owner` (complete read): delivery stop still
   `addr ''`, `city ''`, `state ''`; pickup state still empty.
4. **No save request was issued.** The only traffic after the click was `notifications?limit=20`,
   `notifications/unread-count` and `feature-flags/check?key=LOAD_WIZARD_V5` — no PUT/PATCH/POST.

So the button is inert. This **also exonerates my first hypothesis** (that the create wizard's
reservation-timer re-render, which regenerated the load number `0001→0002→0003→0005`, had discarded
the typed stop data). The stops write path fails on its own, with no timer involved. I record the
discarded hypothesis because it was the more obvious explanation and it was wrong.

**Impact:** a delivery address cannot be set or corrected on a load. No delivery address means no
routing, no POD location, no IFTA state miles, and `Est. leg miles ~145` is being derived from
something other than the stored stop. Board row `LV-STOPS-NOSAVE` (CC-3).

### 13 — `LV-LOAD-EDIT-BLANK`: the Edit-load form opens completely UNHYDRATED — FAIL (major, data-loss risk)

Clicking **Edit** on the live load opened the `Edit load` wizard with **every field empty**, for a load
that on prod is assigned and worth $2,450:

| field | Edit form shows | prod actually holds |
|---|---|---|
| Trip type | *nothing selected* | `NB` |
| Customer | `Select customer…` | `TEST-Customer-One-20260806` |
| Linehaul | **$0.00** | $2,450.00 |
| Total customer invoice | **$0.00** | $2,450.00 |
| Truck unit | `Select truck unit` | `TEST-UNIT-20260806-01` |
| Driver | `Select driver` | `Juan USMCA-Battery` |

The form's own banner reads: *"Editing persisted load details. Only fields you change are saved
(partial PATCH — untouched columns stay)."*

**Why this is dangerous, not merely cosmetic.** The partial-PATCH contract is the only thing standing
between this screen and destroying the load: a user who opens Edit, sees `$0.00` and `Select
customer…`, and re-enters what they believe is missing will be writing over correct data; and any
control that reports itself as "changed" on submit (a select that fires onChange when re-picking the
same value, a currency input that normalises `""`→`0`) will silently zero a real charge. The screen
presents a populated, dispatched, invoiced load as if it were an empty draft.

**I did not submit the form** — I closed it and re-verified on prod that nothing was written:
`updated_at` still `2026-08-06T17:02:46.215Z` (the original dispatch timestamp), `rate_total_cents`
still `245000`, driver/unit/customer/trip_type all intact. The risk above is therefore **reasoned, not
demonstrated** — I deliberately did not run the destructive confirmation on live data. Board row
`LV-LOAD-EDIT-BLANK` (CC-3).

**Same family as `LV-LOAD-UNASSIGNED` (item 11), and it is now clearly the broader defect:** the load
read/hydration path does not resolve driver, unit, customer, trip type or charges into the detail and
edit surfaces, even though the detail API returns the correct ids and prod holds correct values. Fix
the hydration once and all three symptoms (detail "Unassigned", blank Edit form, and plausibly the
stops editor) resolve together — they should be triaged as one block, not three.

## ★ 14 — AR CHAIN: load → invoice auto-created — PASS (linkage), GL posting NOT YET PROVABLE

**The dispatch auto-created the invoice.** `INV-2026-00005`, id `d921fbde-b6e2-4e65-9e21-8bcf4278a862`,
created at **`17:02:41.402Z` — the exact load-creation timestamp**, i.e. in the same transaction.

- `total_cents 245000` = **$2,450.00**, matching the load's `rate_total_cents` exactly.
- `qbo_invoice_id IS NULL` → TMS-native, not a QBO clone.
- **Reverse linkage PASS:** `source_load_id = a0b1df25-…` (my load) and
  `customer_id = 01a29250-…` (my customer). USMCA invoices 4 → 5.
- Invoice detail renders **Source Load `L-20260806-0005`** correctly — note this **contrasts with the
  LOAD detail**, which fails to resolve driver/unit (item 11). The invoice screen resolves its
  relation; the load screen does not.
- Line: `linehaul`, income account **4000 - Freight / Line-haul Income**, qty 1, $2,450.00.
- GL panel states honestly: *"No journal entries linked yet (unposted or posting reversed)."*
  `transaction_source_links` for this invoice = **0**.

### 14a — Is this the `CLS-SUBLEDGER-GL-DARK` P0? **NOT PROVEN — and the card needs re-scoping**

The invoice is `status = proforma` and has no GL posting. **A proforma legitimately should NOT post** —
under ASC 606 revenue is recognised when the performance obligation is satisfied, and this load has not
been delivered. So a zero here is **expected state**, not the GL-DARK defect.

I attempted to advance it: the invoice detail offers only `Print` · `View invoice PDF` · `Send` · `Void`.
**`Send` is `disabled: true`** (verified in the DOM, not inferred from styling). Clicking it did nothing —
prod re-read confirms `status` still `proforma`, `updated_at` still `17:02:41.402Z` (unchanged from
creation), `gl_links` still 0.

**Most likely correct design:** proforma → final is gated on **delivery / POD**, which is exactly right.

**Critical-path consequence — this is the useful finding:**
`LV-STOPS-NOSAVE` (item 12) means the load has **no delivery address**, so the load cannot be
delivered → the invoice cannot leave `proforma` → **the AR → GL posting path cannot be exercised at
all.** The stops defect is therefore a **blocker for proving the highest-dollar open card on the
board.** It should be prioritised on that basis, not just as a dispatch annoyance.

**Verdict recorded honestly: `CLS-SUBLEDGER-GL-DARK` remains UNVERIFIED for the TMS-native AR path.**
I could not reach a finalized invoice, so I can neither confirm nor clear it. What IS now established:
the load → invoice hop works, amounts and both-way linkage are correct, and the income account maps to
4000. Re-test once `LV-STOPS-NOSAVE` is fixed and a load can be delivered.

### 14b — `LV-SEND-NOREASON`: disabled `Send` gives no reason — FAIL (minor UX)

`Send` is disabled with **no `title`, no `aria-disabled`, and no helper text** anywhere on the page.
A user cannot tell whether the invoice is not ready, they lack permission, or the button is broken —
and an assistive-technology user gets no signal at all, since `aria-disabled` is absent. If the gate is
"deliver the load first", say so. Board row `LV-SEND-NOREASON` (CC-3).

### 14c — `LV-INV-UUID`: invoice line shows a raw load UUID in customer-facing text — FAIL (minor)

The invoice line description reads
`Linehaul · Load a0b1df25-e49e-4853-b8ee-a26b407e88ba` — a raw UUID — while the header of the same
page correctly renders `L-20260806-0005`. This text is on a document that goes to a customer
(`View invoice PDF` / `Send`). It should read the load number. Same class as the existing
"Class-UUID renders in picker" card. Board row `LV-INV-UUID` (CC-3).

## 15 — MAINTENANCE: `LV-WO-NOSAVE` — "Create work order & Bill" is INERT — FAIL (major)

Attempted the full maintenance chain on USMCA: Repair WO → Section-A cost line → vendor →
`Create work order & Bill` (the form states *"Registers as a Bill (A/P) — payable later, 1099-tracked"*).

**Everything up to the submit is correct and several things are notably good:**

- **Board card #4048 (WO-vendor) — the picker half IS fixed.** The USMCA vendor
  `CC3 Battery Vendor 20260806-01` **appears in the WO vendor picker**. Under the original defect
  (validating against `mdata.qbo_vendors`, empty by design for non-QBO entities) no USMCA vendor could
  be found at all. The picker now reads canonical `mdata.vendors`.
- **`Load #` auto-populated to `L-20260806-0005`** the moment the unit was chosen — the WO
  auto-linked to the unit's **active trip**. That is exactly the §10 cross-module linkage we want,
  happening automatically (WO → unit → active load).
- **The cost-line validator fix is LIVE.** The pre-save panel shows **`✓ At least one cost line item`**
  with **only a Section-A category line** present. That is precisely the defect the board's
  "Cost-line-validator (C1, P1)" card was closed for — confirmed live on prod, not just on main.
- The pre-save validation panel is genuinely good: it blocked initially on
  `! Driver and unit required for non-PM operational types` and `! Vendor invoice # or vendor WO #
  required`, and cleared to **all 9 ✓** once satisfied.

**Then the submit does nothing.**

With all 9 validations green and the `Create work order & Bill` button **enabled** (green, not
disabled — verified visually and by it no longer being greyed):

1. Clicked. **No network request issued** — only `notifications?limit=20` and
   `notifications/unread-count` followed.
2. **No console error or exception** (console tracking active at click time).
3. **No UI feedback** — no toast, no error, no state change, drawer stays open.
4. **Nothing persisted:** `maintenance.work_orders` for USMCA = **0** (unchanged),
   USMCA `accounting.bills` = **8** (unchanged, no new bill).

Clicked twice with the button in its enabled state; identical result both times.

**Consequence: work orders cannot be created on USMCA at all**, so the whole maintenance chain
(WO → parts/labor → close → bill → GL) is unreachable, and **board card #4048 cannot be closed** — its
vendor-picker half is demonstrably fixed, but the create still fails, now at the CLIENT rather than in
the route. The card should be re-scoped accordingly rather than marked verified.

**Same failure shape as `LV-STOPS-NOSAVE` (item 12):** an enabled primary submit control that issues no
request and reports nothing. Two independent forms exhibiting the identical signature suggests a shared
cause (a submit handler not wired, or a guarded handler swallowing the call) and they should be
investigated together. Board row `LV-WO-NOSAVE` (CC-3).

### 15a — Class auto-derive renders the template, not the values — observation

With unit **and** driver both set, the green `Class (auto)` field reads the literal **`UNIT-DRIVER`**
(and read `UNIT-UNASSIGNED` before the driver was set). Per §7 the class auto-derive should be
`{UNIT}-{LASTNAME}` — here `TEST-UNIT-20260806-01-USMCA-Battery` or similar.

**Recorded as an observation, NOT filed as a defect, and deliberately so:** because the WO cannot be
saved (above), I could not read the persisted `class` value from `maintenance.work_orders` to see
whether the token substitution happens server-side on write. The display may be a placeholder that
resolves on save. **UNVERIFIED — needs live check once `LV-WO-NOSAVE` is fixed.** Note this is NOT the
same symptom as board card 611 (which was about raw **UUIDs** rendering); this is an un-substituted
template string, so do not treat 611 as re-opened on this evidence.

### 15b — `LV-WO-NOSAVE` cascades to maintenance expenses — and the linkage gate itself is a PASS

`Maintenance → + Create Expense` opens with **`Work order *` as a required first field** and the
explicit note: *"Select a work order so this expense carries Maintenance linkage (WO FK)."*

**That gate is correct and is a PASS** — it refuses to create a maintenance expense that is not linked
to a work order, which is exactly the §10 total-connectivity / G18-style enforcement we want (no
orphan expense records).

**But because `LV-WO-NOSAVE` means no work order can be created on USMCA, this path is blocked too.**
So the single inert submit button takes out: WO creation → WO→bill → WO parts/labor → close-WO→bill →
**and** maintenance expense creation. `LV-WO-NOSAVE` is therefore the blocker for the entire
Maintenance module on this entity, not one form.

**Scope note on the inert-submit class (measured, not assumed).** The signature is NOT universal —
these submits all worked and persisted this session: vendor create, vendor edit, customer create,
driver create, unit create, bill create (twice, with balanced GL), and the full Book Load wizard
(which created a load, an invoice and two consumed outbox events). The two confirmed inert submits are
**`Save stops`** and **`Create work order & Bill`**. So this is a specific defect in those handlers,
not a global regression — which is the useful scoping for whoever picks it up.

## ★★ 16 — OWNER ANSWERS LOCATED — the GL-DARK P0 needs NO owner decision; it is a BUILD

Owner directed (2026-08-06): *"there is no hold … all questions have been asked and answered … never
defer we always fix. all responses live here."* Located and read the answer set:

- `~/Downloads/OWNER-DECISIONS-FINAL-2026-07-26.md` (complete A–H answered set)
- `~/Desktop/CPA ANSWERS.docx`
- **in-repo:** `.block-ready/REVENUE-RECOGNITION-TWO-EVENT-LATCH-2026-07-19.json`,
  `.block-ready/CPA-ANSWERS-PHASE1.json`, `docs/OWNER-RULING-flag-flips-sole-owner-decision-2026-07-11.md`

### 16a — Revenue recognition is OWNER-LOCKED as a TWO-EVENT LATCH (ASC 606)

From `.block-ready/REVENUE-RECOGNITION-TWO-EVENT-LATCH-2026-07-19.json` (status BUILD, locked 2026-07-19):

| event | trigger | posting |
|---|---|---|
| **Event 1** | `delivered` / `delivered_pending_docs` | **DR Unbilled Revenue / CR Line-Haul Income** |
| **Event 2** | `completed_docs_received` (POD, via `docs.files`) | **DR A/R / CR Unbilled** |

Never one combined POD+delivered gate. Reversible on status revert. Entity scope locked: TRANSP seeds
Unbilled + enables first; **USMCA seeds Unbilled+Deferred, dormant until loads**; **TRK excluded**
(lease lessor, 42000-LEASE, no delivery trigger).

Corroborated by `CPA ANSWERS.docx` §7: *"revenue recognition should be the second the invoice is
created, and the invoice should be created on the day we pick up the load and closes the day we
deliver"*, and by `OWNER-DECISIONS-FINAL` **B2a/B2b** (auto-create a **Pro Forma Invoice** at booking,
call it that) and **B2d** (*"at POD auto-convert to Official Invoice + auto-send to factoring"*).

### 16b — ★ THE FLAGS ARE ALREADY ON FOR USMCA (verified live on prod, not assumed)

`lib.feature_flag_overrides` on `br-fancy-credit-akjnd07a`:

| flag | TRANSP | TRK | USMCA |
|---|---|---|---|
| `REVENUE_RECOGNITION_ENABLED` | true | true | **true** |
| `REVENUE_RECOGNITION_POST_ENABLED` | true | **false** | **true** |

**TRK = false is CORRECT**, matching the locked entity scope (lease lessor, no freight Unbilled/Deferred,
no delivery trigger). So the posting machinery is **armed for USMCA and waiting on a delivery event**.

### 16c — Conclusions that replace my earlier "UNVERIFIED / needs decision" framing

1. **`INV-2026-00005` sitting at `proforma` with 0 GL links is CORRECT** — it is the owner-specified
   Pro Forma at booking (B2a), and **Event 1 has not fired because the load has not been delivered**.
   This is expected state, not GL-DARK.
2. **No owner/architectural decision is pending on `CLS-SUBLEDGER-GL-DARK`.** The treatment is locked,
   the flags are on, and the work is a BUILD. Any board card still reading *"architectural decision
   needed"* or *"needs owner decision"* is stale and must not be used to defer.
3. **`LV-STOPS-NOSAVE` is the single thing standing between here and proving the whole revenue chain.**
   No delivery address → no `delivered` → Event 1 never fires → Event 2 never fires → no A/R posting.
   It is the top build priority on this board.

### 16d — DRIFT FLAGGED (§9): stale HOLD language in the locked revenue block

`.block-ready/REVENUE-RECOGNITION-TWO-EVENT-LATCH-2026-07-19.json` still states:
*"Flag default OFF per-entity behind financial HOLD/JORGE-APPROVED + Neon proof before enable."*

That is **contradicted by three later sources**: the **OWNER LAW of 2026-08-03** (no holds, the
`JORGE-APPROVED` label is deleted, coders merge on green), the **live prod flag state above** (already
enabled for USMCA), and the **owner's direct instruction of 2026-08-06** (*"there is no hold"*).
Flagging both files rather than silently picking one, per §9. **Canonical = the owner law + live prod
state; the `HOLD/JORGE-APPROVED` clause in that block-ready JSON is stale and should be struck.**

### 16e — Owner-decision checks run against live prod while I was in there

- **C2b escrow cap $2,500 — PASS.** `ESCROW_CAP_CENTS = 250_000` in
  `apps/backend/src/driver-finance/escrow-resolver.service.ts:38`, and prod
  `driver_finance.escrow_settings.escrow_target_cents = 250000` for **both TRANSP and USMCA**. The
  owner's note that "code caps $2,000 today" is now historical — it has been implemented. Not a defect.
- **A4-D5 "require a Work Order on every repair" — PASS**, and it is enforced live: the maintenance
  Create Expense drawer requires `Work order *` before anything else (item 15b).

## 17 — SAFETY: accident created with FULL linkage — PASS

`/safety/accidents` → `+ Create Accident`. Created on USMCA.

- **Prod (`safety.accident_reports`):** id `b99b9461-e593-4376-a501-21bb36453a41`,
  `operating_company_id` = USMCA, `status open`, `record_type accident`,
  `location 'I-35 N mile marker 22, Laredo TX'`.
- **★ §10 TOTAL CONNECTIVITY — every hop resolves:**

  | link | value |
  |---|---|
  | driver | `88c04cf5-…` **Juan USMCA-Battery** |
  | unit | `240be73b-…` **TEST-UNIT-20260806-01** |
  | load | `a0b1df25-…` **L-20260806-0005** |

- **Canonical table note:** the accident landed in **`safety.accident_reports`**, NOT `safety.accidents`.
  My first read hit `safety.accidents` and returned 0 — which the discriminator immediately exposed as
  a wrong-table read rather than a failure: `safety.accidents` has **`n_tup_ins = 0`**, i.e. it has
  never had a single row inserted, as has `safety.incidents`. Both look like RETIRE tables. **Anyone
  querying `safety.accidents` for accident data will get a permanent, misleading zero.**
- **The load picker in this form resolves MORE than the load's own detail page does** — it rendered
  `L-20260806-0005 · TEST-Customer-One-20260806 · Laredo` (load + customer + city). That is further
  evidence `LV-LOAD-UNASSIGNED` (item 11) is specific to the dispatch load-detail endpoint, not a
  general resolution failure.
- **The accident DETAIL form hydrates completely** — driver, unit, load, location and memo all
  populated on reopen. This is the direct counter-example to `LV-LOAD-EDIT-BLANK` (item 13) and
  confirms that hydration defect is **specific to the load edit surface, not systemic**.

## 18 — `LV-SPAWN-LIABILITY-NOSAVE`: "Spawn Liability" is INERT — FAIL (major)

The accident detail offers `Spawn Liability`, `Spawn WO` and `Add Photo`. Clicking **`Spawn Liability`**:

1. **No network request issued** — only `notifications?limit=20` and `notifications/unread-count`.
2. **No modal, no form, no toast, no error, no state change.**
3. **Nothing created.** Every claim/liability table on prod is untouched, and the discriminator is
   conclusive — these are not "empty right now", they have **never had a row inserted**:

   | table | n_live_tup | **n_tup_ins** |
   |---|---|---|
   | `insurance.claim` | 0 | **0** |
   | `driver_finance.driver_liabilities` | 0 | **0** |
   | `accounting.insurance_claim_recovery_postings` | 0 | **0** |
   | `maintenance.warranty_claims` | 0 | **0** |
   | `safety.accident_cost_lines` | 0 | **0** |

   `safety.accident_reports.insurance_claim_id` remains NULL for the accident.

**This is the THIRD control with the identical signature** — after `Save stops` (item 12) and
`Create work order & Bill` (item 15): an enabled primary action that issues no request, logs no error,
shows no feedback, and writes nothing. Three independent forms, one signature.

**Consequence:** the entire **Safety → Insurance → Legal → Accounting** chain is unreachable. Accident
exists and is correctly linked, but no claim can be spawned → no matter → no claim cost → no GL. The
`n_tup_ins = 0` across every claim table shows this chain has **never once been exercised** in the
system's history — the same "never exercised, not broken" shape as WF064 (item 10b), except here the
producer genuinely is dead, because the button that would produce it does nothing.

Board row `LV-SPAWN-LIABILITY-NOSAVE` (CC-3), to be fixed with the other two inert submits.

## 19 — BANKING: real density found, and a UI banner that contradicts prod

`/banking` on USMCA is the first module with **real data density**: Plaid 2 accounts (last sync
`8/6/2026 10:32:24 AM`), **163 transactions**, **112 uncategorized**, `USMCA FREIGHT ••••3224`
$93.68, Relay Fuel Wallet $0.00. Tabs: `For review · 112` / `Categorized · 3` / `Excluded · 0`.
This is the population `CLS-BANK-MATCH-DENSITY` needs.

**Much of this module is exemplary.** It carries honest self-disclosure banners rather than implying
completeness — e.g. *"Bank row attachments and notes are not wired yet"*, and it explicitly warns that
`matched_journal_entry_id` is **not** proof that bank-feed GL posting is live because recon Match can
also stamp it when `ledger_entry_kind = 'je'`. That distinction is exactly right and is the kind of
honesty this audit usually has to discover the hard way.

### 19a — `LV-BANKFLAG-STALE`: the banner states the OPPOSITE of live prod — FAIL

The banner asserts:

> *"Categorize tags are not ledger posts — **`BANK_FEED_GL_POSTING_ENABLED` stays OFF by default**"* …
> *"the flag-gated bank-feed poster is a separate path (**default OFF**)"* …
> *"A JE link with the flag **OFF** is a match/link, not 'posting is on.'"*

**Live on prod (`lib.feature_flag_overrides`, br-fancy-credit-akjnd07a):**

| flag | TRANSP | TRK | USMCA |
|---|---|---|---|
| **`BANK_FEED_GL_POSTING_ENABLED`** | **true** | **true** | **true** |
| `BANK_TX_SPLIT_GL_POSTING_ENABLED` | true | true | true |
| `BANK_TX_SPLIT_ENABLED` | true | true | true |
| `BANK_DRIVER_ADVANCE_ENABLED` | true | true | true |
| `BANK_DRIVER_EXPENSE_DEDUCTION_ENABLED` | true | true | true |
| `BANK_ACCOUNT_HIDE_ENABLED` | true | true | true |

**The stated nuance is real but the banner does not carry it.** It is true that the flag *key* DEFAULT
is OFF and that per-entity `lib.feature_flag_overrides` drive the ON state (standards §6) — that is
the same distinction preserved during the 2026-08-06 governance cleanup. But the operator is looking
at **USMCA, where the override is ON**, and the banner reports the key default as if it were the
effective state.

**Why this is material, not pedantic:** an accountant reading this page is being told that
categorizing a bank transaction does **not** write to the ledger. If the poster is in fact armed for
this entity, that belief drives real errors — double-posting a categorised transaction manually,
or treating the GL as untouched during reconciliation. A banner about whether the books are being
written must state the **effective, per-entity** state, never the key default.

**FIX:** render the effective resolved flag state for the currently selected entity (e.g. "bank-feed
GL posting: **ON** for USMCA"), not the key default. Same defect class as the one
`verify-no-stale-approval-gate` was built for — a law/UI surface asserting flags are OFF when prod
says ON — but here it is operator-facing rather than agent-facing.

Board row `LV-BANKFLAG-STALE` (CC-1 money — it concerns whether the GL is being written).

**NOT YET PROVEN, stated honestly:** I have **not** demonstrated that the poster actually fires on
categorize. The flag being enabled is necessary, not sufficient — the code path may still no-op. The
decisive test is to categorize one transaction and check for a balanced JE on prod.
**UNVERIFIED — needs live check.** What IS proven is the contradiction between the banner text and
`lib.feature_flag_overrides`.

### 19b — ★ RESOLVED: bank categorize DOES post a balanced JE — `LV-BANKFLAG-STALE` CONFIRMED

Item 19a left this **UNVERIFIED**. It is now **proven**, and the banner is actively wrong.

Categorized bank transaction `49e3a071-d63e-40a4-a167-e80a54b4be4c` (Monthly Fee Business Adv
Fundamentals, 08/03/2026, **$16.00 money out**, USMCA FREIGHT ••••3224) to account
**6300 Bank Service Charges & Wire Fees** via the real UI, then pressed **Post**.

**Prod (`banking.bank_transactions`):** `categorized_at 2026-08-06 21:52:41.211105+00`,
`coa_account_id de553cc4-…`, `matched_journal_entry_id 0eb02ac8-69f7-480b-b1da-208535418d79`.

**The JE is a real, balanced posting** (`accounting.journal_entry_postings`):

| seq | dr/cr | amount | account | source_transaction_type |
|---|---|---|---|---|
| 1 | debit | $16.00 | **6300** Bank Service Charges & Wire Fees | `bank_categorization` |
| 2 | credit | $16.00 | **1000** Bank of America - Operating (USMCA) | `bank_categorization` |

**DR = CR exactly.** Both postings and both accounts are `operating_company_id` = USMCA
(`acct_same_entity = true`) — no cross-entity account FK.

**★ The page's own caveat is ruled out.** The banner warns that `matched_journal_entry_id` is not
proof of posting because *"recon Match can also stamp it when `ledger_entry_kind = 'je'`"*. That
escape hatch does not apply here: **`source_transaction_type = 'bank_categorization'`** on both
legs, which can only come from the categorize path. This was a Post from the Categorize tab, not a
Match.

**Verdict: `BANK_FEED_GL_POSTING_ENABLED` is ON for USMCA and the poster fires on categorize.** The
banner telling the operator it *"stays OFF by default"* is not merely imprecise — it states the
opposite of live behaviour on the entity being viewed. `LV-BANKFLAG-STALE` upgraded from
UNVERIFIED to **CONFIRMED (major)**.

**Battery PASS recorded:** bank categorize → balanced GL. This drains the categorize half of
`CLS-BANK-MATCH-DENSITY`; the match-to-bill / match-to-invoice half remains.

**Module quality note (fair to the builders):** apart from the banner, this module is the best-built
surface encountered in the battery. The match engine returns real scored candidates from live ledger
data (bills, expenses, journal entries, with amount/date gaps and scores), the row carries
Driver/Unit/Trailer/**Trip (load)** linkage fields inline per §10, and it discloses its own limits
honestly ("Bank row attachments and notes are not wired yet"; "Draft fields below are not Law §9
links until Post / Categorize commits them"). The defect is the stale banner text, not the machinery.

### 19c — Bank MATCH: test INCOMPLETE (not a failure) — method correction recorded

Attempted the match half of `CLS-BANK-MATCH-DENSITY` on the 08/03/2026 `Wire Transfer Fee` $15.00.

**Result: no match persisted** — all four USMCA $15.00 rows still show `matched_bill_id`,
`matched_invoice_id` and `matched_journal_entry_id` = NULL.

**I am NOT recording this as a defect, because the test was invalid.** Two reasons, both verified:

1. **The browser tab died immediately after the click**, so the non-persistence could not be cleanly
   attributed to the app.
2. **More importantly, I clicked the wrong control.** The `find` tool reported a per-candidate
   "Match" button on the `USMCA-RB-002` bill card (`ref_241`). A direct DOM inspection disproves
   that: the expanded panel's complete button set is **`Match`, `Categorize`, `Split`, `Cancel`,
   `Post`, `Search all`, `Open match drawer`** — `Match`/`Categorize` are the row-level MODE toggle,
   not an apply. The candidate cards are **informational links to the bill**, with no apply action.
   Applying a match evidently goes through **`Open match drawer`**, which I did not reach.

So the correct method for the match test is: expand row → `Match` (mode) → **`Open match drawer`** →
select target → apply. **Re-run that way before any verdict.** Recorded as a method correction so the
next session does not repeat the same invalid attempt and mistake it for a finding.

**Lesson worth keeping:** the accessibility-tree `find` tool named a button that does not exist. On
this codebase, an a11y-tree claim about an actionable control must be confirmed in the DOM before it
is used as evidence — the same "verify, don't trust the convenient reading" rule that applies to a
0-row query.

### 19d — Categorize persistence re-proven across a full browser restart — PASS

The Chrome tab was lost and the session re-established from scratch. On reload the banking page still
reads **`For review · 111` / `Categorized · 4`** (from 112/3 before item 19b), with USMCA still the
selected entity. The categorize from 19b therefore survives a full client restart — server-side
persistence, not client state.

### 19e — ★ RESOLVED: bank MATCH is GATED BY DESIGN, not broken — no defect

Re-ran the match test through the correct path (expand row → `Match` → **`Open match drawer`**). The
drawer is the real apply surface: each candidate carries a radio + a **`Confirm match`** button, plus
an explicit gate label. Live state for the 08/03/2026 `Wire Transfer Fee` $15.00:

| candidate | amount | gate label shown | `Confirm match` |
|---|---|---|---|
| BILL `USMCA-RB-002` | $1.00 | **"Posting available after CHAIN-04"** | **disabled** |
| BILL `USMCA-TEST-BILL-05` | $0.05 | **"Posting available after CHAIN-04"** | **disabled** |
| JE `Bank categorization 49e3a071… posting` | $16.00 | "Variance posting pending balanced-JE proof (Tier-1)" | enabled |
| EXPENSE / JE (variance) ×5 | $1.00–$1,200 | "Variance posting pending balanced-JE proof (Tier-1)" | mostly disabled |

Drawer header states the contract outright:
> *"Exact-amount matches can be confirmed to link and clear — **no journal entry is posted**. Bill
> payments and any amount variance **stay held**. Candidates are live production ledger rows — never
> fixtures."*

**Conclusion — NO DEFECT.** Three facts, all from the running DOM:

1. **Bank → bill match is gated behind a named, disclosed dependency (`CHAIN-04`)** and the control is
   correctly **disabled**, not silently inert. That is the opposite of the `LV-*-NOSAVE` class.
2. **Amount-variance matches are deliberately held** pending Tier-1 balanced-JE proof — a conservative,
   correct stance for a money surface.
3. **My test could never have succeeded:** every candidate for this $15.00 row carries a variance
   ($1.00 to $1,185.00). There is no exact-amount candidate, and only exact-amount matches are
   confirmable. The earlier non-persistence (19c) is fully explained and was never app misbehaviour.

**Match ≠ posting, by design** — "confirmed to link and clear, no journal entry is posted". That is
consistent with the page banner's distinction and with `source_transaction_type='bank_categorization'`
being the thing that actually posted in 19b.

**`CLS-BANK-MATCH-DENSITY` — status recorded honestly:**
- **categorize half: DRAINED** (19b, balanced JE DR 6300 / CR 1000, persisted across a browser restart).
- **match half: BLOCKED UPSTREAM on `CHAIN-04`**, not failing. It cannot be drained by this lane until
  CHAIN-04 lands; re-test then with an **exact-amount** candidate. Not a board row — there is no defect
  to assign.

**Note for whoever owns `CHAIN-04`:** the bank-match half of this class is waiting on it, and USMCA now
has the density (163 transactions / 111 for review) to exercise it the moment it ships.

## 20 — FACTORING: cannot be exercised on USMCA — EXPECTED STATE, no defect

Battery item "factoring advance (link customer + invoice + reserve)". **It is not creatable on USMCA,
and that is correct.**

**Prod (`bypass_rls='lucia'`, discriminator on the same tables):**

| table | rows | n_live_tup | **n_tup_ins** |
|---|---|---|---|
| `accounting.factoring_advances` (all entities) | 0 | 0 | **0** |
| `accounting.factoring_advances` (USMCA) | 0 | — | — |
| `factoring.factor` (all entities) | **1** | — | — |
| `factoring.factor` (**USMCA**) | **0** | — | — |

**`factoring.factor` = 1 row globally and ZERO for USMCA — USMCA has no factor configured.** The Home
widget says the same in words: *"This entity has no factoring contract."* Per `ih35-entity-facts`,
Faro is **TRANSP's** factor; USMCA is not on a factoring agreement.

**So the zero is the correct answer, not a gap.** An advance cannot be linked to a customer/invoice/
reserve for an entity with no factor, and inventing one would be fabricating a financial relationship
that does not exist — exactly what the owner ruling on import-origin/expected-state forbids.

**`accounting.factoring_advances` `n_tup_ins = 0` across ALL entities** means no advance has ever been
recorded in the TMS by anyone. That is a real observation about system-wide coverage, but on **USMCA**
specifically it is expected and unactionable.

**No board row filed** — there is no defect to assign. This battery item is closed as **NOT APPLICABLE
TO USMCA**; it must be exercised on TRANSP, which this lane is forbidden to touch (real QBO books).
Recording that boundary explicitly so a later session does not "fix" it by seeding a fake factor.

**Module quality note:** the factoring tab is again exemplary about its own limits — *"zeros here are
not 'factoring healthy'… Use Recourse Pipeline / Reserve Tracker / Chargebacks for live Faro truth.
Do not invent Advances funded MTD from cash posting KPIs"* — and it names the canonical table
(`accounting.factoring_advances`) rather than implying health from a KPI tile.

## 21 — `LV-EXP-NOLOAD`: Record Expense cannot link a load — G18 unsatisfiable on this path — FAIL

**Expense → GL posting works** (confirms the board's GUARD-VERIFIED "Expense posting — record-expense
calls poster" card): USMCA has 2 expenses, both `Posted` with JE refs `ff286e60` / `b927818f`, GL
column `Posted`.

**But the create form cannot set the load link.** `/accounting/expenses` → `+ Create` → `Record
expense` offers exactly: Vendor · Category · Payment Date · Amount (USD) · **Truck/Unit (optional)** ·
Description · Payment method\* · Payment account\* · Receipts & documents. **There is no Load / Trip
field at all.**

**Why this matters — it is a documented hard rule, not a preference.** §4 of the standards:
*"Every diesel/roadside expense MUST FK to a load (G18, critical)."* On this path that FK **cannot be
supplied by the person recording the expense**. The Expenses list even renders a **`Load` column** —
which reads `—` on both existing USMCA rows, because nothing in this form can populate it.

**The capability exists elsewhere, which is what makes this an inconsistency rather than a missing
feature:** the **bank categorize** panel (item 19) carries inline **`Driver` / `Unit (truck)` /
`Trailer` / `Trip (load)`** fields on the bank row. So load-linking is built and wired there, but
absent from the dedicated expense-entry form.

**Consequence:** the battery item *"fuel expense WITH load link (IFTA)"* is **not creatable through
the accounting Record Expense path**. IFTA state-mileage attribution and per-load fuel cost both
depend on that FK.

**Scope stated honestly:** I have **not** established that NO path can create a load-linked expense —
the fuel module and the bank-categorize row are both plausible alternatives, and the maintenance
expense path requires a WO instead (item 15b). What is proven is that the **primary, general-purpose
expense-entry form omits the field**, while the list it feeds displays a column for it.
**UNVERIFIED — needs live check** on whether the fuel module supplies it.

Board row `LV-EXP-NOLOAD` (CC-2 mechanical/FE).

## 22 — FUEL module: GL mapping complete (PASS) · `LV-EXP-NOLOAD` scope RESOLVED

**PASS — Fuel → GL mapping coverage is complete for USMCA: `5 of 5 categories mapped`** —
`Diesel` · `DEF` · `Reefer fuel` · `Oil` · `Misc fuel`, each showing `mapped`. The page states its own
limit honestly: *"Read-only check of the expense category map (no GL posting is performed here)."*
Fuel Home KPIs are all zero (Active plans 0, MTD spend $0, Fleet MPG 0.0, Loves sync Never) with
`0` open fraud alerts and `0` card-overage queue.

**`LV-EXP-NOLOAD` scope question — now SETTLED (was UNVERIFIED in item 21).** The fuel module offers
tabs `Home · Planner · Relay inbox · Settings · Expense mapping · History & savings · Loves prices ·
Compliance` and an `IMPORT RELAY HISTORY` control. **There is no manual fuel-transaction create
anywhere in it** — the module is relay/import-driven, which matches the prod census on the board
(all 1,548 `fuel.fuel_transactions` are `relay_ingest`).

So the full picture across every expense entry path on USMCA:

| path | can set load link? |
|---|---|
| `/accounting/expenses` → Record expense | **NO** — no Load/Trip field (item 21) |
| Fuel module | **NO manual create at all** — relay/import only |
| Maintenance → Create Expense | requires a **Work order** first, and WO creation is dead (`LV-WO-NOSAVE`) |
| **Bank categorize row** | **YES** — inline `Driver` / `Unit (truck)` / `Trailer` / **`Trip (load)`** |

**Conclusion:** the ONLY surface on which a user can attach a load to an expense is the **bank
categorize row**. `LV-EXP-NOLOAD` therefore stands and is now fully scoped — it is not that the
capability is missing from the product, it is that it is reachable from exactly one screen, and not
from the screen actually named "Record expense". G18 (*every diesel/roadside expense MUST FK to a
load*) cannot be satisfied by someone entering an expense directly.

The board row `LV-EXP-NOLOAD` is updated from "UNVERIFIED on the fuel module" to **fuel module
confirmed to have no manual create path**.

## 23 — ★ COMPLIANCE: regulatory calendar correct + driver→compliance auto-linkage — PASS

`/compliance` on USMCA: `6 OVERDUE · 0 DUE SOON · 3 UPCOMING · 0 NOT YET TRACKED`. **Every row is
`Entity = USMCA`** — correctly scoped.

**★ The regulatory calendar is CORRECT against the actual federal/state rules** (checked against
`ih35-fmcsa-compliance`, not assumed):

| program | detail shown | due date | correct? |
|---|---|---|---|
| **Form 2290 / HVUT** | Annual Heavy Vehicle Use Tax filing | **08/31/2026** | ✅ 2290 tax period runs Jul 1–Jun 30, filing due Aug 31 |
| **IFTA Quarterly Fuel Tax Return** | **Q3 2026** return | **10/31/2026** | ✅ Q3 (Jul–Sep) is due Oct 31 — the correct quarter *and* the correct deadline |
| **Texas Business Personal Property Tax Rendition** | 2027 rendition, **Tax Code §22.23, due Apr 15** | 04/15/2027 | ✅ statute cited correctly |
| **Drug & Alcohol Clearinghouse Query** ×3 | annual query, **49 CFR §382.701** | — (Overdue) | ✅ correct CFR cite |
| **Annual MVR Review** ×3 | annual motor vehicle record review, **49 CFR §391.25** | — (Overdue) | ✅ correct CFR cite |

This matters because the board records a prior defect class where *"a regulatory calendar lived in
nobody's head (e.g. the IFTA wrong-quarter bug)."* On this entity, live, **the quarter and the
deadline are both right**, and the statutes are cited rather than paraphrased.

**★ DRIVER → COMPLIANCE AUTO-LINKAGE CONFIRMED (§10).** The overdue rows include
**`TEST Driver-One-20260806`** — the driver I created in item 06 — with **both** an annual
Clearinghouse query (§382.701) and an annual MVR review (§391.25) generated for it, alongside the
same two obligations for `TEST DRIVER-USMCA` and `Juan USMCA-Battery`. **Creating a driver
automatically spawned its federal compliance obligations, with no manual step.** That is exactly the
total-connectivity behaviour §10 requires, working end to end.

**Battery PASS.** No defect. This is the strongest module result so far: correct regulation, correct
dates, correct citations, correct entity scoping, and automatic driver→obligation wiring.

Note the 6 "Overdue" items are **expected state**, not a defect — they are annual obligations for
drivers that have just been created in a test entity with no prior query/review history. Flagging
them as overdue is the correct behaviour.

## 24 — ★ REQUIRED DOCUMENTS: FMCSA matrix correct + owner decision E1/W-8BEN implemented — PASS

`/compliance?tab=required_docs` → sub-tabs `Drivers · Units · Customers · Vendors`. Header states the
model plainly: *"Which documents are required per record. Warn-first; promote any to a hard block.
Seeded from FMCSA/IRS defaults."* Drivers tab, 6 rows, all `Source = Regulatory default`,
`Enforcement = Warn`, each with a `Make hard block` action:

| document | authority | expiry |
|---|---|---|
| Commercial Driver License (`cdl`) | **FMCSA §383** | Tracked |
| DOT Medical Certificate (`med_cert`) | **FMCSA §391.41** | Tracked |
| Motor Vehicle Record (`mvr`) | **FMCSA §391.25** | Tracked |
| Drug & Alcohol Clearinghouse (`clearinghouse`) | **FMCSA §382.701** | Tracked |
| Driver Employment Application (`driver_application`) | **FMCSA §391.21** | — |
| **Form W-9 (or W-8BEN if foreign)** (`w9`) | **IRS** | — |

**Every citation is correct** — §383 CDL, §391.41 medical certificate, §391.25 MVR, §382.701
Clearinghouse, §391.21 employment application. Checked against `ih35-fmcsa-compliance`, not assumed.

**★ OWNER DECISION IMPLEMENTED — verified, not asserted.** `CPA ANSWERS.docx` §12 states:
*"We need to include the wben8 treasure form to confirm that the person does exist in Mexico, it
should go in the driver file when hiring and renew every year."* And `OWNER-DECISIONS-FINAL`
**E1 — "no withholding from anyone; W-8BEN on file + in Legal."** The **`Form W-9 (or W-8BEN if
foreign)`** row is live in the driver required-documents matrix under IRS authority. **The owner
decision is built, not pending.** This is exactly the driver model the standards describe — Mexican
B1 1099 contractors, so a W-8BEN rather than a W-4.

**The warn-first / promote-to-hard-block design is the right control shape**: it surfaces the gap
without blocking operations by default, and lets the carrier escalate any single document to a hard
dispatch block. That matches how McLeod/Alvys handle driver-qualification enforcement.

**Battery PASS.** No defect.

**Minor note (recorded, not boarded):** navigating directly to `/compliance/required-documents`
silently redirects to `/home` rather than resolving or 404-ing; the tab is reachable only via
`/compliance?tab=required_docs`. A deep link that quietly lands somewhere unrelated is a small
usability wart, not a data defect.

## 25 — REQUIRED DOCUMENTS · UNITS tab: vehicle matrix correct — PASS

`Units` sub-tab, 5 rows, all `Regulatory default` / `Warn` / `Tracked` expiry:

| document | authority | correct? |
|---|---|---|
| Vehicle Registration (cab card) (`registration`) | State DMV | ✅ |
| **Annual DOT Inspection** (`annual_inspection`) | **FMCSA §396.17** | ✅ §396.17 is the annual-inspection rule |
| IFTA License / Decal (`ifta`) | IFTA | ✅ |
| **Form 2290 (HVUT) Schedule 1** (`form_2290`) | **IRS Form 2290** | ✅ Schedule 1 is the proof-of-payment doc |
| Insurance / Cab-card proof (`insurance`) | State / FMCSA | ✅ |

Every vehicle-side requirement in the FMCSA/IRS matrix is present and correctly attributed — annual
DOT inspection, registration, IFTA, 2290 Schedule 1, insurance. Combined with the Drivers tab
(item 24), the required-documents matrix covers **both** the driver-qualification file and the
vehicle file with correct authorities throughout.

**Battery PASS.** No defect. The compliance module (items 23–25) is the strongest area verified in
this battery: correct regulatory calendar, correct CFR/IRS citations on both drivers and units,
correct entity scoping, automatic driver→obligation generation, and an implemented owner decision
(W-8BEN). Nothing here needed a board row.

## 26 — `LV-CREDITMEMO-NOPATH`: AR credit memo and AP vendor credit have NO create path — FAIL

Battery items *"AR … credit memo"* and *"AP … vendor credit"*. **Neither can be created.**

**UI — exhaustively checked, not sampled.** On `/accounting/invoices`:
- `+ Create ▾` offers exactly: `New Bill` · `Expense` · `Invoice` · `Receive payment` · `Journal entry`.
- The `More ▾` accounting menu was enumerated from the DOM — **120 distinct menu items** — and the
  only credit/memo/refund match is the string **`Memo`**, which is a table COLUMN HEADER, not a
  route. There is **no Credit memo and no Vendor credit anywhere in accounting navigation**.
- The invoice detail (item 14) offers only `Print` · `View invoice PDF` · `Send` · `Void`.

**Prod — the tables exist, so this is unrouted, not undesigned:**

| table | rows | **n_tup_ins** | meaning |
|---|---|---|---|
| `accounting.credit_memos` | 0 | **0** | exists, **never written by anyone, ever** |
| `accounting.vendor_credit_applications` | 0 | **0** | exists, never written |
| `accounting.vendor_credits` | **6** | 6 | see origin below |
| `mdata.qbo_vendor_credits` (mirror) | 6 | 6 | — |

**Origin census on `accounting.vendor_credits` (the discriminator that settles it):** all **6 rows are
`TRANSP`**, **`qbo_id IS NOT NULL` on all 6**, **`tms_native = 0`**, `source_system = 'qbo'`.
**USMCA has zero.** So every vendor credit in the system is a QBO clone on the real-books entity —
**the TMS has never originated a vendor credit, and has never written a credit memo at all.**

**Expected-state test applied (owner ruling 2026-08-04):** the 6 QBO-origin rows are legitimately
imported and are NOT a defect — no backfill, no invented data. **The defect is the absent create
path**, which is a different thing and is not exempted by the origin rule.

**Consequence:** AR cannot issue a customer credit, and AP cannot record a vendor credit, through the
product. For a system targeting QuickBooks/NetSuite parity these are baseline AR/AP documents —
QBO has both as first-class create actions.

Board row `LV-CREDITMEMO-NOPATH` (CC-2 mechanical/route; **CC-1 to confirm the posting treatment**
before the route is wired, since a credit memo is GL-affecting).

## 27 — RECURRING BILL TEMPLATE — PASS (first ever created in the system)

`/accounting/recurring-transactions` → redirects to `/accounting/bills/recurring` → `+ Create`.
Full-page form (not a drawer): Template Name\* · Vendor\* · Amount\* · Memo · Frequency\* ·
First Generation Date\* · End Date · **`Auto-post bill to ledger when generated`** · Line Items.

**Created and verified on prod (`accounting.recurring_bill_templates`):**

| field | value |
|---|---|
| `uuid` | `17f2ab49-c4d0-4bc0-99d1-e8bfb0ed0e8a` |
| `template_name` | TEST Recurring Bill 20260806 - CC3 battery |
| `amount` | **425.00** |
| `frequency` | `monthly` |
| `next_generation_date` | **2026-09-06** |
| `auto_post` | **true** (checkbox honoured) |
| `is_active` | true |
| `vendor_uuid` | `308f6434-…` → **CC3 Battery Vendor 20260806-01** |
| `vendor_opco` | `5c854333-…` **= USMCA** |
| `operating_company_id` | `5c854333-…` **USMCA** |

**★ `n_tup_ins` went 0 → 1 — this is the FIRST recurring bill template ever written in this system,
on any entity.** The table existed and had never been exercised.

**Both-way linkage correct (§10):** the template's `vendor_uuid` resolves to the vendor created in
battery item 01, and **the vendor's own `operating_company_id` is USMCA — same entity as the
template**, so there is no cross-entity vendor reference. The `auto_post` flag persisted as checked,
which is the control that decides whether generated bills hit the ledger.

**Battery PASS.** No defect.

**Observation recorded, not boarded:** there are three recurring tables —
`accounting.recurring_bill_templates` (now 1 row), `accounting.recurring_bill_generation_log`
(`n_tup_ins` 0) and `accounting.recurring_templates` (`n_tup_ins` **0**). The write landed in
`recurring_bill_templates`; `recurring_templates` has never been written by anything and looks like a
RETIRE/superseded table. Worth confirming against the §10 canonical map before any future block
targets it — a builder picking `recurring_templates` by name would write to a dead table.

**Not yet provable:** whether generation actually fires on `2026-09-06` and whether `auto_post`
produces a balanced JE. That is a **future-dated cron behaviour** — it cannot be observed today
without waiting or forcing the job. **UNVERIFIED — needs a live check on/after 2026-09-06**, or a
forced generation run. Recorded rather than assumed.

## 28 — ★★ `LV-VOID-NO-REVERSAL`: bills are VOIDED but NEVER REVERSED — $1,643.21 still on the USMCA books — FAIL (critical, money)

**The void-reversal pass found the most serious defect of this battery.**

Another lane ran a duplicate-void remediation at **`2026-08-07 00:33:50.999787+00`** (all four voids
share that exact timestamp), voiding one of each duplicate pair and leaving the sibling live —
including the `LV-AP-DUP` pair I reported. **The void half is correct. The reversal half never
happened.**

**Evidence 1 — the voided bill's own postings.** `55997ecb-2a81-4b01-ab70-c23f41d3829d`
(`voided_at 2026-08-07 00:33:50`) still carries **only its two ORIGINAL postings**:
DR 5400 $743.21 / CR 2000 $743.21, created `2026-08-06T16:41:39.304Z`. Both rows read
**`reversed_by_line_id = NULL`** and **`reversal_of_line_id = NULL`**. **No reversing entry exists.**

**Evidence 2 — the aggregate across every voided USMCA bill:**

| measure | value |
|---|---|
| voided bills (USMCA) | **4** |
| voided bills that carry GL postings | **3** |
| postings sitting on voided bills | **6** |
| **reversal postings among them** | **0** |
| **cents still on the books from voided bills** | **164,321 = $1,643.21** |

**Evidence 3 — the account balances, which is what an auditor would see:**

| account | net (all) | **net from VOIDED bills** | share |
|---|---|---|---|
| **2000 Accounts Payable (A/P)** | $3,138.47 Cr | **$1,643.21 Cr** | **52% of A/P is voided-bill residue** |
| **5400 Truck Repairs & Maintenance** | $2,837.47 Dr | **$1,643.21 Dr** | **58% of the expense is voided-bill residue** |

**This violates the single most-repeated law in this repo.** PERMANENT LAW §4 and standing-order
rule 5: **"VOID = reversal; nothing is deletable."** A void that sets `voided_at` without posting a
reversing JE does not undo anything — it hides the document while leaving the money on the ledger.
The books now show A/P and expense overstated by **$1,643.21** on USMCA.

**Note the figure:** `$1,643.21` is exactly the overstatement named in CC-1's PR **#4614**
(*"ACCT-F142 — the TMS can enter the same vendor bill twice; $1,643.21 overstated A/P live on prod"*).
So the duplicate was correctly identified and the bills were correctly marked void — **but the
overstatement it was meant to correct is still there**, because the void produced no reversal.

**What is NOT wrong (stated fairly):** the originals are preserved — all four voided bills still
exist as rows with `voided_at` set, none deleted. That half of WORM holds. Siblings are untouched
(`5a1d7268`, `304f5fa3`, `0fe49cd0` all still `(live)`). The defect is precisely and only the
missing reversing entry.

**FIX REQUIREMENT (CC-1, money):** the void path must post a reversing JE — DR 2000 / CR 5400 for
each voided bill's original amount, same entity, linked to the original via
`reversal_of_line_id` / `reversed_by_line_id`, reusing the existing poster (**write no new GL math**).
Then back-post reversals for the 3 already-voided bills carrying live postings so the $1,643.21 clears.

**GUARD:** assert no bill with `voided_at IS NOT NULL` has un-reversed postings — i.e. for every
voided source transaction, `SUM(debit) - SUM(credit) = 0` across original + reversal, and every
original posting has a non-null `reversed_by_line_id`. This is a shrink-only ratchet and would have
caught this the moment the void ran.

Board row `LV-VOID-NO-REVERSAL` — **CC-1, critical**.

### 28a — `LV-VOID-NO-REVERSAL` extends to AR: it is the VOID PATH, not a bill-specific bug

Checked every USMCA invoice for the same shape:

| invoice | status | total | voided_at | postings | **reversals** | verdict |
|---|---|---|---|---|---|---|
| INV-2026-00001 | void | $1.00 | 2026-08-05 23:16:48 | **2** | **0** | ❌ **same defect — un-reversed** |
| INV-2026-00002 | void | $1.00 | 2026-08-05 23:16:48 | 0 | 0 | ✅ nothing to reverse (never posted) |
| INV-2026-00004 | void | $0.00 | 2026-08-05 23:14:59 | 0 | 0 | ✅ nothing to reverse |
| INV-2026-00003 | partial | $1,200.00 | (live) | 2 | 0 | ✅ live, correctly posted |
| INV-2026-00005 | proforma | $2,450.00 | (live) | 0 | 0 | ✅ correct — Event 1 has not fired (item 16) |

**So the defect is in the VOID PATH ITSELF, across document types** — AR and AP both. `INV-2026-00001`
was voided on **2026-08-05**, two days before the bill voids, and is *also* un-reversed. This is not a
one-off from the recent duplicate remediation; it is how void has been behaving.

**Materially:** the AR residue is only **$1.00**, so the dollar exposure remains dominated by the
$1,643.21 on the AP side. But the *fix* must be made at the void path, not patched per-document-type,
or the next voided invoice reintroduces it at whatever amount that invoice happens to carry.

**WORM checklist result for the void pass — 3 of 5 PASS:**

| requirement | result |
|---|---|
| a. reversing JE posted, DR=CR nets zero | ❌ **FAIL — no reversal exists on any voided doc** |
| b. original preserved (`voided_at` set, not deleted) | ✅ PASS — all 4 bills + 3 invoices still exist as rows |
| c. append-only audit row written | ✅ PASS — **4 `audit.row_changes` rows on `bills`** at the exact void timestamp, one per voided bill (audit table 2,312,528 rows total) |
| d. siblings untouched | ✅ PASS — `5a1d7268`, `304f5fa3`, `0fe49cd0` all still `(live)` |
| e. entity balance reflects the net correctly | ❌ **FAIL — $1,643.21 residue in 2000/5400** |

Both failures are the same single missing behaviour. Everything else about void is correct.

### 28b — ★ The reversal flag was ON. "It was gated off" is NOT the explanation.

Before CC-1 investigates `LV-VOID-NO-REVERSAL`, the obvious first hypothesis — *the reversal was
gated off* — is **ruled out on prod**:

| flag | TRANSP | TRK | **USMCA** |
|---|---|---|---|
| **`MONEY_CONTROL_VOID_REVERSAL_ENABLED`** | true | true | **true** |
| `VOID_ENFORCEMENT_ENABLED` | true | true | **true** |
| `WO_VOID_ENABLED` | true | true | **true** |
| `VOID_QBO_MIRROR_ENABLED` | false | false | **false** ✅ correct — no QBO write-back |

**The void-reversal control is ENABLED for USMCA and the reversal still did not post.** So this is a
code defect in the void path, not a configuration state. (Note the same key-default-vs-override
pattern as `LV-BANKFLAG-STALE`: CI logs describe this key as "per-entity, default OFF", and the
per-entity override is ON — the effective state is what matters.)

`VOID_QBO_MIRROR_ENABLED = false` on all three is **correct and should stay** — QBO write-back is
never on (parallel books). Nothing in the fix should change that flag.

### 28c — Void/cancel pass: remaining voidable inventory on USMCA

| document | total | voided/cancelled |
|---|---|---|
| customer payments | 1 | 0 |
| journal entries | 19 | 0 |
| driver settlements | **1** | 0 |
| vendor credits | **0** | — (no create path, item 26) |
| loads | 3 | 0 |
| work orders | **0** | — (cannot be created, `LV-WO-NOSAVE`) |

Two battery items are **structurally unreachable**, not skipped: **vendor-credit void** (nothing can
create a vendor credit — item 26) and **work-order cancel** (nothing can create a WO — item 15).
Recorded so they are not later mistaken for untested.

`driver_settlements` moved 0 → **1** since the previous baseline — another lane created one. Noted per
the diff-don't-assume rule.

### 28d — The three inert submit handlers are STILL UNFIXED on the current deploy

Prod advanced twice this session (`e6343f4` → `251eaf7` → `bf1a21c`). **No fix has landed for any of
the three.** Verified by reading `origin/main` history rather than re-clicking the UI: the only
work-order commit in the window is `68c32e162` (MNT-F05, entity scope on the WO load number) — not
the submit handler. Nothing touches the stops save or the liability spawn.

So `LV-STOPS-NOSAVE`, `LV-WO-NOSAVE` and `LV-SPAWN-LIABILITY-NOSAVE` remain OPEN and still block
delivery→revenue, the whole Maintenance module, and Safety→Insurance→Legal. **Re-testing them in the
browser would prove nothing while the code is unchanged** — cheaper and more honest to say so than to
re-run the clicks and report the same failure as if it were new evidence.

**Landed this session and relevant:** `915ab9b43` (CC-1 ACCT-F142 — the duplicate-bill fix, which is
what performed the voids in item 28) and `df429772e` (CI-DEPENDABOT — matches my `LV-CI-DEPENDABOT-RED`).

## 29 — ★★ `LV-REVREC-NOT-FIRING`: Event 1 of the two-event revenue latch does NOT fire on delivery — FAIL (critical, money) — resolves the GL-DARK P0

Item 16 left `CLS-SUBLEDGER-GL-DARK` **UNVERIFIED** because I could not reach a delivered load
(`LV-STOPS-NOSAVE` blocked it). **Two USMCA loads have since reached delivery status**, so the test
is now runnable — and it fails.

**All four preconditions are satisfied, verified individually on prod:**

| precondition | state |
|---|---|
| 1. Owner-locked rule exists | ✅ `.block-ready/REVENUE-RECOGNITION-TWO-EVENT-LATCH-2026-07-19.json`: **Event 1 at `delivered` / `delivered_pending_docs` → DR Unbilled Revenue / CR Line-Haul Income** |
| 2. Flags enabled for USMCA | ✅ `REVENUE_RECOGNITION_ENABLED` **true**, `REVENUE_RECOGNITION_POST_ENABLED` **true** (item 16b) |
| 3. **The account exists** | ✅ `catalogs.accounts` **USMCA `1150` "Unbilled Revenue"**, type Asset (TRANSP has `1240`) |
| 4. **A load is in the trigger state** | ✅ `LUSMCAFREIGHT-20260806-0001` = **`delivered_pending_docs`**; `L-20260802-0258` = **`delivered`** |

**And the posting is absent:**

| account | postings | net | source types |
|---|---|---|---|
| **1150 Unbilled Revenue (USMCA)** | **0** | — | — |
| 4000 Freight / Line-haul Income | 3 | $1,200.00 Cr | **`invoice` only** |

**Zero postings to Unbilled Revenue.** Every dollar of revenue on USMCA arrived via
`source_transaction_type = 'invoice'` — the direct invoice path — **not one came from a delivery
event.** Event 1 has never fired.

**This is the GL-DARK P0, now proven rather than inferred.** The earlier honest verdict was
"UNVERIFIED — could not reach a delivered load." That obstacle is gone, and with the account present,
the flags on, and a load sitting in the exact trigger state the locked spec names, the conclusion is
no longer avoidable: **the delivery→revenue latch is not wired to fire.**

**Why the account check mattered:** had `1150` been missing, this would have been a seeding gap, not
a posting gap — a completely different fix owned by a different lane. I checked before concluding;
the account is present, so the defect is the trigger.

**Secondary gap recorded:** the locked spec says *"USMCA seeds Unbilled **+ Deferred** flagged dormant
until loads."* USMCA has **Unbilled (1150) but NO Deferred Revenue account** — TRANSP has
`QBO-340 Deferred Revenue`, USMCA has none. Event 2 / deferred treatment may need it. Flagged, not
assumed to be a defect: it may be legitimately unnecessary until deferred revenue actually arises.

Board row `LV-REVREC-NOT-FIRING` — **CC-1, critical**. Note this is a **different defect** from
`LV-VOID-NO-REVERSAL` (item 28) — that one is the void path, this one is the delivery trigger — but
both share a shape worth naming: **a flag is ON, the machinery is present, and the posting simply
never happens.** Two independent money paths with that shape suggests checking whether other
flag-gated posters are equally inert.

## 30 — `LV-PAY-SETTLE-NOPOST`: a live customer payment and a CLOSED settlement both have ZERO GL — FAIL (money)

| document | id | state | GL postings |
|---|---|---|---|
| customer payment | `a0b83bf5-c9fb-485c-a646-9090b8630bb0` | **$250.00, `voided_at` NULL — LIVE** | **0** |
| driver settlement | `d3ff8ea3-4acd-4792-b3ad-fdad6383fbb2` | **status `closed`** | **0** |

Both are money documents in a **final** state carrying **no ledger entry at all**. A received customer
payment should post DR Cash / CR A/R; a closed driver settlement should post its earnings, deductions
and escrow contribution. Neither did.

### 30a — ★ I must correct my own speculation from item 29

In item 29 I suggested the "flag ON + machinery present + posting never happens" shape might be
**systemic**. **The evidence says it is not, and I am correcting that.** Poster census on USMCA
(`journal_entry_postings` grouped by `source_transaction_type`):

| poster | postings | JEs | works? |
|---|---|---|---|
| `bill` | 16 | 8 | ✅ |
| `bank_categorization` | 8 | 4 | ✅ |
| `invoice` | 4 | 2 | ✅ |
| `expense` | 4 | 2 | ✅ |
| `prepaid_purchase` | 2 | 1 | ✅ |
| `transfer` | 2 | 1 | ✅ |
| `(null)` | 2 | 1 | ⚠️ posting with **no `source_transaction_type`** — minor data-quality note |

**Six posters demonstrably fire.** The money engine broadly works. So the correct characterisation is
**four specific inert paths**, not a systemic failure:

1. **revenue-on-delivery** (Event 1) — item 29
2. **void-reversal** — item 28
3. **customer payment** — this item
4. **driver settlement** — this item

That distinction matters for whoever picks this up: it is four targeted wirings against a working
poster, **not** a rebuild of the posting engine. Overstating it as systemic would have sent a builder
down the wrong path — which is why the census was worth running before repeating the claim.

**Caveat stated honestly:** a settlement in `closed` state *should* have posted, and a live customer
payment *should* have posted — but I have **not** read the code to confirm those are the intended
trigger points, and there may be a further "paid"/"disbursed" step for settlements. **The zero-GL
facts are proven; the exact intended trigger is UNVERIFIED.** CC-1 should confirm the trigger before
wiring.

Board row `LV-PAY-SETTLE-NOPOST` (CC-1, money).

## 31 — ★ LOAD CANCEL — PASS on all five WORM criteria, with a working cascade

Cancelled `L-20260806-0005` (`a0b1df25-…`, assigned-not-dispatched — the realistic cancel case)
through the real UI. The modal is well built: **Cancellation Reason (required)**, **Notes (min 20
chars, required)**, **Billable to customer**, optional **Cancellation charge**, and `Confirm Cancel`
**disabled until a reason is selected**.

**Cancellation-reason catalog loads correctly** with real codes — `CUST_NO_LONGER_NEEDED`,
`CUST_RATE_TOO_LOW`, `CUST_NO_SHOW_AT_PICKUP`, `CUST_DOUBLE_BROKERED`, "No available unit" — plus an
inline `+ Create cancellation reason` (the §7 inline-create pattern). Note this catalog works while 21
others 500 (`LV-CAT-500`) — it is served by a different endpoint.

**Result on prod:**

| check | result |
|---|---|
| a. reversing entry | **N/A — correctly** (the linked invoice was a `proforma` with **0 postings**; there was nothing to reverse) |
| b. original preserved | ✅ `status = cancelled`, **`soft_deleted_at` NULL — not deleted** |
| c. append-only audit row | ✅ **1,828 audit rows** in the window, covering **`loads` AND `invoices`** — both the cancel and the cascade were audited |
| d. siblings untouched | ✅ `LUSMCAFREIGHT-20260806-0001` still `delivered_pending_docs`; `L-20260802-0258` still `delivered` |
| e. entity balance correct | ✅ no GL impact — the proforma never posted, so nothing to unwind |

**★ THE CASCADE WORKS:** cancelling the load **auto-voided its linked invoice** —
`INV-2026-00005` moved to `status = void`. Load→invoice cascade is wired, and it did the right thing
(a proforma for a cancelled load should not survive).

### 31a — ★ This is the diagnostic contrast CC-1 needs for `LV-VOID-NO-REVERSAL`

**The CANCEL path is correct. The VOID path is not.** Same system, same entity, same WORM law:

| | cancel (item 31) | void (item 28) |
|---|---|---|
| original preserved | ✅ | ✅ |
| audit row written | ✅ | ✅ |
| siblings untouched | ✅ | ✅ |
| **reversal posted** | ✅ N/A, nothing to reverse | ❌ **$1,643.21 left on the books** |
| cascade to linked docs | ✅ invoice auto-voided | — |

So the void defect is **not** a missing framework — cancel demonstrates the surrounding machinery
(audit, preservation, cascade) all works. **CC-1 should diff the cancel implementation against the
void implementation**; the cancel path appears to do correctly what void omits. That is a far cheaper
starting point than writing reversal logic from scratch, and it satisfies "reuse the existing poster,
write no new GL math."

**Caveat:** cancel was tested on a load whose invoice had **zero postings**, so it never had to emit a
reversal. This proves cancel's preservation/audit/cascade behaviour, **not** that cancel would post a
correct reversal if there were postings to unwind. **UNVERIFIED** on that specific point — do not read
this as proof that cancel reverses correctly.

### 28e — ★ `LV-VOID-NO-REVERSAL` verified at the JOURNAL-ENTRY level too — the ledger never learns the bill was voided

I originally proved this at **posting** level (`reversal_of_line_id` / `reversed_by_line_id` NULL).
`accounting.journal_entries` also carries its own reversal columns (`reversed_by_je_id`,
`reverses_je_id`, `voided_at`, `void_reason`), so I re-checked there before letting my own finding
stand. **It holds, and the JE-level view is the cleaner statement of the defect.**

**USMCA journal entries, whole-entity census:** 19 total, **all `status = posted`**,
**0 voided**, **0 with `reversed_by_je_id`**, **0 that are themselves a reversal (`reverses_je_id`)**.
There is no reversing journal entry anywhere on this entity.

**The three JEs behind the voided bills — every one still fully posted:**

| bill | amount | bill `voided_at` | JE | **JE status** | JE voided | reversed_by |
|---|---|---|---|---|---|---|
| CC3-BILL-20260806-01 | $743.21 | 2026-08-07 00:33:50 | `811cb8bc-99dd-41ab-8822-1a9219d94a6c` | **posted** | not voided | none |
| TEST-BILL-0806-A | $450.00 | 2026-08-07 00:33:50 | `570ba3b6-7795-4cd7-98c5-596af46a501e` | **posted** | not voided | none |
| TEST-BILL-0806-A | $450.00 | 2026-08-07 00:33:50 | `faeccb0d-cbc3-4fc0-b2b8-9be7206cf7b5` | **posted** | not voided | none |

$743.21 + $450.00 + $450.00 = **$1,643.21** — matching the residue measured in item 28 exactly, from
an independent direction.

**The sharpest way to state the defect: the bill is voided, but its journal entry is still
`status = posted`, not voided, and has no reversal. The ledger never learns the bill was voided at
all.** Voiding currently touches only the subledger document; the GL is left untouched.

**This gives CC-1 three exact JE targets** for the back-post, and tells them the fix must address the
journal entry (void or reverse it), not merely stamp `voided_at` on the bill.

**Method note:** I checked the JE-level columns specifically because finding the defect at posting
level did not rule out the reversal being recorded elsewhere. Had `reversed_by_je_id` been populated,
my original finding would have been wrong. It was worth the one query to be sure of my own claim
before CC-1 spends time on it.

### 28f — ★★ REFINEMENT: invoice-void DOES reverse. Bill-void does not. There is a working reference implementation.

The Manual Journal Entries screen surfaced JE `43b3ed80-c2f6-4fa1-a53d-6ba0d480697c`, memo
**"Void reversal of invoice e4d2ebdd-…"**, dated **2026-08-02**. Verified on prod:

| field | value |
|---|---|
| status / source | `posted` / `auto` |
| **legs** | **`1100 credit $1.00` \| `4000 debit $1.00`** — a correct flip of an invoice posting (DR A/R / CR Revenue reversed) |
| `reverses_je_id` | **NULL** |
| `reversed_by_je_id` | **NULL** |

**Two conclusions, and they change the shape of `LV-VOID-NO-REVERSAL`:**

**1. The reversal capability EXISTS and has fired correctly — for INVOICE void.** An automatic,
balanced, correctly-flipped reversing JE was produced on 08/02. So this is **not** a missing
framework and **not** "reversal has never worked." **Bill void (08/07) simply does not do what
invoice void does.** CC-1 has a working reference implementation to copy rather than logic to invent
— which is both cheaper and satisfies "reuse the existing poster, write no new GL math."

**2. Even the working reversal leaves `reverses_je_id` NULL.** The reversing JE is not linked to the
entry it reverses. So there is **no programmatic way to walk reversal → original**; the relationship
survives only as free text in the memo. That is a real audit-trail weakness independent of the bill
defect: a reversal that cannot be traced to its original is not a complete audit chain, and any
report or guard trying to net originals against reversals cannot do it by join.

**Revised statement of the defect for CC-1:**
- **(a)** bill void does not emit the reversing JE that invoice void does — **copy the invoice-void path**;
- **(b)** when a reversal IS emitted, populate `reverses_je_id` / `reversed_by_je_id` so the chain is
  traceable — currently the only link is prose in `memo`.

**Correcting my own earlier wording:** items 28/28e said "no reversing journal entry exists anywhere
on this entity." That was true of the **`reverses_je_id` census** but **overstated as prose** — a
reversal JE does exist (43b3ed80); it simply isn't *linked*, which is why the column-based census
returned zero. The measurement was right, my sentence around it was too broad, and the corrected
version above is what CC-1 should work from.

## 32 — ★★ JE VOID — PERFECT WORM REVERSAL (PASS) — and it pinpoints the bill-void defect exactly

Voided JE `ff286e60` (Expense posting, $1.00) through the real UI. The drawer states its contract
up front: *"Voiding posts an **equal-and-opposite reversing entry** and keeps the audit trail. This
can't be undone."* Reason required (min 3 chars). **It delivers exactly that.**

**Prod result — the pair:**

| | original `ff286e60-f3d2-4912-8e3d-15dbc5f5b8a8` | reversal `ea6a0f05-39df-465d-ba69-1385ccdf57ab` |
|---|---|---|
| memo | Expense 2b520d35… posting | **"Reversal of journal entry ff286e60-…"** |
| legs | **6160 debit $1.00 \| 1000 credit $1.00** | **6160 credit $1.00 \| 1000 debit $1.00** ← exact opposite |
| status | `posted` (preserved, not deleted) | `posted` |
| `reversed_by_je_id` | **`ea6a0f05…`** ✅ forward link | (NULL) |
| `reverses_je_id` | (NULL) | **`ff286e60…`** ✅ back link |
| `void_reason` | — | **"CC3 live battery - WORM reversal verification…"** ✅ captured |
| net | 0 (balanced) | 0 (balanced) |

USMCA JEs 19 → **20**. Every WORM criterion met: equal-and-opposite reversal, original preserved,
reason recorded, **bidirectional linkage populated**, nets to zero.

### 32a — ★★ THE DISCRIMINATOR: three void implementations, three quality levels

This is the most actionable form of `LV-VOID-NO-REVERSAL`. The same system contains **three different
void behaviours**:

| void path | posts reversal? | links `reverses_je_id` / `reversed_by_je_id`? | evidence |
|---|---|---|---|
| **JE void** | ✅ **yes, equal-and-opposite** | ✅ **yes, BOTH directions** | `ff286e60` ↔ `ea6a0f05` (this item) |
| **Invoice void** | ✅ yes | ❌ **no — NULL both ways** | `43b3ed80` (item 28f) |
| **Bill void** | ❌ **no reversal at all** | ❌ n/a | `811cb8bc`, `570ba3b6`, `faeccb0d` (items 28/28e) |

**So the reversal service exists and is CORRECT — bill void simply never calls it.** The fix is not to
write reversal logic; it is to make bill void do what **JE void** already does. JE void is the
best-in-class reference in this codebase: it reverses, preserves, records a reason, and links both
ways.

**I must correct my own earlier statement again:** in item 28f I wrote that `reverses_je_id` is
"never populated." **That was wrong** — it is populated correctly by the JE-void path; only the
invoice-void path leaves it NULL. The corrected picture is the quality ladder above, and it is more
useful than either of my earlier framings.

**Recommended order for CC-1:** (1) point bill void at the JE-void reversal service — that clears the
$1,643.21; (2) add the linkage population to invoice void so its reversals are traceable too;
(3) back-post reversals for the three already-voided bills.

## 33 — Controlled reproduction: bill → GL still PASSES on the current deploy

Created bill `CC3-VOIDTEST-20260807-01` (`7ccd431e-8e85-433a-a5e0-4425011ffb5e`) on deploy `9c62278`:
**$88.77**, Section-A category line `Repairs & maintenance`, vendor = the item-01 vendor.
**Prod: 2 postings, DR 5400 $88.77 / CR 2000 $88.77 — balanced, USMCA-scoped.**

So the bill→GL poster is **still working on the current deploy** — this is a fresh PASS, not a
carry-over from the earlier sample.

## 34 — ★★ `LV-AP-OPEN-INCLUDES-VOIDED`: the Open Bills KPI counts VOIDED bills — $1,766.66 overstated — FAIL (money)

The Bills screen headline reads **`OPEN BILLS $3,174.14 · 11 open`**. Prod says:

| measure | count | amount |
|---|---|---|
| all bills | 11 | **$3,174.14** |
| **live** (`voided_at IS NULL`) | **7** | **$1,407.48** |
| **voided** (`voided_at IS NOT NULL`) | **4** | **$1,766.66** |

**The UI's "OPEN BILLS" figure is `total_all` — it is the ALL-bills total, voided included.** Open
payables are overstated by **$1,766.66**, which is **56% of the displayed figure**. The count is wrong
the same way: 11 shown vs 7 actually live.

**Root cause is the same defect family as `LV-VOID-NO-REVERSAL`, and this makes it concrete:**
**every bill on this entity still has `status = 'unpaid'`, including all 4 voided ones.** Void sets
`voided_at` and nothing else — it does not move `status` to `void`, and the Open-Bills query filters
on `status`, not on `voided_at`. So a voided bill remains "open" everywhere that reads `status`.

Cross-check that the numbers hang together: the $1,766.66 of voided bills = the **$1,643.21** GL
residue (item 28) **+ $123.45** for the fourth voided bill, which had no GL postings.
Both measurements agree.

**Operational impact:** AP aging, cash-requirement forecasting and any vendor-payables report reading
`status` will overstate what the company owes. On the real-books entity this would misstate payables.

Board row `LV-AP-OPEN-INCLUDES-VOIDED` (CC-1, money). **Fix note:** setting `status = 'void'` on void
is likely the single change that corrects both this and the list display — but it must be done
**with** the reversing JE (item 32), not instead of it; correcting the label without correcting the
ledger would hide the $1,643.21 rather than clear it.

## 35 — `LV-BILLS-VENDOR-UUID`: the Bills list Vendor column shows raw UUIDs for every row — FAIL

The Bills list **Vendor** column renders the raw vendor UUID on **every row**, never a name:
`308f6434-0a51-4109-953e-c86ffb1f0999`, `d9bb802f-fad4-421c-a41e-a1e834e33362`,
`40fc1104-896b-4c42-9a5d-971a9e468a…`. Not one vendor name appears in a column headed "Vendor".

The AP bills list is therefore unusable for its primary purpose — telling an operator **who** each
bill is owed to. The data is present and resolvable (the same vendor renders correctly by name in the
bill create drawer and on the vendor detail page), so this is a projection/display defect, not
missing data.

Same class as `LV-INV-UUID` (raw load UUID on the invoice line) and the historical
"Class-UUID renders in picker" card — **resolve ids to human identifiers, entity-scoped**.

Board row `LV-BILLS-VENDOR-UUID` (CC-2 mechanical/FE).

## 36 — ★★ `LV-BILLVOID-DATE-ERROR`: the Void Bill action FAILS with a date-parse error — FAIL (critical) — and it re-diagnoses `LV-VOID-NO-REVERSAL`

Attempted the controlled reproduction: voided the fresh bill `CC3-VOIDTEST-20260807-01`
(`7ccd431e-8e85-433a-a5e0-4425011ffb5e`, $88.77, JE `6f63081e`) through the real UI on deploy
`fb0920c`, with a valid reason.

**The drawer returned a hard error:**

> **`invalid input syntax for type date: "Thu Aug 06"`**

That is a **Postgres date-parse failure**. A date is being sent to the database as the human-formatted
string **`"Thu Aug 06"`** (JavaScript `Date.prototype.toDateString()` shape, and note it is even
truncated — no year) instead of an ISO date. **The void never executes.**

**Prod confirms nothing happened:** the bill is still `voided_at (live)`, `status = 'unpaid'`, its 2
original postings intact, **0 reversal postings**, JE `6f63081e` still `status = posted` with
`reversed_by_je_id` NULL. USMCA JEs went 20 → 21, but the new JE is the bill's **own creation
posting** (`6f63081e`, "Bill CC3-VOIDTEST-20260807-01 posting", DR 5400 / CR 2000 $88.77) — **not a
reversal**. I checked that specifically rather than reading the count as success.

### 36a — ★ This RE-DIAGNOSES `LV-VOID-NO-REVERSAL`, and the correction matters

I had assumed the 4 previously-voided bills went through this UI path and that the path simply
omitted the reversal. **That cannot be what happened — this path cannot complete at all.**

So the accurate picture is:

- **The UI "Void Bill" action has never successfully run** — it dies on date parsing before doing anything.
- **The 4 bills that carry `voided_at` were therefore voided by some OTHER route** — almost certainly
  a direct SQL/script step in CC-1's ACCT-F142 duplicate remediation (all four share the identical
  timestamp `2026-08-07 00:33:50.999787+00`, which is the signature of a single UPDATE, not four user
  actions).
- **That explains the missing reversals cleanly:** a script that sets `voided_at` directly bypasses
  the reversal service entirely. It was never a case of the void path "forgetting" to reverse.

**Revised guidance for CC-1 — two separate defects, in this order:**
1. **`LV-BILLVOID-DATE-ERROR` (this item)** — fix the date serialisation so Void Bill can run at all.
   Until then the UI void is untestable and unusable.
2. **`LV-VOID-NO-REVERSAL`** — the **$1,643.21 already on the books** still needs back-posted
   reversals, because the rows were voided out-of-band. And once (1) is fixed, the UI path must be
   re-verified to confirm it actually emits the reversal its own drawer promises.

**The drawer's promise is now a stated contract:** *"Voiding posts an equal-and-opposite reversing
entry and keeps the audit trail."* Identical wording to the JE-void drawer, which **does** honour it
(item 32). So the bill-void drawer advertises behaviour that currently cannot execute.

**Honest note on my own earlier framing:** items 28/28e/28f/32 described bill void as "does not
reverse." That was a correct description of the *observed data* but an incorrect inference about the
*mechanism* — the UI path doesn't reverse because it doesn't run. The residue and the dollar figures
are unchanged and still stand; the causal story is now right.

Board row `LV-BILLVOID-DATE-ERROR` — **CC-1, critical** (blocks the void path entirely).

## 37 — ★★ `LV-BILLVOID-DATE-ERROR` ROOT CAUSE FOUND — one line, and it explains everything

**`apps/backend/src/accounting/bills.service.ts:1764`:**

```js
const originalDate = String(billRaw.bill_date).slice(0, 10);
```

**The mechanism.** The `pg` driver returns a Postgres `date` column as a **JavaScript `Date` object**,
not a string. So:

- `String(new Date('2026-08-06'))` → `"Thu Aug 06 2026 00:00:00 GMT+0000 (UTC)"`
- `.slice(0, 10)` → **`"Thu Aug 06"`**

…which is passed as `originalDate` into `postVoidReversal` and reaches Postgres as a `date`, producing
the exact error observed live: **`invalid input syntax for type date: "Thu Aug 06"`**. The line
assumes an ISO string (where `.slice(0,10)` correctly yields `2026-08-06`); it gets a Date object.

**★ And the surrounding code resolves the whole puzzle.** The comment immediately above reads:

> *"Post the reversing JE **BEFORE** the status flip so both land atomically on this client."*

and the block is `if (flagOn)` — gated on `MONEY_CONTROL_VOID_REVERSAL_ENABLED`, which I verified is
**true for USMCA** (item 28b). So:

1. **The reversal IS implemented** — this corrects my repeated earlier characterisation that bill void
   "doesn't reverse." It does; the code is there and its intent is correct.
2. **It throws on the date before it can post.**
3. **Because the reversal runs BEFORE the status flip and both are in one transaction, the throw rolls
   the ENTIRE void back** — which is exactly why the bill was left un-voided with no reversal and no
   partial state. That is actually *correct* transactional behaviour around a broken input.
4. **And it explains the 4 out-of-band voids**: since this path cannot complete, those rows must have
   been set by direct SQL, which bypassed this reversal block entirely.

**One-line fix shape** (CC-1's call, not mine): normalise to ISO before slicing — e.g. use the same
date-normalisation the working JE-void path uses, or `toISOString().slice(0,10)` / a shared helper.
**Do not "fix" it by removing the reversal.**

### 37a — Same pattern appears at 13 other sites — a CANDIDATE class, not 14 proven bugs

`String(<date>).slice(0, 10)` occurs **14 times** across the backend. **Exactly one is proven broken**
(the bill-void line above, where I have the live error). The other 13 are **candidates** — each is a
bug only if that column is returned as a `Date` object rather than a string, which depends on the
column type and driver parsing:

`invoice-send.service.ts:216` (`issue_date`) · `cash-basis/engine.ts:90` · `applicants.routes.ts:70`
(`date_of_birth`) · `compliance-aggregate.service.ts:22,35` · `form-2290.routes.ts:144`
(`acquired_date`) · `csa.routes.ts:147` (`due_date`) · `filings-aggregate.service.ts:47` ·
`driver-scheduler.service.ts:792,794` (`start_date`/`end_date`) · `cert-monitor.service.ts:130` ·
`obligation-reconcile.routes.ts:215,242` (`issue_date`/`bill_date`)

**I am deliberately NOT claiming these are all defects.** Several land in read/display paths where a
malformed string may never reach Postgres as a `date`, and would degrade rather than throw. But
`obligation-reconcile.routes.ts:242` uses `bill_date` — the *same column* that fails in bill void —
and `invoice-send.service.ts:216` sits on the invoice send path, so both are worth checking first.

**Recommended:** fix the proven site, then sweep the pattern with a shared date-normalisation helper
and a guard that bans `String(...).slice(0, 10)` on a value sourced from a `date`/`timestamp` column.
That converts a recurring foot-gun into a one-time fix.

## 38 — ★★ CLASS BOUNDED: exactly ONE of five void paths is broken, and the correct fix already exists in a sibling file

Scoped the date defect at source rather than by clicking each screen. **`postVoidReversal` has five
production callers**, and only one mangles the date:

| # | caller | how it computes `originalDate` | verdict |
|---|---|---|---|
| 1 | **`bills.service.ts:1764`** | **`String(billRaw.bill_date).slice(0, 10)`** | ❌ **BROKEN — proven live** |
| 2 | **`invoices.routes.ts:831-832`** | **type-checked**: `typeof rawDate === "string" ? rawDate.slice(0,10) : new Date(rawDate).toISOString().slice(0,10)` | ✅ **CORRECT — handles both shapes** |
| 3 | `journal-entries.service.ts:555` | `originalDate: existing.entry_date` (passed raw) | ✅ works — proven live (item 32) |
| 4 | `amortization-posting.service.ts:823` | `originalDate: je.entry_date` (raw) | ✅ same safe pattern |
| 5 | `loan-payment-posting.service.ts:395` | `originalDate: je.entry_date` (raw) | ✅ same safe pattern |

**★ The fix is a copy of line 831-832 from `invoices.routes.ts` into `bills.service.ts:1764`.** The
codebase already contains the correct, defensive implementation of exactly this computation — three
files away, for the sibling document type. Nothing new needs designing.

### 38a — This closes the whole void investigation. Everything now agrees.

The quality ladder I measured empirically (item 32) is fully explained by the code:

| path | observed behaviour | code explanation |
|---|---|---|
| **JE void** | reversal ✅ + both links ✅ | passes `entry_date` **raw** (no mangling) **and** writes bidirectional header linkage (`journal-entries.service.ts:464` — *"Posts a LINKED reversing JE … and writes the bidirectional header linkage"*) |
| **Invoice void** | reversal ✅, links ❌ | date handled **defensively and correctly**, so it posts — but it calls `postVoidReversal` without the header-linkage step JE-void adds |
| **Bill void** | **no reversal, void rolls back** | `String(...).slice(0,10)` → `"Thu Aug 06"` → throws before posting; reversal precedes the status flip in one transaction, so the whole void reverts |

Three independently-observed behaviours, one consistent code-level explanation. **No remaining
unexplained facts in this investigation.**

**And it confirms the earlier live evidence was right:** invoice reversal JE `43b3ed80` exists
(item 28f) precisely *because* path 2 handles the date correctly — that was not luck.

**Bounded scope for CC-1 — three ordered changes, all small:**
1. `bills.service.ts:1764` — adopt the invoice-void date handling. Unblocks bill void entirely.
2. Add the bidirectional linkage step to invoice void so its reversals are traceable
   (`reverses_je_id`/`reversed_by_je_id`), matching JE void.
3. Back-post reversals for the **$1,643.21** already voided out-of-band, which no code path will
   clean up on its own.

**Deliberately NOT claimed:** the other 13 `String(<date>).slice(0,10)` sites elsewhere in the backend
(item 37a) are still only *candidates* — none of them call `postVoidReversal`, so they are outside
this class and need their own check. Bounding the void class does not bound those.

---

## 39. ROOT CAUSE — `LV-REVREC-NOT-FIRING`: every gate passes, so the poster was never CALLED

**Verified 2026-08-07 on Neon prod `br-fancy-credit-akjnd07a`, USMCA `5c854333-…`, `current_user = ih35_app`.**

Item 29 proved Event 1 never fires. This item proves **why**, the same way item 37 closed the void
class: by reading the poster and then executing **its own verbatim SQL** against prod, gate by gate.

**The poster exists and is reachable:** `apps/backend/src/accounting/revrec-delivery-posting/poster.service.ts:310`
`postLoadRevenueLatch()`. It refuses to post only through nine named early-return gates. Each was
measured live for `LUSMCAFREIGHT-20260806-0001`:

| # | gate | measured on prod | fires? |
|---|---|---|---|
| 1 | `wrong_status` | status = `delivered_pending_docs`; `resolveEvent` (`:300-305`) maps both `delivered` **and** `delivered_pending_docs` → `earn` | **no** |
| 2 | `flag_off` | `lib.feature_flag_overrides`: `REVENUE_RECOGNITION_POST_ENABLED` = **true** for USMCA | **no** |
| 3 | `latch_table_missing` | `to_regclass('accounting.load_revenue_recognition_postings')` → **the table exists** | **no** |
| 4 | `trk_excluded` | company code = `USMCA` (TRK is `b49a737b…`, correctly flag-`false`) | **no** |
| 5 | `load_not_found` | load present | **no** |
| 6 | `already_posted` | **0** latch rows for this load | **no** |
| 7 | `missing_delivery_evidence` | **the function's exact query returns `2026-08-06 17:03:35.076384+00`** | **no** |
| 8 | `earn_missing_for_bill` | n/a for `earn` | **no** |
| 9 | `zero_amount` | `rate_total_cents` = **100** (> 0) | **no** |

**ALL NINE GATES PASS AND NO ROW EXISTS.** Gate 7 was not assumed — `finalActiveDeliveryDepartureAt`
(`:277-298`) is narrower than a naive check (it takes `ORDER BY sequence_number DESC LIMIT 1`, so only
the **highest-sequence** delivery stop counts), so its query was run **verbatim** rather than
approximated. It returns a timestamp. The delivery stop is `sequence_number 2`, `stop_type delivery`,
`status departed`, `soft_deleted_at NULL`.

> **Therefore the failure is NOT a gate. `postLoadRevenueLatch` was never invoked for this load.**

**POSITIVE CONTROL — INTERNAL TO THE SAME TABLE (so this is not an RLS artifact).**
`accounting.load_revenue_recognition_postings` holds **2 rows**, `n_live_tup = 2`, `n_tup_ins = 2`:
TRANSP load `L-20260624-0083` has **both** `earn` and `bill` at $15,000.00 (2026-07-30). **The poster
demonstrably works and can write to this table.** The USMCA zero is a real zero, not a masked read.

**WHY IT FAILED SILENTLY — by design, and the design is defensible.**
`apps/backend/src/dispatch/delivery-evidence-latch.ts` states in its own header that
**"SWALLOW-AND-LOG IS DELIBERATE"** — *"a latch failure must never 500 the driver's 'I departed the
delivery' tap. Losing the stop capture is worse than deferring recognition."* That is a **correct**
trade-off, and it explains why item 29 saw an absent posting with no user-visible error anywhere.
**The swallow is not the defect — but it is why the defect was invisible, and it means this class can
never be caught by watching for errors. Only a ledger assertion catches it.**

### ★ SCOPE CORRECTION — only ONE of the two loads is a defect

Item 29 named two loads. That was right about the symptom and **too broad about the cause**:

- `LUSMCAFREIGHT-20260806-0001` (`delivered_pending_docs`) — delivery departure **captured**, all nine
  gates pass → **should have posted. GENUINE DEFECT.**
- `L-20260802-0258` (`delivered`) — its delivery stop has `actual_departure_at` **NULL** and status
  `pending`, so `finalActiveDeliveryDepartureAt` returns null → gate 7 fires → **`missing_delivery_evidence`
  is the CORRECT and intended refusal.** Per the code comment, *"Event 1 earns ONLY on real captured
  delivery evidence — never on status alone."* That is sound ASC-606 conservatism and **must not be
  "fixed"** — recognising revenue on a status flip with no captured delivery would be the worse bug.

**This distinction is the point of this item.** A fix aimed at "loads in delivered status have no
Event 1" would loosen gate 7 and start recognising unearned revenue. **The defect is one load, and it
is an invocation failure, not a gate failure.**

### For CC-1 — what is bounded and what is NOT

**Bounded (proven):** the nine gates are not the cause; the poster works; the table is writable; the
flag is on; the account (`1150`) exists.
**NOT bounded (state honestly):** this lane did **not** determine which caller runs on the
`delivered_pending_docs` transition, nor whether the latch was invoked-and-swallowed versus never
reached. Two wired call sites are known to exist — `delivery-evidence-latch.ts:53` and
`loads.routes.ts:1335`, with a guard `verify-delivery-evidence-latch-wired` — so **"wired" is already
true and is NOT sufficient**; a guard asserting wiring would pass today while the ledger stays dark.
**CC-1 must instrument the swallowed catch (or replay the transition) to see which of the two it is.**

**GUARD REQUIREMENT (this is the one that would have caught it):** assert that a load whose
**highest-sequence active delivery stop has `actual_departure_at` set** and whose status is
`delivered`/`delivered_pending_docs`, with the flag on and a non-TRK entity, **has a balanced `earn`
row in `accounting.load_revenue_recognition_postings`**. Scope it to TMS-native loads (origin test —
QBO-clone loads must not redden it). **A guard on wiring, flags, or account existence reproduces this
exact miss**, because all three were already true.

**Verdict: `LV-REVREC-NOT-FIRING` — root cause LOCATED to invocation, gates EXONERATED, scope narrowed
from 2 loads to 1, and one apparent instance reclassified as CORRECT behaviour.**

---

## 40. ★★ ROOT CAUSE PROVEN — `LV-REVREC-NOT-FIRING` is a CROSS-CONNECTION read-your-own-writes bug

**Item 39 bounded it to "the poster was never invoked, or invoked and silently gated." This item closes
that gap. The latch IS invoked. It reads the delivery evidence on a DIFFERENT database connection than
the one that just wrote it, inside a transaction that has not committed — so the evidence is invisible,
gate 7 fires, and the poster returns a no-op that not even the error log records.**

### The call path, read end to end

| step | file:line | what it does |
|---|---|---|
| 1 | `dispatch/loads.routes.ts:1166` | handler enters `withCompanyScope(...)` |
| 2 | `dispatch/loads.routes.ts:357-368` | `withCompanyScope` → `withCurrentUser` |
| 3 | `auth/db.ts` (`withCurrentUser`) | **`pool.connect()` → `BEGIN`** … `COMMIT` — call it **connection A**. The whole handler body runs inside this ONE open transaction. |
| 4 | `dispatch/loads.routes.ts:1295` | `stampFinalActiveDeliveryDeparture(client, …)` writes `mdata.load_stops.actual_departure_at` **on connection A — uncommitted** |
| 5 | `dispatch/loads.routes.ts:1335` | `postLoadRevenueLatch({...})` — still inside A's transaction |
| 6 | `auth/db.ts:158-166` (`withLuciaBypass`) | **`luciaPool.connect()` → its own `BEGIN`** — **connection B** |
| 7 | `poster.service.ts:277-298` | `finalActiveDeliveryDepartureAt` runs **on B** |

**Step 7 cannot see step 4.** Under READ COMMITTED, connection B reads only committed data; A's stamp is
still in flight. `actual_departure_at` reads **NULL** → gate `missing_delivery_evidence` → the poster
returns `{ posted: false, reason: "missing_delivery_evidence" }`. Then A commits, the departure becomes
visible to everyone, and **nothing ever retries.**

### This explains every observed fact — including the ones that looked contradictory

1. **`actual_departure_at` is present now** (`2026-08-06 17:03:35.076384+00`) — A committed.
2. **Zero latch rows** — the poster no-opped before that commit.
3. **All nine gates pass when queried after the fact** (item 39) — because I queried on a *fresh*
   connection, *after* the commit. **The gates were never wrong; they were evaluated at a moment when
   the evidence genuinely did not exist yet.** Item 39's table is accurate and its conclusion —
   "never invoked" — was the *one* wrong branch; it was invoked, at the wrong instant.
4. **No error appears anywhere, not even in the swallow-and-log.** This is the subtle part: a gate is a
   **return value**, not a throw. The `catch` in `loads.routes.ts:1341` and the deliberate swallow in
   `delivery-evidence-latch.ts` only fire on an exception. A gated no-op logs **nothing at all**. So the
   swallow-and-log policy is not even the reason this was invisible — it would have been invisible with
   no swallow at all.
5. **TRANSP's `L-20260624-0083` posted both events** — consistent: its departure was captured by the
   **driver** path in an **earlier, already-committed** request, so by the time a later request called
   the latch, the evidence was visible on any connection.

### The sharp, falsifiable prediction this makes

> The latch fails **exactly when** the departure stamp and the latch call happen in the **same request**
> (the office "mark delivered" path, ACCT-F81), and succeeds when the departure was committed by an
> **earlier** request (the driver capture path).

That is precisely the split observed: my office-transitioned USMCA load failed; the driver-evidenced
TRANSP load posted. **The office-delivers coupling (ACCT-F81) is what created the same-request case.**
Its own comment shows the dependency was understood — *"the recognition gate in poster.service.ts reads
exactly that timestamp off the final active delivery stop"* — but the **connection boundary** between
the writer and that reader was not. ACCT-F81 added the stamp to make office deliveries recognizable and,
for the same-request path, achieved the opposite.

### Scope — who else is exposed

**Every path that stamps departure and latches in one request.** `stampFinalActiveDeliveryDeparture` is
shared by the office transition, the bulk path and the mdata status path (per its own comment,
*"shared stamp (also used by bulk + mdata status paths)"*). Any of those that also calls the latch in the
same transaction has this bug. **The driver paths are the safe case only by accident of ordering** — they
derive status FROM an already-committed stop event.

### For CC-1 — the fix, and the one option that does NOT work

**Does NOT work:** passing the route's `client` into the poster. The poster needs the RLS bypass
(`SET LOCAL app.bypass_rls='lucia'` + the sentinel company GUC), which is exactly what `withLuciaBypass`
establishes; handing it connection A would run the poster without its bypass context.

**Works, in preference order:**
1. **Fire the latch AFTER the transaction commits** (post-commit hook / after `withCompanyScope` returns).
   Preserves the swallow-and-log policy, preserves the bypass, and makes the evidence unambiguously
   visible. It also matches the existing intent that a latch failure must never 500 the delivery tap.
2. **Pass the departure timestamp into the poster** as an input when the caller just stamped it, so gate 7
   can be satisfied from the caller's own knowledge rather than a re-read. Narrower, but couples the
   caller to the gate.

**GUARD REQUIREMENT — and this is the one that matters:** the existing static guard
`verify-delivery-evidence-latch-wired` **passes today and always would have**, because the call *is*
wired — wiring was never the problem. **A guard asserting wiring cannot catch a visibility bug.** The
guard that catches this asserts on the **ledger**: a load whose highest-sequence active delivery stop has
`actual_departure_at` set, status `delivered`/`delivered_pending_docs`, flag on, non-TRK, **must have a
balanced `earn` row** in `accounting.load_revenue_recognition_postings` (scoped to TMS-native loads per
the origin test). That is a live-data assertion, not a static scan.

### Correction to item 39, stated plainly

Item 39 concluded "**never invoked**." That was wrong on that one point — it **was** invoked, and gated
on evidence that was real but not yet visible. Every measurement in item 39 stands; the inference from
them did not. **The nine-gate table is what made this findable**: it is precisely *because* all nine
gates passed post-hoc that the timing explanation was the only one left.

### Secondary finding, recorded separately below

While tracing callers, `dispatch/loads-bulk.routes.ts` was found to be an **un-latched** delivery-evidence
writer — see item 41. It is a **different** defect from this one and must not be merged into this fix.

---

## 41. NEW DEFECT — bulk "Mark delivered" stamps delivery evidence and NEVER latches; the guard is blind to it

**Found while tracing item 40's callers. This is a SEPARATE defect from item 40 and needs its own fix.**

`apps/backend/src/dispatch/loads-bulk.routes.ts`, action `set_status`:

- **Accepts the delivery-evidence statuses.** `setStatusPayloadSchema.transition` is
  `dispatchStatusSchema` (`load-state-machine.ts:3-14`), which includes **`delivered_pending_docs`** and
  **`completed_docs_received`**. `PER_LOAD_ONLY_TRANSITIONS` (`:23`) excludes only `abandoned`,
  `driver_walkoff`, `driver_no_show` — **the delivery statuses are NOT excluded.**
- **Writes the status** — `UPDATE mdata.loads SET status = $3::mdata.load_status_enum` (`:90-97`), from a
  runtime value `toMdataStatus(statusPayload.transition)`, never a literal.
- **Stamps the delivery departure** — `loadStatusRequiresDeliveryDepartureStamp(mdataStatus)` (`:99`),
  which is exactly `DELIVERY_EVIDENCE_STATUSES.has(status)`
  (`stamp-final-delivery-departure.ts:27-29`) → calls `stampFinalActiveDeliveryDeparture`.
- **Emits the dispatch spine event** (`:104`).
- **NEVER references `latchOnDeliveryEvidence` or `postLoadRevenueLatch`.**

**So an office bulk "Mark delivered" creates delivery evidence, tells the workflow spine the load
delivered, and the ledger hears nothing.** That is verbatim the defect CLS-DISP-WIRE-07 was written to
eliminate — *"every path that moves a load INTO a delivery-evidence status must fire the two-event
revenue latch"*. The bulk path got the **stamp** half of WIRE-07 and not the **latch** half.

**The file's own comment shows the hole was half-seen** (`:19-23`): *"Bulk set_status does NOT run those
financial hooks, so moving a load into one of these states in bulk would silently skip the escrow
proposal and the settlement ping. Route them to the per-load action instead of losing the side-effects."*
The author identified exactly this failure mode and fenced off **three** statuses — but not the delivery
statuses, and did not add the latch call. **The delivery-evidence statuses fall through the very hole
that comment was written to close.**

### The guard passes green while the hole is open — PROVEN, not argued

`scripts/verify-delivery-evidence-latch-wired.mjs` decides scope with
`assignsEvidenceStatus()`, a regex requiring a **string-literal assignment**:
`(?:=|\?|:)\s*["']delivered_pending_docs["']`. The bulk route sets the status from a **variable**
(`$3` ← `mdataStatus`), so nothing matches. Its only literal occurrence sits inside
`new Set([… , "delivered_pending_docs", …])` (`:42`), preceded by a **comma** — which the regex does not
accept. **The file is therefore never even considered.**

Executed live, 2026-08-07, on `audit/cc3-live-battery-20260806`:

```
file mentions delivered_pending_docs : true
guard matcher says it ASSIGNS status : null
file references the latch            : false
=> guard IN SCOPE for this file      : false

$ node scripts/verify-delivery-evidence-latch-wired.mjs
verify-delivery-evidence-latch-wired OK — every delivery-evidence transition fires the revenue latch
exit=0
```

**The guard prints "every delivery-evidence transition fires the revenue latch" and exits 0 — and that
statement is false.** The guard's docstring says it scans for the SHAPE so that *"anyone adding a fourth
path (offline sync replay, a bulk driver tool, a telematics auto-complete) reproduces it"* and is caught.
**A bulk tool is one of the three examples it names, and it is not caught** — because the matcher
recognises only literal assignment, while the enterprise-normal pattern (validate a payload enum → map →
bind as a parameter) is invisible to it.

**This is the "law = enforced guard or it is not law" failure mode in its most dangerous form: not a
missing guard, but a guard that is green and trusted while the law it encodes is being broken.**

### Two defects, two fixes — do not merge them

| | item 40 | item 41 |
|---|---|---|
| path | per-load office transition | bulk `set_status` |
| latch call | **present**, fires at the wrong instant | **absent entirely** |
| cause | cross-connection read-your-own-writes | never wired |
| fix | latch after commit | call the latch (after commit — item 40 applies here too) |

**Fixing item 40 alone leaves the bulk path dark. Fixing item 41 alone reproduces item 40's timing bug
in a second place** — because the bulk route stamps the departure on its own `client` in the same
transaction, so a latch naively added there would hit the identical invisibility. **Item 41's fix must
adopt item 40's after-commit ordering.**

**GUARD REQUIREMENT:** widen `assignsEvidenceStatus` to catch non-literal status writes — any file that
`UPDATE mdata.loads SET status` **or** calls `stampFinalActiveDeliveryDeparture` must reference the latch
or be explicitly exempted with a stated reason. The `stampFinalActiveDeliveryDeparture` call is the
better signal: **stamping delivery departure is the definition of "this path delivers a load"**, it is a
single shared helper, and it cannot be written as a variable. Pair it with the live ledger assertion from
item 40 — a static guard alone cannot catch item 40, and a ledger guard alone would not name the file.

---

## 42. FIXED (CC-3 lane) — the false-green guard now catches the parameterized shape

**This is the one thing in items 40/41 that is CC-3's own lane (CLAUDE.md §3: mechanical / CI-guards,
non-financial). Fixed in the same session it was found, not boarded and left.**

`scripts/verify-delivery-evidence-latch-wired.mjs` — `assignsEvidenceStatus()` widened from
literal-only to three signals:

1. the original literal assignment (unchanged);
2. **`stampFinalActiveDeliveryDeparture(` is called** — the *definitional* signal that a path delivers
   a load. It is a single shared helper and, unlike a status string, **a function call cannot be
   hidden behind a variable**, so it survives the validate→map→bind pattern that defeated the literal
   scan;
3. belt-and-braces: `UPDATE mdata.loads` + `SET status` + the file names an evidence status.

Signal 3 deliberately requires `SET status` specifically, so `mdata/driver-team.service.ts` — which
writes `SET team_id` and only *reads* `delivered_pending_docs` in an `ACTIVE_LOAD_STATUSES` filter
list — is **not** false-positived. That was checked by reading the file before shipping the rule.

**Selftest extended from 6 cases to 8, and the new cases are the ones that matter:**
- **case6** — the exact parameterized shape that was invisible (validate enum → `toMdataStatus` →
  bind `$3`, plus the stamp call and a `new Set([… "delivered_pending_docs" …])`) **must be caught**.
- **case7** — same shape *with* a latch call **must stay clean** (proves the widening did not become
  an unconditional flag).
- **case8** — a writer of a *different* column that merely reads an evidence status **must not** be
  flagged.

**Removed the old case6, which asserted the real tree was clean.** That conflated two different
questions — *is the matcher correct* (selftest) and *is the repo compliant* (the main run) — so a
genuine defect would have surfaced as a confusing selftest failure instead of a plain guard failure.

**RESULT, executed 2026-08-07:**

```
$ node scripts/verify-delivery-evidence-latch-wired.mjs --selftest
verify-delivery-evidence-latch-wired: selftest PASS   exit 0

$ node scripts/verify-delivery-evidence-latch-wired.mjs
  ✗ apps/backend/src/dispatch/loads-bulk.routes.ts: calls stampFinalActiveDeliveryDeparture() — it
    records delivery evidence, but never references the revenue latch …
exit 1
```

**Exactly one file flagged — the real defect — and no false positives.** The guard can no longer be
green while the law is broken.

> **★ THE GUARD IS NOW RED, AND THAT IS THE POINT — but it is NOT merged.** It lives on
> `audit/cc3-live-battery-20260806`. Merging it to `main` turns a required check red for **every**
> lane until CC-1 wires the bulk latch. **This lane did not impose that on the other lanes
> unilaterally.** The correct sequence is: CC-1 wires the bulk latch **using item 40's after-commit
> ordering** → the guard goes green → both land together. **That is sequencing, not deferring:** the
> guard is the forcing function and it is already written. **Merging it red immediately is available
> and is the owner's call.**

---

## 43. NEW DEFECT — the book-load wizard silently DROPS the stop ZIP code (0 of 18 stops have one)

**LIVE-PROVEN 2026-08-07, USMCA, booked through the real UI.** Booked `L-20260806-0008`
(`1d5d8733-5891-44fc-891f-078ced5ae66f`), $1,875.50, customer TIO PERFUMES, unit USMCA-001, driver
Juan USMCA-Battery. **I typed `78040` (pickup) and `78205` (delivery) and saw both rendered in the
form fields** before booking.

On prod immediately after:

| field | pickup | delivery |
|---|---|---|
| `address_line1` | `1200 Santa Ursula Ave` ✅ | `500 E Cesar E Chavez Blvd` ✅ |
| `city` | `Laredo` ✅ | `San Antonio` ✅ |
| **`postal_code`** | **NULL ❌** | **NULL ❌** |

**Whole-table check with the completeness discriminator:** `mdata.load_stops` — `postal_code`
non-empty = **0**, total rows = **18**, `n_live_tup` = **18** (visible == live, so this is a real
zero, not an RLS mask). By contrast `city` is non-empty on **10 of 18** and `state` on **9 of 18** —
**those columns persist when supplied; `postal_code` never does, for any row that has ever existed.**
`postal_code` is confirmed the only candidate column (`information_schema`: the address columns are
`address_line1`, `city`, `state`, `postal_code` — there is no separate `zip`), so this is not a
wrong-column read.

**WHY THIS IS A MONEY DEFECT, not cosmetic.** The section is titled **"STOPS · PC\*MILER ROUTING"**,
and the booking screen showed **PRACTICAL 0 · SHORTEST 0 · DEADHEAD 0 · RPM —**. Postal code is the
routing key for PC\*MILER mileage. Without it: **driver pay per mile** (the screen states *"Shortest
miles (yellow) used for driver pay"*), **fuel planning + ETA**, and **IFTA jurisdiction miles** are
all structurally unreachable — and every diesel expense must FK to a load (G18). A load that can
never compute miles cannot settle a per-mile driver correctly or produce a defensible IFTA return.
**LANE: mechanical/FE (CC-2) for the persistence bug; the mileage/IFTA consequence is why it is not
low priority.**

**GUARD:** assert that a load stop created through the booking path with a supplied postal code
persists it — and, as the live assertion, that TMS-native stops are not 100% NULL on `postal_code`
(scoped to TMS-native rows per the origin test, since imported stops may legitimately lack one).

---

## 44. NEW DEFECT — "Load booked and dispatched" toast, but the load was NEVER dispatched

**LIVE-PROVEN 2026-08-07.** After `Override & dispatch` on `L-20260806-0008`, the UI showed a green
**"Load booked and dispatched"** toast (plus "Load saved"). On prod, that load's status is
**`assigned_not_dispatched`** — at `created_at 02:05:48` and still at `updated_at 02:05:51`, and
unchanged on re-query minutes later.

**This is NOT a naming artifact.** `mdata.load_status_enum` contains a real, distinct **`dispatched`**
member (verified via `enum_range`: … `assigned`, **`dispatched`**, `at_pickup`, `in_transit` …,
alongside `assigned_not_dispatched`). The load sits in the *pre*-dispatch state while the UI reports
the post-dispatch one.

**WHY IT MATTERS:** the override was recorded specifically to permit **dispatch** past two DOT
blockers (no CDL expiry, no medical card on file). A dispatcher reading that toast believes a truck is
rolling under an audited override; the record says it never left. **An override audit trail that
attests to an action that did not happen is worse than no override at all** — it is exactly what a
DOT/FMCSA reviewer or an insurer would read. **LANE: mechanical (CC-2)**, but flag the audit
consequence.

**ALSO — this blocked the item-40 empirical test.** The plan was to drive a fresh load
book → dispatch → depart → deliver and watch Event 1 fail on the office path. **The load will not
leave `assigned_not_dispatched`, so the lifecycle is stalled at step 2.** The item-40 root cause
stands on the code + prod evidence already recorded; the end-to-end reproduction is **NOT yet done**
and is stated as such rather than implied.

**GUARD:** assert the success toast is emitted only after the transition the server actually applied —
i.e. the dispatch path must report the *returned* status, never an assumed one.

### Correction to `LV-STOPS-NOSAVE` — partially disproven

Earlier this battery recorded that booking-wizard stops do not save. **That is now too strong.**
`L-20260806-0008`'s stops persisted **address and city** on both rows. The accurate finding is
narrower and is item 43: **`postal_code` specifically is dropped, always.** Recording the correction
because a builder acting on "stops don't save" would go looking in the wrong place.

---

## 45. ★★ NEW DEFECT — the load detail drawer shows a FULLY ASSIGNED load as "Unassigned" (root-caused to a 18-column view)

**LIVE-PROVEN 2026-08-07, USMCA, `L-20260806-0008` (`1d5d8733-5891-44fc-891f-078ced5ae66f`).**

**Symptom.** The Load Detail drawer → *Equipment · Driver · Trailer* renders:
`TRIP TYPE —` · `TRUCK UNIT —` · **`DRIVER Unassigned`** · `DRIVER PAY RATE / MI —`
…while the **load board on the very same screen** shows unit `USMCA-001` for that load. Two views of
one record, disagreeing.

**MY FIRST HYPOTHESIS WAS WRONG, AND THE DB CHECK CAUGHT IT.** I assumed the booking wizard had failed
to persist the assignment. Prod says otherwise:

| field | prod value |
|---|---|
| `assigned_primary_driver_id` | `88c04cf5-9e32-455c-91e5-298a9b331b10` → **Juan USMCA-Battery** |
| `assigned_unit_id` | `bb1e77ab-f052-4d1c-961c-d2cc1289e643` → **USMCA-001** |
| `trip_type` | **`NB`** |

**The wizard saved everything correctly. This is a READ/display defect, not a write defect** — a
distinction that decides which layer gets fixed. A builder told "the booking wizard loses the driver"
would rewrite a form that works.

### Root cause — proven, not inferred

`GET /api/v1/dispatch/loads/:id` (`dispatch/loads.routes.ts:663`, observed live returning **200**)
does `SELECT l.*` **FROM `views.dispatch_load_with_driver_status`** — not from `mdata.loads`.

That view has **18 columns total**. Checked on prod via `information_schema.columns`:

| field the drawer reads | in the view? |
|---|---|
| `trip_type` (`LoadDetailDrawer.tsx:370`) | **ABSENT (0)** |
| `assigned_unit_number` (`:372`) | **ABSENT (0)** |
| `assigned_primary_driver_name` (`:374`) | **ABSENT (0)** |
| `assigned_primary_driver_id` | present (1) |
| `assigned_unit_id` | present (1) |

**Exactly the three fields that render wrong are exactly the three the view does not expose.** No
unexplained facts remain. `undefined` → `—`, and `assigned_primary_driver_name ?? "Unassigned"` →
**"Unassigned"**.

**THE SMOKING GUN IS AN ASYMMETRY IN ONE QUERY.** The same handler *does* resolve a driver name — but
only the **secondary** one:

```sql
NULLIF(TRIM(CONCAT(COALESCE(sd.first_name,''),' ',COALESCE(sd.last_name,''))),'') AS assigned_secondary_driver_name
...
LEFT JOIN mdata.drivers sd ON sd.id = l.assigned_secondary_driver_id
```

There is **no equivalent join for the PRIMARY driver, and none for the unit**. The team-driver field
therefore works while the primary-driver field — the one that matters on every load — does not.

**Corroboration that the defect is local to this endpoint:** the load board renders `USMCA-001`
correctly for the same load, so the list path resolves the unit. Only the detail path is narrow.

**Internally inconsistent within the same file:** `LoadDetailDrawer.tsx:712` and `:849` use
`load.assigned_primary_driver_id` — which **is** in the payload and does work. So the drawer already
proves the ID is available; only the display block reached for names that were never sent.

### Why this is not cosmetic

A dispatcher opening a load sees **"Driver: Unassigned"** on a load that has a driver and a truck
committed. The realistic consequences are double-booking the driver, re-assigning a covered load, or
believing a unit is free. It also violates the total-connectivity law (§10a): a record that IS linked
is displayed as unlinked, and forward drill-through from the load to the driver/unit is broken on the
primary screen for that record.

### Fix — two options, one clearly better

1. **(preferred, lowest risk, matches the code already there)** in the detail handler, add
   `trip_type` and LEFT JOIN `mdata.drivers` / `mdata.units` to compute
   `assigned_primary_driver_name` and `assigned_unit_number` — i.e. **mirror for the primary driver
   exactly what the query already does for the secondary driver**, entity-scoped with the same
   `operating_company_id` predicate the secondary join uses.
2. widen `views.dispatch_load_with_driver_status`. Higher blast radius — the view is shared, and
   `CREATE OR REPLACE VIEW` is append-only per §2, so columns must be appended, not reordered.

**LANE: CC-2 / mechanical.**

**GUARD:** assert the load-detail payload carries a non-null driver name and unit number whenever
`assigned_primary_driver_id` / `assigned_unit_id` are set — a contract test on the endpoint's
response, not a static scan. **A guard that only checked the columns exist on `mdata.loads` would pass
here**, because the columns do exist; the endpoint simply never selects them. That is the same shape
as item 41: the naive guard confirms the wrong thing.

**RELATED, NOT CONFLATED:** the UI hint text at `LoadDetailDrawer.tsx:379` and the handler comment
both reference **`loads.trailer_id`** — a column that **does not exist** on `mdata.loads` (verified:
the only trailer column is `trailer_type`). The handler comment already documents that a prior join on
that non-existent column 500'd every load-detail fetch (42703) and broke the cancel flow. The stale
reference survives in user-facing copy. Minor, but it is the same wrong mental model that caused a
production 500 once already.

**NOT CLAIMED:** whether this shares a cause with `LV-DISPATCH-TOAST-LIES` (item 44). Both concern the
same load, but the dispatch action ran from the booking wizard, not this drawer. **UNVERIFIED — needs
its own check.** They are recorded as separate defects deliberately.

---

## 46. Item 45 CORROBORATED across four views + a bounded observation on the Assigned→Dispatched control

**Verified 2026-08-07, USMCA, `L-20260806-0008`.**

### 45 is now corroborated on four independent surfaces

| surface | driver rendered | unit rendered |
|---|---|---|
| Load board — **List** view | **Juan USMCA-Battery** ✅ | `USMCA-001` ✅ |
| Load board — **Kanban** card (Assigned column) | **Juan …** ✅ | `USMCA-001` ✅ |
| Load board — **Assignment** view (`ASSIGNED UNITS`) | **Juan USMCA-Battery** ✅ | `USMCA-001` ✅ |
| **Load detail drawer** | **"Unassigned"** ❌ | **"—"** ❌ |

**Four surfaces read the same record; three are right and one is wrong.** That removes any remaining
doubt that this is a display defect local to `GET /api/v1/dispatch/loads/:id`, and it kills the
alternative explanation (a data problem) outright — a data problem would break all four. One earlier
screenshot captures the contradiction in a **single frame**: the drawer reads "Unassigned" while the
board row behind it reads `USMCA-001`.

The Assignment view also renders the STATUS pills for the whole entity, which is a useful snapshot:
`L-20260806-0008` **Assigned (not dispatched)** · `LUSMCAFREIGHT-20260806-0001` **Delivered (pending
docs)** · `L-20260806-0005` **Cancelled** · `L-20260802-0258` **Delivered**.

### BOUNDED OBSERVATION — I could not find an office control to advance Assigned → Dispatched

Attempted, all on the live app:
1. **Kanban drag** Assigned → Dispatched — the card did not move.
2. **Kanban card click** — scrolls the board; opens no drawer or menu.
3. **List row action button** (`ref_223`, unlabeled, end of the `L-20260806-0008` row) — clicked, no
   menu appeared.
4. **Assignment board view** — `STATUS` is a read-only pill; the `ASSIGN` column is empty for units
   that are already assigned.

**WHAT I AM NOT CLAIMING.** The Kanban drag failure is **not** evidence of a defect: synthetic
`left_click_drag` events routinely fail against HTML5 drag-and-drop implementations, so I cannot
distinguish a tool limitation from an app bug, and I will not file one on that basis. Likewise
"I could not find a control" is **not** "no control exists" — the driver PWA plausibly owns this
transition (the latch file states the driver capture paths set delivery statuses directly), and there
may be a surface I did not reach.

**Recorded as UNVERIFIED — needs live check**, not as a defect. What *is* established is that the
office board offers no obvious Assigned→Dispatched affordance across the four surfaces above, which is
worth a deliberate answer from whoever owns dispatch UX.

### Consequence for the item-40 replay — stated plainly

The end-to-end reproduction of the revenue-latch failure (book → dispatch → depart → deliver, watching
Event 1 fail on the office path) **remains blocked** at step 2 and is **still not done**. Item 40's
root cause does not depend on it — it rests on the connection-boundary code read plus the prod
evidence already recorded — but the live replay is an outstanding gap and is logged as such rather
than quietly dropped. **Next attempt should use the driver PWA**, which is the surface that actually
performs departures, rather than continuing to hunt the office board.

---

## 47. ★ NEW DEFECT — cancelling a load voids its invoice by STATUS ONLY, never stamping `voided_at`

**LIVE-PROVEN 2026-08-07 on Neon prod, USMCA. Found while taking an AR baseline — before creating
anything.**

`INV-2026-00005` — **`status = 'void'`, `voided_at` NULL, `void_reason` NULL**, `total_cents` 245000,
`amount_open_cents` 245000. Its `source_load_id` is `a0b1df25-…` = **`L-20260806-0005`, the cancelled
load.**

**Whole-entity count:** exactly **1** invoice is `status='void' AND voided_at IS NULL`, overstating by
**$2,450.00** on both `total_cents` and `amount_open_cents`.

**How it distorts a live read.** Under the §2 WORM convention, "live" means `voided_at IS NULL`. So:

```
live_invoices = 3, live_total_cents = 552550
  = 187550 (INV-…006 proforma) + 245000 (INV-…005, VOID) + 120000 (INV-…003 partial)
```

**A voided invoice is being carried as live A/R.** `amount_open_cents` is still 245000, so AR aging
shows it open too.

### Root cause — the two void paths disagree

**Canonical void route** — `accounting/invoices.routes.ts:846-856`:
```sql
UPDATE accounting.invoices
   SET status = 'void', voided_at = now(), void_reason = $2, updated_at = now(), updated_by_user_id = $3
 WHERE id = $1
```
Sets **status + `voided_at` + `void_reason`.** Correct.

**Load-cancellation path** — `dispatch/cancellation.service.ts:181-187`:
```sql
UPDATE accounting.invoices
   SET status = 'void', updated_at = now(), updated_by_user_id = $3
 WHERE source_load_id = $1::uuid AND operating_company_id = $2::uuid AND status = 'proforma'
```
Sets **status only. No `voided_at`. No `void_reason`.**

**Corroborated by the data:** every invoice voided through the proper route (`INV-…001`, `…002`,
`…004`) carries **both** a `voided_at` and a descriptive `void_reason`. The one voided by load
cancellation carries **neither**. The split is perfectly clean.

### Scope, stated precisely — this is NOT a GL defect

`gl_postings` for `INV-2026-00005` = **0**. A `proforma` invoice was never posted, so there is **no GL
residue and no reversing entry is owed.** The trial balance is unaffected.

**This matters for whoever fixes it:** the correct fix is to stamp `voided_at` (and a `void_reason`
naming the cancellation), **not** to post a reversal. Treating this like the GL-residue class
(`LV-VOID-NO-REVERSAL`) would create an entry against a document that never hit the ledger — inventing
financial data. **The damage is confined to the A/R subledger and every report built on
`voided_at IS NULL`.**

### Relationship to the AP finding — same symptom, DIFFERENT mechanism

`LV-AP-OPEN-INCLUDES-VOIDED` also showed voided money counted as open, but by a different route (the
open-AP query not excluding voided rows, over bills that *did* carry `voided_at`). **Here the row
itself is mis-stamped, so even a correctly-written query would count it.** Same symptom class —
voided document still counted — **different cause, and they need different fixes.** Recorded as
separate defects on purpose; merging them would send a fixer to the wrong layer.

### Fix + guard

**FIX:** in `cancellation.service.ts`, set `voided_at = now()` and a `void_reason` (e.g. the
cancellation reason) in the same UPDATE — matching the canonical route. Keep the `status='proforma'`
predicate: the surrounding comments correctly explain that a *non*-proforma invoice must NOT be
auto-voided because a TONU or cancellation charge may be genuinely owed, and that a driver bill is
deliberately never auto-voided. **That reasoning is sound and must be preserved — the bug is only the
missing stamp.**

**GUARD:** assert `accounting.invoices` has **zero** rows with `status='void' AND voided_at IS NULL`
(and the same invariant for any other table using the status+timestamp void pattern). This is a live
data assertion — a static scan would not catch it. It reddens today on exactly one row and goes green
the moment the row is stamped. **LANE: CC-1 / money** (A/R correctness), even though the offending
write lives in `dispatch/`.

**NOTE — the fix must also stamp the EXISTING row**, or the guard stays red: `INV-2026-00005` needs
`voided_at` backfilled. That is a data correction on a test-entity row with no GL impact, so it is
safe — but it is **not** something this lane will do, since it does not build.

### Also observed (PASS) — the proforma pipeline fired for the new load

`INV-2026-00006` was **auto-created for `L-20260806-0008`** at `$1,875.50`, status `proforma`,
`source_load_id = 1d5d8733-…`. The booking wizard's "queue invoice" step works. **PASS.**

---

## 48. ★ NEW DEFECT — the A/R invoice list counts VOID invoices in "Total billed" AND "Open" (overstated $2,452.00)

**LIVE-PROVEN 2026-08-07 in the running app — `/accounting/invoices`, USMCA, visible on screen and
confirmed by arithmetic against the same screen's rows.**

The page header reads:

> **Total billed: $5,527.50 · Open: $5,277.50 · Rows: 6 of 6**

The six rows it is summing (no filter applied — "6 of 6"):

| invoice | status | Total | Open |
|---|---|---|---|
| INV-2026-00006 | proforma | $1,875.50 | $1,875.50 |
| **INV-2026-00005** | **void** | **$2,450.00** | **$2,450.00** |
| **INV-2026-00004** | **void** | **$0.00** | **$0.00** |
| INV-2026-00003 | partial | $1,200.00 | $950.00 |
| **INV-2026-00002** | **void** | **$1.00** | **$1.00** |
| **INV-2026-00001** | **void** | **$1.00** | **$1.00** |

`1875.50 + 2450.00 + 0 + 1200.00 + 1.00 + 1.00 = ` **5527.50** — matches "Total billed" exactly.
`1875.50 + 2450.00 + 0 + 950.00 + 1.00 + 1.00 = ` **5277.50** — matches "Open" exactly.

**The four VOID invoices contribute $2,452.00 to the reported Open balance.** True open across
non-void rows is `1875.50 + 950.00 = ` **$2,825.50**.

### Two distinct faults, one screen

1. **Per row:** a void invoice still shows a **non-zero Open** ($2,450.00, $1.00, $1.00). A voided
   document has no open balance, by definition.
2. **In the summary:** those non-zero values are then **summed into "Open"** — an A/R balance concept.

### THIS IS NOT item 47, and the difference decides the fix

Item 47 is a **data** defect: one row (`INV-2026-00005`) mis-stamped by the load-cancel path, missing
`voided_at`. **This item is a QUERY defect** — because `INV-2026-00001`, `…002` and `…004` **DO** carry
a proper `voided_at` (verified on prod: `2026-08-05 23:16:48.664…`, `23:16:48.299…`, `23:14:59.653…`)
**and they are still being counted.**

**Fixing item 47 alone would NOT move this number**, since the aggregation is evidently not filtering
on `voided_at` at all. Both fixes are required, and they live in different places. Recording them as
separate cards is deliberate.

### Fair reading of the design — and why it is still wrong

Showing void rows in the **register** is a legitimate design (WORM: void, never delete — the row must
remain visible). **That is not the complaint.** The complaint is that a **balance** labelled "Open"
includes them. Even in a register that deliberately displays voided documents, a voided invoice's open
amount is **$0.00**, and the "Open" total must exclude it.

**Separately worth a decision (flagged, not claimed as a defect):** `INV-2026-00006` is a **proforma**
and contributes $1,875.50 to both figures. A proforma is not yet an issued receivable, so whether it
belongs in "Total billed"/"Open" is a **policy question**, not obviously a bug — the two-event
recognition model treats billing as the POD event. **Naming it so whoever fixes the void filter also
decides the proforma question explicitly rather than by accident.**

### Relationship to `LV-AP-OPEN-INCLUDES-VOIDED`

**This is the exact A/R twin of that A/P finding, and the SAME mechanism** (an open-balance aggregate
that does not exclude voided documents) — unlike item 47, which shares only the symptom. **Two sides
of the ledger, one missing predicate.** Whoever fixes one should fix the other in the same pass and
sweep for the pattern elsewhere (aging reports, dashboards, cash-flow projections).

**FIX:** exclude voided invoices from both aggregates, and zero the per-row Open for a voided document.
**GUARD:** assert that the A/R open-balance aggregate equals the sum over **non-void** invoices only —
a live data assertion computed two independent ways, which is exactly how this was caught.
**LANE: CC-1 / money.**

---

## 49. `LV-PAY-SETTLE-NOPOST` UPGRADED — customer-payment GL failure REPRODUCED ON DEMAND; subledger and GL now provably out of balance by $687.25

**LIVE 2026-08-07, USMCA. Item 30 observed this on a pre-existing payment. This item reproduces it
deliberately with a payment I created in the UI seconds earlier — which is a much stronger claim.**

### The transaction (PASS on everything except the ledger)

Recorded a customer payment on `INV-2026-00003` via **Record Payment → Receive Payment**:
method **ACH**, reference **`CC3-BATTERY-ACH-43725`**, **$437.25**, deposited to **Undeposited Funds**,
applied $437.25 to `INV-2026-00003`.

**What worked — genuinely well-built, and worth recording as PASS:**
- The panel's allocation tracker updated live: **"Applied $437.25 / Remaining $0.00"**.
- **`PMT-2026-00002`** created at **$437.25**.
- Invoice **Open moved $950.00 → $512.75** — exactly `950.00 − 437.25`.
- Status correctly stayed **`partial`** (not flipped to paid).
- **Payment Applications** now lists **both** `PMT-2026-00002 $437.25` and `PMT-2026-00001 $250.00`.
- The invoice page links its own **Journal Entry `45424cff` · posted**.

**The subledger arithmetic and the linkage are correct. Only the ledger is missing.**

### The failure — on prod, with a positive control that cannot be waved away

| payment | amount | live? | **GL postings** |
|---|---|---|---|
| **`PMT-2026-00002`** (created 02:28:55, this session) | $437.25 | LIVE | **0** |
| `PMT-2026-00001` | $250.00 | LIVE | **0** |

**Posting census for USMCA by `source_transaction_type`:**
`bill` 18 · `bank_categorization` 8 · `invoice` 4 · `expense` 4 · *(null)* 4 · `transfer` 2 ·
`prepaid_purchase` 2.

> **There is no `payment` source type at all. Not one customer-payment posting exists in this entity.**

**POSITIVE CONTROL — this is not an RLS artifact.** I **created** `PMT-2026-00002` through the UI, and
I can **read it back** on the same table in the same query that reports its zero postings, with
`n_tup_del = 0`. A masked read cannot show me a row and hide only its postings. And six other source
types **do** post, so the posting engine itself works — consistent with the item-30 census.

### The consequence, stated the way a CPA would read it

`INV-2026-00003`: total **$1,200.00**, GL postings **2** (A/R debited $1,200.00 at issue).
Payments applied: `$250.00 + $437.25 = ` **$687.25**. Subledger open: **$512.75**.
**GL A/R still carries the full $1,200.00**, because no payment ever posted.

- **A/R control (GL) is overstated by $687.25.**
- **Undeposited Funds is understated by $687.25** — the payment panel explicitly says *Deposited to:
  Undeposited Funds*, so the intended entry is **DR Undeposited Funds / CR A/R**.
- **The A/R subledger and the GL A/R control no longer agree.** A subledger-to-GL tie-out — the first
  reconciliation any auditor, CPA or lender performs — **fails by exactly $687.25**, and the gap grows
  with every payment received.

**This is the cleanest possible demonstration of the defect**: cash was received and applied, the
customer's balance went down, and the general ledger never heard about it.

### Refines item 30's scope

Item 30 grouped the customer payment with the driver settlement and correctly warned that the intended
trigger point was **UNVERIFIED**. For the customer payment that ambiguity is now **closed**: the
trigger is unmistakably *payment received and applied* — the app itself performs the application and
updates the subledger in the same action. **No further trigger question remains for this half.** The
settlement half of item 30 is untouched here and remains open on its own terms.

**FIX:** wire the payment-received path to the existing poster — **DR Undeposited Funds (or the
selected deposit account) / CR A/R**, entity-scoped, honouring the `Deposited to` selection. **Write no
new GL math**; six posters already work. Voiding a payment must reverse it.
**GUARD:** assert every live `accounting.payments` row carries a balanced posting, and — the stronger
form — that **A/R subledger open equals the GL A/R control balance** per entity. That tie-out assertion
would have caught this on the first payment ever recorded. **LANE: CC-1 / money.**

---

## 50. NEW DEFECT — TMS-native BILLS never get a `display_id` (invoices and payments do)

**LIVE-PROVEN 2026-08-07 on Neon prod. ORIGIN TEST APPLIED — this is the narrow, defensible claim, not
the raw count.**

Raw counts look alarming and would be **wrong to report as-is**: `display_id` is NULL on **all 16,258**
`accounting.bills` rows across all three entities. **But per the origin ruling, imported rows are
legitimately unlike TMS-native ones**, so the raw number is meaningless. Classifying by origin:

| entity | bills | QBO-cloned (`qbo_bill_id` NOT NULL) | **TMS-native** | **TMS-native WITH `display_id`** |
|---|---|---|---|---|
| TRK | 13,051 | 13,050 | 1 | **0** |
| TRANSP | 3,196 | 3,195 | 1 | **0** |
| USMCA | 11 | **0** | **11** | **0** |

USMCA's 11 all carry `source_system = 'tms'` and **zero** `qbo_bill_id` — unambiguously TMS-native.

> **Every TMS-native bill that has ever existed — 13 of 13, across all three entities — has a NULL
> `display_id`. Zero exceptions.** The 16,245 QBO clones are excluded from the claim; their NULL is
> expected state, not a defect.

**The contrast is the proof this is a gap and not a design choice:** in the SAME entity, TMS-native
**invoices carry a display_id 6 of 6** (`INV-2026-00001`…`00006`) and **payments 2 of 2**
(`PMT-2026-00001`, `PMT-2026-00002`). **Bills are the only money document in the system without a
human-readable identifier.**

**Why it matters:** a bill is what you argue about with a vendor, attach to an approval, cite in a
dispute, and hand an auditor. Everything else in A/P and A/R has a stable citable ID; a bill can only
be referenced by raw UUID (which is exactly what the app's own URL falls back to —
`/accounting/bills/7ccd431e-8e85-433a-a5e0-4425011ffb5e`). This also conflicts with the
server-generated display-ID convention that invoices, payments and work orders all follow.

**NOT a WORM conflict — stated because it looks like one.** The standing order says *void ALWAYS by
UUID, never display_id*. That governs **which key an operation is performed on**, not whether a
human-readable ID should exist. Invoices are voided by UUID **and** carry `INV-…` display IDs. So
adding a bill display_id does not weaken the WORM rule.

**FIX:** generate a server-side `display_id` for TMS-native bills, matching the existing convention.
**GUARD:** assert every TMS-native (`qbo_bill_id IS NULL`) bill has a non-null `display_id` — **scoped
to TMS-native rows by the origin test**, so the 16,245 imported clones can never redden it. **A guard
written against the whole table would be red forever on expected state** — the
`expected-state-recorded-as-failure` anti-pattern. **LANE: CC-1 / money.**

---

## 51. ★ The void invariant is broken in BOTH directions — my item-47 guard was half a guard

**LIVE-PROVEN 2026-08-07, USMCA.** Query: bills where `voided_at IS NOT NULL AND status <> 'void'`
**OR** `status = 'void' AND voided_at IS NULL` → **4 rows**.

All four are the bills voided out-of-band (identical `voided_at 2026-08-07 00:33:50.999787+00`), and
**every one still has `status = 'unpaid'`.**

### This is the exact MIRROR of item 47, and that changes the guard

| | `status` | `voided_at` |
|---|---|---|
| **Item 47** — invoice voided by the load-cancel path | **`void`** ✅ | **NULL** ❌ |
| **Here** — bills voided out-of-band | **`unpaid`** ❌ | **set** ✅ |

**The same invariant — `status = 'void'` ⟺ `voided_at IS NOT NULL` — is violated in opposite
directions by two different mechanisms.** Either half alone reads as a one-off; together they show the
system has **no enforcement of the pairing at all**, so any writer can set one field and not the other.

### Correcting my own item-47 guard proposal

Item 47 proposed: *assert zero rows with `status='void' AND voided_at IS NULL`.* **That is only half a
guard.** It passes cleanly on all four bills here, which are broken the other way.

**The correct guard is bidirectional**, per table using the status+timestamp void pattern:

```
status = 'void'  XOR-fails  voided_at IS NOT NULL
  -> flag rows where (voided_at IS NOT NULL AND status <> 'void')
                  OR (status = 'void' AND voided_at IS NULL)
```

Applied to `accounting.bills` + `accounting.invoices` today, that reddens on **5 rows** — 4 bills
(item 51) + 1 invoice (item 47) — and each needs a different correction. **Better still, enforce it in
the database** (a CHECK constraint or trigger) so no future writer can set one without the other;
a guard catches it after the fact, a constraint makes it impossible.

**This also explains a symptom already on the board:** those four voided bills reading `status='unpaid'`
is precisely why voided money keeps appearing in open-A/P figures — the status field, which the A/P
views key off, still says the bill is owed. **`LV-AP-OPEN-INCLUDES-VOIDED` and this are the same root
cause seen from two ends.**

**LANE: CC-1 / money.** Supersedes the guard wording in item 47 — **fix the guard there to the
bidirectional form before building it.**

---

## 52. ★★ NEW DEFECT — the "Unpaid bill selector" OFFERS VOIDED BILLS FOR PAYMENT (item 51 made exploitable)

**LIVE-PROVEN 2026-08-07 in the running app, `/accounting/bill-payments`, USMCA. This is the
downstream consequence of item 51, and it is the most serious finding of this iteration: it puts real
money at risk.**

Opened **+ Record Bill Payment → Unpaid bill selector**. It lists **every one of the entity's 11
bills — including all 4 that are VOIDED.**

**Proven by exact count-matching against prod, not by eyeballing:**

| amount | bills on prod | options offered |
|---|---|---|
| $123.45 | `d613ca88` **VOIDED** + `304f5fa3` live | **2** |
| $743.21 | `55997ecb` **VOIDED** + `5a1d7268` live | **2** |
| $450.00 | `40c1ca80` **VOIDED** + `e65dddd4` **VOIDED** + `0fe49cd0` live | **3** |
| $88.77 | `7ccd431e` live | 1 |
| $0.05 | `62fbc5ec` live | 1 |

**The multiplicity matches exactly.** Duplicate amounts are not a rendering artifact — each duplicate
is a distinct bill, and in every pair/triple the extra copies are precisely the voided ones. If the
selector filtered voided bills, $450.00 would appear **once**; it appears **three times**.

### The causal chain, end to end

1. **Item 51** — bills voided out-of-band got `voided_at` stamped but kept **`status = 'unpaid'`**.
2. The unpaid-bill selector evidently filters on **`status`**, not on `voided_at`.
3. → **Voided bills are presented to the user as payable.**

**This is exactly why item 51 matters, and why the bidirectional guard is not academic.** A
one-directional guard (item 47's original wording — `status='void' AND voided_at IS NULL`) **passes
cleanly on all four of these bills** and would never have surfaced this.

### Why this is the highest-severity item in this iteration

Paying a voided bill is **an erroneous cash disbursement against a document the business has already
retracted**. In a real entity that is a duplicate or unauthorised payment to a vendor — money out the
door, recoverable only by clawback. It is materially worse than the reporting overstatements
(`LV-AR-OPEN-INCLUDES-VOIDED`, `LV-AP-OPEN-INCLUDES-VOIDED`), which misstate a number; **this one
moves cash.**

### WHAT I DELIBERATELY DID NOT DO

**I did not complete a payment against a voided bill.** Proving the option is *offered*, plus the
status logic that explains why, is sufficient to establish the defect. Actually executing it would
create a real payment row against a voided document, corrupt the entity's A/P state, and require
clean-up — and this lane's standing order forbids moving money erroneously. **The offer is the defect;
executing it would be reckless, not more rigorous.** A builder can reproduce it from the counts above.

**FIX:** the unpaid-bill selector (and every "payable/open bill" query) must exclude
`voided_at IS NOT NULL`, **not** rely on `status`. Fixing item 51's data alone is not sufficient —
the query must be correct even if a status field drifts again. **Both fixes are needed:** correct the
status/timestamp pairing (item 51, ideally a DB constraint) **and** make the selector filter on the
authoritative `voided_at`.
**GUARD:** assert the payable-bill query returns **zero** rows with `voided_at IS NOT NULL`. Live data
assertion. **LANE: CC-1 / money — HIGH.**

### Also observed

- **`+ Record Bill Payment` did nothing on first click** with no modal and no inline error. **NOT
  filed as a defect** — the button plausibly requires a bill selected first, which is a normal
  pattern, and I have not established otherwise. **UNVERIFIED — needs live check.**
- The selector renders each bill as **`<vendor-uuid> · <user-entered bill #> · <due> · <amount>`** —
  a raw UUID as the leading identifier. **This is `LV-BILL-NO-DISPLAY-ID` (item 50) surfacing in the
  UI**: with no server-generated bill display_id, the picker falls back to a UUID.
- **Refinement to item 50, stated in fairness:** the bill detail page *does* show a "Bill #"
  (`CC3-VOIDTEST-20260807-01`) — but that is a **user-entered vendor reference**, not a
  server-generated ID, so it is not guaranteed to exist or be unique. Indeed **`CC3-BILL-0001` is
  reused across two different bills**, visible in this very dropdown. **That duplication is itself the
  argument for a server-generated display_id** — two distinct payables are indistinguishable to the
  user in the payment picker.

---

## 53. ★★ HYPOTHESIS DISPROVEN — A/P payments post correctly; the A/R gap is ISOLATED, and there is now a working reference implementation

**LIVE 2026-08-07, USMCA. I predicted the payment-poster gap would be symmetric on A/P. It is not.
Recording the negative result, because it makes item 49 far more actionable than a confirmation would
have.**

### The A/P transaction — PASS on every dimension

Recorded via `/accounting/bill-payments` → **+ Record Bill Payment → Pay Bill**: bill
`CC3-VOIDTEST-20260807-01` ($88.77), method **check**, check # **10077**, reference
**`CC3-BATTERY-AP-3340`**, from bank account **Relay Fuel Wallet**, amount **$33.40** (deliberately
partial), applied $33.40.

| check | result |
|---|---|
| bill payment row | **`8b68a9d7`**, `amount_cents` **3340** ✅ |
| bill subledger | `paid_cents` **3340**, status **`partially_paid`** ✅ |
| UI open balance | $88.77 → **$55.37** (exactly `88.77 − 33.40`) ✅ |
| **GL postings** | **2** ✅ |
| **the entry itself** | **DR `2000` Accounts Payable (A/P) $33.40 / CR `1295` Relay Fuel Wallet $33.40** ✅ |
| JE surfaced in UI | `4da3efbd`, shown in the ledger's own **JE** column ✅ |
| reconciliation state | `Unmatched` (honest — no bank transaction matched yet) ✅ |

**Balanced, correct accounts, and it honours the selected "From bank account" rather than a hardcoded
default.** This is exactly what a correct payment posting looks like.

**STRONGEST POSSIBLE POSITIVE CONTROL:** `bill_payment` **did not exist as a `source_transaction_type`
in this entity before I created it.** The census now reads `bill` 18 · `bank_categorization` 8 ·
`invoice` 4 · *(null)* 4 · `expense` 4 · `prepaid_purchase` 2 · `transfer` 2 · **`bill_payment` 2**.
I created the first bill payment in the entity's history and the poster fired correctly on it.

### The matched pair — this is the finding

Two payments, **same entity, same user, same session, 13 minutes apart**:

| | subledger | **GL** |
|---|---|---|
| **A/P** — bill payment $33.40 (02:41) | ✅ `paid_cents` 3340, `partially_paid` | ✅ **2 postings, DR A/P / CR bank** |
| **A/R** — customer payment $437.25 (02:28) | ✅ Open $950 → $512.75, `partial` | ❌ **0 postings** |

**One posts. One does not. Nothing else differs.**

### Why the negative result is worth more than a confirmation

1. **It kills the broad diagnosis.** "Payment posting is broken" is **false** — and a builder acting on
   it would go looking for a systemic fault that does not exist.
2. **It isolates the defect** to the customer-payment path specifically.
3. **It hands CC-1 a working reference implementation in the same schema, written by the same team.**
   The A/R fix is the mirror of a posting that already exists and already works:
   - **A/P (works):** DR `2000` Accounts Payable / CR *selected bank account*
   - **A/R (missing):** DR *selected deposit account — the panel says **Undeposited Funds*** /
     CR A/R control
   Same shape, opposite sides. **"Write no new GL math" is not just policy here — the math is already
   written 20 lines away.**

**This is why item 49's guard should be the subledger-to-GL tie-out per control account**, not merely
"payments must post": the A/P side would pass a naive per-row check *and* the tie-out, while the A/R
side fails the tie-out by exactly $687.25. The tie-out is the assertion that distinguishes them.

### Two display observations from this screen — recorded, NOT filed as defects

- **Vendor renders as a raw UUID** (`308f6434-0a51-4109-953e-c86ffb1f0999`) in both the Bill-details
  panel and the Pay-Bill form, though the bill page shows the name *CC3 Battery Vendor 20260806-01*.
  Same family as item 45 (payload carries the id, not the joined name). **Worth a builder's attention;
  I have not traced the endpoint, so it is UNVERIFIED as to cause.**
- **Due date disagrees across screens:** bill page **09/05/2026**, bill-payment panel **9/4/2026**;
  the selector's raw value is `2026-09-05T00:00:00.000Z`. Rendering a UTC midnight in Central time
  yields the prior day — a classic **off-by-one date** display. **UNVERIFIED as to cause**, but on a
  **due date** an off-by-one changes aging buckets and terms compliance, so it should not be dismissed.
- **`+ Record Bill Payment` did nothing on my first click** — and I did **not** file it. Correctly so:
  once a bill was selected it opened immediately. **The button requires a selection; it is not inert.**
  This is the second time this session that checking before filing prevented a false defect.

---

## 54. ★★ NEW DEFECT (HIGH) — voiding a bill payment does NOT post the reversing entry the UI explicitly promises

**LIVE-PROVEN 2026-08-07, USMCA, on a payment I created myself minutes earlier. Baseline captured
BEFORE the void, so this is a controlled before/after, not an inference.**

### The experiment — designed to isolate void behaviour from posting behaviour

Item 53 proved the A/P payment path **posts correctly**. So a void failure on that same path cannot be
blamed on a broken poster. Per the standing order (*multiples of each voidable type, reverse exactly
ONE, siblings live*), I first created a **second** payment so a sibling would remain:

- `8b68a9d7` — **$33.40**, check 10077, ref `CC3-BATTERY-AP-3340`, JE `4da3efbd`
- `70299eff` — **$12.60**, check 10078, ref `CC3-BATTERY-AP-1260-SIBLING`, JE `6fe7c21a`

**Pre-void baseline on prod:** bill `paid_cents` **4600**; `source_transaction_type='bill_payment'`
postings **4**, totalling **9200¢**.

Then voided **only** `8b68a9d7` through the app's Void Bill Payment panel, which states verbatim:

> *"Voiding posts an equal-and-opposite **reversing entry** and keeps the audit trail. This can't be
> undone."*

A reason was required and supplied.

### Result — three of four invariants PASS, the accounting one FAILS

| invariant | result |
|---|---|
| **WORM — row preserved, not deleted** | ✅ `8b68a9d7` still present, `status='void'`, `revoked_at 2026-08-07 02:48:58`, `revoked_reason` stored **verbatim** |
| **Sibling untouched** | ✅ `70299eff` still `status='posted'`, `revoked_at` NULL, its 2 postings intact |
| **Subledger rolled back** | ✅ bill `paid_cents` **4600 → 1260**; UI open balance $42.77 → **$76.17** (`88.77 − 12.60`) |
| **REVERSING ENTRY POSTED** | ❌ **`bill_payment` postings still 4, still 9200¢ — byte-identical to the pre-void baseline** |

**Nothing was created at the void timestamp.** The full posting list is only: `8b68a9d7` DR `2000`
$33.40 / CR `1295` $33.40 (created **02:41:42**, the original), and `70299eff` DR/CR $12.60 (created
**02:47:47**). **There is no 02:48 entry.**

### The accounting consequence

The GL still carries the **full** effect of a payment that has been voided:

- **GL:** DR `2000` Accounts Payable = `3340 + 1260 = ` **$46.00**; CR `1295` Relay Fuel Wallet =
  **$46.00**
- **Subledger:** bill `paid_cents` = **$12.60**

> **A/P control (GL) is understated by $33.40** against the subledger, and **the bank account is
> credited $33.40 for cash that never left** — the payment was voided.

The bank side is the worse half: the ledger asserts money went out of Relay Fuel Wallet on a payment
the business retracted. **A bank reconciliation will not tie**, and the discrepancy is invisible from
the A/P screens because the subledger looks correct.

### Why this finding is unusually strong

1. **The UI makes an explicit accounting promise and does not keep it.** This is not a silent gap —
   the panel names the reversing entry as the mechanism. A user reading it has every reason to believe
   the ledger was corrected.
2. **The other half of the same sentence IS honoured** ("keeps the audit trail" — `revoked_at`,
   `revoked_reason`, row preserved). So the void path was clearly written with care; the reversal is a
   specific omission, not general neglect.
3. **It isolates cleanly:** the same path **posts correctly on create** (item 53) and **fails to
   reverse on void**. Posting works; reversal does not. That is a bounded defect with a known-good
   reference right beside it.
4. **Controlled before/after on a row I created**, so no origin ambiguity and no RLS doubt.

### Relationship to `LV-VOID-NO-REVERSAL` — related, but this is much stronger evidence

That card covers **$1,643.21** of GL residue from bills voided **out-of-band by direct SQL**, where
one could argue the service was simply bypassed. **This is the in-app void path, on a freshly created
payment, with the reversal explicitly advertised — and it still does not reverse.** It removes the
"they bypassed the service" explanation entirely.

**FIX:** the bill-payment void path must post the equal-and-opposite entry (DR bank / CR A/P for the
voided amount) **through the existing poster** — the create side already builds DR `2000` / CR bank,
so the reversal is that entry inverted. Link it back via `reverses_je_id` / `reversed_by_je_id` as the
JE-void path does. **Write no new GL math.**
**GUARD:** assert that for every `bill_payments` row with `revoked_at IS NOT NULL`, the net GL effect
of its `source_transaction_id` is **zero** — original plus reversal must cancel. Live data assertion.
**LANE: CC-1 / money — HIGH.**

### Sub-finding — a THIRD void-column convention in one schema

`accounting.bill_payments` uses **`revoked_at` / `revoked_by_user_id` / `revoked_reason`**, while
`accounting.invoices`, `accounting.bills` and `accounting.payments` all use **`voided_at`** (invoices
add `void_reason`).

**This is a live trap, not pedantry.** Every "exclude voided rows" fix on the board
(`LV-AR-OPEN-INCLUDES-VOIDED`, `LV-AP-OPEN-INCLUDES-VOIDED`,
`LV-PAYABLE-SELECTOR-OFFERS-VOIDED-BILLS`) is written by looking for `voided_at`. **On
`bill_payments` that column does not exist**, so a developer applying the same fix pattern here gets a
column-does-not-exist error at best — or, if they reach for `status` instead, walks straight into the
item-51 trap where status and the timestamp disagree. **Whoever fixes the void-filter family must be
told this table is named differently.** Recorded so they are.

---

## 55. `LV-AP-OPEN-INCLUDES-VOIDED` FULLY RECONCILED — the $1,766.66 now ties to the cent, and the COUNT is wrong too

**LIVE-PROVEN 2026-08-07, `/accounting/bills`, USMCA. The earlier card asserted $1,766.66 overstated.
This item reconciles that number exactly against the screen, so it is no longer an estimate.**

The Bills page header reads:

> **OPEN BILLS $3,161.54 · 11 open**

The entity has **exactly 11 bills** — **7 live and 4 voided**. Reconciling every balance from prod:

| bill | balance | state |
|---|---|---|
| `7ccd431e` | $76.17 (`88.77 − 12.60` paid) | live |
| `304f5fa3` | $123.45 | live |
| `5a1d7268` | $743.21 | live |
| `0fe49cd0` | $450.00 | live |
| `62fbc5ec` | $0.05 | live |
| `77f2659f` | $1.00 | live |
| `996907d6` | $1.00 | live |
| **`d613ca88`** | **$123.45** | **VOIDED** |
| **`55997ecb`** | **$743.21** | **VOIDED** |
| **`40c1ca80`** | **$450.00** | **VOIDED** |
| **`e65dddd4`** | **$450.00** | **VOIDED** |

- **live** = `76.17 + 123.45 + 743.21 + 450.00 + 0.05 + 1.00 + 1.00` = **$1,394.88**
- **voided** = `123.45 + 743.21 + 450.00 + 450.00` = **$1,766.66**
- **total** = **$3,161.54** — **matches the header to the cent.**

> **"OPEN BILLS $3,161.54" includes $1,766.66 of VOIDED bills. True open A/P is $1,394.88 — the
> headline figure is overstated by 127%.**

**The COUNT is wrong too, and that is a separate error:** "**11 open**" counts all 11 bills; only **7**
are live. Both the money and the count are inflated by the same four rows. The earlier card named the
dollar figure only.

**Corroborating detail visible on the same screen:** the `Status` column shows **`open`** for the
voided bills — exactly what `LV-VOID-INVARIANT-BOTH-WAYS` predicts, since their `status` was never
changed when `voided_at` was stamped. And the duplicate rows are plainly visible: `CC3-BILL-0001`
$123.45 **twice**, `CC3-BILL-20260806-01` $743.21 **twice**, `TEST-BILL-0806-A` $450.00 **multiple
times** — each pair being one live bill and its voided twin, indistinguishable to the user because
bills have no `display_id` (`LV-BILL-NO-DISPLAY-ID`).

**Four separate board cards are visible in this one screenshot, all reinforcing each other:**
`LV-AP-OPEN-INCLUDES-VOIDED` (the totals), `LV-VOID-INVARIANT-BOTH-WAYS` (status still `open`),
`LV-BILL-NO-DISPLAY-ID` (indistinguishable duplicates), and `LV-PAYABLE-SELECTOR-OFFERS-VOIDED-BILLS`
(the same voided rows are payable). **They are one root cause — void state is not authoritative
anywhere in A/P — with four separate symptoms.** Whoever picks this up should fix it as one piece of
work, not four.

**Why the reconciliation matters:** an exact tie-out converts "the number looks too big" into "the
number is wrong by precisely these four rows", which is directly actionable and impossible to argue
with. It also independently re-derives the $1,766.66 from a completely different surface than the
original finding.

---

## 56. VENDOR CREDIT — PASS, and a deliberate NON-defect ruling (intent test applied)

**LIVE 2026-08-07, USMCA. Created and applied a vendor credit end-to-end.**

### What worked — PASS

Created via `/accounting/vendor-credits` → **+ Create**: vendor *CC3 Battery Vendor 20260806-01*,
**$27.15**, with a descriptive note.

- **`VC-2026-0001`** created — **and it HAS a server-generated `display_id`**, unlike bills
  (`LV-BILL-NO-DISPLAY-ID`). Vendor credits, invoices, payments and credit numbers all get one; bills
  remain the sole exception. **That strengthens item 50: bills are the outlier, not the convention.**
- Applied $27.15 to bill `CC3-VOIDTEST-20260807-01` via **Apply to bill**.
- **Unapplied $27.15 → $0.00**, status → **`applied`**, and the credit's *Applied bills* panel lists
  the bill with amount and date.
- **`accounting.vendor_credit_applications`** row written correctly: `applied_cents` **2715**,
  `applied_at 2026-08-07 02:58:03`, live.
- The apply panel states the server re-verifies both remaining credit and the bill's remaining balance
  — appropriate server-side validation rather than trusting the client.

### The NON-defect ruling — GL absence is EXPECTED STATE, and I am not filing it

`gl_postings` for `VC-2026-0001` = **0**. **This is NOT a defect.** The page says so itself, in its own
subtitle:

> *"Open vendor credits reduce A/P when applied to bills **(data-only until GL flags advance)**"*

And the flag state on prod corroborates the caveat is currently active:
**`QBO_VENDOR_CREDITS_PROJECTION_ENABLED` = false**. **Declared intent + matching flag state = expected
state.** Filing "vendor credit doesn't post to the GL" would be the
`expected-state-recorded-as-failure` anti-pattern, and any guard built on it would be red on purpose-
built behaviour.

### The one thing genuinely worth naming — a copy/expectation gap, not a broken invariant

**Fact:** after applying the $27.15 credit, the bill's balance is **unchanged at $76.17**
(`amount_cents 8877 − paid_cents 1260`). It did **not** become $49.02.

The subtitle's first clause — *"Open vendor credits **reduce A/P** when applied to bills"* — is written
in the **present tense**, while the parenthetical arguably scopes "data-only" to the GL only. **The two
readings differ on whether the SUBLEDGER was meant to move**, and I cannot resolve that from the
screen: reading (a) says only the GL entry waits for flags; reading (b) says nothing changes until they
advance.

**I am NOT calling this a defect** — the behaviour may be exactly as designed. **What is concrete is
the user-facing risk:** a user who applies a $27.15 credit and reads that sentence may reasonably
believe they now owe **$49.02**, while every A/P surface still says **$76.17**. Combined with
`LV-AP-OPEN-INCLUDES-VOIDED` (open A/P already overstated by $1,766.66), the A/P figure a user sees is
now wrong in two independent directions.

**RECOMMENDATION (for the feature owner, not a defect card):** either make the subtitle state the
current behaviour precisely, or reduce the subledger balance on application. **UNVERIFIED — the intent
question belongs to whoever owns the vendor-credit feature; this lane records the observation, not a
verdict.**

### Extension of an existing card — a SECOND selector offers voided bills

The **Apply vendor credit to bill** picker is materially better than the payable selector — it is
**vendor-scoped** and shows the **remaining** balance ($76.17, not the original $88.77). **But it still
lists a voided bill.** Vendor `308f6434` has three bills — `7ccd431e` (live, $76.17), `5a1d7268` (live,
$743.21) and **`55997ecb` (VOIDED, $743.21)** — and the picker offers **all three**, with $743.21
appearing **twice**.

**This extends `LV-PAYABLE-SELECTOR-OFFERS-VOIDED-BILLS` from one selector to a class:** two
independent "open bill" pickers, written at different times with different quality, both fail to
exclude voided bills — because both key off `status`, which void never updates
(`LV-VOID-INVARIANT-BOTH-WAYS`). **Any fix must sweep every open-bill picker, not just the payment
one.** Board row updated accordingly.

### Sub-observation — a FOURTH void-naming variant

`accounting.vendor_credit_applications` uses **`voided_at` / `voided_by_user_id` / `voided_reason`**.
Note `voided_reason` here versus **`void_reason`** on `accounting.invoices`, and `revoked_at` /
`revoked_reason` on `accounting.bill_payments`. **Three different names for the same concept across
four tables in one schema.** Recorded for whoever writes the void-exclusion sweep — they will need a
per-table map, and a copy-paste fix will silently miss tables.

---

## 57. OVERPAYMENT — PASS, a second prevented false-defect, and item 49's prediction CONFIRMED

**LIVE 2026-08-07, USMCA. Controlled before/after with a baseline captured first.**

### Finding the right test — the credit-memo "island" was not an island

`accounting.credit_memos` exists but has **no UI route, no subnav entry and no REST endpoint**. The
tempting conclusion was "a table with no path to it" — a total-connectivity violation. **That would
have been wrong.** `apps/backend/src/accounting/payments/apply.service.ts:238-269` contains
`createArCreditMemo(...)`, called with a `remainderCents` argument, and the test beside it is named
**`apply-overpayment.test.ts`**. Credit memos are **generated from customer overpayment**, not created
by hand. **There is no manual create screen because the design does not have one.**

So the correct test was an overpayment, not a hunt for a missing screen.

### The transaction — PASS

Baseline: `credit_memos` = **0**; `INV-2026-00003` open **$512.75**, paid $687.25.

Recorded a payment of **$600.00** (ref `CC3-BATTERY-OVERPAY-600`) applying only **$512.75**. The panel
computed **"Applied $512.75 / Remaining $87.25"** correctly before submit.

| check | result |
|---|---|
| invoice status | **`paid`**, open **$0.00**, `amount_paid_cents` **120000** ✅ |
| payment recorded at full amount | `PMT-2026-00003` `amount_cents` **60000** ✅ |
| **overpayment tracked** | `amount_applied_cents` **51275** + `amount_unapplied_cents` **8725** ✅ |
| application row | `payment_applications` invoice **51275** (not the full $600) ✅ |
| aggregate reconciliation | payments **128725** − applications **120000** = **8725** ✅ |

**The $87.25 reconciles three independent ways.** The subledger arithmetic is correct throughout.

### SECOND PREVENTED FALSE DEFECT — and I want this on the record

`credit_memos` is still **0** after the overpayment. My first instinct was that the remainder had
**vanished** — the `createArCreditMemo` code exists, so surely it should have fired. **I checked before
filing, and the money is there:** `amount_unapplied_cents = 8725` on the payment row.

**Leaving an overpayment as unapplied cash on the customer's account is a legitimate A/R design** —
it is what QuickBooks does (an unapplied customer credit), and it is arguably *better* than
auto-minting a credit memo the user did not ask for. Whether this UI path *should also* create one is
a **design question**, not a provable defect. **NOT FILED.**

**That is twice in this iteration** that checking before filing prevented a false defect (the other
being the credit-memo "island"). Both would have sent a builder to rewrite something that works.

### ★ Item 49's prediction CONFIRMED — the tie-out gap grew exactly as forecast

Item 49 stated the A/R subledger-to-GL gap *"grows with every payment received"*. It has:

| | then (item 49) | **now** |
|---|---|---|
| live customer payments | 2, **$687.25** | **3, $1,287.25** |
| **GL postings across all of them** | **0** | **0** |
| invoice subledger | $512.75 open | **$0.00 — PAID IN FULL** |
| GL A/R for that invoice | $1,200.00 debited, uncredited | **$1,200.00 debited, still uncredited** |

**The subledger now says the customer owes nothing; the general ledger still says they owe the entire
$1,200.00.** The tie-out failure grew from **$687.25 to $1,200.00**, and on top of that **$87.25 of
unapplied customer cash exists with no GL representation at all** — unapplied cash is a *liability*
(customer deposit/credit), and it is not on the books.

**Total cash received into this entity with zero ledger entries: $1,287.25.**

This is not a new defect — it is `LV-PAY-SETTLE-NOPOST` doing exactly what was predicted, now at
nearly double the size. **It also strengthens the recommended guard:** a per-row "payments must post"
check and the subledger-to-GL tie-out both catch it, but only the tie-out expresses *why it matters* —
an invoice reading `paid` against a GL that still shows it fully outstanding is the single most
alarming line an auditor could read.

**Board row for `LV-PAY-SETTLE-NOPOST` updated with the grown figure.**

---

## 58. ★★ VOID CLASS RESOLVED — invoice void DOES reverse; the failure is SPECIFIC to bill payments

**LIVE-PROVEN 2026-08-07, USMCA. Controlled before/after on an invoice I created, posted and voided
myself. This answers the open question from item 54 and prevents a broad, wrong fix.**

### Method

Created a **fresh** invoice specifically for this test (leaving the paid `INV-2026-00003` and the live
proforma `INV-2026-00006` untouched): **`INV-2026-00007`**, TIO PERFUMES, **$313.90**, income account
`4000`. Created as `draft` — **and a draft correctly posts nothing** ("No journal entries linked yet").
Sent it to post, captured a baseline, then voided.

**Outbound-action check before Sending:** `invoice-send.service.ts` imports `enqueueEmail`, so Send is
outward-facing. Verified on prod first that TIO PERFUMES has **all six email columns NULL**
(`billing_email`, `ar_email`, `main_contact_email`, `cc_email`, `bcc_email`) — **no recipient exists,
so nothing could leave the system.** Send is also explicitly listed in this lane's standing order.

**Baseline after posting:** invoice postings **6**, journal entries **24**, and the invoice posted
**DR `1100` A/R $313.90 / CR `4000` Freight Income $313.90** — balanced and correct.

### Result — the GL half PASSES

| check | result |
|---|---|
| invoice status | **`void`** ✅ |
| **reversing JE created** | ✅ **`53415aef`**, memo *"Void reversal of invoice `135af1df`…: \<my reason\>"*, created **03:14:32** (the void moment) |
| **reversal postings real and correct** | ✅ **DR `4000` $313.90 / CR `1100` $313.90** — the exact inverse |
| **net GL effect** | ✅ **account `1100` net = 0, account `4000` net = 0** |
| journal entries | 24 → **25** |

**The general ledger is correctly cleaned up.** This is a genuine PASS, and it is the opposite of what
the bill-payment void did.

### ★ THE CLASS QUESTION IS ANSWERED — and the answer narrows item 54

| path | reversing JE | net GL | linkage |
|---|---|---|---|
| **Invoice void** | ✅ created | ✅ **zero** | ❌ none |
| **Bill-payment void** (item 54) | ❌ **none at all** | ❌ **$33.40 residue** | — |
| JE void (item 37, code read) | ✅ | ✅ | ✅ writes both sides |

**INDEPENDENT CONFIRMATION OF ITEM 54 FROM A SECOND ANGLE:** a direct query for journal entries whose
memo matches *"void reversal of bill payment"* returns **0** for this entity — even though I voided a
bill payment an hour earlier. **The reversal JE simply does not exist**, while the invoice one plainly
does, with the same memo convention.

> **Void-without-reversal is NOT a systemic class. It is specific to the bill-payment path.**

**This materially changes the fix.** Had this gone unverified, CC-1 could have rewritten void handling
across accounting — when in fact **invoice void already contains a working implementation of exactly
what bill-payment void is missing**, using the same memo convention. As with item 53, the correct fix
is to copy a neighbour, not to rebuild.

### Two real defects remain on the invoice path — both lesser, both worth fixing

**1. NO REVERSAL LINKAGE.** `reverses_je_id` and `reversed_by_je_id` are **NULL on both** the original
(`e30baa6a`) and the reversal (`53415aef`), even though `accounting.journal_entries` has both columns.
**Item 37's code-read claim is now LIVE-CONFIRMED:** invoice void reverses but does not link. The only
thing connecting the two entries is **a memo string containing the invoice UUID**. A memo is not a
foreign key — proving a reversal belongs to its original requires text-parsing, which is exactly what
an auditor should never have to do. The JE-void path already writes both columns, so the pattern
exists in-repo.

**2. THE REVERSAL POSTINGS ARE UNTAGGED — and this one silently corrupts reports.** The reversal's
postings carry **`source_transaction_type = NULL` and `source_transaction_id = NULL`**. Consequence,
measured: **`invoice_postings` stayed at 6 across the void** — the reversal is invisible to any query
grouped or filtered by source type.

> **A revenue report that groups postings by `source_transaction_type = 'invoice'` will show the full
> $313.90 as income and never see the reversal.** The trial balance is fine — it sums by account and
> nets to zero — **but any source-typed P&L, revenue-by-type, or drill-through is overstated by the
> full amount of every voided invoice.**

This also explains the **`(null)` source-type bucket** already visible in the earlier posting census —
those NULL-tagged rows are reversals, sitting outside every source-typed report.

**FIX:** (a) populate `reverses_je_id` / `reversed_by_je_id` on both entries, mirroring the JE-void
path; (b) carry `source_transaction_type` / `source_transaction_id` onto reversal postings so they
appear in the same reports as what they reverse. **GUARD:** assert every posting has a non-null
`source_transaction_type`, and that a voided invoice's postings net to zero **within its source
grouping**, not merely by account. **LANE: CC-1 / money.**

---

## 59. ★★ VOID LANDSCAPE COMPLETE — JE void is the WORKING REFERENCE; three paths, three quality tiers

**LIVE-PROVEN 2026-08-07, USMCA. Created a manual JE, posted it, voided it — controlled before/after.
This completes the void map and gives CC-1 an in-repo implementation to copy, so no new GL math is
needed for either broken path.**

### The transaction

Created via `/accounting/journal-entries` → **+ Create** (two-step wizard): ref
**`CC3-JE-LINKAGE-TEST`**, type **Adjusting Entry**, lines **DR `1295` Relay Fuel Wallet $64.20 / CR
`2000` Accounts Payable $64.20**. The wizard's live balance validator read **"Debits $64.20 / Credits
$64.20 Balanced ✓"** before it would save — correct, and a genuine control. JE **`5f70a75c`** created,
`source = manual` (correctly distinguished from the `auto` system entries), status `posted`.

Then voided it with a reason.

### Result — JE void is CORRECT ON EVERY DIMENSION

| check | result |
|---|---|
| reversing JE created | ✅ **`56a58856`**, memo *"Reversal of journal entry `5f70a75c`…"* |
| net GL effect | ✅ account `1295` net = **0**, account `2000` net = **0** |
| **`reverses_je_id`** on the reversal | ✅ **`5f70a75c`** — points at the original |
| **`reversed_by_je_id`** on the original | ✅ **`56a58856`** — points at the reversal |
| **`void_reason`** | ✅ **stored verbatim** on the reversal |
| UI affordance | ✅ the original's action cell now reads **"Reversed"** instead of offering Void |

**The linkage is bidirectional and the UI consumes it.** This is exactly what the other two paths lack.

### ★ THE COMPLETE VOID MAP — measured, not inferred

| path | reversal JE | net GL zero | `reverses_je_id` | `reversed_by_je_id` | `void_reason` |
|---|---|---|---|---|---|
| **JE void** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Invoice void** (item 58) | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Bill-payment void** (item 54) | ❌ **none** | ❌ **$33.40 residue** | — | — | (reason on the payment row only) |

**All three rows were produced by the same method — create it myself, baseline, void, re-read prod —
so they are directly comparable.** The invoice and JE rows sit side by side in one query: `53415aef` /
`e30baa6a` both NULL on both columns, while `56a58856` / `5f70a75c` are both populated.

**This is the best possible outcome for the fix.** Neither broken path needs new GL math or a design
decision — **the correct behaviour already exists in this repo, on a path in the same schema, and can
be copied**:
- **bill-payment void** needs the *whole* thing (reversal + linkage);
- **invoice void** needs only the *linkage half* (its reversal already nets to zero).

### NEW CONSEQUENCE FOUND — missing linkage leaves an already-reversed JE re-voidable

Because JE void writes `reversed_by_je_id`, the UI renders **"Reversed"** on the original and
**withdraws the Void action**. The invoice path writes neither column — so in the same list,
**`e30baa6a` (the invoice's original JE, already reversed by `53415aef`) STILL OFFERS A VOID BUTTON**,
and so does the reversal itself.

> **Nothing prevents a user from voiding an already-reversed invoice JE a second time**, producing a
> second reversal and swinging the GL the wrong way by the full invoice amount.

**I did NOT execute a double-void** — that would corrupt the entity's ledger to prove a point the
button already proves, and this lane does not move money erroneously. **The offer is the finding**,
exactly as with the voided-bill selector (item 52). **The linkage is not cosmetic traceability: it is
the control that makes double-reversal impossible.** That reframes item 58's linkage gap from an audit
inconvenience to a correctness guard, and it should raise its priority.

**FIX:** point CC-1 at `journal-entries.service.ts`'s void path as the reference; replicate its
linkage write in the invoice-void path and its whole reversal+linkage behaviour in the bill-payment
void path. **Write no new GL math — copy the working neighbour.**
**GUARD:** assert that for every JE carrying `voided_at`/reversal, both `reverses_je_id` and
`reversed_by_je_id` resolve, and that a JE with a non-null `reversed_by_je_id` cannot be voided again.
**LANE: CC-1 / money.**

---

## 60. EXPENSE VOID — the endpoint is BUILT and the UI cannot reach it; void behaviour stays UNVERIFIED

**LIVE 2026-08-07, USMCA. The last unmapped void path — and it could not be exercised, for a reason
that is itself the finding.**

### Baseline (captured before attempting anything)

`accounting.expenses` for USMCA: **2 rows**, both `$1.00`, `status = posted`, `posting_status = posted`,
`voided_at` NULL, **2 GL postings each**. Entity totals: `je_total` **27**, expense postings **4**.
Expense `2b520d35` posts **DR `6160` Parts & Supplies Expense $1.00 / CR `1000` Bank of America –
Operating (USMCA) $1.00** — correct and balanced. A natural sibling pair already existed, so the
standing order's *"reverse exactly ONE, siblings live"* rule was satisfiable without creating more.

### What I found instead

- The **list** page is titled **"Expenses — Recorded expenses (read-only)"** and has **no ACTIONS
  column**; its columns are Expense #, Date, Payee, Category/Memo, Load, WO, Vendor, JE, Bank txn,
  Amount, Status, GL, Bank Match.
- The **detail** page (`/accounting/expenses/2b520d35-…`) shows POSTED, Amount, GL posting **Posted**,
  Journal entry **`ff286e60`**, Payment account, Unit, Memo and Lines — **and offers no action at all.
  No Void, no Edit.**

**So there is no UI path to void an expense.**

### The capability exists — it is just unreachable

| layer | state |
|---|---|
| DB | `accounting.expenses` has **`voided_at`, `void_reason`, `voided_by_user_id`** |
| Backend route | **`POST /api/v1/expenses/:expenseId/void`** — `accounting/expenses.routes.ts:1045` |
| Shared service | `accounting/void.service.ts:301` maps **`expense: "accounting.expenses"`** |
| Status vocabulary | `expenses.routes.ts:130` — status is `IN ('draft','posted','void')` |
| **Frontend** | **nothing invokes it.** `ExpenseDetailPage.tsx`'s only `void` occurrences are a badge mapping (`if (status === "void") return "neutral"`) and an unrelated JS `void detailQuery.refetch()` |

**The frontend knows how to RENDER a voided expense and has no way to PRODUCE one.** That badge branch
is dead code today.

### Verdict — a reachability gap, stated with its ambiguity

**I am NOT filing this as a hard defect.** The list page **declares** itself "read-only", and a
deliberately read-only expense module is a coherent design — expenses may be captured upstream (bank
feed, driver app, card import) and corrected at source rather than voided in place. **Per the intent
test, a declared behaviour is not a defect.**

**But the declaration does not cover the whole picture:** a void ENDPOINT was built, a shared void
SERVICE knows about expenses, the status enum includes `void`, and the UI renders a `void` badge. **Four
independent signals say voiding an expense is intended to be possible; zero UI affords it.** That is a
reachable-capability gap under the total-connectivity law (§10a), and it is worth a deliberate answer
rather than silence.

**CONSEQUENCE FOR THIS BATTERY, STATED PLAINLY: expense void behaviour is UNVERIFIED.** I cannot say
whether it posts a reversal, writes linkage, or leaves residue, because **I will not call the raw API
to find out** — this lane verifies the running application, and invoking an endpoint the app never
invokes would be testing something no user can do, on a money-affecting write. **The void map
therefore has three measured paths and one unreachable one.**

### Updated void map

| path | reversal | net GL zero | linkage | reachable from UI |
|---|---|---|---|---|
| **JE void** | ✅ | ✅ | ✅ both | ✅ |
| **Invoice void** | ✅ | ✅ | ❌ | ✅ |
| **Bill-payment void** | ❌ | ❌ | — | ✅ |
| **Expense void** | **UNVERIFIED** | **UNVERIFIED** | **UNVERIFIED** | ❌ **no control exists** |

**FIX (if voiding expenses is intended):** surface the existing endpoint on the expense detail page,
reusing the same reason-required panel the JE/invoice/bill-payment voids already use. **If the module
is deliberately read-only, say so explicitly** on the detail page too, and the dead `void` badge branch
should be removed or justified. **Either answer is fine; the current state is the one that is not.**
**LANE: CC-2 / mechanical (FE) — with a design answer needed from whoever owns expenses.**

---

## 61. ★ TWO MUTUALLY EXCLUSIVE SIGN CONVENTIONS live in `banking.bank_transactions.amount_cents`

**LIVE-PROVEN 2026-08-07 on Neon prod, all three entities. Read-only across entities — no write to
TRANSP; this lane never writes outside USMCA.**

### The split is perfectly clean, and it is BY ACCOUNT

`is_credit = true` rows, by entity:

| entity | credits | stored **negative** | stored **positive** |
|---|---|---|---|
| USMCA | 69 | **69** | 0 |
| TRK | 1,395 | **1,395** | 0 |
| TRANSP | 1,278 | 1,170 | **108** |

Drilling into TRANSP's 108 — they are not scattered, they are **one account**:

| TRANSP account | credits | negative | positive |
|---|---|---|---|
| BUSINESS CHECKING …6103 / …6129 / …6137 / …3500, Business Platinum Card® | 1,170 | **1,170** | 0 |
| **Relay Fuel Wallet** | **108** | 0 | **108** |

**Whole-database totals: 2,634 credits stored NEGATIVE, 108 stored POSITIVE.** The 108 are a single
coherent cohort — one account, a contiguous window (2026-03-03 → 2026-05-30), one description shape
(*"Relay deposit · card …NNNN. Card deposit. Manual De…"*), totalling **$446,896.99**. **Origin test
applied: this is a distinct feed, not corruption.**

> **Two mutually exclusive conventions coexist in one column, and nothing in the schema records which
> applies to which row.** Every future reader of `amount_cents` must already know that Relay Fuel
> Wallet is special — or be wrong.

### What is NOT a defect — stated explicitly, because it looks like one

`banking/internal-wallet-balance.ts:97,198` computes
`SUM(CASE WHEN is_credit THEN amount_cents ELSE -amount_cents END)` — signed math on the stored value,
which would be wrong under the negative-credit convention. **It is correct**, because its own header
scopes it: *"INTERNAL (non-Plaid) WALLET BALANCE — root-cause fix for the Relay Fuel Wallet tile
showing $0.00 … an account with `plaid_item_id IS NULL` — **the Relay Fuel Wallet is the only one
today (verified prod, 2026-07-16)**"*. It runs **only** over the account that stores credits positive,
so its formula matches its data. **NOT FILED.** I checked the scoping before judging the arithmetic.

### What IS wrong — a code comment that contradicts prod on 96% of rows

`accounting/recon/recon-engine.service.ts:188-193`:

```
// banking.bank_transactions stores amount_cents (bigint magnitude) + is_credit; normalize to a signed value
(CASE WHEN is_credit THEN amount_cents ELSE -amount_cents END)::text AS amount_cents
```

**`amount_cents` is NOT a magnitude.** It is a magnitude on 108 rows and a signed value on **2,634** —
so the stated premise is false for **96% of all credits in the database**. Under the real convention,
`WHEN is_credit THEN amount_cents` yields a **negative** value for a credit the normalization intends
to make positive.

**And this engine is LIVE, not parked:** `TMS_QBO_RECON_ENABLED` is **true for TRANSP, TRK and USMCA**
(prod `lib.feature_flag_overrides`). The accounting standard calls reconciliation *"the correctness
spine … the daily correctness test"*, so a sign assumption that is false for 96% of credits sits in the
one component whose job is catching errors.

**WHAT I AM NOT CLAIMING — and why.** Line 40 of the same file says *"sign per is_credit convention
(caller normalizes both sides the same way)"*. **If the QBO side is normalized with the identical
(mistaken) expression, the inversion cancels and matching still works.** Whether real exceptions are
produced therefore depends on the other side of the comparison, **which I did not trace — UNVERIFIED,
and CC-1 must confirm before treating this as a live mis-match rather than a false premise.** I will
not assert a dollar impact I have not measured.

**FIX:** make the convention explicit rather than assumed — either normalize on write so
`amount_cents` is a true magnitude everywhere (with `is_credit` the only direction carrier, which is
what `posting-engine.service.ts:1677` and `bank-feed-gl-posting.service.ts:8` already declare as law:
*"DIRECTION IS DRIVEN ONLY BY is_credit — NEVER by the sign of amount_cents"*), or record the
per-account convention in the schema. **Note those two files state the law that direction must never
come from the sign — and the recon engine's normalization does exactly that.**
**GUARD:** assert `banking.bank_transactions` has **one** sign convention — e.g. no `is_credit` row
with a positive amount while another has a negative one — or, if the Relay feed is legitimately
different, assert it is the *only* exception and is explicitly registered as such.
**LANE: CC-1 / money** (recon + banking conventions).

---

## 62. ★ THE BANKING PAGE TELLS OPERATORS CATEGORIZE DOESN'T POST — the flag is ON and it does

**LIVE-PROVEN 2026-08-07, USMCA. This is the "read the global default and conclude OFF" masked-scope
error — the exact class the accounting standard names — written into the operator-facing UI.**

### What the page says

`/banking/transactions` renders a standing banner:

> **"Categorize tags are not ledger posts — `BANK_FEED_GL_POSTING_ENABLED` stays OFF by default"**
> *"Categorize persists driver/unit/load/vendor fields immediately; that alone does not post a balanced
> TMS JE. `matched_journal_entry_id` is **not** proof that bank-feed GL posting is live … the
> flag-gated bank-feed poster is a separate path (default OFF). A JE link with the flag OFF is a
> match/link, not 'posting is on.'"*

### What prod says

| source | value |
|---|---|
| `lib.feature_flags.default_enabled` | **false** ← the only thing the banner is describing |
| `lib.feature_flag_overrides` — **TRANSP** | **true** |
| `lib.feature_flag_overrides` — **TRK** | **true** |
| `lib.feature_flag_overrides` — **USMCA** | **true** |

**The flag is ON for all three entities.** The banner's clause is *technically* true about the default
and **materially false about the live system** — and the default is the one thing that does not govern,
because the poster resolves the per-entity override first.

### And the posting is demonstrably happening — by the banner's OWN evidentiary standard

The banner correctly warns that `matched_journal_entry_id` is not proof. **So I did not rely on it.**
Independent measurement on USMCA:

- categorized transactions: **4**
- of those, with a JE link: **4**
- **`accounting.journal_entry_postings` where `source_transaction_type = 'bank_categorization'`: 8**

**Eight postings — two per categorized transaction, i.e. balanced pairs — explicitly tagged as bank
categorization.** That is not a match/link stamped by recon; that is the bank-feed poster's own output
under its own source type. **The banner's stated disproof condition is satisfied.**

### Why this matters more than a wording nit

The banner is not incidental copy — it is a **standing operator instruction about whether an action
touches the general ledger.** An operator reading it will categorize freely, believing the act is
bookkeeping metadata with no ledger effect. In this entity **every categorize posts a balanced journal
entry.** That is the opposite of what the screen promises, on the one axis (does this touch the GL?)
where being wrong matters most.

**This is also the precise error the accounting standard warns about**, quoted there against
revenue-recognition: *"Reading the global `default_enabled=false` and concluding 'OFF' is a
masked-scope error — read `lib.feature_flag_overrides` PER ENTITY."* **The same mistake is now baked
into the banking UI.** The warning exists because this error keeps recurring; here it recurred in the
place an operator is most likely to trust.

**NOTE ON METHOD — the intent test did NOT excuse this.** Earlier this session I correctly declined to
file the vendor-credit GL gap because the page *declared* it and **prod corroborated the declaration**
(flag genuinely off). **A declaration only earns deference when it is TRUE.** Here I checked the same
way and prod contradicted it, so the declaration is the defect rather than the excuse. **The test is
"verify the declaration", not "trust the declaration."**

**FIX:** the banner must read the per-entity override, not the global default — ideally rendering the
live state ("bank-feed GL posting is **ON** for this entity — categorizing posts a balanced JE") so it
can never drift from reality again. Static copy asserting a flag state will always rot.
**GUARD:** assert no UI string claims a money-posting flag is OFF while any per-entity override for it
is true. **LANE: CC-2 / mechanical (FE copy) — but flag to CC-1, since the misstatement is about GL
effect.**

---

## 63. ★ VOID-INVARIANT CLASS MEASURED AND BOUNDED — 5 rows across the ENTIRE money schema

**LIVE-PROVEN 2026-08-07 on Neon prod, all entities, read-only. This turns
`LV-VOID-INVARIANT-BOTH-WAYS` from "broken in both directions" into a bounded, safely fixable class —
and the boundary is the finding.**

### Scope of the sweep

`information_schema` says **27 tables** across `accounting` / `banking` / `mdata` / `driver_finance` /
`maintenance` carry **both** a `status` column and a void timestamp (`voided_at` or `revoked_at`).
Notably **`accounting.bills` carries BOTH `voided_at` AND `revoked_at`** — two void timestamps on one
table, which is its own latent trap.

Of those, **10 are populated**. Measured every one for the invariant in **both** directions:
`ts IS NOT NULL AND status NOT IN (void-ish)` and `status IN (void-ish) AND ts IS NULL`.

**Rows measured: 75,459.**

### Result

| table | stamped but status not void | status void but not stamped | rows in table |
|---|---|---|---|
| **`accounting.bills`** | **4** | 0 | 16,258 |
| **`accounting.invoices`** | 0 | **1** | 11,987 |
| `accounting.expenses` | 0 | 0 | 27,072 |
| `banking.bank_transactions` | 0 | 0 | 11,072 |
| `accounting.bill_payments` | 0 | 0 | 6,546 |
| `accounting.journal_entries` | 0 | 0 | 1,802 |
| `accounting.recon_runs` | 0 | 0 | 519 |
| `accounting.recon_exceptions` | 0 | 0 | 201 |
| `driver_finance.driver_settlements` | 0 | 0 | 1 |
| `maintenance.work_orders` | 0 | 0 | 1 |

> **FIVE ROWS. Across 75,459 rows and 10 populated money tables, the invariant is violated exactly five
> times — and only in the two tables whose broken write-paths this battery already identified.**

### Why the boundary is the valuable part

The earlier card established the invariant is broken **in both directions**, which reads like a
schema-wide integrity problem. **It is not.** Eight populated tables — including the three largest —
are **100% clean**, which means:

1. **The pairing is being maintained correctly almost everywhere.** The two failures are specific
   write-paths, not a missing convention: `accounting.bills` (4 rows voided **out-of-band by direct
   SQL**, which never ran the service) and `accounting.invoices` (1 row from the **load-cancel path**
   that sets `status` without stamping — `LV-CANCEL-VOIDS-STATUS-ONLY`).
2. **A DATABASE CONSTRAINT IS NOW CHEAP AND SAFE.** The permanent fix — a CHECK/trigger enforcing
   `status='void' ⟺ void-timestamp IS NOT NULL`, which no future writer can forget — requires
   correcting **5 rows**, not a mass backfill across 75k. **That removes the usual reason this class of
   fix gets deferred.**
3. **It tells CC-1 where NOT to look.** No sweep of expenses, bank transactions, bill payments or
   journal entries is warranted; they are already correct.

### The permanent fix this evidence unlocks

Per the owner law (never patch): correct the 5 rows **and** add the DB-level constraint in the same
change, **and** fix the two write-paths so they cannot recreate it. A guard alone would catch the next
occurrence after the fact; **a constraint makes it impossible**, which is the difference between a patch
and a permanent fix.

**MUST BE PER-TABLE, NOT COPY-PASTE:** the void column is **`revoked_at`** on `bill_payments`,
**`voided_at`** on invoices/bills/expenses, **`voided_reason`** vs **`void_reason`** for the reason
field, and **`bills` has both `voided_at` and `revoked_at`**. A single templated constraint applied
blindly will target the wrong column on at least one table.

**LANE: CC-1 / money.** Board card `LV-VOID-INVARIANT-BOTH-WAYS` updated with the measured boundary.

---

## 64. ★★ THE TIE-OUT GUARD I RECOMMENDED WOULD HAVE BEEN WRONG — it must be scoped TMS-NATIVE

**LIVE-PROVEN 2026-08-07, read-only across all entities. I have been recommending a
subledger-to-GL tie-out as THE guard for the customer-payment gap. Measuring it before CC-1 builds it
shows the naive form would redden forever on correct data.**

### The measurement

**A/R control balance (GL) vs invoice subledger open, per entity:**

| entity | GL A/R postings | GL A/R balance | live invoices | subledger open |
|---|---|---|---|---|
| **USMCA** (`1100`) | 5 | **$1,200.00** DR | 2 | **$1,875.50** |
| **TRANSP** (`QBO-45`) | 5 | **−$961,983.52** (CREDIT on an asset) | 11,979 | **$829,871.13** |
| TRK | 0 | — | 0 | — |

### TRANSP — EXPECTED STATE, NOT A DEFECT (origin test applied)

A −$961,983.52 credit balance on an asset account and an $829,871.13 subledger gap look alarming. **They
are not a defect.** All five TRANSP `QBO-45` postings, read individually:

1. **CR $961,983.52** — *"Opening balance — QBO Balance Sheet 12/31/2024 (signed-actual, NI rolled to RE)"*
2. DR $15,000.00 — Revrec Event 2, load `L-20260624-0083`
3. CR $15,000.00 — the reversal of that Event 2
4. CR $5.00 — customer payment `PMT-2026-00712`
5. DR $5.00 — invoice `INV-2026-00740`

They net to exactly the opening balance. **And the subledger is import-origin: TRANSP has 11,980
invoices, of which 11,976 are QBO clones and only 4 are TMS-native.**

**Under parallel books, the TMS GL was never supposed to carry the cloned invoices' postings — booking
them would DOUBLE the books.** So a subledger of cloned invoices standing against a GL holding an
opening balance plus TMS-native activity is **exactly the designed state**. Reporting it as a
$1.79M discrepancy would have been the `expected-state-recorded-as-failure` anti-pattern at maximum
volume, against the entity that holds the real books.

### ★ THEREFORE — THE GUARD I RECOMMENDED NEEDS A CORRECTION BEFORE IT IS BUILT

I wrote, on several board rows, that the guard should be *"A/R subledger open == GL A/R control balance
per entity."* **Built naively, that guard is red on TRANSP on day one, forever, on correct data** — and
a permanently-red guard gets muted, which would destroy the one assertion that catches the real defect.

**The correct form — scope both sides to TMS-NATIVE rows:**
- subledger side: invoices with `qbo_invoice_id IS NULL` (TMS-native only)
- GL side: postings excluding the opening-balance entry (and any import-origin JE)
- assert equality **per entity**, and let entities with zero TMS-native invoices assert trivially

**On USMCA — where every invoice IS TMS-native — the tie-out is meaningful today, and it fails:**
GL A/R **$1,200.00** vs subledger open **$1,875.50**. The two sides are not merely unequal, they are
**disjoint**: the $1,200.00 in the GL belongs to an invoice the subledger reports **`paid`** (its
payments never posted — `LV-PAY-SETTLE-NOPOST`), while the $1,875.50 in the subledger is a **proforma**
that never posted to the GL at all. **Neither number appears on the other side.**

### Second observation — flagged, NOT claimed

The opening entry credits A/R by $961,983.52. **A/R is an asset; a credit balance is abnormal.** The
locked decision says opening balances are taken *"signed-actual (not natural-side)"*, so this is either
(a) faithful to what QBO's 12/31/2024 balance sheet actually showed, or (b) a sign inversion on import.
**I cannot distinguish these without QBO's actual 12/31/2024 balance sheet, which this lane cannot
read. UNVERIFIED — recorded so it is checked, not asserted.** Given the locked decision explicitly
anticipates signed-actual values, (a) is entirely plausible and this is **not** filed as a defect.

**Also noted, not filed:** USMCA's invoice posts A/R to **`1100`**, while the locked account mapping
says **A/R = `QBO-45`** — and USMCA has BOTH accounts. TRANSP posts to `QBO-45`. Whether USMCA is
deliberately on a different mapping is a decision I cannot verify from here. **UNVERIFIED.**

**LANE: CC-1 / money — and this correction should be read BEFORE the tie-out guard is built.**

---

## 65. ★★ ITEM 64's UNVERIFIED QUESTION — RESOLVED FROM PRIMARY SOURCE. The A/R credit balance is FAITHFUL, not inverted.

**LIVE-PROVEN 2026-08-07 against QuickBooks itself (authenticated connector, realm "IH 35
Transportation LLC" = TRANSP). Read-only report pull; no QBO write, and no credential was handled by
this lane.**

Item 64 flagged, honestly, that I could not tell whether TMS's opening entry crediting A/R
$961,983.52 was **faithful to QBO's signed-actual balance sheet** or a **sign inversion on import** —
because I could not read that balance sheet. **I can now, and the answer is faithful.**

### QBO Balance Sheet, 12/31/2024, accrual — primary source

| line | QBO value |
|---|---|
| **Accounts Receivable (A/R)** — the account itself | **−$956,313.52** |
| ↳ sub: Unauthorized Expenses Ignacio Muñoz | +$350,451.38 |
| ↳ sub: Unauthorized Expenses Anarely Alcazar | +$73,253.48 |
| **A/R group total** | **−$532,608.66** |

The group total reconciles exactly: `−956,313.52 + 350,451.38 + 73,253.48 = −532,608.66` ✓

> **QBO genuinely reports A/R as a NEGATIVE (credit) balance. The locked decision takes opening balances
> "signed-actual (not natural-side)", so TMS carrying a credit A/R is the decision working as written —
> NOT a defect, and NOT a sign inversion. Item 64's suspicion is retired.**

**This also confirms the two "Unauthorized Expenses" receivables are still on the books as receivables**
— consistent with the locked decision that they are *"receivables pursued in bankruptcy court — NOT
written off, NOT reclassed to expense."*

### NEW, PRECISE OBSERVATION — a round $5,670.00 delta (flagged, NOT filed)

| side | A/R |
|---|---|
| QBO 12/31/2024 (account, without subgroups) | **−$956,313.52** |
| TMS opening entry to `QBO-45` (posted 2026-07-04) | **−$961,983.52** |
| **delta** | **−$5,670.00** |

**$5,670.00 exactly — a round number, not rounding drift**, which usually means one identifiable
transaction or adjustment rather than accumulated error.

**I am NOT filing this as a defect, and the reason is documented in the locked decisions:** *"The QBO
source is a MOVING TARGET: the internal accountant (Martin) is still cleaning/reconciling. The opening
JE is DEFERRED until Martin finalizes the 2024 close."* TMS imported on **2026-07-04**; QBO has been
actively edited since. **A delta between a July snapshot and today's QBO is the expected consequence of
a deliberate, owner-approved strategy** (clone-as-is-then-adjust), not an import bug.

**What it IS good for:** this is the exact figure the opening tie-out must explain when Martin finalises
the close. Recording it now means the tie-out starts from a measured number instead of a rediscovery.

### PASS — a locked invariant verified against primary source

**`Opening Balance Equity = $0.00`** on QBO's 12/31/2024 sheet. The locked decision states *"OBE →
Retained Earnings as a temporary clearing account — a permanent Opening Balance Equity balance is a
DEFECT (must net ≈ 0)."* **It nets to zero. PASS**, verified at source rather than assumed.

### Method note

Item 64 said *"this lane cannot read that sheet — UNVERIFIED"* rather than guessing at a sign
inversion. **That restraint was correct: guessing would have produced a $961,983.52 false defect
against the entity holding the real books.** The question stayed open exactly as long as it needed to,
and was closed the moment a primary source became reachable. **UNVERIFIED is not a dead end — it is a
placeholder for evidence that has not arrived yet.**

**LANE: informational — item 64's UNVERIFIED item is retired; the $5,670.00 goes to CC-1 as an opening
tie-out input, not as a defect.**

---

## 66. CONTROL-ACCOUNT ROLE REGISTRY — two UNVERIFIED items retired, one real split found

**LIVE-PROVEN 2026-08-07 on Neon prod, read-only, all entities. STRUCTURAL only — no numeric QBO-vs-TMS
comparison, per the standing rule that FY2023–2025 figures are still moving while Martin reconciles.**

### The registry is well-built — and it retires item 64's second UNVERIFIED

`accounting.chart_of_accounts_roles` binds control accounts **per entity**, and supersedes old bindings
by **deactivating, never deleting** (WORM, correctly applied):

| entity | `ar_control` | `ap_control` |
|---|---|---|
| TRANSP | **`QBO-45`** active · `1100` **inactive** | **`QBO-47`** active · `2000` **inactive** |
| TRK | **`TRK-1100`** active · `1100` **inactive** | **`TRK-2000`** active · `2000` **inactive** |
| USMCA | **`1100`** active | **`2000`** active |

**Item 64 flagged as UNVERIFIED that "USMCA posts A/R to `1100` while the locked mapping says A/R =
`QBO-45`". RESOLVED — it is correct by configuration.** USMCA's active `ar_control` **is** `1100` and its
`ap_control` **is** `2000`, so the poster is faithfully honouring the registry. The locked
"A/R = QBO-45 / A/P = QBO-47" statement is **TRANSP-specific** — it describes the QBO-mirrored entity's
mapping, and TRANSP does exactly that (1,550 A/P postings on `QBO-47`). **USMCA has no QBO realm, so
native numbering is right. NOT a defect.**

**That is the third UNVERIFIED item retired with evidence rather than argued away.**

### The real finding — TRK's A/P is SPLIT across an active and a DEACTIVATED control account

TRK's `ap_control` moved to **`TRK-2000`** at **2026-06-16 04:42:46**, deactivating `2000` at the same
instant. Yet A/P postings landed on **both** afterwards:

| account | posted | amount | memo |
|---|---|---|---|
| **`2000`** *(deactivated)* | **2026-07-12** — **26 days after** | $0.01 | "GUARD TRK posting test — void me" |
| **`2000`** *(deactivated)* | **2026-07-29** — **43 days after** | $300.00 | "Prepaid purchase GUARD prepaid first-JE 2026-07-29" |
| `TRK-2000` *(active)* | 2026-08-03 | $25.00 | "Bill … posting" |

**Both stragglers postdate the deactivation, so this is not historical residue from before the
switchover.** The one clearly-production posting — a bill — correctly used the active account, so **the
bill poster honours the registry.**

### What I will NOT claim, and why

**Both `2000` postings carry "GUARD" in their memo**, which marks them as verification-lane artifacts
rather than business transactions. I therefore **cannot** tell whether:

- **(a)** a posting path resolved `2000` from the registry and ignored `is_active=false` — **a real
  defect**, or
- **(b)** a guard test named the account explicitly, which would be **expected state** for a test.

**UNVERIFIED — and I am not guessing between them.** Distinguishing them requires reading the
prepaid-purchase posting path to see whether it resolves `ap_control` or takes an account id from its
caller. That is a bounded code read, and it belongs to the lane that owns the poster.

### What IS established regardless of which explanation holds

**TRK's A/P is genuinely split: $300.01 sits on a DEACTIVATED control account and $25.00 on the active
one.** Any report, aging, or tie-out that resolves A/P through the **active** `ap_control` role — which
is the correct way to resolve it — **silently omits $300.01**. That is true whether the postings came
from a test or a production path, and it will not correct itself.

**FIX:** decide and act — if the two are test artifacts, void them per WORM (they are on the ledger, so
they count); if a posting path resolves the role without honouring `is_active`, fix that path.
**Either way TRK's A/P must end up on one account.**
**GUARD:** assert **no posting targets a `chart_of_accounts_roles` account whose binding is
`is_active = false`**. That is a clean, permanent, entity-agnostic invariant — and it catches this class
before it splits a control account again.
**LANE: CC-1 / money.**

---

## 67. ★★ SELF-CORRECTION — item 66's guard would have been WRONG, and an "inactive role binding" is NOT an inactive account

**LIVE-PROVEN 2026-08-07. I filed item 66 and then kept measuring. The wider measurement disproved my
own framing before CC-1 could act on it.**

### What I claimed, and what is actually true

Item 66 reported *"A/P posted to a DEACTIVATED role account"* and proposed the guard
*"assert no posting targets a `chart_of_accounts_roles` account whose binding is `is_active = false`."*
Generalising that measurement across all entities and roles produced **154 postings**, which looked like
a large live class:

| entity | role | postings | account |
|---|---|---|---|
| TRANSP | `cash_dip` | 142 | `QBO-1150040141` **WF - General Operating 6103** |
| USMCA | `damage_recovery` | 8 | `5400` **Truck Repairs & Maintenance** |
| TRK | `accum_depr_default` | 2 | `QBO-1150040031` |
| TRK | `ap_control` | 2 | `2000` |

**Then I looked at what those accounts actually are, and the class evaporated.**

**`chart_of_accounts_roles.is_active = false` means "this account is no longer THE designated account for
THAT ROLE". It does NOT mean the account is deactivated or unpostable.**

- `WF - General Operating 6103` is a **BANK account** — and it still holds **1 ACTIVE role binding**.
  142 postings to a live bank account is *normal banking*.
- `5400 Truck Repairs & Maintenance` is an **EXPENSE account**. 8 repair postings is *normal expense
  activity*. Its retired `damage_recovery` binding has nothing to do with whether repairs post there.

**Verified on `catalogs.accounts`, which carries the account's own `deactivated_at`: every one of these
accounts is ACTIVE.**

### The decisive query — and it is a PASS, not a defect

```
postings landing on an account AFTER that account's own deactivated_at  ->  0
```

**ZERO. Across the entire database, not one posting has ever landed on a genuinely deactivated account.**
The system is correct on the invariant that actually matters. TRANSP's `2000` was deactivated
2026-06-30 and has received nothing since.

### Consequences — stated plainly

1. **My proposed guard was wrong and is WITHDRAWN.** Built as specified it would have reddened on **154
   correct postings** — a permanently-red guard that would then be muted, exactly the failure mode I
   warned about for the tie-out guard in item 64. **Twice now I have caught a guard-spec error by
   measuring before it was built; both would have shipped as noise.**
2. **The correct guard is the one the data already passes:** assert no posting lands on an account after
   its own `deactivated_at`. That is meaningful, currently green, and would catch a real regression.
3. **The narrow part of item 66 SURVIVES, restated honestly:** TRK's A/P sits on **two ACTIVE A/P
   accounts** — `2000` "Accounts Payable" ($300.01) and `TRK-2000` "Accounts Payable" ($25.00), with
   `ap_control` designating `TRK-2000`. **A role-based A/P report resolves `TRK-2000` and omits
   $300.01.** That split is real and worth resolving — but the reason is *two active A/P accounts in one
   entity*, **not** "posting to a disabled account".

### Why I am recording this rather than quietly editing

The wrong framing and the wrong guard were **already pushed to the shared board**, where CC-1 could have
picked them up. Under the never-guess law a filed claim that turns out to be wrong gets **corrected in
place with the reasoning**, not silently overwritten — the correction is as much a finding as the
original. **The lesson is specific and reusable: a foreign-key-ish flag on a JOIN table (`role.is_active`)
describes THE RELATIONSHIP, never the ROW it points at.** I conflated the two, and only measuring the
target rows caught it.

**Board row `LV-AP-POSTED-TO-DEACTIVATED-ROLE-ACCOUNT` corrected accordingly.**

---

## 68. WORK ORDER CREATE — four PASSes, and a z-index defect that DESTROYS the form

**LIVE 2026-08-07, USMCA, `/maintenance` → + Create Work Order → Repair. The work order was NOT
created — and the reason is the defect.**

### PASS — this screen is genuinely well-built

1. **Pre-save validation panel with live blockers.** Section D lists nine named checks and marks each
   `✓` or `!` as you type, and **"Create work order & Bill" stays DISABLED while any `!` remains.** It
   correctly blocked on *"Driver and unit required for non-PM operational types"*, *"Vendor invoice # or
   vendor WO # required"*, and cleared each as I satisfied it. **This is the opposite of the
   `LV-DISPATCH-TOAST-LIES` pattern** — the screen refuses to claim success it has not earned.
2. **Class auto-derive works.** `Class (auto)` moved from **`UNIT-UNASSIGNED` → `UNIT-DRIVER`** the
   moment a driver was attached — the §7 auto-derive rule, rendered in the one green the palette allows.
3. **★ Auto load-linkage — the total-connectivity law working.** Attaching the driver auto-populated
   **`Load # = L-20260806-0008`** (the unit's active trip) with a clearable `×`, and surfaced
   **"Suggested load: L-20260806-0008 **EXACT**"**. The WO wired itself to the load without being asked.
4. **Inline `+ Add new part`** is present at the end of the part dropdown, per §7, and opens a mini-create
   **without closing the parent** — the correct pattern.

**Cost math also verified:** part $289.45 → Subtotal $289.45 → Tax 8.25% **$23.88** → **WO Total
$313.33**, and Section D declares *"Registers as a Bill (A/P) — payable later, 1099-tracked."*

### ★ DEFECT — the Quick Create Part panel renders BEHIND its parent modal, and clicking it destroys the work order

`+ Add new part "…"` opens a **Quick Create Part** side panel. **The Create Work Order modal renders ON
TOP of it** — verified by zooming the region: the WO modal's white surface visibly overlays the left
portion of the part panel, hiding its upper field(s). Only a narrow strip of the part panel is exposed to
the right of the modal.

**And the exposed strip is not safe to click.** Clicking there is treated as an **outside-click on the
Create Work Order modal**, which **dismisses BOTH panels and discards the entire work order** —
every field, the VMRS complaint/cause/correction, the cost line, the driver, the vendor invoice number.

**Measured consequence: the work order was lost and `OPEN WOS` remains `0`.** This is not a cosmetic
overlap — **it is unrecoverable data loss on a multi-section form**, triggered by using the very
inline-create affordance §7 requires the screen to have.

**Severity is amplified by where it sits:** the part panel is only reachable *after* filling out the
whole work order, so the user has maximum unsaved work at exactly the moment the trap is armed.

**FIX (root cause, not a patch):** the child panel must render **above** its parent (z-index/stacking
context), and — independently — the parent modal must **not treat clicks inside a descendant panel as
outside-clicks**. Both are needed: fixing only the z-index still leaves a dismiss-on-click surface if the
outside-click handler ignores the portal.
**GUARD:** assert that no modal's outside-click dismissal fires while a child create-panel is open. A
purely visual z-index fix is not testable; the dismissal behaviour is.
**LANE: mechanical / FE (CC-3 role per board §3 — NOT CC-2, which never builds).**

### Honest status of this battery item

**The maintenance chain (WO → parts + labor → close → bill) is NOT complete.** `maintenance.work_orders`
for USMCA remains **0**. Everything above about validation, auto-derive and auto-linkage was observed
live in the form; the persistence half is unproven because the form cannot survive the part-create step.
**Recorded as incomplete rather than implied.**

---

## 70. CORRECTION to item 68 — the part-panel defect DESTROYS ONLY THE COST LINES, not the work order

**Verdict: SELF-CORRECTION (item 68 overstated the damage).** Item 68 claimed the trap "discards the entire
work order — every field, the VMRS complaint/cause/correction, the cost line, the driver, the vendor invoice
number." **That is wrong.** Re-opening `+ Create Work Order → Repair` on 2026-08-07 restored, intact and
unprompted: unit `USMCA-001`, driver `Juan USMCA-Battery`, `Class (auto) UNIT-DRIVER`, `Load # L-20260806-0008`,
`Source Type IS - Internal shop`, `Location Internal shop`, `Vendor RO / Invoice CC3-WO-INV-0001`, the full
description, AND all three VMRS panels (complaint / cause / correction).

**What is actually lost:** the COST LINES only — Section A read `No Section A lines / Subtotal A: $0.00` and
Section B read `No Section B lines / Subtotal B: $0.00`, where `$289.45` had stood.

The draft persistence is real and it works. The precise defect is narrower than filed and the board row is
corrected accordingly. **A finding that overstates its blast radius is still a wrong finding** — the law does
not only forbid missing defects, it forbids inflating them.

---

## 71. `+ Create labor` is INLINE and clean — the trap is specific to `+ Create part`

**Verdict: PASS (and it bounds item 68).** `+ Create labor` renders a LABOR sub-row **inside** the Section B
item line — no modal, no overlay, no dismiss-on-click. Entered `Alternator R&R - charging system load test`,
`2` hr @ `$95.00` → sub-row total computed **$190.00**, correct.

So the z-index/outside-click defect is **not** a general property of the WO modal's inline-create — it is
specific to the `+ Create part` panel. That narrows the fix surface and proves the intended pattern already
works somewhere in the same component.

---

## 72. FAIL (P0, money) — `LV-WO-RECONCILE-EXCLUDES-SECTION-A`: the WO declares "Reconciled" while its own total is $436.66 higher than the amount reconciled

**Verified live in the product, USMCA, 2026-08-07.** Final state of one work order:

| surface | value |
|---|---|
| Subtotal A (category lines) | `$289.45` |
| Subtotal B (item lines) | `$289.45` |
| Subtotal | `$578.90` |
| Tax 8.25% | `$47.76` |
| **WO Total = A + B** | **`$626.66`** |
| Vendor Invoice Reconcile — Parts, WO total | `$0.00` |
| Vendor Invoice Reconcile — Labor, WO total | `$190.00` |
| Vendor invoice entered | `$190.00` |
| Panel verdict | **"Reconciled — WO parts & labor tie to the vendor invoice."** |
| Pre-save validation | **all 9 ✓**, incl. "Vendor invoice reconciles — WO parts & labor tie to invoice" |
| Registers as | **Bill (A/P)** — "payable later, 1099-tracked" |

**The two totals are computed from DISJOINT sets.** Verified in code, not inferred —
`apps/backend/src/maintenance/two-section-service.ts:186-191`:

- `sectionATotal` = Σ category lines
- `sectionBTotal` = Σ `Math.max(line.amount, Σ sub_rows.amount)` — the parent item-line amount **or** its
  parts/labor children, **whichever is larger**
- `totalCost = sectionATotal + sectionBTotal`

The **vendor-invoice reconcile reads only the parts/labor sub-rows.** Therefore Section A category lines and
any parent item-line amount that exceeds its children are **structurally invisible** to the reconcile, while
being fully included in the WO total and in the A/P bill. A user can put the entire cost of a repair in
Section A, enter a vendor invoice of `$0.00`, and the screen will certify **"Reconciled."**

**Why this matters beyond the arithmetic:** the reconcile is the control that proves a maintenance bill
matches the vendor's actual invoice — the thing an auditor, an insurer, or a bankruptcy examiner tests. A
control that certifies a tie while $436.66 of the same document is outside its scope is worse than no
control: it produces documentary assurance that is not true. Under Ch.11 with an active embezzlement
reconciliation, an A/P control that reports false agreement is exactly the wrong failure to ship.

**NOT claimed / UNVERIFIED:** the amount that would actually land on `accounting.bills`. The create call
**500s** (item 73), so the bill is unreachable and the posted figure has never been observed. Whether the
bill takes `$626.66`, `$578.90` or `$190.00` is **UNVERIFIED — needs live check once item 73 is fixed.**

**Routed:** money/GL → **CC-1**.

---

## 73. FAIL (P0, BLOCKER) — `LV-WO-CREATE-500-OPENED-AT`: work-order creation is 100% broken; two writers disagree and trip the table's own immutability trigger

**Reproduced live, twice, through the product's own endpoint on USMCA:**

```
POST https://api.ih35dispatch.com/api/v1/maintenance/work-orders
→ HTTP 500
{"statusCode":500,"code":"P0001","error":"Internal Server Error",
 "message":"E_WO_OPENED_AT_IMMUTABLE: opened_at cannot be changed once set"}
```

`P0001` = PL/pgSQL `RAISE EXCEPTION`. Captured with a fetch interceptor in the live authed session; the
request carried `operating_company_id 5c854333-…` (USMCA), `wo_type repair`, `source_type IS`,
`service_date "2026-08-07"`, and a separate `opened_at`.

**FIRST HYPOTHESIS WAS WRONG — recorded because the correction is the finding.** I first concluded the
trigger "fires on INSERT, where there is no prior value to change." Reading the actual function on prod
disproved it. `maintenance.wo_set_opened_at` is **correct**:

```sql
IF TG_OP = 'INSERT' AND NEW.opened_at IS NULL THEN
  NEW.opened_at := COALESCE(NEW.created_at, now());
ELSIF TG_OP = 'UPDATE' AND OLD.opened_at IS DISTINCT FROM NEW.opened_at THEN
  RAISE EXCEPTION 'E_WO_OPENED_AT_IMMUTABLE: opened_at cannot be changed once set';
END IF;
```

It raises on **UPDATE**. The trigger is not the bug — it is the sensor that caught the bug.

**ACTUAL ROOT CAUSE — two writers in one request, sourced from different fields**
(`apps/backend/src/maintenance/two-section-service.ts`):

1. **:203 INSERT** — `opened_at = COALESCE($8::timestamptz, now())` where `$8 = header.service_date`
2. **:285 post-insert UPDATE** — `opened_at = COALESCE($1, opened_at)` where `$1 = header.opened_at`

When a request carries **both** `service_date` and `opened_at` and they differ (they always do — one is a
date at midnight, the other a timestamp), the UPDATE changes a column the INSERT already set →
`OLD.opened_at IS DISTINCT FROM NEW.opened_at` → **RAISE** → the whole transaction aborts → 500, no row.

The comment at **:272-273** shows the author saw the hazard — *"All COALESCE so a missing field never
clobbers the INSERT defaults (e.g. opened_at)"*. `COALESCE` protects only when the field is **absent**. It
does nothing when the field is **present and different**, which is the normal case from this very form.

**LIVE DB EVIDENCE — prod `br-fancy-credit-akjnd07a`, `maintenance.work_orders`, completeness discriminator satisfied:**

| metric | value |
|---|---|
| `current_user` | `neondb_owner` (asserted in the same statement) |
| `n_tup_ins` | **13** |
| `n_tup_del` | **3** |
| `n_live_tup` | **1** |
| `count(*)` visible, all entities | **1** — `visible == n_live_tup` ✓ (positive control, same table) |
| `count(*)` visible, USMCA | **0** |
| trigger | `trg_wo_set_opened_at` on **INS/UPD** |

**13 inserted − 3 deleted = 10 expected live, but 1 is live.** Nine inserts exist in the statistics and
nowhere in the table: they were **rolled back**. That is the durable signature of an aborted transaction,
and it is the identical shape as `LV-TXN-014` (insurance policy create). **This is a class, not an
incident** — a post-insert UPDATE pattern colliding with a column guard.

**THE FIX MUST BE THE ROOT CAUSE, NOT THE SENSOR.** Do **not** relax, drop, or add an exception to
`wo_set_opened_at` — the immutability guard is correct and is protecting an audit-relevant timestamp.
Fix the writers: settle on ONE source of truth for `opened_at`, and stop the post-insert UPDATE from
rewriting a column the INSERT already owns (drop `opened_at` from the :285 SET list, and have the INSERT
take `header.opened_at ?? header.service_date`). **A guard that fires correctly is not a bug to silence.**

**Consequence:** the maintenance module cannot create a work order at all, for any entity. This blocks
WO → parts+labor → close → bill, and therefore the maintenance half of the USMCA battery.

**Routed:** mechanical/backend. See the routing note on the board — standing-order rule 7 says
mechanical → CC-2, while the owner-locked board §3 says CC-2 **never builds** and assigns mechanical to
CC-3, which does not build either. Filed naming **both** so the work is not stranded in a never-build lane.

---

## 74. USMCA COVERAGE MAP — verified with the completeness discriminator, after a FALSE ZERO nearly became the record

**Verdict: PASS (coverage), plus a recorded near-miss that matters more than the numbers.**

**THE NEAR-MISS.** A single-statement coverage sweep across eleven USMCA tables returned **0 for every one of
them** — including `mdata.loads` and `mdata.drivers`. I did **not** record it. It was self-evidently false:
minutes earlier the work-order form had auto-linked load `L-20260806-0008` and driver `Juan USMCA-Battery`,
and the captured POST payload carried live UUIDs for both. **A result that contradicts something you watched
happen is a broken query, not a discovery.**

**Cause, verified:** `mcp__Neon__run_sql` runs each statement standalone, and the MCP role **alternates**
(`ih35_app` on that call, `neondb_owner` on others — observed both within minutes). Under `ih35_app` with no
`app.operating_company_id` and no `app.bypass_rls`, FORCED-RLS masks `mdata.*` / `accounting.*` /
`banking.*` to zero **silently — no error, no warning, just zeros.** Re-run inside ONE transaction with
`set_config(...,true)` first, the same tables returned real counts. Had I filed the first result, this
document would now assert that USMCA has no drivers, no loads, no bills and no bank activity — every
statement false, and each one would have justified fabricating data to "fix" it.

**VERIFIED MAP** — prod `br-fancy-credit-akjnd07a`, GUC + lucia bypass set in the same transaction,
`current_user` asserted in-statement, and `visible_all == n_live_tup` proven on **every** row:

| table | USMCA | visible_all | n_live_tup | complete |
|---|---|---|---|---|
| `banking.bank_transactions` | **163** | 11,073 | 11,073 | ✓ |
| `mdata.drivers` | **86** | 181 | 181 | ✓ |
| `accounting.journal_entries` | **27** | 1,802 | 1,802 | ✓ |
| `accounting.bills` | **11** | 16,258 | 16,258 | ✓ |
| `accounting.invoices` | **7** | 11,987 | 11,987 | ✓ |
| `mdata.vendors` | **7** | 2,836 | 2,836 | ✓ |
| `mdata.loads` | **4** | 9 | 9 | ✓ |
| `accounting.payments` | **3** | 12,127 | 12,127 | ✓ |
| `mdata.customers` | **3** | 2,698 | 2,698 | ✓ |
| `mdata.units` | **3** (owner or lessee) | 183 | 183 | ✓ |
| `driver_finance.driver_settlements` | **1** | 1 | 1 | ✓ |
| **`maintenance.work_orders`** | **0** | 1 | 1 | ✓ |

**`maintenance.work_orders` is the ONLY genuinely empty subledger**, and it is empty for a proven reason —
`LV-WO-CREATE-500-OPENED-AT` (item 73) aborts every create. That zero carries its own discriminator
(`visible_all` 1 == `n_live_tup` 1, positive control on the same table), so it is a **verdict**, not a mask.

**The standing rule this reinforces:** a `0` from this MCP is worthless until the same statement proves who
it ran as, that it could see the table at all, and that what it saw equals what exists. Two zeros appeared in
this session — one false, one true — and they were indistinguishable until the discriminator was applied.

---

## 75. FAIL (P1) — `LV-EXPENSE-CATEGORY-PICKER-EMPTY`: the Record-expense Category picker offers ZERO options while 32 USMCA expense accounts exist, so the only affordance is "+ Add new category" — which duplicates the chart

**Verified live, USMCA, 2026-08-07.** `+ Create` → **Record expense** drawer (`/accounting/expenses`).

**OBSERVED (primary, in the product):**
- **Category** picker with an EMPTY search string offers exactly one row: **`+ Add new category`**. Typing
  `diesel` → only `+ Add new category "diesel"`. Typing `fuel` → only `+ Add new category "fuel"`.
- **Payment account** picker, in the SAME drawer, IS populated: `Bank of America - Operating (USMCA)` and
  `Undeposited Funds` — both genuine USMCA accounts.

**PROD DATA — the categories exist** (`br-fancy-credit-akjnd07a`, GUC + lucia bypass in one txn,
`current_user` asserted, `visible_all == n_live_tup` on both tables):

| source | USMCA |
|---|---|
| `catalogs.accounts` type `Expense` (active + postable) | **16** |
| `catalogs.accounts` type `CostOfGoodsSold` (active + postable) | **10** |
| `catalogs.accounts` type `OtherExpense` (active + postable) | **6** |
| **expense-family total** | **32** |
| `accounting.expense_category_account_map` | **32** |

**LIVE API — the data reaches the browser.** Called from the authed session:
`GET /api/v1/catalogs/accounts?operating_company_id=5c854333-…&status=active&postable_only=true`
→ **200**, `returned: 50, total: 76` (page size 50). Page 1 alone carries **21 expense-family rows**
(Expense 10 · OtherExpense 6 · COGS 5).

**THE FILTER IS CORRECT.** `apps/frontend/src/lib/account-picker-scope.ts:94` —
`isExpenseAccount = is_postable && !deactivated_at && account_type ∈ {Expense, CostOfGoodsSold,
OtherExpense}`. Against the 21 rows actually returned it should match 21, not 0. `isPaymentAccount`
(same file, :82) runs over the SAME array and correctly yields the 2 accounts that render.

**WHY THIS MATTERS — it is not cosmetic.** With no existing category selectable, the only path a user has
is `+ Add new category`, which creates a NEW account in `catalogs.accounts`. Every expense recorded from
this screen therefore grows a **parallel, duplicate expense taxonomy** beside the 32 that already exist and
beside `expense_category_account_map`. That is silent chart-of-accounts corruption produced by using the
screen exactly as designed — and under Ch.11 with an embezzlement reconciliation running, a duplicated
expense chart is precisely the artifact that makes a ledger unauditable. §7's `+ Add new ___` is meant to
be the LAST row of a populated dropdown, not the only row.

**ROOT CAUSE — NARROWED, NOT PROVEN. UNVERIFIED, needs one more live check.** I can state with evidence
that the data exists (prod), reaches the client (200, 21 rows), and that the filter which consumes it is
correct. I could NOT confirm which component the drawer actually mounts:
`components/expenses/RecordExpenseForm.tsx` (whose `categoryOptions`, :138-152, is the wiring I read),
`components/expenses/RecordExpenseModal.tsx`, or `pages/accounting/ExpenseCreatePage.tsx` all render a
"Record expense" surface. **I am not naming a line I did not confirm executes.**

**A WRONG INFERENCE I MADE AND CORRECTED IN PLACE:** I first concluded "no categories endpoint is called at
all — the picker has no data source", because my fetch interceptor saw only `/api/v1/attachments` when I
reopened the drawer. That was wrong: both queries carry `staleTime: 60_000`, so they were served from
cache and simply did not re-fetch. I then predicted the Payment account picker would ALSO be empty (shared
`enabled: Boolean(operatingCompanyId)`); it was populated, which **disproved the prediction and killed the
theory.** Recorded because the falsified prediction is what stopped a wrong root cause from being filed.

**Routed:** FE/mechanical — see the routing note on the board.

---

## 76. item 75's UNVERIFIED root cause — PARTIALLY RESOLVED: the component is confirmed, and FOUR hypotheses are now DISPROVEN by live evidence

Item 75 closed with *"UNVERIFIED — needs one more live check."* I ran the checks. Two questions closed,
four theories died, and the residue is now small enough to hand over precisely.

**CLOSED — which component actually mounts the drawer.** Fingerprinted by strings that are unique in the
tree and were both present in the live DOM: **`Truck/Unit (optional)`** appears ONLY in
`components/expenses/RecordExpenseForm.tsx`, and **`View all expenses`** ONLY in
`components/expenses/RecordExpenseModal.tsx`. The modal wraps the form. So `categoryOptions`
(`RecordExpenseForm.tsx:138-152`) is the code under suspicion — no longer a guess between three candidates.

**CLOSED — `ReferenceSelect` honours what the parent passes.** `components/parity/ReferenceSelect.tsx:102`
builds `comboOptions = [...options, ...created]`. It does not fetch its own list by `createKind`. So an
empty picker means `categoryOptions` was genuinely empty at render, not that the child ignored it.

**DISPROVEN 1 — "the data isn't there."** The EXACT URL the client builds
(`status=active&limit=200&offset=0&operating_company_id=5c854333-…&postable_only=true`) returns
**76 of 76** rows: `Asset 22 · Expense 16 · CostOfGoodsSold 10 · Income 10 · Liability 9 · OtherExpense 6 ·
Equity 3`. **All 76 postable, ZERO with `deactivated_at`.** Expense-family = **32**.

**DISPROVEN 2 — "the filter is wrong."** `isExpenseAccount` = `is_postable && !deactivated_at &&
account_type ∈ {Expense, CostOfGoodsSold, OtherExpense}`. Against the 76 rows actually delivered it must
match **32**. `isPaymentAccount`, over the SAME array, correctly yields the 2 accounts that DO render
(`Bank of America - Operating (USMCA)`, `Undeposited Funds`).

**DISPROVEN 3 — "prod runs a stale bundle predating the 2026-07-22 category fix."** I pursued this because
the source carries a `LIVE-DEFECT fix (2026-07-22)` comment saying the filter *previously* required
`qbo_account_id`, and **every USMCA account has `qbo_account_id = NULL`** (verified live: `allWithQbo: 0`
across all 76 — correct for a TMS-only entity with QuickBooks not connected). It fit perfectly. **It is
still wrong.** I fetched the deployed chunk `account-picker-scope-*.js` (543 bytes) and read it: it gates
on `is_postable` and `deactivated_at`, carries types `Bank, Bank, CreditCard, Expense, CostOfGoodsSold,
OtherExpense`, and contains **no `qbo_account_id` reference at all**. The deployed helper is CURRENT.

**DISPROVEN 4 — "the query never fired / `operatingCompanyId` is missing."** Predicted the Payment account
picker would also be empty (both queries share `enabled: Boolean(operatingCompanyId)`). It was **populated**.

**WHAT REMAINS — the only surviving candidate.** Data correct, delivered, filter correct, helper deployed
and current, sibling filter over the same array working. That leaves whether the **deployed**
`RecordExpenseForm.categoryOptions` actually invokes `isExpenseAccount` on `paymentAccountsQuery.data.accounts`.
Static bundle probing could not settle it: `RecordExpenseForm` sits in `index-*.js` while the helper is a
separate 543-byte chunk, so the constants are legitimately absent from the form's chunk whether or not it
imports them. Settling it needs source maps or a runtime breakpoint — **UNVERIFIED, and I will not name a
line I did not watch execute.**

**Why this is worth recording rather than four dead ends:** the defect is real and reproducible, and the
owning lane now inherits a one-question investigation instead of an open-ended one. Four plausible causes —
including one that fit the evidence exactly — are eliminated **with the evidence that killed them**, so
nobody re-runs them. Hypothesis 3 is the cautionary one: `qbo_account_id = NULL` on every USMCA account is
TRUE, the code comment describing that exact failure is TRUE, and the conclusion drawn from both was still
FALSE. Two true facts and a coherent story are not proof.

---

## 77. PASS — JE void satisfies EVERY WORM invariant in the standing order, including "siblings untouched"

**Verified on prod `br-fancy-credit-akjnd07a`, USMCA, 2026-08-07**, GUC + lucia bypass in one transaction,
`current_user` (`ih35_app`) asserted in the same statement. Lines read from
`accounting.journal_entry_postings` (`debit_or_credit`, `amount_cents`) — note the table is NOT
`journal_entry_lines`, which does not exist.

The standing order requires, for each voidable type: *"reversing JE DR=CR nets zero, original preserved
(voided_at/cancelled not deleted), append-only audit row, siblings untouched."* For the manual JE path,
all of it holds:

| invariant | result | evidence |
|---|---|---|
| reversing JE nets zero | **PASS** | `56a58856` DR `$64.20` = CR `$64.20` |
| original preserved, not deleted | **PASS** | `5f70a75c` still present, `status = posted` |
| linkage written BOTH ways | **PASS** | `5f70a75c.reversed_by_je_id = 56a58856` AND `56a58856.reverses_je_id = 5f70a75c` |
| **siblings untouched** | **PASS** | all 6 other USMCA JEs have `updated_at == created_at` to the second |
| every entry balanced | **PASS** | 8 of 8 JEs read DR = CR |

**The siblings check is the one that had never been proven, and it is the sharpest.** Across the 8 most
recent USMCA journal entries, exactly **one** row has `updated_at > created_at`: `5f70a75c`
(`03:33:20 → 03:34:07`), which is the void stamping its own linkage. Every other entry — `53415aef`,
`e30baa6a`, `6fe7c21a`, `4da3efbd`, `6f63081e`, `ea6a0f05` — carries `updated_at` identical to
`created_at`. A void touched precisely the row it was supposed to touch and nothing else. That is the
property a court or examiner actually tests, and it is now measured rather than assumed.

**PRECISION THAT MATTERS — `voided_at` is NOT set on the original.** `5f70a75c` reads `voided: false` and
remains `status = posted`; what marks it is `reversed_by_je_id`, and the UI renders `Reversed` in place of
the Void button. So for journal entries the void model is **a reversing entry plus bidirectional linkage**,
NOT a `voided_at` flag. This is correct under board Rule 4 ("VOID = reversal; nothing is deletable") and
under GAAP — a posted entry is never unposted — but it differs from `accounting.payments`, which DOES carry
`voided_at`. **Anyone auditing "is this voided?" by testing `voided_at IS NOT NULL` will read a reversed JE
as live.** Recording the distinction so a future guard is written against the right column per table.

**This is the working reference implementation.** Items already on the board record that invoice void
reverses without writing linkage, bill-payment void produces no reversal, and expense void is unreachable.
The JE path shows the complete correct shape — reversing entry, balanced, original preserved, linkage both
directions, siblings untouched — so the other three paths have a proven in-repo model to be fixed against.
No new engine has to be designed.

---

## 78. FAIL (P0 · legal evidence) — `LV-AUDIT-TRAIL-HAS-NO-ACTOR`: 2 of 2,319,894 WORM audit rows record WHO made the change

**Verified on prod `br-fancy-credit-akjnd07a`, 2026-08-07**, `audit.row_changes`, whole table, `current_user`
asserted in the same statement. This is the append-only WORM trail the constitution names as the audit
system of record.

| column | populated | of total |
|---|---|---|
| rows in table | — | **2,319,894** (2026-05-28 → 2026-08-07) |
| `changed_by_user_id` | **2** | 0.00009% |
| `changed_by_role` | **0** | 0% |
| `session_id` | **0** | 0% |
| `tenant_id` | 2,163,538 | 93% |
| `op = 'DELETE'` | **27** | — |

**The trail records WHAT changed and never WHO.** Two rows out of 2.3 million carry a user; not one carries
a role or a session. The columns exist and are correctly designed — they are simply not being written.

**WHY THIS IS P0 AND NOT A NICE-TO-HAVE.** `CLAUDE.md` opens by stating this system holds *"live financial
and legal-evidence data"*, and §10 requires every change be made as if *"a CPA, auditor, attorney, insurer,
lender, DOT/FMCSA reviewer, architect, or court will review it."* An audit trail without an actor is a
**change log, not evidence** — it cannot answer the one question every one of those reviewers asks first:
*who did this?* This company is in confirmed Ch. 11 and is actively litigating an embezzlement by Ignacio
Muñoz, with the "Unauthorized Expenses" receivables held as evidence. Attribution is not paperwork here; it
is the mechanism by which a disputed change is pinned to a person. Non-repudiation is impossible today.

**CONCRETE DEMONSTRATION — 27 rows were DELETED and the trail cannot say by whom.** All 27 `DELETE`
operations in the entire table occurred in **one transaction at `2026-08-04 16:05:35`**:

| table | deletes | with actor |
|---|---|---|
| `mdata.load_stops` | 10 | **0** |
| `mdata.units` | 6 | **0** |
| `mdata.loads` | 5 | **0** |
| `mdata.drivers` | 4 | **0** |
| `maintenance.work_orders` | 2 | **0** |

**I am NOT filing the deletion itself as the defect.** A single-transaction purge of 27 rows across
TMS-native test tables on one day is most plausibly a deliberate test-data cleanup, and board Rule 4 records
that all TMS-native data is test. Calling that a defect without evidence of intent would be the guessing
this lane forbids — **origin matters, and I did not establish it.** What the deletion proves is the
*consequence* of the actor gap: 27 operational records were destroyed and the WORM trail is structurally
incapable of naming who destroyed them. That is the finding.

**Worth a separate look by the owning lane, NOT claimed here:** board Rule 4 also says *"VOID = reversal;
**nothing is deletable**."* Hard `DELETE`s did execute against `mdata.loads`, `mdata.drivers`, `mdata.units`,
`mdata.load_stops` and `maintenance.work_orders`. Whether that purge was sanctioned is **UNVERIFIED —
needs an owner/lane answer**, and it is recorded rather than assumed in either direction.

**What "fixed" must mean (do not accept less):** the writer populates `changed_by_user_id`, `changed_by_role`
and `session_id` from the authenticated request context on every mutation, and a CI guard proves a mutation
through a real route lands an audit row WITH an actor. Back-filling the 2.3M historical rows is neither
possible nor desirable — that data is gone and inventing it would be fabricating evidence. **The honest
remediation is: attribute everything from the fix forward, and record in the audit documentation that rows
before that date carry no actor**, so nobody later mistakes a null actor for a system action.

**Routed:** WORM / audit integrity → **CC-1**.

---

## 79. FAIL (P1) — `LV-BANKING-QBO-CONNECTED-IS-HARDCODED`: Banking tells every entity "QBO Sync: Connected" from a string literal, while USMCA has no QBO connection at all

**Observed live, USMCA, 2026-08-07, `/banking`.** The Banking Home status strip renders, verbatim:

> **QBO Sync:** Connected | Last sync: n/a | Transactions: 163 | Uncategorized: 111 | Pending QBO sync: 0

The same line claims a live connection **and** admits it has never synced. Meanwhile the global top bar,
two inches above it, shows a grey **"QuickBooks: not connected"**. Two contradictory statements about the
same entity on the same screen.

**PROD — USMCA has NO QBO connection.** `integrations.qbo_connections`, completeness discriminator
satisfied (`visible_all` **4** == `n_live_tup` **4**, `current_user` asserted in the same statement):

| operating_company_id | realm_id | live (`revoked_at IS NULL`) | is USMCA |
|---|---|---|---|
| `b49a737b…` | 1432746210 | true | **false** |
| `91e0bf0a…` (TRANSP) | 123145885549599 | false | **false** |
| `b49a737b…` | 123145885549599 | false | **false** |
| `91e0bf0a…` (TRANSP) | 123145885549599 | true | **false** |

**Zero rows for USMCA.** The header is right; the banking strip is wrong.

**ROOT CAUSE — a hardcoded literal, no inference required.**
`apps/frontend/src/pages/banking/components/SyncStatusStrip.tsx:11-12`:

```jsx
<span className="font-semibold">QBO Sync:</span>{" "}
<span className="text-slate-700">Connected</span>
```

The component's entire prop surface is `{ syncedAt, transactionCount, uncategorizedCount, pendingSyncCount }`
— **not one of them is a connection state.** There is no query, no flag, no conditional. "Connected" is
printed unconditionally, for every entity, forever. This is not a scoping bug or a stale cache; the screen
has no access to the fact it is asserting.

**WHY IT MATTERS.** Under the locked parallel-books architecture QBO is the system of record through
2025-12-31 and TMS reconciles against it. A banking screen that certifies "QBO Sync: Connected · Pending
QBO sync: 0" tells the reader their bank activity is mirrored and nothing is outstanding. For USMCA —
TMS-only and isolated **by design** — every part of that is false: there is no connection, so "0 pending"
is not "all clear", it is "nothing can ever sync". A user reconciling USMCA banking would reasonably
conclude it ties to QuickBooks. It cannot.

**Same class as `LV-DISPATCH-TOAST-LIES`:** a UI asserting a system state it never checked. It is the
cheapest kind of defect to fix and among the most expensive to trust wrongly, because it is
indistinguishable from a true "Connected" until someone checks the database.

**Fix, completely:** derive the label from the entity's real connection state (a live
`integrations.qbo_connections` row for the current `operating_company_id`, `revoked_at IS NULL`), render
"Not connected" when there is none, and suppress or relabel "Pending QBO sync" when no connection exists —
`0 pending` against no connection is affirmatively misleading. **A guard should assert this component takes
connection state as a prop**, so the literal cannot come back.

**Routed:** FE/mechanical for the render; the wording of the connected/not-connected states touches the
parallel-books contract, so CC-1 should sanity-check the copy.

---

## 80. FAIL (P1 · money) — `LV-BANK-MATCH-SCORE-SATURATES-TO-MEMO`: once every candidate is outside tolerance the amount term clamps to zero, so the top-ranked "match" is chosen by fuzzy memo text

**Observed live, USMCA, 2026-08-07, `/banking/transactions`**, match drawer for the bank row
*"Zelle payment to Dreamline Transit LLC for 'INV-418334'; Conf# vfmqou1ne"*, **$918.00 spent, 08/05/2026**.
The drawer offers *"Recommended matches (±7 days) from live ledger data"*, ranked by Score:

| rank | candidate | amount | **amount gap** | date gap | score |
|---|---|---|---|---|---|
| **1** | JOURNAL ENTRY · CC3-JE-LINKAGE-TEST | $64.20 | **$853.80** | 1d | **0.202** |
| 2 | JOURNAL ENTRY · Invoice INV-2026-00003 posting | $1,200.00 | **$282.00** | 1d | 0.191 |
| 3 | JOURNAL ENTRY · Invoice INV-2026-00007 posting | $313.90 | $604.10 | 1d | 0.191 |
| 4 | JOURNAL ENTRY · Bill payment 8b68a9d7 posting | $33.40 | $884.60 | 1d | 0.186 |

**The closest candidate by amount ranks SECOND.** A candidate off by $853.80 is presented as the best match
over one off by $282.00, and two candidates with gaps of $282.00 and $604.10 score **identically**.

**ROOT CAUSE — read in code, then confirmed arithmetically against the live scores.**
`apps/backend/src/accounting/bank-recon/match.service.ts:136-141`:

```js
const amountScore = Math.max(0, 1 - input.amountGapCents / Math.max(input.toleranceCents, 1));
const dateScore   = Math.max(0, 1 - input.dateGapDays / AUTO_MATCH_DATE_WINDOW_DAYS);
const memoScore   = Math.max(0, Math.min(input.similarity, 1));
return Number((0.55 * amountScore + 0.2 * dateScore + 0.25 * memoScore).toFixed(6));
```

Tolerance (`:92-93`, `:133`) is `max(100 cents, |amount| × 0.0001)` → for $918.00 that is **$1.00**. Every
candidate's gap ($282.00 – $884.60) is **282× to 884× the tolerance**, so `1 - gap/tolerance` is deeply
negative and `Math.max(0, …)` clamps **`amountScore` to 0 for every candidate**. The 0.55 weight — the
majority of the score — contributes **nothing**. `AUTO_MATCH_DATE_WINDOW_DAYS = 5` and all four rows share
a 1-day gap, so `dateScore` is identical too. **The only term left varying is the 0.25 memo similarity**,
which is exactly what the observed spread (0.202 / 0.191 / 0.191 / 0.186) decomposes to.

**The ranking has silently degenerated from "closest amount" to "text that looks most like the bank memo."**

**WHY THIS IS A MONEY DEFECT, not a UX nit.** The drawer's job is to tell an operator which ledger entry a
bank line corresponds to. It labels these "Recommended matches" and sorts by Score, so the rational
operator accepts the top row. Here the top row is the **worst of the four by amount** — accepting it would
reconcile a **$918.00** bank payment against a **$64.20** journal entry that exists only because I created
it as a void-linkage test. In a real reconciliation that is a mis-tied bank line, and bank reconciliation
is precisely where a CPA, lender or examiner checks that cash agrees with the ledger.

**Honest mitigation, stated:** the UI **does** display `Amount gap: $853.80` on every row, so an attentive
operator can catch it. The defect is the RANKING and the Score, not concealment — the screen is not lying,
it is recommending badly. That is why this is P1 and not P0.

**Fix, at the root — do not just re-sort the list.** The score must remain discriminating when all
candidates fall outside tolerance. Any of: replace the hard clamp with a continuous decay
(`1 / (1 + gap/tolerance)`) so ordering by amount survives at any distance; or suppress candidates beyond a
sanity multiple of tolerance rather than presenting them as recommendations; or, when every `amountScore`
is 0, fall back to ranking by amount gap ascending and label the list "no close amount match". **A guard
should assert that for a fixed date and memo, a smaller amount gap never scores lower than a larger one** —
that property is what broke, and it is cheap to test.

**Routed:** money / reconciliation → **CC-1**.

---

## 81. CONTROLLED COMPARISON — the SAME CoA picker works in Banking and is empty in Record-expense, which isolates item 75 to that one component

**Verified live, USMCA, 2026-08-07, same browser session, minutes apart.** This is the positive control item
75 was missing.

| surface | picker | result |
|---|---|---|
| `/banking/transactions` → row → Categorize | **Category (Chart of Accounts)** | **POPULATED** — `Driver Cash Advance- TEST Driver-One-20260806` (Asset) · `Relay Fuel Wallet` (Asset) · **`Interest & Financing Expense` (Expense)** · `Interest Receivable` (Asset) · `Loans to Related Parties` |
| `/accounting/expenses` → `+ Create` → Record expense | **Category** | **EMPTY** — only `+ Add new category` |

Same entity, same session, same chart, same authenticated user, minutes apart. The Banking picker even
renders an **Expense**-type account (`Interest & Financing Expense`), which is exactly the class the
Record-expense picker claims none of.

**WHAT THIS ELIMINATES — with evidence, so nobody re-runs these:** the empty picker is **not** missing data,
**not** the CoA endpoint, **not** entity scoping, **not** RLS, **not** auth or session, and **not** a
per-entity CoA gap. All of those would have broken the Banking picker identically. Combined with the four
hypotheses already killed in item 76 (data absent · filter wrong · stale bundle predating the
`qbo_account_id` fix · query never fired), the surviving surface is now **one component**:
`components/expenses/RecordExpenseForm.tsx` `categoryOptions` (:138-152).

**Everything around it is proven working:** `catalogs.accounts` holds 32 active+postable expense-family rows
for USMCA; the exact client URL returns 76/76; `isExpenseAccount` is correct; `ReferenceSelect` renders what
its parent passes; and a sibling picker over the same chart populates fine.

**Still UNVERIFIED and still not guessed:** why that one component's `categoryOptions` evaluates empty.
Settling it needs source maps or a runtime breakpoint. **I will not name the failing line without watching
it execute** — but the owning lane now has a controlled A/B, which is the cheapest possible starting point.

**Note (minor, both surfaces):** `+ Add new category` renders as the **FIRST** row of both dropdowns.
Product lock §7 says the inline `+ Add new ___` belongs at the **END** of a reference dropdown. Recorded as
a consistency observation, not filed as a defect.

---

## 82. FAIL (P0 · money) — `LV-BANK-CATEGORIZE-POSTS-GL-WHILE-BANNER-SAYS-IT-DOES-NOT`

**The Banking screen tells the operator that categorizing does not post to the ledger. It posts to the
ledger. Proven by doing it once.**

**WHAT THE SCREEN SAYS** (`/banking/transactions`, standing banner, verbatim):

> **Categorize tags are not ledger posts — BANK_FEED_GL_POSTING_ENABLED stays OFF by default**
> Categorize persists driver/unit/load/vendor fields immediately; **that alone does not post a balanced TMS JE.**

**WHAT ACTUALLY HAPPENED.** I categorized exactly one row — *"Zelle payment to Dreamline Transit LLC for
'INV-418334'"*, **$918.00**, 08/05/2026 — to `Other Operating Expense`, and clicked **Post**. UI counters
moved honestly (For review 111 → 110, Categorized 4 → 5). Then, on prod:

| evidence | value |
|---|---|
| `banking.bank_transactions.review_state` | `matched` |
| `matched_journal_entry_id` | **set** |
| journal entry created | **`ff746cfa`** |
| its `created_at` | **`2026-08-07 15:13:10`** — the same second as the bank row's `updated_at` |
| its memo | **`Bank categorization cb271ba0-691a-48b5-ad07-3669bbe6c569 posting`** |
| its debits | **$918.00** |
| USMCA `accounting.journal_entries` | **27 → 28** |

A **new, balanced journal entry** was created by the categorize, and its own memo says so.

**THE FLAG IS ON — AND THAT IS WHY THE BANNER IS WRONG, NOT THE POSTER.** `lib.feature_flags` /
`lib.feature_flag_overrides` on prod:

| scope | `BANK_FEED_GL_POSTING_ENABLED` |
|---|---|
| global `default_enabled` | **false** |
| **USMCA** override | **TRUE** |
| TRANSP override | **TRUE** |
| TRK override | **TRUE** |

**The posting is CORRECT behaviour.** The flag is enabled for every entity. The defect is that the screen
asserts the opposite.

**ROOT CAUSE — a hardcoded sentence, not a scoping bug.**
`apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx:2155-2157` is a static `<p>`:
the words "stays OFF by default" and "does not post a balanced TMS JE" are literal prose. **The banner never
reads the flag it names.**

**This is the exact masked-scope error the house standards call out** — *"Reading the global
`default_enabled=false` and concluding 'OFF' is a masked-scope error — read `lib.feature_flag_overrides`
PER ENTITY."* The banner reads like someone checked the global default and wrote it down. The global default
IS `false`; the effective per-entity value is `TRUE` everywhere.

**WHY THIS IS P0.** There are **110 transactions still in the for-review queue**. An operator who believes
this banner will categorize them as mere tagging and thereby post **110 unintended journal entries** into a
live general ledger — during a Ch.11 case with an active embezzlement reconciliation, where every GL entry
is potential evidence. Unlike the other UI-truth defects I filed today, this one does not merely misinform:
**acting on the false statement changes the books.**

**Cruel detail:** the same banner block already warns that `matched_journal_entry_id` "is not proof that
bank-feed GL posting is live." That caution is well-founded and correct — and it is the sentence that could
lead a reviewer to dismiss the very evidence of this defect. I therefore did not stop at the linkage column:
I confirmed a **new JE row**, its creation timestamp, its memo, its balanced debit, and the entity JE count
moving 27 → 28.

**FIX COMPLETELY:** derive the sentence from the effective per-entity flag
(`resolveFlagEnabled(BANK_FEED_GL_POSTING_ENABLED, operating_company_id)`), and when posting is ON say so
loudly — *"Categorizing WILL post a balanced journal entry to the ledger for this entity."* Never print a
flag's global default as if it were the effective state. **Guard: assert this banner's text is rendered from
the resolved per-entity flag value and that no literal 'stays OFF' string exists in the component.**

**Routed:** money / GL → **CC-1** (posting truth), with FE for the render.

---

## 83. Bank categorize — the ENGINE is correct end-to-end; one structural weakness in reverse linkage

**Verified on prod after the item-82 categorize (USMCA, $918.00, 2026-08-07).** Having proven the banner
false, the fair question is whether the thing it denied is at least *done well*. It is — with one gap.

**PASS — the posted entry is accounting-correct:**

| side | account | type | amount |
|---|---|---|---|
| DR | `6999` Other Operating Expense | Expense | **$918.00** |
| CR | `1000` Bank of America - Operating (USMCA) | Asset | **$918.00** |

Balanced, and the correct double entry for a money-out bank line categorized to an expense: the expense is
debited, the bank account it actually cleared is credited. **The poster picked the right cash account on its
own** — I chose only the expense category.

**PASS — attribution persisted exactly as the banner promises:** on `banking.bank_transactions`,
`categorized_at = 15:13:10`, `categorization_gl_account_id` → `6999 Other Operating Expense`,
`category_kind = "Other Operating Expense"`, `review_state = matched`. `categorization_driver_id`,
`_unit_id`, `_load_id`, `_vendor_id` are all NULL — **correct**, because I set none of them. The banner's
claim that categorize "persists driver/unit/load/vendor fields immediately" holds.

**PASS — forward linkage is a real FK:** `bank_transactions.matched_journal_entry_id` → the JE. One row
points at it.

**FINDING (P2, structural) — reverse linkage exists only as a STRING inside a memo.** From the journal
entry, the only row-level pointer back to the bank transaction is the memo text
`Bank categorization cb271ba0-691a-48b5-ad07-3669bbe6c569 posting`. I verified that UUID **is** the bank
transaction id — so reverse drill-through genuinely works, **by parsing prose**. The JE's own structured
columns are `source = 'auto'` and `source_system = 'tms'`, which identify no specific record.

**And the purpose-built mechanism for this is sitting empty.** `banking.bank_transaction_splits` carries
exactly the right shape — `result_journal_entry_id` (a proper reverse FK) plus `load_id`, `driver_id`,
`unit_id`, `trailer_id`, `vendor_id`, `customer_id`, `item_id`, `posting_status`, `voided_at` — and it holds
**0 rows** (`visible_all` 0 == `n_live_tup` 0, discriminator satisfied). The categorize path does not write
it.

**Why this is worth a card rather than a shrug:** LAW §10a (TOTAL CONNECTIVITY) requires forward **and**
reverse drill-through. Today the reverse direction is load-bearing on a free-text string. Nothing enforces
that memo's format — no FK, no constraint, no index. Anyone who edits a memo, or any change to the memo
template, silently severs the audit path from a ledger entry back to the bank line that produced it. That
path is exactly what an examiner walks. **It works now and would break quietly**, which is the definition of
a structural weakness rather than a bug.

**NOT claimed:** I did not verify the JE-detail UI's "Source maps bank_categorization → Banking
Transactions" reverse drill (the banner documents it at
`BankingTransactionsDesignView.tsx:1530`). That is a MODULE-level jump, not row-level, and I have not
exercised it — **UNVERIFIED**.

**Fix:** write the `bank_transaction_splits` row the schema was designed for (it already has
`result_journal_entry_id`), or add a `source_bank_transaction_id` column on `accounting.journal_entries`.
Either makes the reverse link a constraint instead of a sentence. **Guard: assert every JE whose memo begins
`Bank categorization` has a structured FK back to its bank transaction.**

**Routed:** CC-1 (ledger linkage).

---

## 84. PASS — nine ledger-integrity and entity-isolation invariants, measured on prod

**Verified on prod `br-fancy-credit-akjnd07a`, USMCA, 2026-08-07**, GUC + lucia bypass in one transaction,
`current_user` asserted in the same statement. These are the invariants an auditor tests first, and they had
not been measured — only assumed.

**Ledger integrity — `accounting.journal_entries` / `journal_entry_postings`:**

| invariant | result |
|---|---|
| USMCA journal entries | **28** |
| entries where Σdebits ≠ Σcredits | **0** |
| one-sided entries (debits or credits missing) | **0** |
| entries with zero postings | **0** |
| **postings to an account belonging to ANOTHER entity** | **0** |

**Entity isolation — the subledgers:**

| invariant | result |
|---|---|
| USMCA bills | 11 |
| bills whose `vendor_id` resolves to no vendor | **0** |
| bills pointing at a FOREIGN entity's vendor | **0** |
| invoices pointing at a FOREIGN entity's customer | **0** |
| bank transactions categorised to a FOREIGN entity's GL account | **0** |

**What this establishes, and why it matters to how the rest of my findings should be read.** The double-entry
engine and the entity boundary are **sound**. Every journal entry balances, none is malformed, and not one
posting, bill, invoice or bank categorisation crosses into another company's records. USMCA is genuinely
isolated at the data layer.

That is the important frame for the defects filed today: **the money math and the entity walls are holding;
what is failing is what the software TELLS the operator.** The Banking banner denies a GL post that happens
(item 82). The QBO strip reports a connection that does not exist (item 79). The match drawer recommends its
worst candidate first (item 80). The reconcile certifies a tie that is $436.66 off (item 72). None of those
corrupted the ledger — they mislead the human, who then acts. **A correct engine behind a lying interface is
still dangerous, because the operator is part of the system.**

**Schema note, already filed — no duplicate raised.** `accounting.bills.vendor_id` is **`text`** while
`mdata.vendors.id` is **`uuid`**, so a foreign key across that link is not even expressible and nothing
constrains the column to a real vendor. Today all 11 USMCA bills resolve cleanly, so this is latent rather
than active. It is already on the board as `LV-BILLS-VENDOR-UUID`; I checked before writing rather than
filing it twice.

---

## 85. ROOT CAUSE beneath the void findings — two money tables have NO void or soft-delete column at all

**Measured on prod `br-fancy-credit-akjnd07a` (`information_schema.columns`), 2026-08-07.** I filed several
void defects from the UI side; this is the schema fact underneath them. **No new card — the existing cards
are annotated instead**, because filing the same defect twice inflates the board and splits the fix.

| table | `voided_at` | `deactivated_at` | `archived_at` | other soft-delete |
|---|---|---|---|---|
| `accounting.journal_entries` | **✓** | — | — | — |
| `accounting.invoices` | **✓** | — | — | — |
| `accounting.bills` | **✓** | — | — | — |
| `accounting.payments` | **✓** | — | — | — |
| `banking.bank_transactions` | **✓** | — | — | — |
| `driver_finance.driver_settlements` | **✓** | — | — | — |
| `accounting.invoice_lines` | — | — | — | ✓ (`is_active`-class) |
| `driver_finance.settlement_lines` | — | — | — | ✓ (`is_active`-class) |
| **`accounting.bill_payments`** | **NONE** | **NONE** | **NONE** | **NONE** |
| **`accounting.expense_lines`** | **NONE** | **NONE** | **NONE** | **NONE** |

**Two money tables have no way to mark a row void, inactive, archived or cancelled.** The constitution is
explicit — *"void-not-delete: set `voided_at`, never DELETE"* and *"Every table gets `is_active` + audit"* —
and board Rule 4 states *"VOID = reversal; nothing is deletable."* For these two tables the schema offers no
mechanism to comply: the only way to remove a row is a hard `DELETE`, which the law forbids. **The rule and
the schema are in direct conflict.**

**This explains the UI symptoms I filed separately rather than duplicating them:**
- `LV-BILLPAY-VOID-NO-REVERSAL` — voiding a bill payment produces no reversal. With no `voided_at` on
  `accounting.bill_payments`, there is nowhere to record that it was voided. **(Already documented in the
  constitution itself: "`accounting.bill_payments` (no `voided_at`)" — so this is known, not newly
  discovered.)**
- `LV-EXPENSE-VOID-UNREACHABLE` — the expense void path is unreachable from the UI. `expense_lines` has no
  void column either.

**NOT claimed — and I checked rather than assumed:** there is **no evidence of data loss**. `audit.row_changes`
records **27** `DELETE` operations in the entire table, and **none of them touched `bill_payments` or
`expense_lines`** (they were `mdata.load_stops` 10 · `mdata.units` 6 · `mdata.loads` 5 · `mdata.drivers` 4 ·
`maintenance.work_orders` 2). **This is a latent structural gap, not an active one** — it becomes real the
first time someone needs to void a bill payment or an expense line.

**What the fix must be (for the lane that takes the existing cards):** add `voided_at` to
`accounting.bill_payments` and a soft-delete column to `accounting.expense_lines` in an additive, idempotent
migration, then make the void paths write them. **Do not "solve" it with a `DELETE`** — that is the one
outcome the law forbids, and it is the path of least resistance for anyone who does not read this first.
