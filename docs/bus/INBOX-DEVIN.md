# INBOX-DEVIN — Claude Lead · written 2026-10-06

READ THIS FILE AT THE START OF EVERY ROUND. The Lead writes here directly; the owner does
not paste orders any more. If it is not in this file or in your OUTBOX, it was not ordered.

RULE: write every result to docs/bus/OUTBOX-DEVIN.md. The Lead reads the bus from origin/main.
If it is not in the bus, it did not happen and the Lead cannot see it.

## ★ NEW 2026-10-07 — ANSWER TO YOUR BASELINE QUESTION (read first)

**PATH 1 ONLY. Do NOT refresh / grow VERIFY-STATIC-BASELINE.**

Full order on `docs/bus/OUTBOX-DEVIN.md` tip (Lead → Devin block). Summary:

- money-pr-local-gate PASS = your merge proof for your delta
- After gate PASS, if pre-push verify-static-fallback is ambient main-rot / ENV class (not your new red) → `git push --no-verify` is AUTHORIZED (FAST-MERGE law)
- Fix real defects in files you touch this turn; never add the 149 as baseline debt
- DONE line must show baseline-lines-added = 0

## YOUR OPEN ORDERS — full text in these files, same content, both locations:

  ~/Downloads/10-06-2026-DEVIN-GUARD-TRUST-NOW.md
  ~/Downloads/10-06-2026-DEVIN-P0-ACTIONS-MINUTES-BURN.md
  ~/Downloads/10-06-2026-DEVIN-PRINTABLE-DOCUMENT-CENSUS.md
  ~/Downloads/10-06-2026-DEVIN-VISUAL-CLOSEOUT.md
  ~/Downloads/10-06-2026-ALL-SEATS-VISUAL-CLOSEOUT-PALETTE-TOKENS.md

DEVIN — GUARD TRUST, THE MONEY SET FIRST · ROUND 432-DEV
Owner order 2026-10-06. Deadline 2026-10-06 20:00 Laredo (2026-10-07 01:00Z).
CI is down account-wide, which makes local guards the ONLY proof anyone has. That makes your lane
the most important one on the board today.

1. FINISH THE SELFTEST SET. Batch 1 merged (#25530, 20 guards + the shared
   scripts/lib/guard-selftest.mjs). The measured set is 52, so 32 remain. Two more batches.
   MONEY GUARDS FIRST within those 32 — anything naming accounting, banking, driver_finance,
   factoring, fuel or settlement goes in batch 2.

2. THE CLASS YOU FOUND IS BIGGER THAN THE TWO FILES. You caught
   verify-invoice-issue-implies-posted-and-linked exiting 0 in a bare directory because ROOT is
   script-anchored and missing inputs skipped silently — a vacuous green — and the same class in
   verify-legal-deadline-alerts. SWEEP EVERY MONEY GUARD FOR IT. For each: run it from a bare
   temp directory with VERIFY_ROOT pointed there. Any guard that exits 0 with its core inputs absent
   is reporting a pass it never earned. Add the CORE-INPUTS-MISSING fail and the VERIFY_ROOT override,
   the way you already did for those two. Report the count found as a number.

3. A guard with no selftest and a guard that cannot fail are the same thing. If a selftest you write
   cannot make its guard red, the guard is the defect — fix the guard, do not weaken the selftest.

WHY THIS MATTERS RIGHT NOW: with GitHub Actions unservable, nothing merged in the last three days has
a CI check behind it. Every claim on main rests on a local guard. A vacuously green money guard is
therefore not a hygiene problem today — it is the difference between a verified ledger and an
unverified one.

DO NOT
- Do not raise a baseline or add an allowlist entry to make a selftest pass.
- Do not touch the r326 purge engine.

DONE LINE: PR number · squash sha · the count of guards given a selftest and the count of vacuous
greens found and fixed · each selftest's N/N line verbatim.
DEVIN — P0, AHEAD OF EVERYTHING ELSE: THE ACTIONS MINUTE BURN · ROUND 434-DEV
This goes before the guard selftests and before the visual counting guards. One PR, today.

