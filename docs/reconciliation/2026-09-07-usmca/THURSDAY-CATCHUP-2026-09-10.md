# USMCA ↔ AllwaysTrack catch-up — Monday → Thursday (owner order 2026-09-10)

**Reference system = AllwaysTrack** (awtrack.com/webapp, "IH35 Transportation, LLC" header — the header name is NOT
an entity discriminator per the standing 2026-09-08 ruling "WE HAVEN'T CHANGED THE NAME IN ALWAYS"; all Faro-era
tours are USMCA). App was last reconciled ~Monday; owner wants it current to Thursday 2026-09-10.
**Nothing posted to prod — this is the measured delta + rehearsal prep.**

## A. Settlements — 4 NEW signed tours 5797–5800 (added to the rebuild CSVs; preview PASS)

| doc | driver | loads | total_due |
|---|---|---|---|
| 5797 | Fernando Mecor Hernandez | 13569, 13577 | 1,544.48 |
| 5798 | Genaro Guerrero Chavez | 13572, 13575 | 927.85 |
| 5799 | Jorge Luis Infante Corona | 13571, 13574 | 2,523.91 |
| 5800 | Vicente Santos Contreras | 13551, 13573, 13584 | 1,407.40 |

New 4-tour total **$6,403.64**. 32-tour grand = **$44,234.51** — `preview-usmca-settlement-rebuild.mjs` → PREVIEW PASS,
32 docs, 274 lines, penny-exact.

## B. Redistribution risk (measured live) — reverse scope must expand

7 newly-signed loads are already bundled in 5 existing settlements; reverse these too or they double-settle:
- **CLOSED (posted):** S-2026-0016 (13551), S-2026-0022 (13572)
- **OPEN:** S-2026-0018 (13575), S-2026-0019 (13569, 13577), S-2026-0021 (13571, 13574)

So Phase-1 reverse scope = 14 Faro-era + these 5 = ~19 settlements.

## C. Open/active loads missing from our app (app max = 13581) — seed as dispatched

Source: AllwaysTrack Open Loads board, screenshot 2026-09-10. Rate (customer charge) NOT in grid — pull per-load
from load detail / Faro A/R before seeding.

| load | driver | truck | trailer | customer | origin → dest | start | end |
|---|---|---|---|---|---|---|---|
| 13582 | Jorge Luis Infante Corona | T177 | FB-56713 53' Flatbed | Semares Forwarding Services | Laredo TX → Edison NJ | 2026-09-08 12:00 | 2026-09-11 09:00 |
| 13583 | Genaro Guerrero Chavez | T152 | 10380 53' Reefer | Hawkeye Transportation Services | Laredo TX → Stoughton MA | 2026-09-08 07:00 | 2026-09-12 06:00 |
| 13586 | Leonel Antonio Morales | T174 | FB-56704 53' Flatbed | Mode Transportation | Austinville VA → San Antonio TX | 2026-09-08 08:00 | 2026-09-10 08:00 |
| 13587 | Angel Alfonso Sosa Perez | T156 | 10222 53' Reefer | Key Global Logistics | Delphi IN → Laredo TX | 2026-09-10 08:00 | 2026-09-14 07:00 |
| 13588 | Luis Armando Sosa Perez | T170 | 10224 53' Reefer | Refrigerx Transportation LLC | Laredo TX → Quakertown PA | 2026-09-08 08:00 | 2026-09-11 08:00 |
| 13589 | Neftali Coronado Urbano | T176 | FB-56711 53' Flatbed | Kirsch Transportation Services INC | Clarks Summit PA → Houston TX | 2026-09-09 08:00 | 2026-09-14 07:00 |

Plus **13584** (on settled tour 5800 — seed so its earnings line links).
Loads 13576/13580/13581 already exist in-app; 13577/13584 are settled (5797/5800); 13585 not on the open board
(likely delivered/completed — confirm).

### C-EXEC — measured resolution 2026-09-10 eve (Cursor, live on br-fancy-credit, bypass_rls=lucia)

