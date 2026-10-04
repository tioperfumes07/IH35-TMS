# LANE_CROSS — CC-3 into CC-1's money lane — escrow release claim + floor (Lead, 2026-10-04)

Cited, Lead to CC-3: "YOUR CORRECTION IS ACCEPTED … APPROVED EXACTLY AS YOU SCOPED IT: refuse when deposits-minus-prior-
releases for that settlement is less than the reversal wants; no clamping, no partial posting — throw a named error;
idempotency: every release names its claim (source_type + source_id REQUIRED), and a second release of the same claim and
amount is a no-op; selftest … LANE_CROSS into CC-1's money lane: GRANTED, cite this."

Files: apps/backend/src/accounting/escrow/service.ts · apps/backend/src/accounting/escrow/__tests__/service-balance-math.test.ts ·
apps/backend/src/driver-finance/settlement-payrun-subledger-unwind.service.ts · scripts/verify-escrow-release-claim-and-floor.mjs ·
scripts/verify-steps/14613-verify-escrow-release-claim-and-floor.mjs

Not in scope: the $225 unwind of the nine release postings — its own AUTH, dry run first.
