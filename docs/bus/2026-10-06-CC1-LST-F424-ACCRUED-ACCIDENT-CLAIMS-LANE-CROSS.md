# LANE_CROSS — CC-1 — LST-F424 accident company-absorb accrues the claim (2026-10-06)

**Authority:** owner, in chat to CC-1, 2026-10-06: "I FOLLOW YOUR RECOMMENDATIONS … FIX, NEVER DEFER … DO NOT HANDOFF,
FULLY BUILD". This is CC-1's recommendation (b) from OUTBOX #25597: accrue the claim at decision time, and clear it with
the payee's bill.

Files outside CC-1's lane:
- `apps/backend/src/safety/accident-liabilities.service.ts`: the absorb entry credits 2180 Accrued Accident Claims
  (role `accrued_claims_liability`) instead of a raw ap_control line (ROUND 393.1 refuses that). It is sourced to the
  liability, carries its load, and is dated on the company's business day.
- `apps/frontend/src/api/accounting.ts`, `apps/frontend/src/pages/accounting/CoaRolesPage.tsx`: the new role is
  registered (type + label).

No safety business logic changes: same decision, same driver chargeback, same void reversal.
