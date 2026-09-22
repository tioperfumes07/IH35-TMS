# LEAD RULING — 2026-09-22 — **FEED PARITY: THE VERIFIED SIDE-EFFECT LIST**
## What Book Load does that feeding does not. Read off the code, not described.

Owner: *"SO CREATE THE SAME WHEN FEEDING. I TOLD YOU TO CREATE THE PROCESSES BASED ON LIVE
VERIFIED DATA. REPO."*

Extracted from `apps/backend/src/dispatch/book-load.service.ts` at main. Every line number below
was read from the file. **A fed load today gets the `mdata.loads` row and almost nothing else.**

---

## WHAT `bookLoadInTransaction()` ACTUALLY DOES — 8 INSERTs
```
 984   driver_finance.driver_bills          <- THE OWNER'S POINT. Created ONLY here.
1070   driver_finance.driver_bills             A fed load never gets one.
2275   mdata.loads                          <- the only thing a feed creates today
2413   docs.file_links
2426   dispatch.load_charge_lines           <- the revenue lines
2481   dispatch.load_assignment_history     <- who was assigned, when
2512   dispatch.load_assignment_history
2644   mdata.load_stops                     <- the stop windows FUEL MATCHING DEPENDS ON
```

## AND 14 RESOLVERS / GATES THE FEED SKIPS ENTIRELY
```
 364, 2260  resolveLoadTrailerEquipmentIdForInsert   <- THE MISSING TRAILER
 800        resolveDriverBasePayCents                <- driver pay rate
2444        resolveFactoringVendorId                 <- FACTORING ASSIGNMENT
2590        findOpenPresettlementTourForUnit         <- THE PRE-SETTLEMENT TOUR NUMBER
2076, 2117  claimReservation / reserveNextLoadId     <- load number allocation
2231        assertUnitNotActiveOnAnotherLoad         <- *** THE DUPLICATE-TRUCK GUARD ***
1674        detectAssetCoverageGap                   <- insurance coverage
1929        assertDriverQualifiedForLoad             <- driver qualification
1851-1929   drug-test gate
1753        HOS check
1602        out-of-service check
1485        unit validity check
 605+       appendCrudAudit (12 call sites)          <- THE AUDIT TRAIL
1592, 1841  enqueueOverrideNotice
```

---

## THIS EXPLAINS FOUR THINGS THE OWNER REPORTED, WITHOUT ANY GUESSING

| what he saw | the line that explains it |
|---|---|
| **"the bills are supposed to be auto created from the driver"** | `driver_bills` INSERTs exist **only** at :984 / :1070, inside Book Load. All 5 open loads have zero. |
| **"trucks are duplicated in waiting for load"** | `assertUnitNotActiveOnAnotherLoad` (:2231) is a **Book-Load-only guard**. A feed bypasses it, so one unit can be active on two loads at once. |
| **"we are missing the trailer"** | `resolveLoadTrailerEquipmentIdForInsert` (:364, :2260) never runs on a feed. |
| **"we are missing the pre-settlement tour number"** | `findOpenPresettlementTourForUnit` (:2590) never runs on a feed. |

And the fuel gap follows from the same list: **`mdata.load_stops` is INSERTed at :2644 by Book
Load.** Fuel-to-load matching keys on the unit's **stop windows**. No stops, no window, no match —
which is exactly the `load_exemption_reason` the ingest wrote and never retried.

---

## THE RULING — **ONE SHARED CREATE PATH. THE FEED CALLS IT.**

1. **Extract everything in `bookLoadInTransaction()` after input validation into
   `createLoadWithFullSideEffects(client, input, { source })`** — the 8 INSERTs and the 14
   resolvers/gates above, in their existing order, in the same transaction.
2. **`bookLoad()` calls it. The EDI 204 handler calls it. The CSV importer calls it. Any future
   feed calls it.** One path. A feed source cannot bypass a side effect by omission, because
   there is nothing left to omit.
3. **`source` controls POLICY, never PRESENCE.** A gate may be recorded-and-continued for a fed
   historical load rather than blocking it — a load that already ran cannot fail a drug-test gate
   retroactively. **But it is always EVALUATED and its outcome always RECORDED.** A skipped gate
   becomes an **exception row**, never a silent pass. `appendCrudAudit` runs on every path with
   the source named.
4. **NOTHING IS REIMPLEMENTED.** Every resolver and gate above already exists and is called by
   its existing name. The feed path gains no logic of its own.
5. **The reconciler (ruling 03) is the safety net, not the mechanism.** This ruling makes fed
   loads correct at creation; the reconciler catches what any future path still misses. **Both,
   not either.**

## GUARD — `scripts/verify-one-load-create-path.mjs` (CC-1)
- **FAIL** any file other than the shared create path that `INSERT`s into `mdata.loads`.
  Today's offenders, verified: `integrations/edi/transactions/inbound-204.handler.ts:236`,
  `mdata/loads.routes.ts:462`, `seed/csv-seed-import.ts:942`,
  `onboarding/seed-sample-data.ts:278`.
- **FAIL** if the shared path stops calling any of the 8 INSERTs or 14 resolvers — the list above
  is the assertion, by symbol name.
- Selftest **RED before GREEN**.

## DONE — re-measurable
Feed one historical load through the shared path in a dry run and show it produces: a driver bill ·
charge lines · stops · assignment history · a resolved trailer · a resolved factoring vendor · a
pre-settlement tour link · an audit row. **Then show `assertUnitNotActiveOnAnotherLoad` firing on a
unit already active — which is the Truck Line duplicate, caught at the source.**

**Deadline 2026-09-23 06:00 UTC. Surrender seat: CC-3.**
