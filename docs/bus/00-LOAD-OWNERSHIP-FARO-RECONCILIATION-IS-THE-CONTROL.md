
================================================================================
ROUND 161 — OWNERSHIP RESOLVED FROM THE OWNER'S OWN FARO RECONCILIATION. EXECUTE THIS.
================================================================================
CONTROL DOCUMENT: `~/Desktop/JPM_RECONCILIATION.csv` (owner-supplied, 104 Faro invoice rows).
It is the source of truth for USMCA load ownership. Not `operating_company_id`. Not the DB.

## THE OWNERSHIP TEST, FINAL
A load is USMCA's if it appears in JPM_RECONCILIATION.csv — either PURCHASED by Faro, or flagged
`NOT PURCHASED` there. A load that appears NOWHERE in that file is not ours.

## THE 5 NOT-PURCHASED LOADS — THEY ARE OURS. DO NOT TOUCH THEM.
Owner named the debtors directly; the CSV confirms each:
```
13527  EGRO TRANSPORT LLC          $3,000.00   delivery 08-17
13541  EGRO TRANSPORT LLC          $2,500.00   delivery 08-28
13572  EGRO TRANSPORT LLC          $3,200.00   delivery 09-08
13555  2 EMS                       $3,180.00   CSV row: PO "NOT PURCHASED", settlement 5787
13540  IM Specialized Logistics    $3,120.00   CSV inv #26: PO "NOT PURCHASED", settlement 5782
```
These are USMCA loads Faro declined to purchase. We invoiced the customer directly. They are
real revenue, real A/R, and they belong in cash flow as INVOICED — never factored.
Also in the CSV as NOT PURCHASED: **13515** (FLS Transportation Services Limited, inv #9,
settlement 5776) and inv #10 (Supply Chain Management, no load number). Treat 13515 the same way
if it exists in our DB.

## HARD DELETE AND BLOCK — NOT IN THE RECONCILIATION AT ALL
### Group A — the 13 soft-deleted, confirmed by the owner as TRANSPORTATION
```
13497 13502 13503 13504 13505 13506 13507 13509 13522 13530 13531 13533 13539
```
Not one appears in JPM_RECONCILIATION.csv. Already soft-deleted on 09-25 by the ground-truth
reset — that was correct remediation. **Hard delete from USMCA and block the load numbers so
they cannot be re-fed.**

### Group B — 5 more that appear nowhere in the reconciliation
```
13498  $3,800.00  Value Logistics (A1 Value)     delivery 08-05
13517  $3,800.00  Refrigerx Transportation       delivery 08-10
13525  $0.00      Refrigerx Transportation       delivery 08-10   <- ZERO RATE, invoice sent
13578  $4,650.00  Refrigerx Transportation       delivery 09-14
13595  $1,500.00  PAYPA Transport                delivery 09-11
```
**These carry SENT invoices, so do NOT delete them silently.** Verify each against the CSV once
more yourself, then report to the owner as a short list for his yes/no before deleting. If he
confirms they are TRANSPORTATION, hard delete and block with Group A. 13525 at $0.00 with a sent
invoice is a defect in its own right regardless of entity.

## LINKAGE DEFECT — MY "NOT IN FARO" TEST WAS MEASURING A BROKEN JOIN, NOT OWNERSHIP
Two loads are PURCHASED in the owner's CSV yet read as unfactored in our database:
```
13513  FLS Transport Inc.          purchase $525.00     settlement 5772   CSV inv #8
13582  S E Mares Forwarding        purchase $4,900.00   settlement 5805   CSV inv #64
```
`accounting.invoices.factoring_advance_id` is NULL on both. The advance exists, the invoice
exists, the link does not. **Backfill the factoring_advance_id on every invoice by matching the
CSV's Inv # / PO / LOAD to `accounting.factoring_advances.faro_invoice_number`.** Then re-run the
ownership test and report how many more loads change state — I expect others.
Guard: `scripts/verify-purchased-invoice-carries-factoring-advance-id.mjs` — an invoice whose load
appears as purchased in the Faro reconciliation must carry a non-null factoring_advance_id.

## DISPATCHED MUST BE EXACTLY THE 16 FROM ALWAYSTRACK
Owner: "only the loads from the picture can be in dispatched." That is **13624 .. 13639**, 16
loads. Our DB has 23. The other 7 move out through the real state machine (ROUND 157-A item 1).

## PRE-INVOICE THE 16 SO THEY RENDER IN CASH FLOW AT THE RIGHT DATES
Owner: "those 16 loads can't be in faro yet, but they should be pre-invoiced and should be
rendering in the correct cash flow dates."
Create a PROFORMA invoice per dispatched load — status `proforma`, dated to the load's scheduled
DELIVERY date, at `rate_total_cents`. Proforma is explicitly excluded from the issued-invoice test
everywhere, so this changes no A/R, no revenue, no GL. It exists so cash flow can show the money
in the BOOKED state on the date it is expected.
Cash flow renders four states per load and the dates come from the load, not from today:
```
BOOKED     proforma, dated to scheduled delivery   -> expected revenue
INVOICED   issued invoice                          -> A/R, aged
FACTORED   Faro advance against that invoice       -> cash in, reserve out
COLLECTED  bank transaction matched                -> cash realised
```
BULK LAW: all 16 proformas in ONE transaction. Report rows/second.

## PROOF
The reconciliation-vs-DB table for all 149 loads (in CSV / purchased / not purchased / absent) ·
the deletions with their block entries · the factoring_advance_id backfill count · dispatched
returning exactly 13624-13639 · the 16 proformas · cash flow showing the four states on the
correct dates.

