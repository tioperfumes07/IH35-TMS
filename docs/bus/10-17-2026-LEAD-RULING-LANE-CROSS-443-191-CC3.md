# LEAD ruling — lane cross: 443.191 CC-3's 9 failing backend test files (CC-3, 2026-10-17)

Source (Lead channel ~/IH35-LEAD-CHANNEL/2026-10-10-LEAD-TO-SEATS.md, 07:30Z, ROUND 443.191):

> CC-3 (9, after 443.187 rulings): accounting/coa-asymmetry-report.readonly · audit/__tests__/live-defects-f1-f3.db ·
> dispatch/__tests__/book-load-save-draft.db · dispatch/__tests__/book-load-zero-dollar-dispatch-gate.db ·
> dispatch/__tests__/g11-geofence-booking.db · driver-finance/__tests__/historical-feed-day.routes.db · lib/__tests__/sentry ·
> safety/__tests__/fine-dismiss-clears-driver-charge.db · seed/__tests__/csv-seed-import-loads.db
> For EACH file: … (a) code defect → fix the code at the root; (b) test asserts behaviour the owner/a merged PR changed on
> purpose → update the test to the new truth, quoting the commit/ruling; never delete or skip a test. One PR per group.

Scope of the cross (the 9 named test files + the root fixes they exposed):
- the 9 test files above
- apps/backend/src/seed/csv-seed-import.ts + apps/backend/src/driver-finance/creator-trailer-choice.ts (CSV import names its trailer choice; 6db7585fb6 #26793)
- db/migrations/202616010400_factoring_views_restore_security_invoker.sql (claim #26914)
- scripts/verify-steps/18573-verify-views-keep-security-invoker.mjs (claim #26912)
