# LEAD RULING — 2026-09-22 — `views.live_loads`
## THE PERMANENT FIX FOR "AT RISK SHOWS 19". VALIDATED LIVE BEFORE ANY CODE WAS WRITTEN.

Owner, from the live app: *"THE WIRING IS NOT CORRECT... AT RISK SHOWS 19, AND LATE SHOWS 19...
THE LOADS IN KANBAN APPEAR STILL DISPATCHED AND IN TRUCK LINE AND IN ALL. WHEN I INSTRUCT YOU TO
CREATE A FIX OR BUILD, I EXPECT IT DONE CORRECTLY, AND THROUGHOUT THE ENTIRE APP, VERTICALLY,
HORIZONTALLY, NOT JUST A PATCH."*

---

## WHY THE LAST FIX DID NOT HOLD — read this before writing anything

`assertCanonicalSubset` validates that a board's **status list** is a subset of the canonical
status set. It cannot validate the other half of the predicate, because **the two halves are
different shapes**: one is a list of enum values, the other is a set of NOT EXISTS conditions
against three other tables. A list-based guard can never enforce a row-level condition.

So `dispatch-alert-statuses.ts` and `planner.service.ts` correctly import
`assertCanonicalSubset`, correctly pass it, and **still render every `dispatched` load — 19, of
which 14 are already settled and driver-billed.**

**A per-caller convention is what failed. Every board has to remember to apply the money half,
and they do not. That is not fixable by asking harder.**

---

## THE FIX — move the guarantee into the data layer, where it cannot be skipped

**One view. Settled loads are not in it. A board physically cannot render one.**
This is the same principle as the shared ingest entry point in task 49: the guarantee must be
structural, not disciplinary. `views` is already the established pattern here — **39 objects**,
including `views.dispatch_load_with_driver_status` and `views.units_with_dispatch_status`.

```sql
-- db/migrations/<timestamp>_create_views_live_loads.sql   (CC-1's lane — he writes the migration)
CREATE OR REPLACE VIEW views.live_loads AS
SELECT
  l.*,
  CASE
    WHEN l.status::text IN ('delivered','delivered_pending_docs','completed_docs_received')
      THEN 'pre_settlement'
    ELSE 'open_dispatch'
  END AS live_state
FROM mdata.loads l
WHERE l.is_sample_data IS NOT TRUE
  AND l.soft_deleted_at IS NULL
  -- (1) the status half
  AND l.status::text NOT IN (
        'draft','invoiced','paid','closed','cancelled',
        'abandoned','driver_walkoff','driver_no_show')
  -- (2) the money half — THE PART EVERY BOARD KEEPS OMITTING
  AND NOT EXISTS (SELECT 1 FROM driver_finance.settlement_lines s
                   WHERE s.load_id = l.id AND s.is_active IS TRUE)
  AND NOT EXISTS (SELECT 1 FROM driver_finance.driver_bills b
                   WHERE b.load_id = l.id AND b.status <> 'void')
  AND NOT EXISTS (SELECT 1 FROM accounting.invoices i
                   WHERE i.source_load_id = l.id
                     AND i.status NOT IN ('draft','proforma','void'));
```

**RLS:** the view inherits `mdata.loads`' policies through the invoker. Confirm
`security_invoker = true` behaviour on this Postgres version in the migration and state it in the
PR body. **A view that bypasses RLS is a worse defect than the one it fixes.**

---

## VALIDATED LIVE — USMCA, `set_config('app.bypass_rls','lucia',FALSE)`, 2026-09-22
```
live_state       loads  units  load numbers
open_dispatch        5      2  13609, 13615, 13616, 13617, 13618
pre_settlement       4      3  13610, 13612, 13613, 13614

surface                                        renders
AT RISK / LATE through views.live_loads              5
AT RISK / LATE as the app does it today             19    <- the owner's screen
```
**The owner's own 5 open loads and his 4 delivered-and-invoiced loads, exactly.**

---

## HOW EVERY SURFACE CONSUMES IT
```
dispatch boards, At Risk, Late, Kanban, Truck Line,
Planner, Trip Pairing, Quick Assign, wizard pickers    FROM views.live_loads
                                                       WHERE live_state = 'open_dispatch'
                                                       [ AND status IN (<narrower list>) ]

Load Costs / pre-settlement                            FROM views.live_loads
                                                       WHERE live_state = 'pre_settlement'

anything historical                                    mdata.loads directly — REPORTS ONLY,
                                                       never a dispatch surface
```
**A narrower view narrows the STATUS half only. It never opts out of the money half — and now it
cannot, because settled loads are not in the view to begin with.** "Moving right now" still
excludes a load that is already settled: a settled load is not moving, it is finished.

`canonical-active-load-set.ts` stays and keeps `assertCanonicalSubset` for the status lists. It is
no longer load-bearing on its own — **the view is.**

---

## GUARD — `scripts/verify-dispatch-reads-live-loads-view.mjs` (CC-1)
1. **FAIL** any file under `apps/backend/src/dispatch/**`, `dispatcher-board/**` or
   `accounting/load-costs-board*` that selects `FROM mdata.loads` for a list/board surface
   instead of `views.live_loads`. Allow-list the legitimate writers (`book-load.service.ts`, the
   status-transition routes, `update-load.service.ts`) and the Reports surfaces, by explicit
   path, with the reason recorded.
2. **FAIL** any query that applies the status half without reading the view.
3. Shrink-only four-arm ratchet seeded at today's offender count.
4. Selftest **RED against current code** — which must fail it today — before GREEN.

## DONE — re-measurable, and it is a TABLE, not a claim
Every surface, before and after, against `open_dispatch = 5`:
At Risk · Late Arrivals · Kanban · Truck Line · Planner · Trip Pairing · Quick Assign ·
Factoring Queue · Dispatch Home tiles · every wizard picker · every tab.
**Load Costs → `pre_settlement = 4`.** Paste the table. **Do not ship a third time without it.**

## WHY THIS IS THE COMPLETE FIX AND NOT A PATCH
The defect was never any one board. It was that **correctness depended on every caller
remembering a three-table condition.** Thirteen callers did not. Moving the condition into the
view removes the requirement to remember: a settled load is not in the result set, so no board can
show one — including boards nobody has written yet. **That is the property McLeod and QuickBooks
have: the guarantee is structural, not disciplinary.**

**Deadline 2026-09-22 23:59 UTC. Surrender seat: CC-3.**
