# Runner-Exposed Reds — Pre-Enumeration (2026-07-18)

> **Step 2a deliverable** for `docs/specs/MERGE-TREADMILL-FIX-INSTRUCTIONS-CURSOR-2026-07-18.md`.
> Draws the map BEFORE the keystone runner fix so step 2 is a known quantity, not a scramble.
> Evidence: static classification of `scripts/verify-steps/*` + `npm run verify:static` (dead-port
> DB sentinel — **prod-safe, never touched prod**), run this session on branch
> `docs/merge-treadmill-plan-2026-07-18`. Method caveats at the bottom.

## Headline: the feared "wave" is essentially empty. The real problem is elsewhere.
- **Fail-open surface = exactly 26 of 192 verify-steps** (return-based; the runner swallows their
  failure). This is the COMPLETE universe step 2 can newly enforce — nothing outside it can turn red.
- **Currently red among those 26, in a CI-equivalent clean checkout: ~0.** 25/26 pass clean; the lone
  static red (`xlsx-cve-closeout`) is a **local-only artifact** (see below), not a CI defect.
- **None of the 26 are DB-dependent** (none appear in SKIP-needs-db) → high confidence the wave is ~0.
- **So step 2 (fixing the runner) will likely expose 0–1 reds, not dozens.** The risk was theoretical.
- **The actual fake-green mass is a SEPARATE bucket: 32 UNWIRED failing guards** (§B) — guards that fail
  and that **nothing in CI runs at all.** That is the bigger "make CI honest" finding.

---

## §A — The 26 fail-open steps (step 2's entire scope)
Runner swallows a `return N`; step 2 makes these honest. Static status from `verify:static`:

| Step | Underlying guard | Static status |
|---|---|---|
| 144-verify-xlsx-cve-closeout | verify-xlsx-cve-closeout | **RED — local-only (see note)** ; also has a *double* bug: discards its 1st `ctx.run` status too |
| 142-verify-sql-column-existence | verify-sql-column-existence | PASS |
| 143-verify-no-guard-hotfile-thrash | verify-no-guard-hotfile-thrash | PASS |
| 142-verify-banking-bankaccountdetail-is-credit-amounts | " | PASS |
| 142-verify-driver-border-credentials-edit | " | PASS |
| 142-verify-entity-badge-single-source | " | PASS |
| 142-verify-h02-qbo-topbar-sync-now | " | PASS |
| 142-verify-user-detail-activity-tab | " | PASS |
| 136-verify-relay-status-not-hardcoded | " | PASS |
| 140-verify-inventory-reorder-threshold-ui | " | PASS |
| 39-verify-drivers-count-nav-integrity | " | PASS |
| 45-verify-dispatch-arch-tab-parity | " | PASS |
| 45-verify-drivers-profile-action-bar | " | PASS |
| 45a-verify-driver-suspend-atomic | " | PASS |
| 46-verify-drivers-create-vocab | " | PASS |
| 47-verify-book-load-accessorial | " | PASS |
| 47-verify-dvir-schema-presence | " | PASS |
| 48-verify-maint-create-vocab | " | PASS |
| 48-verify-safety-meetings-training-wire | " | PASS |
| 49-verify-drivers-earnings-debt-tab | " | PASS |
| 49-verify-safety-hos-dashboard-wire | " | PASS |
| 49-verify-trailer-wo-equipment-id | " | PASS |
| 50-verify-dispatch-late-arrivals-alerts | " | PASS |
| 51-verify-safety-incidents-cluster-wire | " | PASS |
| 901-verify-home-quickjump-counts | " | PASS |
| 01-ensure-database-url | (infra step, not a guard) | n/a |

**xlsx-cve-closeout note:** run bare it `walk()`s the tree and **OOMs (4 GB heap)** because it recurses
into `.claude/worktrees/` (~125 local repo copies). That directory does not exist in CI, so **it passes
in a clean checkout.** Minor guard hardening: skip `.claude` in the walk (defensive). NOT a CI red.

---

