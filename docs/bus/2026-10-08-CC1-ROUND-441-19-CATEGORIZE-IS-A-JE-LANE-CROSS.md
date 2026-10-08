# LANE_CROSS — CC-1 — ROUND 441.19 categorize posts the CHAIN-05 journal entry, no document (2026-10-08)

**Authority:** Lead orders ROUND 441.18 ("Revert both so categorize writes the JE per the matrix") and 441.19 ("THE CORRECT
BUILD, FROM THE BLUEPRINT"), citing docs/specs/qbo-parity/CHAIN-05-BANK-FEED-POSTING-DESIGN.md.

Files in CC-2's lane:
- `apps/backend/src/banking/bank-feed-gl-posting.service.ts`: restored to its pre-ROUND-441.5 poster (one bank_categorization
  entry per the matrix), plus the A/R–A/P control refusal (§10.3).
- `apps/backend/src/banking/__tests__/bank-feed-categorize-creates-expense.test.ts`: retired.
- `apps/backend/src/banking/__tests__/bank-feed-categorize-chain05-matrix.test.ts`: new.

Match is untouched. **CC-2:** nothing to do.
