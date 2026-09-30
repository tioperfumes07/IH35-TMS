# CODEX | 2026-09-30 6:08 AM CT | X-01 / X-02 execution evidence

Measured base: `f72f49e667`. No production connection or write in this pass.

## X-01 — ten static checks

Before: 5,435 guard files, 4,152 wired, 1,259 exempt, 24 unaccounted.
After local CI change: 4,162 wired, 1,259 exempt, 14 unaccounted.
These are registration counts, not claims that all registered guards executed.

Ten newly wired static guards executed: 10 passed, 0 failed. Their exact list is
in `required-static-guards` in `.github/workflows/ci.yml`. A separate job avoids
an earlier frontend/precommit failure preventing their execution. The required
`build-typecheck` aggregate rejects this job failing, skipping, or cancelling.
The batch runs every check and returns nonzero for any failure or spawn error.

`verify-load-costs-wizard-amounts` executed its static portion only; its live
portion explicitly reported SKIP because no DATABASE_URL was supplied. No live
load-cost proof is claimed here. No exemptions or baselines changed.

The eleventh purported passing check, `verify-seed-expense-actually-works`, invokes
a production-capable fixture writer. It remains unwired pending the separately
ordered isolated-database rewrite; rollback does not authorize production fixtures.

## X-02 — fresh-schema incompatibilities reproduced

All four checks ran against the dedicated local schema-only database
`ih35_test_codex_rls_20260930`, with `default_transaction_read_only=on`:

```text
Required guards: executed=4 passed=2 failed=2
verify-every-bill-posting-carries-its-source-link: LIVE FAIL — 0 driver-settlement-adopted bills; completeness discriminator says this is an instrument problem, not a real zero
verify-issued-invoice-on-rolling-load-needs-authorization: error: role "neondb_owner" does not exist (22023)
```

The stop-stamps and escrow checks passed on the empty local schema. Those zeros
are NOT production measurements and must NOT shrink their production baselines.
Simply connecting these guards to CI's empty Postgres will not make them valid:
the bill guard requires a real population, and the invoice guard assumes a
Neon-specific role. Next work is isolated positive/negative database fixtures and
portable role setup, retaining fail-closed production behavior. No offline skip,
empty-population exemption, or baseline change was introduced.

## Lane and remaining work

LANE-CROSS: `.github/workflows/ci.yml`, CI owners: X-01 explicitly authorizes
Codex to wire the orphan guards; no application or financial writer changed.
X-01 is partial, not shipped. X-02 through X-15 are not claimed complete.
The known match-candidate and geocode failures remain unexempted.

## CODEX | 2026-09-30 6:10 AM CT | X-03 / X-04 routing and publication

CC-2 / B-08: fresh `verify-match-candidates-are-settlement-born-only` exit 1:
`fetchLedgerCandidates must NOT select from expenses` and
`fetchLedgerCandidates must NOT select from AR payments`. Both findings persist.

CC-3 / T-08: fresh `verify-geocode-provider-is-reachable` exit 1:
`geocoding a known-good US address failed: reason=provider_unavailable`.
This was the local configured environment, not a Render-environment measurement.

The actual static batch extracted from CI passed 10/10; runner tests passed 4/4,
including eight real shell executions of the required aggregate's status branches.
Publication gate reached `verify-one-load-create-path` and failed:
`DATABASE_URL not set and this guard does not declare ALLOW_OFFLINE_SKIP`.
No bypass, push, PR, merge, or production fixture execution occurred.