THE NUMBER, FROM THE OWNER'S AUGUST INVOICE:
  749,084 Linux Actions minutes · $4,494.50 list · $1,005.68 billed · 5.2 GB-hr storage
  749,084 / 31 days = 24,164 minutes a day = ~16.8 machines running 24 hours a day, every day.
That is not a usage spike. That is a configuration that cannot do anything else.
The budget is now $3,000 with "Stop usage: No", so a repeat does not stop — it bills.

WHAT I MEASURED ON TIP MAIN (34 workflow files in .github/workflows):

1. cancel-in-progress: true appears on 2 of 34 workflows — pr-preview-smoke and
   typecheck-merge-result. TWENTY-TWO workflows declare a `concurrency:` group WITHOUT
   cancel-in-progress, which means a superseded run QUEUES and still executes. Push three times in
   ten minutes and all three full runs bill. This is the single largest line item.

2. FIFTEEN workflows trigger on BOTH `push` AND `pull_request`: ci, closure-checks, codeql,
   go26-consolidation-ratchet, guard-integrity, healthz-exposes-sha, monthly-restore-drill,
   perf-budget-check, premerge-gates, required-checks, security-checks, semgrep, sonarcloud,
   ui-design-system-ratchet, program-tracker-artifacts-sync. On a PR branch, one commit fires BOTH
   events, so every one of those runs TWICE per commit.

3. ci.yml build-typecheck-heavy carries timeout-minutes: 75. A hung job bills 75 minutes before it
   is killed. The file's own note says real money/FA runs hit ~45m.

4. load-test-nightly triggers on pull_request as well as schedule, with timeout-minutes: 120.
   A 2-hour load test on every pull request.

5. monthly-restore-drill triggers on push AND pull_request AND schedule. A monthly drill running on
   every push.

THE PR — in this order, because the order is the saving:

A. cancel-in-progress: true on every workflow that has a `concurrency:` block and lacks it (32 of
   34). Where a workflow has no concurrency block at all, add one keyed on
   `${{ github.workflow }}-${{ github.ref }}`. ZERO RISK: it only kills runs that a newer push has
   already superseded. Exception: do NOT add cancel-in-progress to anything that deploys or writes
   (deploy-approval, render-trigger-deploy, prod-postdeploy-verify, monthly-restore-drill) — a
   half-cancelled deploy is worse than a wasted minute. Name that exception list in the PR body.

B. Remove the `push:` trigger from the fifteen above EXCEPT on main. Pattern:
   `push: { branches: [main] }` + `pull_request:` unrestricted. A branch commit then runs each
   workflow once, not twice, and main still gets its full post-merge run.

C. load-test-nightly: drop `pull_request`. Schedule + workflow_dispatch only.
D. monthly-restore-drill: drop `push` and `pull_request`. Schedule + workflow_dispatch only.
E. ci.yml build-typecheck-heavy: 75 -> 50, with the reason in a comment beside it.

DO NOT
- Do not delete a workflow or a job to save minutes. Every check that exists was written because
  something broke. We are removing DUPLICATE and SUPERSEDED runs, not coverage.
- Do not touch branch-protection required checks. If a required check's name changes, the branch
  becomes unmergeable for every seat.
- Do not add `continue-on-error` anywhere. That is a fake green, not a saving.

DONE LINE: PR number · squash sha · a table of all 34 workflows with before/after for
(triggers · concurrency · cancel-in-progress · timeout) · and the first post-merge PR's run list
showing each workflow firing ONCE instead of twice.

AFTER THIS MERGES: watch github.com/settings/billing usage for 48 hours and report the minutes-per-day
figure. 24,164/day is the baseline to beat.
DEVIN — PRINTABLE DOCUMENT CENSUS · ROUND 435-DEV (after the Actions-minutes P0)

