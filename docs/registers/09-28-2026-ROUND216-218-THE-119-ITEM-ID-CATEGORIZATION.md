# ROUND 216/218 — the 119 item_id NULLs, categorized (CC-1, 2026-09-28)

## DoD, exactly as specified

```
SELECT count(*) FROM driver_finance.settlement_lines sl
  JOIN driver_finance.driver_settlements ds ON ds.id=sl.settlement_id
 WHERE ds.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80'
   AND sl.item_id IS NULL AND sl.voided_at IS NULL;
```
**Before: 119. After: 17.**

Closed-settlement totals, before and after (identical — no amount, GL account, or total moved):
**gross $80,608.41 / net $75,629.80** — both before and after.

## Part 1 — 63 rows tagged from line_type alone (earnings 29 + deadhead_pay 34)

Live count at execution time was 29 earnings (not 27 — 2 more had landed since ROUND 216's snapshot,
both on OPEN settlements; tagged them too, since tagging metadata doesn't reopen or recompute a
settlement) + 34 deadhead_pay. Every already-tagged row of each line_type in this table uses exactly
one item, no exceptions: `earnings` → **Driver Pay-CDL-Loaded Miles** (`a9a03f7a-...`, 102/102 prior
rows), `deadhead_pay` → **Driver Pay-CDL-Empty Miles** (`2a1414eb-...`, 39/39 prior rows). Applied to
all 63, `quantity=1, rate_cents=round(amount*100), unit_of_measure='each'` (none of the 63 carry a
real per-mile quantity — flat historical amounts, same non-invented decomposition ROUND 198 used).

## Part 2 — the 56 extra_pay rows: real source read, not guessed

