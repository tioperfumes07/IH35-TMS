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

## D. Load-number-on-dispatch parity — CONFIRMED behavior

AllwaysTrack Open Loads shows one row (W/O ES6888) with status **Pending** and **NO load number** — the number is
minted only at dispatch. Our app mints at booking (`allocateNextLoadNumber`). Parity fix = defer minting to the
`dispatched` transition.

## E. Reimbursement expense categorization (owner 2026-09-10)

Driver-reimbursement lines carry an expense TYPE in the AllwaysTrack description; each must post to its own expense
GL account, not a generic "reimbursement". Distinct types seen across signed docs 5769–5800:
Reefer Fuel/Diesel · TPE-Scale · Lumper · Truck/Trailer Washout · Parking · Bridge & Toll · Fuel-DEF ·
Windshield/Glass · Truck Tire · (Road Service). — Design in progress (poster GL mapping).
