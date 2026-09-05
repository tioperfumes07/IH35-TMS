# ORDER 2026-09-04 — CC-1 · THREE-MILE COMPARISON (TRUE COST PER MILE)

**Status:** BINDING. Owner 2026-09-04: practical vs short vs **real driven** miles — true cost per mile.  
**Prerequisite (say so, do not fake around it):** CC-3 Samsara geofence import (`docs/bus/ORDER-2026-09-04-CC-3-SAMSARA-GEOFENCE-IMPORT.md`). Without stop geofences there is no arrival/exit bracket → no odometer slice → no real driven miles.

## Priority vs settlement feed

Settlement feed (31 open pre-settlements) **remains in force** (`ORDER-2026-09-04-SETTLEMENT-ENTRY-SPLIT.md`). Sequence:

1. **ITEM ZERO** (CostOfGoodsSold picker) if not done — blocks diesel on the feed.  
2. **Schema + guards for three mileage bases** (this order) — can land while CC-3 imports geofences.  
3. Continue **settlement feed** (OPEN pre-settlements only).  
4. **Wire actual miles + CPM report** once geofences exist and loads have enter/exit events.  
5. Do **not** invent actual miles from practical/short.

## The three numbers (app only knows two today)

| Basis | Meaning | Where |
|---|---|---|
| **PRACTICAL** | PC\*MILER — billed to customer | `mdata.loads.miles_practical` |
| **SHORT** | PC\*MILER — paid to driver | `mdata.loads.miles_shortest` + `miles_deadhead` |
| **REAL DRIVEN** | Odometer | **NOT STORED ON A LOAD ANYWHERE** |

### Measured on 37 signed settlements (2026-07-24 → 2026-09-03, bypass)

| | Miles |
|---|---|
| Practical (billed) | **113,511.8** |
| Short (paid) | **113,090.3** (= 102,426.8 loaded + 10,663.5 empty) |
| Real driven | **119,042.7** (telematics odometer_mi, 14 trucks) |
| **Unbilled & unpaid but driven** | **5,952.4** (**+5.3%** over miles paid) |

Understated: T144 no telematics since 2025-07-09 → settlement 5760 miles missing.

Those miles = wrong turns, off-route fuel, shop trips, yard shuffle, inter-settlement reposition. Burn diesel. Appear on no document.

### Direct cost / CPM (period — diesel $119,550.30 + other $8,868.44 + driver $52,475.09 + add’l $1,557.00 + reimbursed $878.58 = **$183,329.41**)

| Basis | CPM | Implied margin/mi |
|---|---|---|
| Billed | **$1.6151** | $0.7081 |
| Paid | **$1.6211** | — |
| Really driven | **$1.5400** | $0.6752 |

Overstatement **$0.0329/mi ≈ $3,900** of “margin” over six weeks that is not there. Direct costs only — insurance/plates/notes are period unit costs, never on a trip.

## Build

### 1. Store real driven on load + leg

- `mdata.loads.miles_driven_actual numeric(10,1)`
- `mdata.load_stops.leg_miles_driven_actual numeric(10,1)`
- `source` + `reason` columns on both  
- Compute from telematics odometer between geofence **enter/exit** that bound the leg  
- **NULL WITH A REASON** when telematics missing — **NEVER ZERO**  
- T144 → NULL + reason `no_telematics_since_2025-07-09`

### 2. Depends on geofences

`geo.geofences` = 2 rows today. CC-3 imports hundreds from Samsara. **State the dependency in OUTBOX.** Do not approximate.

### 3. Cost-per-mile report — three bases side by side

Per load · per unit · per driver · per lane · fleet.  
**Every figure labelled with WHICH mileage it divides by.** A CPM with no stated basis is useless.

### 4. MPG the same way

AlwaysTrack MPG = **customer (practical) miles / gallons** — confirmed 30/37 (other 7 = Line Haul parse gaps, not formula). Printed weighted mean **5.420**. Real-driven basis **5.467**. Both sides have gaps (gallons only inside settlement window; one truck’s miles missing). **Show both bases, label them. Do not headline fleet MPG until fuel side is closed.**

### 5. Guards

- `verify-three-mileage-bases-stored-separately` — no basis derived from another  
- `verify-cpm-report-states-its-mileage-basis`  
- `verify-actual-miles-null-with-reason-never-zero`

## Why it matters

Every rate, lane, and truck-replacement decision runs off CPM. Today that number uses miles the trucks did not drive and flatters margin on every one.

## Report

1. Schema + guard SHAs  
2. Explicit: blocked on CC-3 geofence import until enter/exit exist  
3. CPM/MPG sample labelled by basis (or NULL+reason)  
4. Settlement-feed tally still required on its own OUTBOX lines (31 OPEN · 0 closed)

**ACK:** `CC-1 | ACK | THREE-MILE + CPM · DEPENDS CC-3 GEOFENCES · NEVER DERIVE ACTUAL | GO`
