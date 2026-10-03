
================================================================================
ROUND 165 — RECENT INVOICE SET IS CLOSED. ONE ITEM PARKED. DO NOT TOUCH IT.
================================================================================

## PARKED — LOAD 13616. OWNER VERIFIES WITH HIS ACCOUNTANT TOMORROW.
```
our DB + AlwaysTrack : load 13616 = Hawkeye Transportation Services · $5,700.00 · delivered 09-25
QuickBooks           : "100-13616" = Refrigerx Transportation LLC · $5,700.00
Faro reconciliation  : ABSENT
status               : delivered, NO INVOICE
```
Amount matches, customer does not, and there is no Hawkeye $5,700 anywhere in the QBO list.
**NO SEAT CREATES THIS INVOICE. NO SEAT GUESSES THE CUSTOMER. NO SEAT CHANGES THIS LOAD'S STATUS.**
The owner verifies it with his accountant. It stays exactly as it is until he rules.

## THE RECENT SET (delivery 2026-09-22 onward) IS OTHERWISE COMPLETE
```
delivered + invoiced (sent)   13609 $2,400.00 · 13617 $4,019.72 · 13618 $3,700.00
                              13620 $4,300.00 · 13621 $4,900.00 · 13622 $2,200.00
dispatched + pre-invoiced     all 16 (13624..13639), proforma dated to delivery
uninvoiced                    13616 only — PARKED
```

## FARO RECONCILIATION — CLOSED, VERIFIED, NEVER REOPEN
```
Faro-listed loads              102
exist in our database          102
with an issued invoice          89
soft-deleted (TRANSPORTATION)   13
LIVE BUT UNINVOICED              0
```
89 + 13 = 102. It ties. Plus the 5 Faro did NOT purchase, all present and invoiced direct:
13527 EGRO $3,000 · 13541 EGRO $2,500 · 13572 EGRO $3,200 · 13555 2EMS $3,180 ·
13540 IM Specialized $3,120 (partial, $87.40 open — a real short-pay, Cursor's
resolve-difference path, not an error).
**DO NOT RE-RECONCILE THIS. DO NOT CHASE QUICKBOOKS AGAINST IT.**

## LEAD RETRACTION — QUICKBOOKS IS NOT THE CONTROL
I chased a "$44,665 AR gap" against the QBO invoice list. That was DRIFT and I withdraw it, along
with ROUND 164 JOBS 1 and 3. The QBO export has errors the Faro reconciliation does not:
  - it contains a SECOND embedded table (columns 19-26) that is TRANSPORTATION, with load numbers
    that COLLIDE with USMCA's (13508, 13510, 13511 appear in both with different customers and
    different amounts)
  - its `Num` suffix is not reliably the load number (row `105- 13627` has LOAD 13572)
  - it carries invoices with no freight behind them
**FARO IS THE CONTROL FOR LOAD REVENUE. QuickBooks is reference only.** Any seat about to report
an AR discrepancy from the QBO file stops and reconciles against Faro instead.

## WHAT IS ACTUALLY LEFT — WORK THESE, NOTHING ELSE
CURSOR · the match engine. 911 live bank transactions, 0 matched, because the ACCEPT FLOW
         (PR 2) was never built. This is the largest open item in the system. Then Faro 09-22..09-25.
CC-1   · turn the SAMSARA FEED ON. It is off. That is why 0 stop stamps exist, which is why loads
         go stale, and it is also the mileage source. One fix, three problems.
         Then the 6 loads with 13614's copied-stop defect and the tour_id-check gap.
CC-2   · the purge (approved, scoped: 25 tables ~1,950 voided rows + the 2 verified leaf tables;
         NOT the 58-master cascade) · Faro control totals, tie 2150 and report BOTH numbers ·
         the 258-row void-header backfill (GL is clean, POST NOTHING) · the zero-line P-series.
CC-3   · nine screen items, all unblocked, all now backed by real data: settlement lines carry
         quantity/rate, all 16 loads carry unit + W/O.

