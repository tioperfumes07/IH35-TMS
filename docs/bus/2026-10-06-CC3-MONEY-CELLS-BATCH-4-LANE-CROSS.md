# LANE_CROSS — CC-3 — money cells onto MoneyCell, batch 4: unwired 43 → 23 (2026-10-06)

**Authority:** Lead ROUND 433-CC3 item 2, plus the owner's "permanent fix to the engine" (#25596 MoneyCell).

**Wired, each to its one record:**
- escrow held per driver → that driver's escrow record;
- bank tiles → the bank account;
- the needs-categorizing line → its bank transaction;
- pending-approval Dr/Cr → the journal entry;
- the wizard reclassify line → its document.

**Declared with a reason, shown on hover and listed on every guard run:**
- footer sums of tables whose rows already open their records: driver overview settlements, additional pay and complaints; escrow footers;
- the cash-flow section total (allocated cash; the lines open their accounts);
- statement opening / running / closing balances;
- escrow targets, which are driver settings;
- KPI breakdown buckets and their total (the drill's own rows below are the transactions);
- virtual bank tiles, which open their own screen from View.

**Guard:**
- unwired 43 → 23;
- declared 3 → 20;
- combined 46 → 43. The combined ceiling only shrinks, so relabelling cannot replace wiring.

**Tests:** ManualJEModal / RecordTransferModal / TransferModal fail identically on origin/main (5 tests).

**Owners of these screens:** nothing to do. This note is the record of the crossing.