## §B — 32 UNWIRED failing guards (the bigger fake-green vector — SEPARATE from step 2)
`verify:static` ran these, got a real (non-DB) failure, and classifies them **not wired into CI's
executed set**. Guards that detect real problems that nothing runs. **Triage each: (1) is it actually
unwired? (2) real invariant failing → investigate + wire, or aspirational guard for an unbuilt feature
→ archive/defer?** Several are financial → owner-gated. NOT part of step 2; needs its own lane.

**Likely-real invariants (investigate first; ★=financial → owner-gated):**
- ★ verify-coa-canonical · ★ verify-inv2-no-hard-delete-accounting (void-never-delete, §2) ·
  ★ verify-p0-settlement-schema-grants · ★ verify-recurring-bills · ★ verify-pre-settlements ·
  verify-migration-schema-grants · verify-samsara-hos-pull-real-clocks (savepoint isolation) ·
  verify-hos-tracker-endpoints · verify-ifta-tax-rates-current (missing Q3-2026 rates) ·
  verify-book-load-modal-x-dismissible · verify-dispatch-eta-columns (missing CI step)

**Likely aspirational / unbuilt-feature guards (archive or defer, don't chase as defects):**
- verify-cap-11-fuel-fraud · verify-cap-12-tire-tread · verify-cap-13-brake-wear · verify-edi-foundation ·
  verify-form-425c-exhibits · verify-photo-comparison-ai · verify-geofence-state-machine ·
  verify-exif-chain-preservation · verify-layover-detection · verify-late-arrival-analytics ·
  verify-load-cancellations-report · verify-reports-hub-9-categories · verify-drug-alcohol-program ·
  verify-dvir-severity-tagging · verify-damage-insurance-continuity · verify-insurance-module ·
  verify-driver-pwa-dispatch-view · verify-pre-dispatch-validation · verify-active-driver-set ·
  verify-i18n-coverage · verify-reference-before-introduction

(Bucket split is a first-pass guess from the failure text — confirm per guard.)

---

## §C — Could NOT be judged statically (need a real DB → run at step 2 under verify:local-ci)
- **SKIP-needs-db (21):** a17-deprecation-comments, bank-feed-live-tieout, coa-roles, content-drift-check,
  csa-score-pull-recency, db-reset, entity-isolation, equipment-types-no-collision,
  fmcsa-safer-customer-coverage, launch-toggle-audit-trail, m1-positioned-parts,
  m2-integrity-position-history, migration-application-consistency, no-cross-carrier-data-leak,
  no-orphan-migration-ledger-entries, no-test-seed-in-prod-listings, pre-commit, rls-operating-company-scope,
  sql-read-targets, sql-write-targets, usmca-seed-completeness. **None of these are in the fail-open 26**,
  so they don't widen step 2's wave — but their true pass/fail needs the CI DB.
- **SKIP-needs-env (2):** event-log-spine (missing `@supabase/supabase-js`), users-add-user-submits (timeout).

---

## Method & caveats (§0 honesty)
- `verify:static` points DB env at a dead-port sentinel (`scripts/verify-static.mjs`) → **prod-safe.**
- It runs each `scripts/verify-*.mjs` standalone; a standalone guard sets its own exit code, so PASS/FAIL
  here = the guard's TRUE verdict = what an honest runner WOULD surface. Faithful proxy for the 26.
- **Not definitive for DB/dist-dependent behavior:** the 26 are all static (grep) guards (none in
  SKIP-needs-db), so confidence is high — but the **definitive** wave check is to run the honest-runner
  harness under `verify:local-ci` (ephemeral Postgres + built dist) as the FIRST action of step 2, and
  confirm the exposed reds match this list (expected: ~0 from §A).
- Run on branch base `6c2c3a7` (local, behind `origin/main`); re-run `verify:static` on latest `main`
  at step-2 time to refresh.

## Bottom line for step 2
Fixing the runner is **safe** — it will not red the board. Budget the real "honest CI" effort for §B
(32 dark guards), which is a separate, owner-partitioned triage lane, not the runner fix.
