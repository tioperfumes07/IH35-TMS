# ROUND 149 — MEASURED: THE SHARED CREATE PATH IS FIRING, AND IT IS SKIPPING EXACTLY THREE SIDE EFFECTS.
Claude Lead, 2026-09-24 12:44 AM CT (2026-09-24 05:44Z). Nothing below is described. Every line was read off
`origin/main` or measured on production `br-fancy-credit-akjnd07a`, USMCA only, `bypass_rls` as a
materialized CTE, READ-ONLY.

## WHAT IS ALREADY BUILT — STOP ASSIGNING IT AS NEW WORK (README rule 1: GREP BEFORE YOU BUILD)
```
createLoadWithFullSideEffects   EXISTS  apps/backend/src/dispatch/book-load.service.ts (exported)
verify-one-load-create-path.mjs EXISTS  scripts/
callers already wired           mdata/loads.routes.ts:508 · onboarding/seed-sample-data.ts:273
                                driver-finance/__tests__/historical-feed-day.routes.db.test.ts:47
non-test INSERT INTO mdata.loads  ONLY  book-load.service.ts (the shared path itself)
                                        + apps/backend/scripts/seed-from-csv.ts (script, not a route)
historical-driver-bill-backfill.service.ts  EXISTS
```
Ruling `04-RULING-FEED-PARITY` was **implemented**. The one-path law holds. This is not a rebuild.

## THE MEASUREMENT THAT NAMES THE REAL DEFECT — live, USMCA, right now
```
mdata.loads                        32
mdata.load_stops                   72    <- Book Load INSERT :2644  FIRED
dispatch.load_assignment_history   72    <- INSERTs :2481 / :2512    FIRED
driver_finance.driver_bills        30    <- INSERTs :984 / :1070     FIRED on 30 of 32
dispatch.load_charge_lines          0    <- INSERT :2426             *** NEVER FIRED ***
loads with a resolved factoring vendor   0 of 32   <- resolveFactoringVendorId :2444        NEVER RAN
loads with a pre-settlement tour link    0 of 32   <- findOpenPresettlementTourForUnit :2590 NEVER RAN
```
**The feed IS going through the shared path** — stops and assignment history only exist because Book Load
created them. So this is not a bypass. **`source = 'historical_backfill'` is omitting three side effects**,
which ruling 04 §3 forbids in its own words: *"`source` controls POLICY, never PRESENCE. A gate may be
recorded-and-continued for a fed historical load rather than blocking it. But it is always EVALUATED and its
outcome always RECORDED. A skipped gate becomes an exception row, never a silent pass."*

## THE ASSIGNMENT — CC-1. ONE PR PER ITEM. `2026-09-24 12:00Z` FOR ALL FOUR. SURRENDER: CC-3.
**149.1 · `dispatch.load_charge_lines` must be INSERTed on a fed load.** Zero of 32 have any.
These are the REVENUE lines. With none, revenue is an unitemized lump, accessorials cannot render as their
own rows (tracking/MacroPoint, on-time pickup, on-time delivery, tarp -> **4200** and children), and load
costs has no revenue side to sit beside. The lines come from the settlement document's REVENUE block via
`feed_input.json` — **1,165 item lines are already built and each carries item | qty | uom | rate | amount,
and the builder refuses to write unless qty x rate reconstructs the amount.** Line haul is a CONTRACTED
TOTAL, not qty x rate — do not try to reconstruct it.

**149.2 · `resolveFactoringVendorId` (:2444) must run on a fed load.** 0 of 32 carry
`factoring_company_vendor_id`. Every one of the 89 is a Faro purchase.

**149.3 · `findOpenPresettlementTourForUnit` (:2590) must run on a fed load.** 0 of 32 carry
`presettlement_link_id`, which is why `driver_finance.driver_settlements` is **0**, why `isLoadTourOpen`
reads every tour as open, why nothing posts, and why the parity guard is red for **every branch in the repo**.
**The settlement document IS the tour IS the settlement** — one object, two states, `open` ->
`ready_to_close` -> `closed`. Do not build a second object. The tour-closing load (SB at Laredo) closes it
through `closeSettlementPayRun`. **NO NEW GL MATH.**

**149.4 · The 2 loads with no driver bill — `13544` and `90007`.** Both `closed`, both with a driver and an
invoice, both with **zero** expenses, zero fuel, zero driver bill. `90007` is outside the entire live range
(13508-13565): identify it against its signed settlement document before anything touches it, and if it is
not in the document, **void with a reason — never delete.** `13520` has a driver bill but zero costs; same
check. `historical-driver-bill-backfill.service.ts` already exists — use it, do not write a second one.

## THE LAW THIS ALL SERVES — `source` CONTROLS POLICY, NEVER PRESENCE
Every one of the 8 INSERTs and 14 resolvers runs on a fed load. A gate that cannot block a historical load
is **evaluated, recorded, and raised as an exception row** — never silently skipped. `appendCrudAudit` runs
on every path with the source named. **Nothing is reimplemented**; every resolver above already exists and
is called by its existing name.

## GUARD — EXTEND THE ONE THAT EXISTS, DO NOT WRITE A SECOND
`scripts/verify-one-load-create-path.mjs` already fails a file that INSERTs `mdata.loads` outside the shared
path. Extend it to assert **PRESENCE OF OUTCOME on a fed load**, derived from live data, never a literal:
every non-voided USMCA load has ≥1 `load_charge_lines` row · a non-null `factoring_company_vendor_id` ·
a non-null `presettlement_link_id` · ≥1 `driver_bills` row · ≥1 `load_stops` row · ≥1
`load_assignment_history` row. RED today at 0/32, 0/32, 0/32 and 30/32. Planted-RED, selftest, live PASS.

## DONE — RE-MEASURABLE, PASTED
Feed one historical document through the shared path and paste the live rows proving it produced: a driver
bill · **charge lines** · stops · assignment history · a resolved trailer · **a resolved factoring vendor** ·
**a pre-settlement tour link** · an audit row. Then show `assertUnitNotActiveOnAnotherLoad` (:2231) firing on
a unit already active. Then the same six counts across all live loads, each at 100%.
