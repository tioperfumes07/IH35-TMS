# ROUND 8.9b — MAIN CHAIN RED REGISTER — ALL CODERS

Posted 2026-11-09 11:59 PM CT (2026-11-10 05:59Z) by Claude-Lead. Measured on origin/main `9235b87`.

## What was measured
- build-typecheck-heavy runs `npm run verify:pre-commit` (4,605 steps) and stops at the first failure. Tonight it stopped at steps 250 (10520) and 312 (EDI fixture). Every step after those was never seen.
- Lead ran the static arm of every step locally (6,833 commands, no DB).
  - 205 need a DB and pass or fail only in CI.
  - 8 timed out under parallel load. All but no-dead-schema pass serially.
  - 5 are INV fail-closed checks that need the DB.
  - **55 guards FAIL on main.** They are listed below.

## Ownership (fix in progress now; deadline 2026-11-10 12:00Z)
| Lane | Owner | Guards |
|---|---|---|
| A money / bank / fuel / settlement | Claude-Lead builder A (Opus) | bank-undo-releases-every-match-column, bills-void-filter-uses-revoked-at, fuel-posts-only-on-bank-match, no-swallowed-db-error-in-transaction (122→125), sweep-c6-money-insert-requires-je-poster, settlement-creator-atomic-post, settlement-creator-salaried-stray-bill-void, driver-pay-rounding-one-rule, driver-default-expense-account-wired, item-income-account-required, fuel-gl-map-codes-no-silent-alias, fuel-g18-load-link-rematch, wex-import-idempotent-and-adoptable, relay-fill-recorded-at-receipt, relay-driver-links-wired, cash-advances-f9930-no-silent-catch, owner-lock-override-propagates, live-document-predicates-single-source (26 new), odometer-ledger-has-one-writer, ops/c51-banking-home-escrow |
| B entity scope / RLS / dispatch / schema | Claude-Lead builder B (Opus) | join-entity-scoped (14 NEW unscoped JOINs), no-session-scoped-rls-bypass, active-entity-hardline, regclass-fallback-intent, dispatch-reads-live-loads-view, one-canonical-active-load-set, load-costs-board-excludes-settled, rolling-ledger-queries-parallel, stop-dwell-boundary, bus-diet-outbox-cap, no-dead-schema, load-mutations-invalidate-load-views, fe-load-labels-and-status-sets |
| C frontend UI | Claude-Lead builder C (Sonnet) | ops/c20, ops/c57 (Driver Profile KPI band, #28769), ops/c21 + fleet-unit-maintenance-create-work-order-drill, ops/factoring-r315-payments-tabs, ops/maint-filelinks-engine-widget, accounts-payable-aging-page-uses-paritytable, insurance-policy-wizard-complete-fleet-picker, lst-picker01 ×3, money-cells-click-through, no-partial-optional-chain, no-uuid-label-rendering, popups-one-format, record-naming-cells-are-click-through, reports-home-no-box-in-box, required-surface-inventory-complete, rows-53-28, surface-bar-modal-inventory, test-provider-completeness, void-bypass-reason-is-catalog-button |

## Rule for every seat, effective now
1. Do not touch the files these guards read until the guard is green. If you must, run that guard locally first.
2. Before any fast-merge, run every guard that greps the files you changed:
   `for g in $(grep -l <your-file> scripts/verify-*.mjs scripts/ops/verify-*.mjs); do node $g && node $g --selftest; done`
   ROUND 8.9a's three checks still apply as well.
3. Never raise a baseline or allowlist to pass. Fix the code, or fix a stale guard so it still catches its plant.
4. Tonight's breakages and their fixes, for reference:
   - #28764 → #28766
   - #28765 → #28768, #28771
   - #28769 → #28771
   - #28767 → #28773, #28774
   - #28591 → #28775
