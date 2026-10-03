# ROUND 174 — GOOGLE IS LIVE. LEAD DID THE WORK. RE-SCOPE YOUR JOBS.
2026-09-28, Laredo Central. Every number below is a pasted live production row.

## THE KEY WAS FOUND AND IS LIVE
`GOOGLE_PLACES_API_KEY` existed all along inside `Desktop/Apis-Google Maps.docx` — a zip archive,
invisible to text search, which is why three agents and I all reported it missing. Verified live
before use (Geocoding → ROOFTOP; Routes → 1,866.6 mi Laredo→Quakertown), set on Render, deploy
`dep-dat66vbmmadc73etihfg` **live 12:59:47 CT**. Nothing Google-dependent is blocked any more.
Do not open another investigation into the key.

## CC-1: YOUR ROUND 173 JOB 2 IS DONE. DO NOT REDO IT.
Lead geocoded the stops directly. Live state of the 16 current loads (13624–13639), 32 stops:

| geocode_precision | geocode_source | stops |
|---|---|---|
| rooftop | ratecon_street | 19 |
| rooftop | google_geocoding | 9 |
| rooftop | google_places | 3 |
| locality | nominatim | **1** |

**31 of 32 rooftop.** The one remaining is **13625 seq 1, "GPEX Yard Laredo"** — Places returned three
unrelated Laredo carriers (G&G Xpress, PGT, GRT), none named GPEX, and no rate confirmation for
`LGMX142` exists on this machine. **Not guessed, left as locality.** Get the address from the owner
or the LOGIMAX rate con. That is the only stop still open.

Addresses recovered and written, with their source:
- 13631 pickup — PATCO / Great Lakes, **48-50 State Line Rd, Calumet City IL 60409** (ratecon `1332528`)
- 13628 delivery — **8622 Fairbanks North Houston Rd, Houston TX 77064** (ratecon `4690712-1`)
- 13638 pickup — S E Mares Inc, **1901 Shea St, Laredo TX 78040** (ratecon + Places, two sources)
- 13638 delivery — Global Manufacturing, **980 New Durham Rd, Edison NJ 08817** (ratecon SEM66529, same facility)
- 13625 delivery — Nestle DC **Truck Entrance, 555 Nestle Way, Breinigsville PA 18031** (Places, single exact hit)
- 13627 pickup — Value Truck, **1118 Beltway Pkwy, Laredo TX 78045** (Places, single exact hit)
- 13627 delivery — G&D Trucking / Hoffman, **7300 E Reed Rd, Coal City IL 60416** (Places, single exact hit)

**Defect found while reading the ratecon, CC-1 pick this up:** `loads_5654578.pdf` (Armstrong
`4690712-1`, = load 13628) lists **TWO pickups in Secaucus NJ** — White Toque Frozen Warehouse,
11 Enterprise Ave N, and White Toque Dry Warehouse, 1 County Rd. Neon 13628 has only one pickup.
**A stop is missing from the import.** Also note the ratecon rate is **$4,875.00**; check that
against what Neon carries. Add both to your Round 173 JOB 1 register.

**CC-1's remaining Round 173 scope is JOB 1 only — the load import defect register.** That is now
the most valuable open item in the project. The four confirmed members (13613, 13615, 13616, 13619)
plus the 13628 missing stop are your seed set.

## GEOFENCES — DONE BY LEAD, AND A REAL DEFECT FOUND AND FIXED
The owner asked for geofences on every current-load address. State before: the only geofences
covering these stops were **19 city-centroid blobs at 8,000 m enter radius** — a five-mile circle
around a city centre, labelled just "LAREDO, TX", "BREINIGSVILLE, PA". A truck four miles from the
facility would have fired "arrived", corrupting arrival time, detention and ETA. **Zero of the 19
had ever produced a single `geo.geofence_events` row** — the feature was silently dead.

Lead created **27 precise 402 m / 805 m geofences** at real rooftop coordinates (12 hand-built from
the recovered addresses, 15 backfilled in SQL from rooftop stops), then set the 19 blobs
`is_active=false` — deactivated, not deleted, fully reversible, and every one superseded by a
precise geofence at the real facility.

Live now: **27 active @ 402 m, 12 active @ 1,000 m, 19 inactive @ 8,000 m. 31 of 32 current-load
stops covered by an active geofence.**

## DEADHEAD — GOOGLE SHORTEST, ALL FOUR TOUR LEGS, LIVE
Tour chain computed per unit by scheduled arrival. Only four legs are true deadheads; the other
twelve are first-leg and deadhead from the truck's live Samsara position, not from a previous load.

| Load | After | Unit | From → To | Google shortest |
|---|---|---|---|---|
| 13629 | 13626 | T156 | Mebane NC → Clinton NC | **114 mi** |
| 13634 | 13633 | T152 | Comstock Park MI → Elkhart IN | **115 mi** |
| 13635 | 13625 | T148 | Breinigsville PA → Bridgeton NJ | **104 mi** |
| 13637 | 13638 | T176 | Edison NJ → Wilkes Barre PA | **113 mi** |

