# LANES — seat ownership. Enforced by `scripts/verify-lane-ownership.mjs` in the merge gate.
Owner-ruled 2026-09-22 after CC-1 and CC-3 both wrote settlement rows 5805/5806 inside the same hour.

A seat may only change paths in its own lane plus SHARED. A PR touching another seat's lane fails
the gate. To cross a lane: post to that seat's OUTBOX, get the Lead's written ruling, and add the
ruling's filename to the PR body under `LANE-CROSS:`.

## CC-1 — schema, gates, hygiene
db/migrations/**
scripts/verify-*.mjs
scripts/verify-*.baseline.json
scripts/verify-steps/**
scripts/.guard-exempt.json
scripts/money-pr-local-gate.mjs
scripts/lib/**
apps/backend/src/identity/**
apps/backend/src/accounting/**
apps/backend/src/dispatch/**
apps/backend/src/feed/**
apps/backend/src/mdata/drivers**
apps/backend/src/mdata/loads.routes.ts
apps/backend/src/mdata/customers.routes.ts
apps/backend/src/mdata/vendors.routes.ts
apps/backend/src/cron/retry-held-expense-postings.cron.ts
apps/backend/src/governance/void-cancel-executors.ts
apps/backend/src/maintenance/service-history-backfill.routes.ts
**/*.db.test.ts
TABLES: accounting.company_settlements · driver_finance.driver_bills · mdata.drivers · identity.*
        mdata.loads

