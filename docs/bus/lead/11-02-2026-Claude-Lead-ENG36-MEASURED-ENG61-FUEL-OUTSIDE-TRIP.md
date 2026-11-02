# ENG-36 measured per document + new ENG-61 (fuel attached outside the load's trip)
Claude Lead · 11-02-2026 4:35 PM CT (22:35Z) · prod tiny-field-89581227 read-only · USMCA 5c854333-6ea5-4faa-af31-67cb272fef80

## ENG-36 — 21 of 87 company settlements negative (guard 18841 query, re-run live = ceiling 21)
Compared each one with its SIGNED company settlement (data/alwaystrack/settlements-truth-2026-09-13.json, entity IH35 Transportation, LLC):

| doc | signed rev | measured rev | signed fuel | measured fuel | signed net |
|---|---|---|---|---|---|
| 5769 | 6,300.00 | 2,500.00 | 1,278.22 | 2,152.13 | 3,798.42 |
| 5771 | 7,900.00 | 3,000.00 | 3,171.66 | 4,348.07 | 2,666.90 |
| 5772 | 7,225.00 | 2,225.00 | 3,979.40 | 4,033.54 | 1,674.11 |
| 5773 | 10,800.00 | 3,600.00 | 3,805.85 | 4,600.88 | 4,899.69 |
| 5774 | 7,800.00 | 4,000.00 | 2,519.78 | 4,593.42 | 2,971.91 |
| 5775 | 7,300.00 | 3,400.00 | 3,207.40 | 3,344.34 | 2,605.76 |
| 5776 | 7,025.00 | 3,125.00 | 4,224.49 | 3,403.82 | 1,347.86 |
| 5778 | 3,800.00 | 3,800.00 | 3,557.34 | 4,638.23 | **−1,331.16** |
| 5779 | 6,500.00 | 3,500.00 | 3,299.57 | 3,670.84 | 1,637.01 |
| 5780 | 2,500.00 | 0.00 | 843.76 | 2,914.18 | 1,135.53 |
| 5785 | 7,600.00 | 3,300.00 | 4,570.14 | 4,134.02 | 1,360.59 |
| 5786 | 5,750.00 | 2,300.00 | 2,418.24 | 2,652.33 | 2,201.32 |
| 5788 | 8,960.00 | 4,100.00 | 4,671.26 | 3,713.87 | 2,291.14 |
| 5793 | 5,100.00 | 5,100.00 | 3,942.23 | 5,087.46 | **−522.07** |
| 5796 | 2,500.00 | 0.00 | 807.03 | 1,840.93 | 1,268.19 |
| 5798 | 5,400.00 | 2,200.00 | 1,990.98 | 1,974.72 | 2,369.81 |
| 5800 | 6,300.00 | 6,300.00 | 3,383.86 | 3,895.16 | 881.59 |
| 5824 / 5829 / 5846 / 5847 | — no signed document in the 09-13 truth file — | | | | |

Causes:
1. **Revenue:** the signed documents are IH35 Transportation settlements covering Transportation loads; by owner ruling 443.167-R2 (10-16) those loads carry $0 revenue in USMCA, while their full fuel stays in USMCA → that diesel is ENG-25b (8000 Inter-company, AUTH pending).
2. **Fuel attached to the wrong load (ENG-61 below)** — measured fuel differs from the signed fuel in BOTH directions (5780 +2,070.42; 5776 −820.67).
3. Truly negative on the signed document: **2** (5778, 5793) — real economics, not a defect.
4. 4 settlements need their signed document read (5824, 5829, 5846, 5847).

## ENG-61 — NEW: fuel rows attached to a load outside that load's trip window
Query (load window = first stop − 1 day … last stop + 1 day, fill date in America/Chicago):
- fuel rows on USMCA loads: **856**; outside the window: **116 ($40,499.46)** on **42 loads**; source import 41, manual 75; up to **19 days** off.
- Example: load 13530 (settlement 5780, trip 08-18 → 08-21, T148) carries 8 rows ($2,914.18); the signed settlement lists ONE fill on 13530: 08-19 LOVES inv 99525016 153.16 gal $843.76. Rows dated 08-03 (2) and 08-12 (4) are other trips' fills.
Writers that set fuel.load_id: fuel/fill-truck-and-load.service.ts, fuel/fuel-load-at-time.ts, fuel/dreamline-statement-import.service.ts, fuel/fuel-transaction-import.ts, driver-finance/settlement-creator.service.ts, integrations/relay-payments/relay-fuel-load-rematch.service.ts.
Owner: **CC-3** (LANES: settlements and fuel).
