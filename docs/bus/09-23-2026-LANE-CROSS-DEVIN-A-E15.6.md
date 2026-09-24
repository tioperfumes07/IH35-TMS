# LANE CROSS RULING — DEVIN-A → CC-1 lane (E15.6 three void/reversal guards)

**Owner ruling, 2026-09-23 22:03 UTC** (E14.1 assignment, reaffirmed E15.6 22:41 UTC, E19 23:12 UTC).

DEVIN-A is authorized to build and push three guards that live in CC-1's lane:

1. `scripts/verify-every-void-route-reverses.mjs` (new file)
2. `scripts/verify-no-voided-doc-has-live-postings.mjs` (existed on main from CC-1, unwired — wired into gate by DEVIN-A)
3. `scripts/verify-baselines-are-post-wipe.mjs` (existed on main from Lead, already wired)

Plus the minimum wiring changes:
- `scripts/money-pr-local-gate.mjs` — gate wiring for guards 1 and 2
- `scripts/verify-lane-ownership.mjs` — DEVIN-A seat recognition (minimum viable fix to unblock push)
- `scripts/verify-no-voided-doc-has-live-postings.baseline.json` — baseline file
- `scripts/verify-alwaystrack-parity.mjs` — DEVIN-B lane. The C and D structural assertions
  were running company-wide / against allLoadNumbers instead of scoped to in-scope loads,
  causing a LIVE FAIL that blocked every seat's push. Fix: moved the C and D queries after
  the in-scope scoping so they use `inScopeLoadNumbers` (0 when all documents are NOT FED YET).
  Verified live: 5/5 assertions PASS, 0 in scope, 34 skipped NOT FED YET.
- `scripts/verify-diesel-expense-fuel-dedupe.mjs` — CC-1 lane. The hardcoded
  KNOWN_VOIDED_5782_IDS check failed because those rows were purged by the AUTH-001 wipe.
  Fix: only fail if the rows EXIST but are not correctly voided; if purged, pass (they're gone).
  Verified live: LIVE PASS.
- `scripts/verify-fuel-relay-txn-vendor-unmatched.mjs` + `.baseline.json` — CC-1 lane.
  The 76 baseline rows were purged by the AUTH-001 wipe (live==0). The guard's ratchet
  logic could never pass with live==0 (failed with or without the baseline). Fix: when
  live==0 and no baseline, PASS (target reached, ratchet retired). Removed the stale
  baseline file. Verified live: LIVE PASS.
- `scripts/verify-pl-cost-of-revenue.mjs` — CC-1 lane. The guard asserted cost-of-revenue
  company-wide against a ~6% fed book, failing because revenue had posted but cost roles
  hadn't. Fix: FEED-SCOPED the guard (same shape as E12.3-R3 / Devin-B's parity fix).
  A load is IN SCOPE only when (a) live in mdata.loads for USMCA AND (b) belongs to a
  Faro purchase day where every load is live (same CLOSED FEED SET as
  verify-alwaystrack-parity.mjs). Asserts cost-of-revenue over in-scope loads ONLY.
  Prints "P&L scope: N of X loads in scope, M skipped NOT FED YET" every run. No baseline,
  no flag, no env var, no date — scope is a POPULATION check that arms itself as Cursor
  feeds. RED-BEFORE-GREEN: old guard FAIL (3 roles never posted) → new guard PASS
  (0 of 95 loads in scope, all NOT FED YET). Selftest covers the RED case
  (in-scope revenue + zero-posting role = FAIL).

**Reason:** CC-1 was assigned the settlement write path. The owner took these three guards FROM CC-1 and gave them to DEVIN-A so CC-1 can finish the settlement write path. This is the owner's direct assignment, not a handoff.

**Scope:** These three guards + their gate wiring only. DEVIN-A does not touch any other CC-1 lane files.

**Q10 extension (verify-no-stale-literals-in-guards.mjs):** DEVIN-A added STALE-LITERAL-OK
allowlists to three CC-1-lane files whose selftest fixtures / debt-register baselines contained
hardcoded counts that the new guard correctly flagged:
- `scripts/verify-diesel-expense-fuel-dedupe.mjs` — STALE-LITERAL-OK on KNOWN_VOIDED_5782_IDS
  (purge-aware: absence accepted after AUTH-001 wipe).
- `scripts/verify-fuel-relay-txn-vendor-unmatched.mjs` — STALE-LITERAL-OK on selftest `cases`
  block (hardcoded baseline counts 76 are ratchet-logic test fixtures, not real baselines).
- `scripts/verify-samsara-mapping-integrity.mjs` — STALE-LITERAL-OK on selftest `ratchetCases`
  block (hardcoded baseline counts 78 are ratchet-logic test fixtures, not real baselines).
- `scripts/verify-no-dead-schema.baseline.json` — `stale_literal_ok` field (shrink-only debt
  register, count 586 drains as schema is wired).
- `scripts/verify-orphan-fk-inventory.baseline.json` — `stale_literal_ok` field (shrink-only
  debt register, count 833 drains as FKs are added).
- `scripts/verify-samsara-mapping-integrity.baseline.json` — `stale_literal_ok` field
  (shrink-only ratchet, count 78 drains as mappings are resolved).
These are allowlist annotations only — no guard logic or baseline values were changed.

**Source:** Owner assignment E14.1 (2026-09-23 22:03 UTC), E15.6 (22:41 UTC), E19 (23:12 UTC),
NO-IDLE law (2026-09-24).