## CC-2 — money in and out
apps/backend/src/factoring/**
apps/backend/src/banking/**
apps/backend/src/accounting/invoices**
apps/backend/src/accounting/daily-close**
apps/backend/src/accounting/factor-reconciliation/**
TABLES: factor.* · banking.* · accounting.factoring_reserve_movements · accounting.invoices
        accounting.reconciliation_runs

## CC-3 — settlements and fuel
apps/backend/src/settlements/**
apps/backend/src/fuel/**
apps/backend/src/driver-finance/**
scripts/alwaystrack/**
TABLES: driver_finance.settlement_lines · driver_finance.driver_settlements
        fuel.fuel_transactions · catalogs.fuel_card_types · catalogs.relay_accounts

## CODEX — dispatch loadboard + load costs vertical, settlement linkage
apps/backend/src/dispatch/loads.routes.ts
apps/backend/src/dispatch/planner.service.ts
apps/backend/src/accounting/load-costs-board.routes.ts
apps/backend/src/expense-attribution/**
apps/backend/src/fuel/fuel-expense-document.service.ts
apps/backend/src/cash-advances/lumper-cash-advance-split.ts
apps/backend/src/driver-finance/historical-driver-bill-backfill.service.ts
apps/backend/src/driver-finance/void-open-driver-bill.service.ts
apps/backend/src/driver-finance/settlement-engine.ts
scripts/verify-load-cost-document-link-writers.mjs
scripts/verify-driver-bill-linked-at-settlement-time.mjs
scripts/verify-loadboard-hub-linkage-systemwide.mjs

## CURSOR — posting provenance, reconciliation analysis, new guards
docs/reconciliation/**
scripts/verify-diesel-expense-fuel-dedupe.mjs
scripts/verify-diesel-expense-fuel-dedupe.baseline.json
scripts/verify-one-canonical-active-load-set.mjs
scripts/verify-load-costs-board-excludes-settled.mjs
scripts/verify-every-void-route-reverses.mjs
scripts/verify-no-voided-doc-has-live-postings.mjs
scripts/verify-no-capability-regression.mjs
# LEAD RULING ROUND 82, 2026-09-22 (docs/bus/09-22-2026-LEAD-RULING-ROUND-82-CURSOR-RECONCILER-LANE-E7-CROSS.md):
# reconciler detection is Cursor's. Its repair half, table, cron and screen moved to Cursor by the ALL-13 cross
# (docs/bus/09-23-2026-LEAD-RULING-CURSOR-ALL-13-E9-RECONCILER-CROSS.md, 13d); they import these invariants.
apps/backend/src/reconciler/**
scripts/reconciler/**
scripts/verify-reconciler-exceptions.mjs
scripts/verify-reconciler-exceptions.baseline.json
scripts/verify-reconciler-route-read-only.mjs
scripts/verify-no-empty-zero-settlement.mjs
scripts/verify-no-empty-zero-settlement.baseline.json
TABLES: none. Cursor is measurement, preview and guards. Every money write goes to a Tier A seat.
        Anything outside these paths is a lane cross and needs a written ruling, same as every
        other seat.
# LEAD RULING — CURSOR SEAT AND LANE, ROUND 48, 2026-09-22: Cursor had 7 finished commits stuck at
# dd14103af9 (branch cursor/r46-items-1-10), then a further 5 at 1f61772644, unable to push because
# this file had no CURSOR section and verify-lane-ownership.mjs recognised no CURSOR seat at all --
# every push 03b-rejected regardless of lane content, real branch prefix confirmed live as `cursor/`.
# DELIBERATELY NARROW: Cursor does NOT get apps/backend/src/accounting/** -- the LANE CORRECTIONS
# section already widened that whole directory to CC-1, and CC-2 holds accounting/invoices**,
# accounting/daily-close** and accounting/factor-reconciliation/**. A wide Cursor lane would collide
# with both on day one, exactly what this file exists to prevent.

## LEAD — rulings and CI pipeline only
docs/bus/**
.github/workflows/**
claude/**                 (Lead rounds, registers and rulings -- the project-doc mirror; had no owner, so every Lead push failed this guard as UNASSIGNED, 2026-09-29)
TABLES: none. The Lead owns no module code and no tables. Anything else the Lead touches is a lane
        cross and needs a written ruling, same as every other seat.

# LANE CORRECTIONS — LEAD, 2026-09-23 (prose/history only, no lane grants of its own -- every real
# grant it describes already lives in the real "## CC-1" section above. Every line here is prefixed
# "# " on purpose: this heading is not one of the parser's 5 recognized sections, so unprefixed prose
# here used to silently fall into whatever section preceded it ("## LEAD") and, because it contains
# "/" and "*", compiled into a phantom lane grant on LEAD -- caught live by verify-lane-ownership.mjs's
# own new path-shape check, same bug class as the CURSOR-section prose bug caught the same round.
#
# **`apps/backend/src/accounting/**` widened from `accounting/company-settlements**` to the whole
# directory.** Not a new grant. Law doc §0b (owner order 2026-09-03, PERMANENT) already reads
# `CC-1 | pages/accounting/**, backend/accounting/**, dispatch/mileage/**, lane-mileage.service.ts`.
# This file, written 2026-09-22, narrowed it to one glob without saying so. The two disagreed, and
# this file is the one the merge gate enforces — so CC-1's assigned fix to
# `apps/backend/src/accounting/load-costs-board.routes.ts` would have failed `verify-lane-ownership.mjs`
# on a lane he has held since 2026-09-03. Corrected to match §0b. **§0b is the senior document; where
# this file and §0b disagree, §0b wins and this file is wrong.**
#
# **`apps/backend/src/dispatch/**` added to CC-1 — OWNER DECISION PENDING, stated plainly.** §0b
# assigns the dispatch surface to **Cursor**, who is not seated in this round. The active-load-set
# defect (see `docs/bus/09-23-2026-LEAD-RULING-LOAD-ACTIVE-SET-NO-CANONICAL-DEFINITION.md`) spans
# `accounting/` and `dispatch/` as **one fix with one canonical definition**, and splitting it across
# two seats is exactly the mechanism §0b exists to prevent ("No job is split across seats").
# Assigned to CC-1 so the work is not blocked. **Owner may move it; until he says otherwise it is
# CC-1's**, on the same basis §0b used when it moved telematics to CC-3 in 2026-09-05.
#
# **`apps/backend/src/cron/retry-held-expense-postings.cron.ts` added to CC-1 (ROUND 260 Part H,
# 2026-09-30).** `apps/backend/src/cron/**` as a directory has no seat -- verify-lane-ownership.mjs
# reports it "owned by UNASSIGNED". This one file is the cron half of a single accounting.expenses
# posting-retry defect whose service-layer half (tour-close-posting.service.ts) already lives in
# CC-1's `apps/backend/src/accounting/**` grant above; splitting the fix and its own cron trigger
# across two seats recreates exactly the "one job, two seats" problem §0b exists to prevent, same
# reasoning as the dispatch grant immediately above. Scoped to this one filename, not the whole
# cron directory. Owner may move it; until then it is CC-1's.
#
# **`apps/backend/src/governance/void-cancel-executors.ts` added to CC-1 (ROUND 270, 2026-09-30).**
# `apps/backend/src/governance/**` has no seat -- UNASSIGNED per verify-lane-ownership.mjs. Adding
# the factoring_advance case here is the direct engine-level fix for the exact
# accounting.factoring_advances void hole CC-1 root-caused and already fixed the data for
# (ACCT-F2026093002, PR #23144/#23156) -- same one-job-one-seat reasoning as the two grants
# immediately above. Scoped to this one filename. Owner may move it; until then it is CC-1's.
#
# **`apps/backend/src/mdata/customers.routes.ts` and `apps/backend/src/mdata/vendors.routes.ts`
# added to CC-1 (ROUND 294, A-21, 2026-09-30).** Both had no seat -- UNASSIGNED per
# verify-lane-ownership.mjs. A-21 shares ONE "has transactions" predicate between the Customers and
# Vendors lists -- the exact accounting-domain predicate CC-1 already derived and live-verified this
# same session (see `docs/bus/2026-09-30-CC1-A13-A14-A16-DRIVER-PROFILE-AND-HAS-TRANSACTIONS-ANALYSIS.md`
# §A-16: proforma/void semantics, invoice/bill/payment/credit-memo/expense/fuel predicates, live
# counts). Splitting the predicate's definition (CC-1's accounting lane) from its two call sites
# would recreate the exact "one job, two seats" problem §0b exists to prevent, same reasoning as the
# three grants immediately above. Scoped to these two filenames. Owner may move it; until then it is
# CC-1's.
#
# **`apps/backend/src/maintenance/service-history-backfill.routes.ts` added to CC-1 (ROUND 297.2,
# A-29, 2026-09-30).** `apps/backend/src/maintenance/**` has no seat -- UNASSIGNED per
# verify-lane-ownership.mjs. This is a brand-new file (the Lead's own A-29 order), not an existing
# file another seat already owns work in -- the new backfill route is inseparable from A-27/A-28
# (the pm_intervals catalog + pm_schedules migrations it reads/writes, both squarely CC-1's
# migrations lane) and from the guard verifying all three together. Same one-job-one-seat reasoning
# as the four grants above. Scoped to this one filename. Owner may move it; until then it is CC-1's.
#
# **`apps/backend/src/maintenance/work-orders.routes.ts` -- ONE narrow edit added to CC-1 (ROUND
# 302, A-34, 2026-09-30).** `apps/backend/src/maintenance/**` has no seat -- UNASSIGNED per
# verify-lane-ownership.mjs. CC-1's own guard (scripts/verify-transaction-linkage-law.mjs, ROUND
# 300 A-30) found and flagged the exact defect (wo_type "tire" forced to carry driver+load
# unconditionally); the Lead's ruling that resolves it
# (docs/bus/2026-09-30-LEAD-RULING-WO-TYPE-TIRE-IS-SPLIT-BY-SOURCE-TYPE.md) is inseparable from
# that same guard, which also changed in this PR to enforce the ruling permanently. Splitting the
# one-line route fix from the guard that found it and now enforces it would recreate the exact
# "one job, two seats" problem §0b exists to prevent. Scoped to this one narrow edit (the
# driver_id/load_id validation block only) in this one filename -- not a blanket grant of the file.
# Owner may move it; until then this one edit is CC-1's.

## SHARED — any seat, but say so in the PR body
docs/**
scripts/ops/**            (one-shot ops scripts, named for the round)
apps/frontend/**          (declare the screen in the PR body)
apps/backend/src/index.ts  (route registration only — declare which register*Routes call in the PR body)
.github/workflows/**      (CI is infrastructure every seat depends on — declare the job in the PR body)
feed-input/**             (parsed source-document truth data every seat reads against, not one seat's own)
scripts/feed/**           (the parsers that produce feed-input/** — same shared-reference-data rationale)
scripts/day_control.json  (verify-feed-day.mjs's CONTROL file, a mirror of scripts/feed/day_control.json above — same shared-reference-data rationale)

## FORBIDDEN TO EVERY SEAT
Any write to: payroll.* · settlement.* · accounting.qbo_* · bank.* · maint.*
              mdata.qbo_vendors · catalogs.cancellation_reasons
Any row in any TRANSPORTATION or TRUCKING operating company.
Any row with is_sample_data = true in USMCA.
Editing an already-applied migration.
