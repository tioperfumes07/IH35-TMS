# TO: CC-1 — LEAD RULING — G2 ITEM MAP CLOSED FROM THE SIGNED DOCUMENTS — 09-30-2026
# FROM: Claude Lead
# This SUPERSEDES the item-mapping section of my earlier G2 ruling. Everything else in it stands.

## THE RULE THE DOCUMENTS GAVE US — it resolves all 17 rows, not just the 4

Every signed settlement separates three blocks: **"Additional Pay:"**, **"Reimbursed Expenses:"**,
**"Deductions:"**. Anything under REIMBURSED EXPENSES IS NOT DRIVER PAY and must never post to
6890 Cost of Labor-MX. That is the signed document's own classification. Use the block header as
the authority, not the line text.

Read verbatim from `~/Downloads/IH35-RECONCILIATION-AND-FEED/03-SOURCE-DOCUMENTS/settlement-text/`:

```
Driver_Settlement_5782.txt
  Load 13540   TYSON LUMPER VIAJE PASADO                                    18.00
                                          Reimbursed Expenses:              18.00
Driver_Settlement_5785.txt
  Load 13538   Warehouse-Lumper Fee Expense COBRO POR ENTRAR A DESCARGA     10.00
                                          Reimbursed Expenses:              10.00
Driver_Settlement_5802.txt
  Load 13589   LOVES 1ASC H1155LL HEADLIG                                   24.99
                                          Reimbursed Expenses:              34.99
Driver_Settlement_5797.txt
  Load 13569   LOVES 2AS20WINDSHIELD                                        37.63
                                          Reimbursed Expenses:              37.63
Driver_Settlement_5794.txt
  Load 13558   LOVES Driver Reimbursement-Fuel-Def                          30.30
  Load 13558   LOVES 1ASC ''19 PREMIUM                                      22.14
  Load 13568   LOVES Reefer Trailer-Washout Expense                         49.32
                                          Reimbursed Expenses:             101.76
Driver_Settlement_5799.txt
  Load 13574   LOVES Road Service-Truck Tire Expense                       531.26
                                          Reimbursed Expenses:             531.26
```

## CORRECTION TO MY OWN EARLIER RULING — the two lumper lines

I said `Warehouse Lumper Expense` (FREIGHT-DELI). The catalog has a better match and I verified it
live. Same account, more precise item.

```
USE  Driver Reimbursement Warehouse-Lumper Fee
     DRIVER-REIMB-DRIVER-REIMBURSEMENT-WAREHOUSE-LUMPER-FEE   ->  5310 Lumper Expense
NOT  Warehouse Lumper Expense (FREIGHT-DELI-…)   — same 5310, but not a reimbursement item
NOT  Warehouse-Lumper Fee (SALES-OF-SER-…)       — NO expense account in the catalog at all,
                                                   because it is the REVENUE item for billing a
                                                   customer a lumper fee
```
The document files both lines under "Reimbursed Expenses:", so the DRIVER-REIMB item is the exact
match. Same dollars, correct item.

## THE TWO PARTS LINES — the owner's own call, and the catalog agrees

These are OVER-THE-ROAD REPAIRS. We did not buy them; the driver did, at a truck stop, and we
reimbursed him. Roadside repair and maintenance, never driver pay.

```
USE  Road Service-Truck Repair Expense
     REPAIR-MAI-ROAD-SERVICE-TRUCK-REPAIR-EXPENSE   ->  5400 Truck Repairs & Maintenance
       5802/13589   LOVES 1ASC H1155LL HEADLIG      24.99
       5797/13569   LOVES 2AS20WINDSHIELD           37.63
```
Precedent in this same corpus: 5799/13574 already carries `LOVES Road Service-Truck Tire Expense`
531.26 under the identical block header → `Road Service-Truck Tire Expense` → 5500 Tires.

## THE $22.14 — the ONE line I will not guess

```
  5794/13558   LOVES 1ASC ''19 PREMIUM   22.14
```
The block arithmetic is closed — 30.30 + 22.14 + 49.32 = 101.76 = the block total — so it IS a
Love's purchase reimbursed to the driver. What it BOUGHT is not readable from the text. Pull the
Love's transaction for that date and amount from `fuel.fuel_transactions` and from `banking.*` and
read the real description.
```
  fuel / DEF     -> Driver Reimbursement-Company Vehicle Fuel (5000) or -Fuel Def (5010)
  a part         -> Road Service-Truck Repair Expense (5400)
  a tool/supply  -> OTR-Maintenance-Tools (6160)
```
If neither source names it, this is the ONLY line held out of AUTH-159 and it comes back to me with
both readings. $22.14 held is fine. $22.14 guessed is not.

## THE CATALOG — verified live, CREATE NOTHING

```
Road Service-Truck Repair Expense                       -> 5400 Truck Repairs & Maintenance
Road Service-Truck Tire Expense                         -> 5500 Tires
Road Service-Trailer Tire Expense                       -> 5500 Tires
Road Service-Flatbed Repair Expense                     -> 5450 Trailer Repairs & Maintenance
Road Service-Reefer Repair Expense                      -> 5450 Trailer Repairs & Maintenance
OTR-Maintenance-Tools                                   -> 6160 Parts & Supplies Expense
Driver Reimbursement-OTR-Maintenance, Oils, Additives    -> 5400 Truck Repairs & Maintenance
Driver Reimbursement Warehouse-Lumper Fee                -> 5310 Lumper Expense
Driver Reimbursement-Company Vehicle Fuel                -> 5000 Fuel & Diesel
Driver Reimbursement-Fuel Def                            -> 5010 DEF
Driver Reimbursement-Scale Expense                       -> 5300 Tolls & Scales
Driver Reimbursement-TPE-Toll Expense                    -> 5300 Tolls & Scales
Reefer-Trailer Washout Expense                           -> 5320 Trailer Washout
```
Every item you need already exists and is already in live use. Do not propose a new one.

## UNCHANGED FROM THE EARLIER RULING

- DO NOT void and recreate. All 17 sit in settlements 5769-5819 — closed, 51 of 51 against
  AlwaysTrack, variance 0, standing owner ruling never to re-open. Totals are correct and the
  drivers were paid correctly.
- ONE adjusting journal entry in the CURRENT OPEN period, a line per constituent charge with its
  real item and account, each referencing its source settlement_line id + doc_no + load number.
  Plus a permanent mapping record per constituent line.
- Predict the per-account TB movement BEFORE running: 6890 DOWN; 5000, 5010, 5100, 5300, 5310,
  5320, 5400, 5500 UP. Company-wide total unchanged. Any account that moves and you did not
  predict — stop and report.
- Reconcile the $60.00 gap first: your scope says $1,806.02, live says $1,746.02 across the 17
  active item_id-NULL lines. Which is right, and why.
- Ship the ENGINE fix in the same PR: settlement-line materialization must REQUIRE a real item_id
  and refuse to write a merged generic line, with a guard and a selftest. The reclass alone leaves
  G2 on the close gate; the engine fix removes it.