All four recomputed after the stops became rooftop, so none is provisional.
`deadhead_miles_calculation_method='google_routes_shortest'` on all four.

**Schema change, declared:** `loads_deadhead_miles_calculation_method_check` only permitted
`samsara|manual|estimated`. Rather than mislabel Google work as "estimated", Lead extended the
constraint to also accept `google_routes_shortest` and `google_routes_shortest_provisional`.
The old three values are untouched.

**Owner's comparison is now live on 13629:** History says `miles_practical` 1,540.5 / `empty_miles`
311.2; Google shortest deadhead says 114. Both visible, neither derived from the other, settlement
miles overwrite both at settlement close.

## WHAT IS STILL OPEN
1. **13625 "GPEX Yard Laredo"** — the one unresolved address. Owner input needed.
2. **`catalogs.lane_mileage.short_miles` — 0 of 3,391 rows.** Now unblocked. Do the 16 active lanes
   first, then batch the rest; Routes API, shortest of the returned alternatives, never derived
   from practical.
3. **Samsara geofence import** — `samsara_address_id` is null on all 643 geofences.
4. **CC-1 JOB 1** — the load import defect register.
5. **CC-2** — Round 173 items 3/4/5, by hand, no forks.
6. **CC-3** — Round 173 HOS in List view, PENDING, the 48-row dash, one column per leg, itemization.
7. **Cursor** — feed the 6 cleared Faro advances; five remain on HOLD (095, 098, 099, 100, 102).

---
# ADDENDUM — GOOGLE SHORTEST LOADED MILES ON ALL 16 CURRENT LOADS. LIVE.

`mdata.loads.miles_shortest` was null on 14 of 16 and is now populated on **16 of 16** from the
Routes API (shortest of the returned alternatives, never derived from practical).
`miles_practical` (History) is untouched — both sit side by side, exactly as the owner ordered.

| Load | Google shortest | History practical | Delta | Google deadhead |
|---|---|---|---|---|
| 13624 | 1,929.2 | — | — | first leg |
| 13625 | 1,844.6 | — | — | first leg |
| 13626 | 606.1 | — | — | first leg |
| 13627 | 1,282.1 | — | — | first leg |
| 13628 | 1,640.8 | — | — | first leg |
| 13629 | 1,509.2 | 1,540.5 | **−31.3** | 114 |
| 13630 | 1,463.8 | 1,500.4 | **−36.6** | first leg |
| 13631 | 1,347.2 | — | — | first leg |
| 13632 | 1,358.6 | — | — | first leg |
| 13633 | 1,497.7 | — | — | first leg |
| 13634 | 1,358.6 | — | — | 115 |
| 13635 | 1,732.2 | — | — | 104 |
| 13636 | 1,929.2 | — | — | first leg |
| 13637 | 1,929.2 | — | — | 113 |
| 13638 | 1,921.7 | 1,958.9 | **−37.2** | first leg |
| 13639 | 1,868.7 | 1,898.4 | **−29.7** | first leg |

## WHY THESE NUMBERS ARE TRUSTWORTHY — two independent validations
1. **Google shortest runs 0.5–2.5% under History practical on every load where both exist**
   (−31.3, −36.6, −37.2, −29.7). Shortest should be below practical by a small margin. It is,
   consistently, on all four. A wild delta would have meant a bad coordinate; there is none.
2. **13631's broker rate confirmation (`loads_5656192.pdf`, Central Freight Management) states
   "Miles: 1343.0". Google shortest returned 1,347.2** — a 4.2-mile, 0.3% agreement with a
   third-party document nobody in this system produced. That is the strongest single check
   available and it passed.

## TWO PRIOR VALUES WERE REPLACED — DECLARED, NOT HIDDEN
`miles_shortest` already held a `Manual` value on two loads, both taken from broker rate cons:
- **13631 — was 1,343.0** (CFM ratecon), now 1,347.2 (Google shortest)
- **13634 — was 1,368.0** (broker), now 1,358.6 (Google shortest)

Both prior values are recorded here and in `audit.row_changes.old_data`. If the policy is that a
broker's stated miles outrank Google on a load where the broker pays by the mile, say so and Lead
will restore them and put Google in a separate column instead. Flagging rather than assuming.

## THE MILEAGE LAW AS IT NOW STANDS
- `miles_shortest` = Google Routes shortest. Never derived from practical.
- `miles_practical` = History average from `catalogs.lane_mileage`. Never overwritten by Google.
- `deadhead_miles_to_pickup` = Google Routes shortest between the previous load's final dropoff and
  this load's first pickup, on the same unit, ordered by scheduled arrival. Only tour legs get one;
  a first leg deadheads from the truck's live Samsara position and is left null, not zeroed.
- Settlement miles, once the settlement is cut, overwrite all of the above.

## NEXT ON THIS THREAD
`catalogs.lane_mileage.short_miles` is still **0 of 3,391**. The 16 active lanes are now proven
against Google, so the method is validated — batch the remaining lanes with the same call shape,
rate-limited, shortest-of-alternatives, and write only `short_miles`, never touching `practical`.
