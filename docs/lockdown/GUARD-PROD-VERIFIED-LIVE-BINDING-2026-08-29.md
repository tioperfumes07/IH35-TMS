# GUARD: `verify-prod-verified-live-binding` — install + what it enforces

**Built 2026-08-29 against live `b276443`. Selftest 9/9. Mutation-tested (Claude design; Cursor install).**  
**Owner of flips:** CC-2 (money) and Cascade GUARD-2 (safety/lists/drivers/system). Not CC-3. Not builders. See `docs/lockdown/GUARD-CAPACITY-PROOF-PACKET-CASCADE-G2-2026-08-29.md`.

**SYS-S07:** bound to `b276443`. Valid on later live SHAs **if** that commit is an ancestor (measured: `b276443` ⊂ `14daeed`). Equality re-stamp is a wasted GUARD cycle.

## The hole it closes — measured

```
prod_verified = true            285
  ...WITH live_verified_sha      10
  ...WITHOUT any SHA binding    275   <-- unfalsifiable
```

`SYS-S07` (Transaction Health): `prod_verified:true`, `live_verified_sha:null`, evidence while API served `069d531`, UI showed “Transaction health unavailable.”

## What it enforces

1. New `prod_verified:true` needs `live_verified_sha` + `live_verified_at`.
2. That SHA must be an ancestor of live `healthz/shallow`.
3. Legacy debt = shrinking baseline (`PROD-VERIFIED-BINDING-BASELINE.json`). Adding ids = tamper FAIL.
4. Unresolvable ref fails CLOSED as **CANNOT DETERMINE** (not “not an ancestor”).

## Shared-lib fix

`scripts/lib/live-verified-stamps.mjs` → `ancestorCheck()` tri-state. L6 stamps use it too.

## Run

```bash
node scripts/verify-prod-verified-live-binding.mjs --selftest   # 9/9
node scripts/verify-prod-verified-live-binding.mjs              # OK + 275 warnings
```

Do **not** re-run `--write-baseline` after adopt.

## Spec’d but NOT built (do not half-ship)

- `verify-evidence-does-not-contradict-status.mjs` — needs curated phrases; naive regex = false positives (“regression test”). Confirmed real: BANK-ECON-04, BANK-SURF-04 still PASS with FAIL language in evidence.
- Lane-band for chrome seats: already FAIL-CLOSED via GO-0030 rider (not SKIP). Do not invent mod-8 in chat.
