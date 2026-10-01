# ALL SEATS — OWNER SCOPE CHANGE, EFFECTIVE IMMEDIATELY

> **SUPERSEDED 2026-10-01 by `docs/bus/2026-10-01-OWNER-LAW-MONEY-PAUSE-LIFTED-ALL-SEATS-BUILD-EVERYTHING.md`.** Owner 2026-10-01: "all coders are to build completely fully economics, financial, mechanical money, etc., full linkage etc." Every "money paused" line below is dead. Only two holds remain: no seeding, no handoffs.


Owner, verbatim, 2026-09-30:
  "No body is supposed to be working on money only creating engines and visual changes and
   upgrades. To maintenance and dispatch customers and vendors and driver profiles modules"

## THE SCOPE IS NOW EXACTLY THIS
ALLOWED: creating ENGINES, and VISUAL changes and upgrades.
ALLOWED MODULES, and only these five:
    MAINTENANCE · DISPATCH · CUSTOMERS · VENDORS · DRIVER PROFILES

## STOP WORK — every money item is PAUSED, not cancelled, not deleted
Stop where you are, commit nothing further on these, leave the findings recorded:
  Reconciliation engine and the MATCHED matching side
  A/R overstatement, payment applications, the Faro receipt chain
  A/P GL vs unpaid bills · escrow GL mirror · factoring reserve GL
  The 931 uncategorized bank transactions and type-driven GL routing
  Cash GL binding · QBO connection · bank-feed posting
  Banking module screens, including the Banking redesign boards
  Settlements, driver pay, deductions, invoices, bills, expenses posting
Nothing already merged gets reverted. Findings stay on the board. You simply stop advancing them.

## WHAT DOES NOT COUNT AS MONEY WORK, AND CONTINUES
A linkage or data-integrity fix inside Maintenance or Dispatch is NOT money work, even when the
row eventually reaches an account. Examples that CONTINUE:
  the PM cron writing against a sample truck (maintenance engine, and it is a live writer)
  wo_type "tire" routed by source_type (maintenance work-order logic)
  the fault-code alert chain, harsh events, odometer, geofences (telematics engines)
  Customers/Vendors list correctness and the master-detail views (visual)
  the driver profile module and its KPIs (visual + engine)
If an item's OUTPUT is a journal entry, a posting, a reconciliation, an invoice or a settlement
figure, it is money and it is paused. If its output is an operational fact, a screen, or an
alert, it continues.

## ONE ITEM I AM HOLDING FOR THE OWNER RATHER THAN DECIDING
The five merged-but-unapplied migrations include 202615000000, which binds the three unbound
Cash GL accounts -- that is money. I am NOT asking for the db:migrate run while money is paused,
except that 202614980000 (Tier 1 linkage constraint) is an integrity constraint on operational
linkage. Both sit in the same run. The owner decides whether that run happens now or waits.
Nobody attempts it either way.

## THE STANDARD DOES NOT CHANGE
Full linkage both directions per docs/laws/TRANSACTION-LINKAGE-LAW.md. Never guess, never defer,
never hand off, complete your own engine. Live proof, pasted. No merge SHA as proof of a screen.