"No raw itemized payload" (ROUND 207) was correct for the *structured DB* — it was never true for
the source documents. `scripts/alwaystrack/parse_settlements.py` (already in this repo, built
2026-09-13) parses the real AlwaysTrack settlement text files. The repo's own committed ground-truth
snapshot (`data/alwaystrack/settlements-truth-2026-09-13.json`) stops at document 5803; 11 of my 32
needed documents (5805–5814) postdate it. The raw source text files for ALL of them exist locally at
`~/Downloads/_st_txt` (up to document 5816, files dated as recently as today) — re-ran the parser
against the full set: **0 tie errors** (every section ties to its document's own printed subtotal).
Committed the fresh output as `data/alwaystrack/settlements-truth-2026-09-28.json` (58 driver
documents, up from 45) since it is real, reusable ground truth beyond just this task.

Matched each of the 56 DB rows to its real composition by settlement_no + load number + exact
subset-sum on amount, against the document's own `additional_pay` and `reimbursements` arrays.
**All 56 matched** — every one is a real, exact sum of 1–5 real line items from its own source
document; none needed a guess.

### 39 rows: single real item, tagged
| Real item (source text) | Catalog item used | Rows | Total |
|---|---|---|---|
| Driver Pay-Enlonada + Desenlonada (combined) | Driver Pay-Tarp-Enlonada/Desenlonada | 21 | — |
| Driver Pay-Layover-Estancia | Driver Pay-Layover-Estancia | 7 | — |
| Driver Pay-Extra Delivery/Drop | Driver Pay-Extra Delivery/Drop | 3 | — |
| Fuel America / Thornton Fuel-Reefer Diesel (reimbursement) | Fuel-Reefer-Diesel | 2 | — |
| Blue Beacon Reefer Trailer-Washout (reimbursement) | Reefer-Trailer Washout Expense | 2 | — |
| Fuel America Washout Truck (reimbursement) | TRACTOR-Washout Expense | 1 | — |
| Pension Belen / Flying OTR-Parking (reimbursement) | OTR-Parking Expense | 1 | — |
| GDC Group Logistics Warehouse-Lumper Fee (reimbursement) | Driver Reimbursement Warehouse-Lumper Fee | 1 | — |
| Driver Pay-Bonus (60 extra miles @ $0.45) | Driver Pay-Bonus | 1 | — |

Same `quantity=1, rate_cents=round(amount*100), unit_of_measure='each'` pattern (each DB row is
itself a flat total; the real per-component breakdown lives in the source doc, not invented here).

### 2 rows: real item identified, no catalog item exists — propose to owner, not tagged
"Driver Pay-Bono por Contratacion 1/4" (a hiring/signing bonus installment — distinct from the
generic "Driver Pay-Bonus" used above, which is a mileage-based bonus) — $50 each, loads 13502
(settl 5772) and 13516 (settl 5775). No "hiring bonus" item exists in `catalogs.items`. Per the
rule ("if the catalog lacks the right item, propose it to the owner first"): recommend a new item,
e.g. **"Driver Pay-Bonus-Contratacion"**, USMCA-scoped, mirroring the existing "Driver Pay-Bonus"
item's account mapping.

### 1 row: genuinely unclear even with the real source text
`b0c47f5c-ea45-40ef-af07-13aa4128fa64` — doc 5794, load 13558, $22.14. Real source line: `"LOVES
1ASC ''19 PREMIUM"` — a LOVES truck-stop line item code with no readable description of what it
actually is (fuel additive? a specific SKU?). Not tagged, not guessed.

### 14 rows: genuinely mixed composition — reporting, not forcing one tag
Each of these is a real, exact sum of 2–5 *different kinds* of real charges bundled into one DB row.
Picking any single item would misrepresent part of the total. Listed by id, document, load, amount,
and exact real composition:

| id | doc | load | amount | real composition |
|---|---|---|---|---|
| `1860a730-0e37-4810-8ad8-62d36bb0bbd1` | 5782 | 13540 | $43.00 | Lumper + Layover-Estancia |
| `715c771f-ea27-4350-ad9d-075d9aaf43e5` | 5783 | 13537 | $125.00 | 4× Enlonada/Desenlonada (multi-stop) + Extra Delivery/Drop |
| `3e1768a7-4a26-41bd-a217-250608f5f1e6` | 5785 | 13538 | $35.00 | Extra Delivery/Drop + Lumper |
| `f6627695-1763-4e11-9d5c-7aedfab17795` | 5787 | 13549 | $97.00 | Parking + Layover-Estancia |
| `e9d75808-499a-483d-9cc7-1ddf05108952` | 5797 | 13569 | $87.63 | Enlonada/Desenlonada + windshield/headlight reimbursement |
| `d4232a21-ca8d-4b24-97a4-39ff68c8ed3b` | 5799 | 13574 | $581.26 | Enlonada/Desenlonada + Road Service-Truck Tire Expense |
| `555889f5-672d-404f-81d3-58cc68691aaa` | 5802 | 13579 | $60.00 | Generator gasoline + Enlonada/Desenlonada |
| `b585c4e6-5f6d-4386-a87e-e2ad1487de04` | 5802 | 13589 | $99.99 | Extra Delivery/Drop + Enlonada/Desenlonada + windshield/headlight |
| `cf6b46fb-5278-4fa1-b7b9-578936f93237` | 5803 | 13564 | $150.00 | Enlonada/Desenlonada + Layover-Estancia |
| `f11ccb9a-c8a4-4652-8ed8-9fce5dac6cc5` | 5803 | 13586 | $75.00 | Enlonada/Desenlonada + Layover-Estancia |
| `2f709456-c6be-4666-b549-02793f4cc19f` | 5805 | 13582 | $60.00 | Generator gasoline + Enlonada/Desenlonada |
| `aa4d640e-e556-46ca-8090-1bd501e94c0f` | 5808 | 13597 | $60.00 | Generator gasoline + Enlonada/Desenlonada |
| `359e247f-51d0-4ea9-bb1c-729e244a0272` | 5809 | 13583 | $75.00 | Extra Delivery/Drop + Layover-Estancia |
| `3f1b56c8-662e-4980-97de-1bdca67ac840` | 5811 | 13603 | $75.00 | Enlonada/Desenlonada + Layover-Estancia |

These need one of: (a) an owner ruling on which single item wins when a settlement line bundles
multiple real charges (and whether that's acceptable data-quality debt or these 14 rows should be
split into their real multiple lines — a structural change, not a tag, so not done here), or
(b) accept them as a small, permanently-named, non-defaulted exception list.

## Summary
| Bucket | Count | Action |
|---|---|---|
| earnings + deadhead_pay | 63 | Tagged |
| extra_pay — single real item | 39 | Tagged |
| extra_pay — needs new catalog item (hiring bonus) | 2 | Reported, not tagged |
| extra_pay — genuinely unclear source text | 1 | Reported, not tagged |
| extra_pay — genuinely mixed composition | 14 | Reported, not tagged |
| **Total** | **119** | **102 tagged, 17 named and reported** |

No amount, GL account, or settlement total changed anywhere. No settlement reopened. No item
invented. The 17 remaining are named individually above with their real source document, per the
owner's own rule — not defaulted, not averaged, not left silent.
