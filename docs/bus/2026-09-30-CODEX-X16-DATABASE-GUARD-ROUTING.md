# CODEX | 2026-09-30 6:35 AM CT | X-16 — priority over remaining X jobs

Owner ruling: database-required guards belong in required CI, not local hooks.
No empty-database baseline is a live measurement. AUTH-147 remains a recorded
EXPIRED authorization finding, not a dependency of this code work.

## Implementation so far — NOT a claim of complete class coverage

`scripts/lib/local-db-guard-routing.mjs` explicitly routes 18 reviewed guards.
Local source checks remain where available; database-only checks print DEFERRED,
never a live PASS. Both the money gate and verify-step command context use it.
The full guards execute directly in CI, outside that local routing context.

The required `ci / build-typecheck` aggregate depends on the live job and rejects
failure, skip, or cancellation, including docs-only runs. The job uses the existing
`PROD_READONLY_DATABASE_URL` secret with default transaction read-only enabled.
Missing credentials still fail. No new live-data baseline or exemption is added.

The workflow RLS fixture guard was unsafe on production even with rollback. Its
replacement inspects production policies read-only; behavior fixtures use random
synthetic identities ONLY in a loopback `ih35_verify`/`ih35_test*` database, checked
again against server identity. CI's fresh-Postgres verify-step owns that behavior
test. No real company data is required to create its fixtures.

Three corrected session-scoped RLS scripts now use transaction-local settings;
their static debt entries were removed (43 -> 40). This is a source-proven shrink,
not a financial baseline reset. The invoice-factor query and Samsara duplicate
query are now explicitly USMCA-scoped before being moved to production-read CI.

## Rebase and duplicate reconciliation

Rebased onto `a0c71ff8f5`. Four overlaps were found and removed from the new static
batch; existing main steps retained:

- 11757 — live-loads-bills-require-closed-settlement
- 11761 — new-financial-table-ships-worm
- 11765 — check-stock-allocator
- 11769 — resolve-fully-wired

The reported 10872..10885 block was not found as that set on this main revision;
the reconciliation uses actual file contents, not assumed reservation numbers.
Six nonduplicated X-01 guards remain in the new static job.

## Local evidence and remaining scope

- Runner/required-CI routing tests: 7/7, exit 0.
- The five top-level domain database checks now route to required CI too.
  Their baselines and financial assertions are unchanged. Two filesystem/source
  guards incorrectly placed in the live-domain list now run locally without a
  credential prerequisite; neither assertion is skipped. Bus scan: 394 files,
  zero hard failures. Settlement comparator and fuel-reference selftests: 5/5 each.
- Load-create selftest: exit 0; live query still exits 1 without credentials.
- Workflow target-safety tests: 6/6; isolated RLS behavior: 3/3, exit 0.
- No production rows written or queried in this implementation pass.
- A textual inventory finds 186 declarations and 72 helper-call candidates,
  union 204. This is a REVIEW CANDIDATE count, not 204 proved live guards:
  meta-guards contain example strings. No blanket production execution is safe.
- Additional domain-gated and legacy invocation paths still need classification
  and migration. X-16 is NOT DONE and the seats are NOT claimed unblocked yet.

LANE-CROSS: X-16 explicitly authorizes `scripts/money-pr-local-gate.mjs`, shared
verify-step context, and CI required-job wiring. No money application code changed.
