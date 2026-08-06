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

### LV-TXN-003 — `GET /api/v1/dispatch/units-without-load` did not settle — **UNVERIFIED, needs re-probe**
- **observed:** in the live network trace for the dispatch board, `dispatch/units-without-load?…` appears
  **three times, all `statusCode: pending`**, while every sibling dispatch call on the same page returned
  200. This is the endpoint behind the "Unassigned units / Awaiting assignment" panel.
- **honest limit:** `pending` in a captured trace can mean in-flight at capture time, not hung. I did not
  re-probe it in isolation, so I am NOT calling it a defect.
- **verdict:** **UNVERIFIED — needs live check.** Re-probe directly before anyone opens a card.
- **status:** OPEN — to re-probe in this lane.

---

## Entity-safety note
No write has been performed on TRANSP in this session. All observation above is read-only; the only
mutation contemplated (walking `L-20260802-0258` forward) is on USMCA test data.
