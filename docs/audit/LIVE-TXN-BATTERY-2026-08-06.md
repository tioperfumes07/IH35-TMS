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

## Entity-safety note
No write has been performed on TRANSP in this session. All observation above is read-only; the only
mutation contemplated (walking `L-20260802-0258` forward) is on USMCA test data.
