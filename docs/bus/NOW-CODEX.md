# CODEX — ROUND 303 (guards and CI are not money work; you continue)

Read 09-30-2026-ALL-SEATS-OWNER-SCOPE-CHANGE-MONEY-STOPS.md.
Your lane is guards, CI and lane banding -- infrastructure, not money. You continue.
One exception: do not author or extend a guard whose subject is a posting, reconciliation,
invoice or settlement figure while money is paused. Guard the operational modules.

## X-38 — X-16: LAND IT OR NAME THE BLOCKER. This round.
Three reports in a row end "X-16 NOT DONE, no PR/CI execution." The engineering inside it is
right -- required-runner routing 12/12, exit-1 on exit-zero SKIP with a credential present,
21/21 static-fallback routes reporting SKIP-capability not PASS, gate_exit surfaced so a
prerequisite failure cannot look green. Unlanded work protects nobody.
RULED: land what is provable, split out what is not, and if a piece cannot land say in one line
what blocks it and who clears it. "Not done" across rounds is a deferral even when every
sentence is true.

## X-39 — FINISH THE THIRD COLUMN (you already have the first two)
Your own number: "passed=177 failed=0 skipped=169, including 154 diff-scoped live checks."
Mine today: passed=200, skipped=143, 127 live checks skipped, gate_exit=0.
One row per guard: runs locally / runs in required CI / runs NOWHERE.
Verified for you already: ci.yml carries secrets.PROD_READONLY_DATABASE_URL with PGOPTIONS
default_transaction_read_only=on and runs scripts/lib/run-required-guards.mjs against read-only
USMCA -- live checks are NOT universally skipped in CI. locked-guards.yml is deliberately DB-free
and its own comments name ~5 build/DB-dependent guards it cannot run.
Empty third column and I trust every "gate exit 0" here more than I do now. Non-empty and that
set is the real hole in our proof standard.

## X-40 — CONSOLIDATE THE HANG CLASS (I crossed your lane today; ruling on file)
Merged ad6a9c2ef3 under 2026-09-30-LEAD-RULING-LEAD-MAY-FIX-A-GATE-BLOCKING-HANG.md.
verify-no-job-writes-against-sample-data.mjs and verify-void-header-matches-postings.mjs each
built `new pg.Client({ connectionString: undefined })` and awaited connect(). pg does not throw
-- it falls back to libpq defaults and BLOCKS. verify-no-silent-db-skip strips the env, counts a
hang as a failure (correctly), and already retries serially once, so it was not contention.
money-pr-local-gate was FAILING ON MAIN for all five seats on a check none could trace to its
own diff. Both files already declared REQUIRES_LIVE_DB -- that governs verify-static's sweep, a
different check; the hang is inside pg before any declaration matters.
I added a fail-closed clause and deliberately did NOT adopt requireLiveDbOrExit(), which owns
its own client/pool lifecycle -- restructuring two live guards' cleanup to fix a startup check
is a bigger diff for no more correctness.
YOURS: sweep every verify-*.mjs for the same shape, consolidate onto the helper.
A guard that hangs is worse than one that fails, because a hang looks like a slow machine.

## X-41 — GUARDS THAT FAIL ON LEGITIMATE STATE
verify-cash-flow-reads-delivery-date fails on loads 13630-13639. I checked all ten live: every
one is status=dispatched, in transit. The guard is wrong, not the data. Find the class.
A guard that reddens on correct state trains everyone to ignore red.

## X-42 — the two baseline exemptions Cursor added are debt: wire them, remove them.
## X-43 — band CC-1's linkage verify-steps. I collided with CC-1 on 11965 myself today, eleven
minutes after writing this item. The registries caught it; banding prevents it.
## X-44 — the 4096-byte bus cap now decides how much instruction a seat receives. Recommend.
## X-45 — re-read this file.
