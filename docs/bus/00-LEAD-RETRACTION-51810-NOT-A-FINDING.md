
================================================================================
ROUND 160.1 — LEAD RETRACTION. THE $51,810 "UNBILLED REVENUE" FINDING IS WITHDRAWN IN FULL.
================================================================================
**DO NOT ACT ON ROUND 160 JOBS 1, 2 OR 3. Do not restore any load. Do not invoice anything.**
If you already started, stop and revert. Nothing in this area is yours to change.

## WHAT I GOT WRONG
The owner, immediately: "those are transportation loads, you are confused and drifting." He is
right and I am correcting on the spot.

I queried `mdata.loads WHERE operating_company_id = '<USMCA>'`, found 13 soft-deleted loads with
`completed_docs_received` and no invoice, and reported $51,810.00 of unbilled USMCA revenue.
**I treated the entity column as proof of entity ownership.** That column is the exact thing this
project has known to be contaminated — we established earlier today that 12 expenses sat in USMCA
only because a TRANSPORTATION load was fed here, and the handoff law already says pre-Faro
documents are TRANSP/QBO, not USMCA. I used the one field I had independent reason to distrust,
and I did not check the period or the entity against anything else before calling it missing money.

## WHY I COULD NOT HAVE RESOLVED IT FROM THE DATABASE — AND SHOULD HAVE SAID SO
I checked afterwards. The periods OVERLAP:
```
USMCA invoiced loads, delivery range     2026-08-05 .. 2026-09-24
USMCA factoring advances                 2026-08-10 .. 2026-09-21
the 13 soft-deleted loads, delivery      2026-08-05 .. 2026-08-23
```
There is no date boundary that separates them. The database cannot tell these apart. The owner
can, because he knows which loads TRANSPORTATION ran. That means my claim was unsupported in both
directions — I should have flagged it as a question, not reported it as a finding.

## THE SOFT-DELETE ON 09-25 WAS CORRECT REMEDIATION, NOT A MISTAKE
All 13 were created 09-24 and soft-deleted 09-25 — one bulk operation, same date as the
`ACCT-F20260925` ground-truth reset. That was a seat correctly identifying TRANSPORTATION loads
that had been fed into USMCA and removing them. **The system did the right thing. I mistook the
fix for the defect.** No money is missing. There is no $51,810.00.

## WHAT IS ALSO WITHDRAWN
`scripts/verify-no-soft-deleted-load-holds-unbilled-revenue.mjs` — DO NOT BUILD IT. As specified
it would FAIL on correct entity remediation and block exactly the cleanup that should happen. A
guard built on a wrong premise is worse than no guard.

## WHAT SURVIVES — ROUND 160 JOB 4 ONLY, AND IT IS UNAFFECTED
Cash flow must still render the load-to-cash chain in four states, per load:
```
  BOOKED     rate on the load, no invoice yet       -> expected revenue, not receivable
  INVOICED   issued invoice                         -> A/R, aged
  FACTORED   advance against the invoice            -> cash in, reserve outstanding
  COLLECTED  bank transaction matched               -> cash realised
```
Surfaces exist: accounting.cash_flow_adjustments · cash_flow_row_adjustments ·
cash_forecast_settings · finance.forecast_lines · forecast_scenarios.
The chain is still broken at COLLECTED for every load — 0 of 911 bank transactions matched
(Cursor PR 2). Cash flow built on the bank alone cannot tell a factoring advance from a customer
payment. That work stands and is still yours.

## THE STANDING LESSON, AND IT APPLIES TO EVERY SEAT
`operating_company_id` ALONE IS NOT PROOF OF ENTITY OWNERSHIP ON PRE-FARO DATA. It is the field
that has been wrong repeatedly. Before any seat reports money as missing, wrong or owed based on
entity, it states what OTHER evidence supports the entity — the signed document, the settlement
series, the bank account the cash moved through — or it asks the owner. AlwaysTrack numbering runs
continuously across entities; so, evidently, did the load feed.

