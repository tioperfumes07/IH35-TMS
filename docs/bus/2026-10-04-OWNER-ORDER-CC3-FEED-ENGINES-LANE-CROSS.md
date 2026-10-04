# LANE_CROSS — CC-3 — settlement feed engines (owner standing order, 2026-10-04)

Owner to CC-3, 2026-10-04: "SO I FOLLOW YOUR RECOMMENDATIONS … ALWAYS FIX, NEVER DEFER, YOU FIX AND COMPLETE ALL YOUR WORK,
DO NOT HANDOFF … EVERY SINGLE TYPE TO THE CORRECT PLACE … LOAD … IS STAMPED CORRECTLY". Lead 2026-10-04 on the DEF dates:
"if the WRITER picked the wrong date, the writer is the fix, not the rows."

Files: scripts/feed/engines/parse_settlements.py · scripts/feed/engines/build_feed_input.py · scripts/feed/engines/README.md ·
scripts/feed/feed-settlement-day.mts · scripts/verify-feed-expense-load-by-proof.mjs ·
scripts/verify-steps/14881-verify-feed-expense-load-by-proof.mjs

Also (2026-10-04, same order): db/migrations/202615410930_fuel_provider_transaction_unique_per_product_line.sql ·
apps/backend/src/fuel/fuel-provider-reference.ts (+ test) · apps/backend/src/feed/seed-settlement-document.service.ts ·
apps/backend/src/fuel/fuel-transactions.routes.ts · apps/backend/src/driver-finance/settlement-creator.service.ts ·
scripts/verify-duplicate-expense-is-refused-or-ruled-never-silent.mjs · scripts/ops/2026-10-04-cc3-def-rows-to-signed-source.mts
scripts/verify-fuel-expense-is-unique-per-provider-transaction.mjs (AWAITING_OWNER_AUTH 1 -> 0 after AUTH-212; group per product line)
scripts/verify-driver-escrow-counter-leg-is-clearing.mjs + .baseline.json (reversed pairs excluded; ceiling 16 -> 6)
