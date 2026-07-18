# Runner-Exposed Reds — Pre-Enumeration (2026-07-18, CORRECTED v2)

> **Step 2a deliverable** for `MERGE-TREADMILL-FIX-INSTRUCTIONS-CURSOR-2026-07-18.md`.
> **v2 corrects v1 after Cursor's review** (v1 overclaimed — see "Corrections" below).
> Re-run this session on **current `origin/main` `1eda1c4d1`** in a **genuinely clean `git archive`
> checkout** (no `.claude/worktrees`). `verify:static` uses a dead-port DB sentinel → **prod-safe.**

## Corrections applied from Cursor's review (owned — v1 was wrong)
1. v1 ran from stale base `6c2c3a7` → **re-run on current `origin/main 1eda1c4d1`.**
2. v1 called 32 guards "unwired / dark / fake-green vector." **WRONG.** Authoritative
   `verify:guard-wired` on current main: **751 wired, 341 exempt, 0 unaccounted (orphan=0).** Nothing is
   unaccounted. See §B — reframed, no "dark guard" claim.
3. v1 dismissed the XLSX guard as "local-only noise." **Proven passes clean (exit 0), but it has a real
   latent traversal defect** to fix — see §A note.
4. v1 recommended "archive/defer aspirational guards." **REMOVED** — dispositioning a guard is an owner
   decision requiring a Jorge-approved tracker ID (§7 additive-only). No dispositions here.

## Headline (verified on current main, clean checkout)
- **Fail-open surface = 26 of 193 verify-steps** (return-based; runner swallows their failure). Stable
  vs v1. This is the COMPLETE universe step 2 can newly enforce.
- **Reds among the 26 in a clean checkout: 0.** All 26 pass; **none are DB-dependent.**
- **⇒ Fixing the runner (step 2) is safe — it will not red the board.** Definitive confirmation still
  comes from running the honest-runner harness under `verify:local-ci` at step-2 time.

---

## §A — The 26 fail-open steps (step 2's entire scope)
All 26 currently PASS. The runner fix makes their return value honest so a FUTURE failure can't be
swallowed. Underlying guards: `sql-column-existence, no-guard-hotfile-thrash, xlsx-cve-closeout,
banking-bankaccountdetail-is-credit-amounts, driver-border-credentials-edit, entity-badge-single-source,
h02-qbo-topbar-sync-now, user-detail-activity-tab, relay-status-not-hardcoded,
inventory-reorder-threshold-ui, drivers-count-nav-integrity, dispatch-arch-tab-parity,
drivers-profile-action-bar, driver-suspend-atomic, drivers-create-vocab, book-load-accessorial,
dvir-schema-presence, maint-create-vocab, safety-meetings-training-wire, drivers-earnings-debt-tab,
safety-hos-dashboard-wire, trailer-wo-equipment-id, dispatch-late-arrivals-alerts,
safety-incidents-cluster-wire, home-quickjump-counts` (+ `01-ensure-database-url` = infra, not a guard).

**Also fix in step 2:** `144-verify-xlsx-cve-closeout` has a **double bug** — its first `ctx.run(...)`
discards status (line 4) AND the runner swallows its return.

**XLSX guard defect (real, to fix — Cursor's point):** proven to **pass in a clean checkout (exit 0 bare
+ `--selftest`)**, so it is NOT a CI red. BUT its `walk()` has no worktree exclusion, so locally it
recurses into `.claude/worktrees/` (~125 repo copies) and **OOMs (4 GB heap)**. Harden it: **traverse
git-tracked files, or exclude nested `.git`/worktree roots.** Real robustness defect, separate from the
runner fix.

---

## §B — 32 guards that FAIL in the static (no-DB) run — wiring status NOT dark
`verify:static` flagged these as failing and "not in its executed set." **Authoritative `verify:guard-wired`
says 0 unaccounted (751 wired / 341 exempt)** — so these are **wired-or-baseline-exempt, NOT orphaned.**
The two tools' wiring heuristics differ; **per-guard reconciliation of `verify:static`'s list against
`verify-guard-wired`'s wired/exempt classification is still owed — I have NOT done it, so I do not label
their individual wiring status here.** What is certain: each is currently failing in a no-DB run. **No
disposition recommended — owner + tracker ID decides whether each is a stale/WIP guard or a parked real
defect.** ★ = financial-adjacent (owner-gated regardless).

★ coa-canonical · ★ inv2-no-hard-delete-accounting (void-never-delete) · ★ p0-settlement-schema-grants ·
★ recurring-bills · ★ pre-settlements · migration-schema-grants · samsara-hos-pull-real-clocks ·
hos-tracker-endpoints · ifta-tax-rates-current (missing Q3-2026 rates) · book-load-modal-x-dismissible ·
dispatch-eta-columns · cap-11-fuel-fraud · cap-12-tire-tread · cap-13-brake-wear · edi-foundation ·
form-425c-exhibits · photo-comparison-ai · geofence-state-machine · exif-chain-preservation ·
layover-detection · late-arrival-analytics · load-cancellations-report · reports-hub-9-categories ·
drug-alcohol-program · dvir-severity-tagging · damage-insurance-continuity · insurance-module ·
driver-pwa-dispatch-view · pre-dispatch-validation · active-driver-set · i18n-coverage ·
reference-before-introduction.

---

## §C — Not judgeable statically (need a real DB → verify:local-ci at step 2)
**SKIP-needs-db (21)** incl. rls-operating-company-scope, entity-isolation, no-cross-carrier-data-leak,
bank-feed-live-tieout, migration-application-consistency, sql-read/write-targets, coa-roles,
usmca-seed-completeness, … **None are in the fail-open 26**, so they don't widen step 2's wave; their
true verdict needs the CI DB. **SKIP-needs-env (2):** event-log-spine (`@supabase/supabase-js`),
users-add-user-submits.

## Method & caveats (§0)
- `verify:static` = dead-port sentinel, prod-safe; runs each guard standalone (PASS/FAIL = its true
  verdict). Faithful for the 26 (all static/no-DB). **Not** definitive for DB/dist behavior → the
  definitive step-2 check is the honest-runner harness under `verify:local-ci`.
- Numbers verified on `origin/main 1eda1c4d1` in a clean `git archive` checkout this session.

## Bottom line
Step 2 (runner fix) is **safe — 0 exposed reds** on current main. The §B set is a **separate,
owner-partitioned triage** (per-guard: reconcile wiring + real-vs-stale), not the runner fix, and carries
**no disposition** until Jorge assigns tracker IDs.
