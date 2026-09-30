# G2 — 17 settlement lines, item_id NULL — SPLIT SCOPE (not executed)

CC-1, 2026-09-30, per Lead RULING 2 (ROUND 293). This is a SCOPE document only. Nothing in this PR
executes a write. AUTH-159 (opened alongside this doc) stays `status: OPEN` pending Lead review of
this scope, per the Lead's own order: "Execution after I see the scope."

## Source, read directly — never another agent's summary

Every split below is read off the actual signed driver settlement documents via
`~/Downloads/_lead_parser/parsed.json` — the already-parsed, already-tested corpus produced by
`~/Downloads/_lead_parser/parse_settlements.py` from the raw settlement text files under
`~/Downloads/IH35-MASTER-RECONCILIATION/03-SETTLEMENTS/text/`. No new parser was written; no prior
agent's summary was relied on. Each of the 17 rows below was matched by settlement doc_no + load
number against the corpus's own `driver[].loads[load].lines[]` array, which carries the real
per-line `description`, `amount`, and `category` exactly as extracted from the signed document.

## The 17 rows — all POSTED (settlement status = closed)

All 17 `driver_finance.settlement_lines` rows live under a `driver_finance.driver_settlements` row
with `status='closed'`. None are draft/open. **All 17 require void+recreate through the sanctioned
engine — none can be corrected by a simple UPDATE.** Current state: every one of the 17 posts as a
single generic line, description `"AlwaysTrack tarp/other/extra-stop load NNNN settl NNNN"`,
`line_type='extra_pay'`, `posting_account_id` = the SAME account for all 17 —
`fd3a69a2-7c71-41e4-89d8-d5f1f9e15c4b` (GL **6890 Cost of Labor-MX**).

## Per-row split, verified TO THE CENT against the source document

Every merged row's total equals the exact sum of its real constituent lines below — confirmed by
direct computation, zero rows failed to reconcile.