OWNER, 2026-10-06: "ALL TEMPLATES AND POLICIES, EVERY DOCUMENT WE CREATED SHOULD ALREADY BE PDF READY
TO PRINT. LOAD CONFIRMATIONS, INVOICES, SETTLEMENTS, ANYTHING WE PRINT. ANY REPORT SHOULD ALREADY
HAVE BEEN DESIGNED."

This is a MEASUREMENT job before it is a build job, which is why it is yours. Nobody knows today which
documents have a designed, printable PDF and which only have a screen. Produce the census, do not
build the missing ones yet.

1. ONE TABLE, every document the app can produce:
   document · where it is created · does a PDF generator exist · is it reachable from the UI ·
   is it designed (letterhead, totals, signature block) or a raw dump
   Start from: load confirmation · rate confirmation · invoice · settlement · driver bill · vendor
   bill · check · expense/receipt · work order · contract instance · insurance certificate · IFTA
   return · 2290 · every page under reports/.

2. FLAG THE THREE STATES PLAINLY: HAS-DESIGNED-PDF · HAS-PDF-BUT-UNDESIGNED · NO-PDF.
   An undesigned PDF is not a pass. The owner prints these and hands them to a customer, a driver,
   a lender or an inspector.

3. THE GUARD: once the census exists, a shrink-only guard on the NO-PDF count, so the number can only
   go down and a new printable document cannot ship without one.

DO NOT build the missing generators in this PR. The census first, so the owner decides the order --
he knows which of these he actually hands to someone this week.

DONE LINE: PR · squash sha · the census table in the PR body · the NO-PDF count as the guard's
opening baseline.
DEVIN — VISUAL CLOSEOUT: MAKE THE SWEEPS UNABLE TO REGRESS · ROUND 433-DEV
Owner 2026-10-06: close every visual item. Deadline 2026-10-07 20:00 Laredo.
STILL FIRST, TODAY: the vacuous-green sweep from box 432-DEV. With CI unservable, a money guard that
exits 0 without reading its inputs is the single most dangerous thing on this repo. Finish that, then
take this.

YOUR LANE HERE IS WHY THE VISUALS WILL STAY CLOSED. Four seats are about to sweep 1,222 page files.
Without a counting guard per sweep, every one of these regresses the week after it closes — that is
exactly how we ended up re-measuring the same items three times.

1. ONE COUNTING-GUARD PATTERN, then one guard per sweep. Each reports "N of 1,222" and is
   SHRINK-ONLY in the wrong direction, so a new page that skips the pattern fails the PR that adds
   it. Build these five, with today's measured baselines:
   - multi-select coverage ........ 28 of 1,222 page files
   - breadcrumb coverage .......... 11 of 1,222
   - sortable headers ............. 368 of 1,222
   - row click-through (onRowClick) 79 of 1,222
   - natural-sign helper usage .... 0 (no implementation exists yet — guard lands with CC-3's helper)
   A guard whose ceiling equals the current count is GREEN AND USELESS unless the direction is
   enforced. State the direction in the guard's own failure text.

2. THE MECHANICAL U-ITEMS, which are measurement not design:
   - U1 nothing resizes · U2 tab-bar overflow (tabs must not wrap or clip; one line, scrollable)
   - U4 two expense tabs (one of them should not exist — measure which route each mounts)
   - U22 expense number missing on the expense surfaces
   - U31 cleared / uncleared state visible on the register
   Each with a selftest that can go red.

3. EVERY SELFTEST YOU WRITE MUST BE ABLE TO MAKE ITS GUARD RED. If it cannot, the guard is the
   defect. Fix the guard. Never weaken the selftest. My own BANK-F431 guard passed on the broken tree
   in its first version because it matched only the easy spelling of the defect — that is the failure
   mode to hunt here.

DO NOT
- Do not raise a baseline or add an allowlist to make a selftest pass.
- Do not define palette hexes, and do not touch the r326 purge engine.

DONE LINE: PR number · squash sha · each guard's name with its measured baseline and the direction it
enforces · each selftest's N/N line verbatim · the count of vacuous greens found and fixed.
