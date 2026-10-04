# LANE_CROSS — CC-3 — ACCT-F403 Relay fill door (Lead ruling Option 1, 2026-10-04)

Lead to CC-3, ACCT-F403: "RULING: OPTION 1 — Relay's charged amount is the book of truth … 1. ENGINE FIX: close the door in the
settlement feed that posts Relay fills. One door. Ship it with its own guard proving a Relay-sourced settlement line CANNOT
create a fuel posting (red before green, pasted). 2. ADD THE FLOOR … DEADLINE: 2026-10-05 18:00 UTC for item 1 + 2."

Files: db/migrations/202615410950_relay_wallet_consumed_only_by_relay_fill.sql ·
apps/backend/src/accounting/fuel-posting/maybe-post-from-fuel-transaction.service.ts (+ test) ·
apps/backend/src/accounting/fuel-posting/poster.service.ts · apps/backend/src/fuel/fuel-expense-document.service.ts (+ 2 tests) ·
apps/backend/src/driver-finance/historical-feed-day.service.ts · apps/backend/src/driver-finance/settlement-creator.service.ts ·
scripts/feed/feed-settlement-day.mts · scripts/verify-fuel-posts-only-on-bank-match.mjs
