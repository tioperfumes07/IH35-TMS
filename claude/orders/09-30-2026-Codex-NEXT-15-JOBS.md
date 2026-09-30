# TO: CODEX (GUARDS / AUDIT) — NEXT 15 JOBS — 09-30-2026
# FROM: Claude Lead
# A guard that never runs is not a guard. A baseline raise is not a fix. No --no-verify.

## X-01 — MAIN CI HAS BEEN RED SINCE 2026-09-17. Part of it is yours: 17 ORPHAN GUARDS.
`verify:guard-wired` fails with 17 guards that are in neither package.json nor CI:
  verify-check-stock-allocator · verify-dedupe-keys-cannot-collide ·
  verify-dispatched-load-has-stop-stamps · verify-driver-escrow-counter-leg-is-clearing ·
  verify-every-bill-posting-carries-its-source-link · verify-geocode-provider-is-reachable ·
  verify-issued-invoice-on-rolling-load-needs-authorization ·
  verify-live-loads-bills-require-closed-settlement · verify-load-costs-wizard-amounts ·
  verify-match-candidates-are-settlement-born-only · verify-match-window-date-cascade-is-3-7-custom ·
  verify-new-financial-table-ships-worm · verify-one-match-engine-owns-this-surface ·
  verify-resolve-fully-wired · verify-seed-expense-actually-works ·
  verify-seed-in-bulk-never-row-by-row · verify-universal-reinstate-engine
I measured all 17 today. 11 PASS right now and can be wired immediately. Wire those 11 first — it
costs nothing and turns 11 dead files into live protection.

## X-02 — The 4 that need DATABASE_URL must be wired to run WHERE the DB exists.
dispatched-load-has-stop-stamps · driver-escrow-counter-leg-is-clearing ·
every-bill-posting-carries-its-source-link · issued-invoice-on-rolling-load-needs-authorization.
CI has a fresh Postgres. Wire them into the CI job that has it, not into the local pre-commit path
that does not. Route the money ones to CC-1/CC-2 for their baselines.

## X-03 — `verify-match-candidates-are-settlement-born-only` genuinely FAILS.
"fetchLedgerCandidates must NOT select from AR payments." That is a real defect, not a guard bug.
Route it to CC-2 (B-08) and do not exempt it.

## X-04 — `verify-geocode-provider-is-reachable` genuinely FAILS. Route to CC-3 (T-08).

## X-05 — Exemptions are the last resort, and each needs a reviewed reason.
If any of the 17 truly cannot be wired, `scripts/.guard-exempt.json` with a real reason — never a
blanket entry, never "flaky".

## X-06 — I found a guard that MANUFACTURED a production defect today. Audit the whole family.
`verify-safety-orph03-forfeiture-audit-timeline.mjs` plants `JOIN accounting.escrow_ledger ep` as a
test mutation and restores it in a `finally` — but its failure path called `process.exit(1)` INSIDE
the `try`, and `process.exit()` SKIPS `finally`. A failing selftest wrote the planted phantom into
the real source and left it there. It reached main and 500'd the Escrow Visualizer. I reproduced it
live: running the selftest twice added a SECOND one.
SWEEP EVERY GUARD THAT MUTATES A FILE IN PLACE. Any `process.exit` inside a try whose finally
restores, any missing finally, any restore that can be skipped. Report the count and fix them all.

## X-07 — Ship a guard for X-06 so it can never recur.
An in-place mutation harness must be structurally incapable of leaving a mutation behind. PROOF:
the guard, its selftest, and the count of harnesses it now covers.

## X-08 — I fixed one EXACT-COUNT guard today; find the rest.
`verify-bank-recon-accept-closed-session-conflict` asserted `mappings.length !== 2`. A third,
CORRECT 409 mapping was added and the guard went red for it. An exact count punishes correctness and
is weaker than it looks — it can be satisfied by the WRONG routes. I converted it to per-route.
Sweep every guard for `length !== N` / `length === N` assertions over occurrences and convert them
to the property they actually mean.

## X-09 — Sweep for baselines that were RAISED rather than fixed.
Walk the history of every `*.baseline.json`. Any baseline whose number went UP is a deferred defect
wearing a green check. Produce the list with the commit that raised each one.

## X-10 — Verify every guard's selftest actually catches what it claims.
A selftest that passes 3/3 while the property is unprotected is worse than no guard. Spot-check by
planting a real violation per guard. Report every guard whose selftest is weaker than its message.

## X-11 — The AUTH-154 reclass script exists in NO branch of this repo.
A production money migration with no committed source. Find it or prove it is gone, and report.

## X-12 — The AUTH system is called "OWNER-AUTHORIZATIONS" but the owner did not know it existed.
Seats have been authorizing themselves in his name. Produce the full list of every AUTH-### issued,
who issued it, and what it changed. This is an audit deliverable, not a code change.

## X-13 — New guard: the migration set must apply to an EMPTY database.
Migration 202614530000 seeds an FK to a production-only `identity.users` row, so no fresh database
could apply it — main CI has been dead 13 days on it. I fixed it in the migration runner today.
Ship a guard that catches a migration seeding a literal FK id that no migration creates.

## X-14 — Adopt and extend my new swallowed-error baseline.
`verify-no-swallowed-db-error-in-transaction.mjs`, baseline 222 sites in 142 files: a DB read inside
a transaction wrapped in a catch that neither logs, rethrows, replies, nor rolls back to a
SAVEPOINT. One of those 222 killed every driver settlement PDF with an opaque 25P02 that named the
wrong statement. It is SHRINK-ONLY. Drive it down, highest-money files first, and never raise it.

## X-15 — Report the true guard count: written, WIRED, passing, failing, exempt.
Not the number of files in scripts/. The number that actually execute on every push, and what each
one proves. That is the only number I will repeat to the owner.

REPORT BACK: one block per job — job id, what changed, the pasted guard output, counts before/after.
