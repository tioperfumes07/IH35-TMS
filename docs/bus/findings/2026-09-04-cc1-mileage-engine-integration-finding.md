# FINDING (not built, owner rules) — hand-typed mileage is below the McLeod/Alvys bar

**Filed:** CC-1, 2026-09-04, per owner order (MILES-SHORTEST-HOLDS-ALWAYSTRACK-BLEND addendum: "NEW, file it, do not build without the owner's word").

## What's true today

Both mileage-driving writers are hand-entry surfaces, confirmed live this session:
- `update-load.service.ts` — Edit Load PATCH, the only writer of `miles_shortest`/`miles_practical`/`miles_deadhead` on the generic edit path.
- `book-load.service.ts` — Book Load create, same three columns.

No mileage engine is called anywhere in either path. `mdata.loads.mileage_source` is `NULL` on every load that carries hand-typed miles because there is no engine to stamp a source — the operator types a number they read off an external report (an AlwaysTrack export, in the cases seen this session), and nothing in the system verifies it against a routed distance.

`catalogs.lane_mileage` (the History autofill catalog) is itself seeded from that same historical hand-entered/AlwaysTrack data — it is a cache of past manual entries, not an independent routing source. Autofilling `miles_practical` from it (the one thing the wizard does autofill) is filling a number FROM history, not FROM a route calculation.

`chain-deadhead.service.ts` (GO-23) does compute a real distance — `haversineMiles` point-to-point from the truck's actual last delivery to the new pickup — but that is straight-line great-circle distance, not a road-network route. It is the correct *property* (trip-based, not lane-based) but not McLeod/Alvys-grade routing precision.

## What McLeod/Alvys do

Both platforms derive practical and shortest mileage from a live mileage engine (PC*Miler is the industry-standard one both integrate) at the point of entry, and stamp the record with which engine/version produced the number. The operator does not type a raw mileage figure by hand as the system of record — they confirm or override an engine-computed value, and an override is itself recorded as such.

## What an integration would take (rough shape, not a commitment)

1. **A routing provider.** PC*Miler is the incumbent (McLeod/Alvys both use it) but is a paid, licensed API — not free, not instant to provision. `apps/backend/src/dispatch/mileage/osrm.provider.ts` already exists in this repo (self-hosted OSRM, open-source road routing) as a cheaper/faster-to-stand-up alternative; it is not currently wired into the load-mileage write path at all (confirmed: `grep -rn "osrm" apps/backend/src/dispatch/*.ts` outside the provider file itself returns nothing in `book-load.service.ts`/`update-load.service.ts`).
2. **Two distinct calls per lane**, matching the law's own three-number model: a practical/HOS-legal route call and a shortest-route call, since the law forbids deriving one from the other (folding the OSM/OSRM approximation into a single "one true mileage" number would repeat exactly the AlwaysTrack-blend mistake this session's fix corrected).
3. **A `mileage_source` stamp that is honest about precision** — e.g. `"OSRM (approximate)"` vs `"PC*Miler"` vs `"Operator entered"` — so a report can distinguish engine-computed miles from a hand-typed number, matching the law's existing `mileage_source` field (already present on `mdata.loads`, already NOT NULL-enforceable going forward per this session's other directive item).
4. **An operator-override path**, not a hard-lock — the law is explicit that autofill must never block booking and the operator must always be able to type over a fill.
5. **Cost/accuracy tradeoff is the owner's call.** OSRM is free and already partially built but is a routing approximation (no live traffic, toll-avoidance, or truck-specific restrictions unless configured); PC*Miler is the real industry bar but is a recurring paid integration. A middle path — wire the existing unused OSRM provider into `book-load.service.ts`/`update-load.service.ts` as a *suggested* fill (same non-blocking autofill pattern as `catalogs.lane_mileage` today) — is buildable without new spend, but does not reach true McLeod/Alvys parity.

## Not filed as a defect

This is a capability gap named at the owner's request, not a bug — the current hand-entry system works and is honestly labeled (`mileage_source` is null exactly where it should be: nobody has ever computed these miles). Owner rules on whether/which tier of engine integration is worth building.
