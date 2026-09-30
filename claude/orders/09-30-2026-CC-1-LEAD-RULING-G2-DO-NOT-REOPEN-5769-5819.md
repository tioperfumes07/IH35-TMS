# TO: CC-1 — LEAD RULING ON THE G2 SCOPE (AUTH-159) — 09-30-2026
# FROM: Claude Lead
# Your scope is accepted as WORK. The execution plan inside it is OVERRULED. Read why.

## FIRST — the scope itself was done right
17 of 17 reconciled to the cent against the signed documents. You read the source, not another
agent's summary. You refused to force 4 ambiguous lines into an item you were not sure of. That is
exactly the standard. Nothing below is a criticism of the work.

## THE OVERRULE — DO NOT VOID AND RECREATE. NOT ONE LINE.

I measured your 17 rows live against production myself:

```
settlement  5772 5775 5782 5783 5785 5787 5794 5797 5799 5802 5803 5805 5808 5809 5811
status      closed — every single one
lines       17 · $1,746.02 total
```

**Every one of those settlements is inside 5769–5819.** That series is CLOSED, was verified
51 of 51 against the AlwaysTrack signed `TOTAL DUE` with VARIANCE 0, and carries a standing owner
ruling in its own document: *"NEVER RE-OPEN."* The drivers were paid these amounts. The documents
are signed.

Void-and-recreate would reopen a series the owner has already closed and verified, to improve the
internal documentation of a document whose TOTAL IS CORRECT. That is not a trade this company
makes. The immutability you found is not an obstacle to route around — it is the control working.

## WHAT IS ACTUALLY WRONG, STATED PRECISELY

The settlement totals are right. The driver payments are right. What is wrong is the **GL
classification of the components**: a $531.26 truck tire, several company-vehicle fuel
reimbursements, a $22.00 parking charge and the lumper fees are all sitting in
**6890 Cost of Labor-MX** because the merged line posts to one account.

That is a **reclassification**, not a correction of the document.

## THE SANCTIONED PATH — the one you could not conclusively identify

A reclassification of a posted document in a closed period is made with an **adjusting journal
entry in the CURRENT OPEN period**, referencing each source settlement line. That is what
QuickBooks does, what NetSuite does, and what a CPA or an auditor expects to see. The closed
document stays exactly as signed; the adjusting entry carries the correction and its own audit
trail back to the source.

So AUTH-159 executes as:
1. ONE adjusting JE in the current open period, with a line per constituent charge, each carrying
   its real item and its real account, and each referencing its source `settlement_line id` +
   settlement doc_no + load number.
2. A permanent mapping record — a real row per constituent line linking `settlement_line_id` to its
   item — so the detail is auditable forever WITHOUT touching the closed document. That is how
   `item_id` gets answered here: by a record that carries it, not by rewriting a signed settlement.
3. Nothing is written to `driver_finance.settlement_lines`. Nothing is voided. Nothing reopens.

Your TB clarification is CORRECT and is the standard I want stated on every reclass from now on:
company-wide total unchanged, individual accounts move by design — 6890 down, 5100/5300/5310/5500
up. State the expected per-account movement BEFORE you run it, then paste the actual. If any
account moves that you did not predict, stop and report.

## THE FOUR UNRESOLVED LINES — my rulings, and where I will not rule

- **$18.00 and $10.00 lumper.** RULED: `Warehouse Lumper Expense` (`FREIGHT-DELI-WAREHOUSE-LUMPER-
  EXPENSE`). A lumper the DRIVER paid and we reimburse is a COST of delivering the freight. The
  `SALES-OF-SER-WAREHOUSE-LUMPER-FEE` item is for when we BILL a customer a lumper fee — a revenue
  item. These are not that. Use the freight-delivery item.
- **$24.99 headlight, $37.63 windshield.** These are truck parts bought at a truck stop and
  reimbursed to the driver. They are NOT driver pay and they must not stay in 6890. If a real parts
  or road-service reimbursement item exists, use it. If none exists, PROPOSE one with its account
  and bring it to me — do not force it into the nearest existing item.
- **$22.14 "LOVES 1ASC ''19 PREMIUM".** I will not rule on ambiguous source text. Cross-check it
  against a SECOND source before deciding: the AlwaysTrack export, and the Love's transaction of
  that date and amount in `fuel.fuel_transactions` and in `banking.*`. If two sources agree, use it.
  If they do not, it stays out of AUTH-159 and comes back to me with both readings.

AUTH-159 executes on the 22 lines that resolve cleanly. The 4 wait. $92.76 unresolved is a fine
outcome; $92.76 guessed is not.

## ONE DISCREPANCY TO CLOSE BEFORE YOU EXECUTE

Your scope says **$1,806.02** in scope. Live production says **$1,746.02** across the 17 active
lines — a **$60.00** difference. Reconcile it and tell me which number is right and why, before
anything runs. I am not assuming it is your arithmetic; it may be a row that changed under you.

## AND THE ACTUAL DELIVERABLE — the part that takes G2 off the gate forever

Reclassifying $1,746.02 fixes today. It does not stop tomorrow. The real fix is the ENGINE:
**settlement-line materialization must REQUIRE a real `item_id`** and must refuse to write a merged
generic line. Ship that in the same PR as the reclass, with a guard and a selftest. A reclass alone
leaves G2 on the close gate; the engine fix is what removes it.

REPORT BACK: the $60 reconciliation · the predicted per-account TB movement · then the JE, the
mapping rows, the actual TB delta, and the engine guard green. By job id, with pasted live rows.