| settlement_line id | settl/load | merged total | constituent lines (source description → amount → item) |
|---|---|---|---|
| aa4d640e-e556-46ca-8090-1bd501e94c0f | 5808/13597 | $60.00 | Enlonada $25.00 → *Driver Pay-Tarp-Enlonada/Desenlonada*; Desenlonada $25.00 → *same*; "ROAD RANGER GAS/HONDA" $10.00 → *Driver Reimbursement-Company Vehicle Fuel* |
| 6d21e5ee-17cd-4249-916f-e8e8619a56e9 | 5775/13516 | $50.00 | "Driver Pay-Bono por Contratacion 1/4" $50.00 → *Driver Pay-Bonus* |
| a785edd9-133e-43be-8512-f49672207c44 | 5772/13502 | $50.00 | "Driver Pay-Bono por Contratatacion 1/4" $50.00 → *Driver Pay-Bonus* |
| b585c4e6-5f6d-4386-a87e-e2ad1487de04 | 5802/13589 | $99.99 | Enlonada $25.00 + Desenlonada $25.00 → *Driver Pay-Tarp-Enlonada/Desenlonada*; Extra Delivery/Drop $25.00 → *Driver Pay-Extra Delivery/Drop*; "LOVES 1ASC H1155LL HEADLIG" $24.99 → *needs a real headlight/parts item — NOT YET RESOLVED, see below* |
| 555889f5-672d-404f-81d3-58cc68691aaa | 5802/13579 | $60.00 | Enlonada $25.00 + Desenlonada $25.00 → *Driver Pay-Tarp-Enlonada/Desenlonada*; "ROAD RANGER Gasolina para Camioneta Honda" $10.00 → *Driver Reimbursement-Company Vehicle Fuel* |
| 359e247f-51d0-4ea9-bb1c-729e244a0272 | 5809/13583 | $75.00 | "Layover-Estancia 11 Y 13 DE SEPTIEMBRE" $50.00 → *Driver Pay-Layover-Estancia*; Extra Delivery/Drop $25.00 → *Driver Pay-Extra Delivery/Drop* |
| d4232a21-ca8d-4b24-97a4-39ff68c8ed3b | 5799/13574 | $581.26 | Enlonada $25.00 + Desenlonada $25.00 → *Driver Pay-Tarp-Enlonada/Desenlonada*; "LOVES Road Service-Truck Tire Expense" $531.26 → *Road Service-Truck Tire Expense* |
| 3f1b56c8-662e-4980-97de-1bdca67ac840 | 5811/13603 | $75.00 | Enlonada $25.00 + Desenlonada $25.00 → *Driver Pay-Tarp-Enlonada/Desenlonada*; "Layover-Estancia" $25.00 → *Driver Pay-Layover-Estancia* |
| 1860a730-0e37-4810-8ad8-62d36bb0bbd1 | 5782/13540 | $43.00 | "Layover-Estancia 21 de Agosto" $25.00 → *Driver Pay-Layover-Estancia*; "TYSON LUMPER VIAJE PASADO" $18.00 → *Warehouse-Lumper Fee (or Warehouse Lumper Expense — confirm which of the two lumper items is correct before execution, see below)* |
| 2f709456-c6be-4666-b549-02793f4cc19f | 5805/13582 | $60.00 | Enlonada $25.00 + Desenlonada $25.00 → *Driver Pay-Tarp-Enlonada/Desenlonada*; "LOVES GASOLINA/HONDA" $10.00 → *Driver Reimbursement-Company Vehicle Fuel* |
| 715c771f-ea27-4350-ad9d-075d9aaf43e5 | 5783/13537 | $125.00 | Enlonada (EDISON NJ) $25.00 + Desenlonada (BAYTOWN TX) $25.00 + Enlonada (BAYTOWN TX) $25.00 + Desenlonada (Houston TX) $25.00 → *Driver Pay-Tarp-Enlonada/Desenlonada* x4 (four separate tarp events on one multi-stop load — real, not a duplicate); Extra Delivery/Drop $25.00 → *Driver Pay-Extra Delivery/Drop* |
| e9d75808-499a-483d-9cc7-1ddf05108952 | 5797/13569 | $87.63 | Enlonada $25.00 + Desenlonada $25.00 → *Driver Pay-Tarp-Enlonada/Desenlonada*; "LOVES 2AS20WINDSHIELD" $37.63 → *needs a real windshield/parts item — NOT YET RESOLVED, see below* |
| f6627695-1763-4e11-9d5c-7aedfab17795 | 5787/13549 | $97.00 | "Layover-Estancia 22,23,24 De Agosto" $75.00 → *Driver Pay-Layover-Estancia*; "FLYING Bridge & Toll Expenses:OTR-Parking Expense" $22.00 → *OTR-Parking Expense* |
| b0c47f5c-ea45-40ef-af07-13aa4128fa64 | 5794/13558 | $22.14 | "LOVES 1ASC ''19 PREMIUM" $22.14 → *needs a real fuel-premium/parts item — NOT YET RESOLVED, see below* |
| f11ccb9a-c8a4-4652-8ed8-9fce5dac6cc5 | 5803/13586 | $75.00 | Enlonada $25.00 + Desenlonada $25.00 → *Driver Pay-Tarp-Enlonada/Desenlonada*; "Layover-Estancia 09 DE SEPTIEMBRE" $25.00 → *Driver Pay-Layover-Estancia* |
| cf6b46fb-5278-4fa1-b7b9-578936f93237 | 5803/13564 | $150.00 | Enlonada $25.00 + Desenlonada $25.00 → *Driver Pay-Tarp-Enlonada/Desenlonada*; "ESTANCIA 04 DE SEPTIEMBRE" $25.00 + "Layover-Estancia 12,13 Y 14 DE SEPTIEMBRE" $75.00 → *Driver Pay-Layover-Estancia* x2 |
| 3e1768a7-4a26-41bd-a217-250608f5f1e6 | 5785/13538 | $35.00 | Extra Delivery/Drop $25.00 → *Driver Pay-Extra Delivery/Drop*; "Warehouse-Lumper Fee Expense COBRO POR ENTRAR A DESCARGA" $10.00 → *Warehouse-Lumper Fee (confirm vs. Warehouse Lumper Expense, same open question as above)* |

**Reconciliation: 17 of 17 rows, sum of constituent lines = merged row total, to the cent. Zero
discrepancies.**

## Open item-mapping questions — must be resolved before AUTH-159 executes

Real catalog items already exist and are already in live use elsewhere in this exact settlement
population for: `Driver Pay-Tarp-Enlonada/Desenlonada` (8dea02de-e7ec-4e0f-b69f-abc33d459a06),
`Driver Pay-Extra Delivery/Drop` (e912b037-f013-4f0d-87da-81429f049cec), `Driver Pay-Layover-Estancia`
(b2f21729-d4f4-49c5-a51e-ee25a91eb6c5), `Driver Pay-Bonus` (95d652da-53ec-4cc0-a2a5-4d745882aa69),
`Road Service-Truck Tire Expense` (d2b34f56-92b0-44f4-92ff-b149322070a7), `OTR-Parking Expense`
(9016ddcf-e6c2-452c-a939-93f01f0efcd2), `Driver Reimbursement-Company Vehicle Fuel`
(e93a0c79-337f-4563-b0fc-d09c9b36e499). These 7 items cover 22 of the 26 constituent lines.

