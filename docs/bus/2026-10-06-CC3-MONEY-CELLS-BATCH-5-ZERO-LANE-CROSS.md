# LANE_CROSS — CC-3 — money cells batch 5: unwired 23 → 0 (2026-10-06)

**Authority:** Lead ROUND 433-CC3 item 2, plus the owner's "permanent fix so it does not occur anymore" (#25596 MoneyCell engine).

**Result:** every money cell in the app now opens its record or its exact list, or is a `MoneyCell { none }` whose reason shows on hover and is listed by the guard on every run. **Unwired 0, declared 33.** The combined ceiling went from 43 to 33, and both ceilings only shrink, so any new hand-written money cell fails the gate.

**Wired:**
- Reclassify tree balance → that account's register through the period end;
- equipment-loan principal → the loan itself (backend `drill_to` now carries `?loan_id=`, which FactoringHome reads);
- factoring reserve → /factoring/reserve, outstanding liability → /factoring/account-summary;
- driver-escrow KPI → the escrow board, whose total ties;
- driver hub "due" → the driver;
- management package: vendor open totals → open bills; P&L section total → ledger target.

**Declared with reasons:**
- customer profile: uninvoiced loads, exposure, credit limit, purchased gross;
- the service catalog's typical cost;
- Settlement Creator previews;
- customer/vendor sidebar "Cleared" (open + uncleared);
- management revenue per customer;
- Reclassify running balance and batch amount.

**Guard precision:**
- it credits a react-router `<Link to>` or a `<MoneyCell>` inside a cell;
- an empty spacer cell lost its money classes;
- selftest 18/18.

**Owners of these screens:** nothing to do. This note is the record of the crossing.