**13588 — DONE + LIVE** (`scripts/ops/cursor-2026-09-10-seed-13588.mts --apply`): booked id `0a20a60d-c652-433b-9cfd-4d4e017c05cc`,
`status=dispatched trip_type=NB is_sample_data=false`, driver Luis Armando Sosa `4ff53886…`, unit T170 `f4430f58…`,
customer Refrigerx **canonical `684f5776…`** (the row 11 existing loads use), pre-settlement **S-2026-0013 (open)**,
Laredo TX → Quakertown PA. Zero guessed values.

**The other 6 are entangled with the rebuild → do them INSIDE the rebuild (same loads, correct order), never race them:**

1. **Advance 4 delivered prior loads** (free the trucks; they have pickup evidence, NO delivery evidence):
   - 13574 (T177) → S-2026-0021 open · 13575 (T152) → S-2026-0018 open · 13578 (T156) → S-2026-0025 open · 13580 (T176) → S-2026-0028 open.
   - Stamp delivery evidence from the AllwaysTrack delivery date, then transition `dispatched → in_transit → delivered_pending_docs`
     via the real route (mirror `scripts/ops/deliver-seeded-usmca-loads.ts`). 13574/13575 are in the rebuild reverse scope —
     so the delivery-revrec (customer invoice + A/R) must post AFTER/with the driver-settlement reversal, not before.
   - 13580 has NO pickup evidence either → stamp both stops.
2. **Then seed the 4 truck-blocked open loads** (trucks now free; `uq_loads_one_active_unit` will accept):
   | load | driver (id) | unit | customer (canonical decision) | route | trip |
   |---|---|---|---|---|---|
   | 13582 | Jorge Luis Infante `3e138476…` | T177 `e15c43f8…` | Semares **`04b65d8b…`** (10 loads, canonical) | Laredo→Edison NJ | NB |
   | 13583 | Genaro Guerrero **(DUP driver `6edcb351…`/`6e908ee1…` — pick one)** | T152 `19d29860…` | Hawkeye **`ba40f2bf…`** (2 loads) | Laredo→Stoughton MA | NB |
   | 13587 | Angel Alfonso Sosa `fba21d80…` | T156 `a10cd288…` | Key Global **(no canonical — owner: most-recent)** | Delphi IN→Laredo TX | SB |
   | 13589 | Neftali Coronado `a32a35c8…` | T176 `f439def3…` | Kirsch **(no canonical — owner: most-recent)** | Clarks Summit PA→Houston TX | SB |
3. **13586** — CREATE driver **Leonel Antonio Morales** (POST /mdata/drivers, status Probation per active-entity law; no real
   phone on file → owner enters the real E.164, use a flagged placeholder meanwhile), customer "Mode Transportation"
   **(no canonical — owner: most-recent)**, unit T174 `8a842d23…` (free), Austinville VA→San Antonio TX. Then seed.
4. **13584** — seed as part of signed tour **5800** (rebuild owns it; earnings line must link to the tour).

All seeds at **rate $0** (owner: edit amounts later), `is_sample_data=false`, via `bookLoad` — never direct SQL, never Book-Load POST theater.

## D. Load-number-on-dispatch parity — CONFIRMED behavior

AllwaysTrack Open Loads shows one row (W/O ES6888) with status **Pending** and **NO load number** — the number is
minted only at dispatch. Our app mints at booking (`allocateNextLoadNumber`). Parity fix = defer minting to the
`dispatched` transition.

## E. Reimbursement expense categorization (owner 2026-09-10)

Driver-reimbursement lines carry an expense TYPE in the AllwaysTrack description; each must post to its own expense
GL account, not a generic "reimbursement". Distinct types seen across signed docs 5769–5800:
Reefer Fuel/Diesel · TPE-Scale · Lumper · Truck/Trailer Washout · Parking · Bridge & Toll · Fuel-DEF ·
Windshield/Glass · Truck Tire · (Road Service). — Design in progress (poster GL mapping).