Four lines (4 different rows: 13589's $24.99 headlight, 13569's $37.63 windshield, 13558's $22.14
"premium" fuel-station charge, and the $18.00/$10.00 lumper pair with two candidate items) do not
have an unambiguous existing-item match yet:
- Two are fuel-station parts/repair line items (headlight, windshield) charged at a truck stop —
  likely belong under a real "Road Service" or "Driver Reimbursement" parts item, but no exact
  catalog match was confirmed live in the time available for this scope pass.
- One ("LOVES 1ASC ''19 PREMIUM") is ambiguous text from the source document itself — needs a human
  or a second source cross-check (the AlwaysTrack export, not just the settlement PDF text) to
  determine whether "PREMIUM" refers to fuel grade, an insurance-adjacent charge, or something else.
- Two lumper-fee lines have TWO candidate existing items (`Warehouse-Lumper Fee`,
  item_code `SALES-OF-SER-WAREHOUSE-LUMPER-FEE`, vs. `Warehouse Lumper Expense`, item_code
  `FREIGHT-DELI-WAREHOUSE-LUMPER-EXPENSE`) and the difference between them (a sales-side item vs. a
  freight-delivery-side item) was not resolved in this pass — needs the item catalog's own intended
  usage confirmed before picking one.

These 4 lines total $92.76 of the $1,806.02 in scope (5.1%) — small in dollars, but AUTH-159 will
refuse to execute against them until they resolve to a real item, per the "never invent a mapping"
law. Recommend either a quick Lead/owner call on the two ambiguous cases, or a follow-up read of the
raw settlement PDFs (not just the parsed text) for the two headlight/windshield lines, which may
name a vendor/part category more specifically than the parsed summary shows.

## What "TB must not move" actually means here — read carefully, this is not "nothing changes"

The 17 merged rows currently ALL post to ONE account: **6890 Cost of Labor-MX**. Their real
constituent items resolve to **at least 5 different GL accounts**: 5100 (Driver Pay/wages — the
tarp/layover/bonus/extra-delivery items), 5300 (bridge/toll/reimbursement — the parking item),
5310 (Lumper), 5450 (mechanics extra pay — n/a here, not used) / 5500 (Road Service — the tire
item), and whatever `Driver Reimbursement-Company Vehicle Fuel` resolves to (not yet confirmed
live — flagged above).

**The company-wide trial balance total (Σ all debits = Σ all credits) will NOT move** — this is a
pure reclassification of which expense account a dollar sits under, not a change to any dollar
amount, and the driver's net settlement pay is unaffected. **But individual GL account balances
WILL move**: account 6890 will decrease by the full $1,806.02 in scope, and accounts 5100/5300/5310/
5500 (and whichever account the fuel-reimbursement item resolves to) will each increase by their
own real share. This is the entire point of the fix — it is currently ALL misclassified into 6890,
and the close cannot be honest while 6890 overstates cost-of-labor by absorbing lumper, toll,
parking, and tire-repair dollars that belong elsewhere. **"Must not move" = the TOTAL. Individual
account balances moving is not a violation, it is the fix.**

## Execution mechanism (for AUTH-159, once resolved and approved — NOT run in this PR)

`retypeSettlementDeduction` (`apps/backend/src/driver-finance/retype-settlement-deduction.service.ts`)
is the closest existing precedent (void old row → create replacement with corrected classification →
`materializeSettlementLines()` re-derives a fresh line) but it explicitly REFUSES unless the parent
settlement is still `'open'` — all 17 of ours are `'closed'`. **The execution script for AUTH-159
must find and use the equivalent sanctioned mechanism for a CLOSED settlement's already-posted
line** (the same "reversal + fresh line via the real writer" shape used everywhere else this session
for a posted document — likely a settlement-specific reversal function alongside
`materializeSettlementLines`, or the general `reversePostedSourceTransactionInClientTx` /
`postSourceTransactionInClientTx` pair if settlement lines route through the same posting-engine
path as other document types). **This was not conclusively identified in the time available for
this scope pass and must be confirmed, by reading the real code, before AUTH-159 is executed** —
this is exactly the kind of "never an UPDATE to a posted row" requirement the Lead named, and it
deserves a confirmed answer, not a guess, before any write happens.

## TB capture

A trial-balance snapshot must be taken immediately before execution and compared immediately after,
using the same mechanism as this session's other snapshots (baseline reference: "2026-09-30-pre-def-fix",
93 accounts, captured 07:12:03Z — a fresh snapshot at execution time is still required since that
baseline predates other same-day changes). Compare TOTAL Dr=Cr (must be identical) and the 5-6
individual account balances named above (expected to move by the exact per-item amounts in the
table).

## Status

**SCOPED, NOT EXECUTED.** Two things must happen before AUTH-159 runs for real: (1) the 4 open
item-mapping questions above resolve to real items, (2) the exact sanctioned engine for a
closed-settlement line correction is confirmed by reading its code, not assumed. G2 stays on the
close gate until then, per the Lead's own ruling.
