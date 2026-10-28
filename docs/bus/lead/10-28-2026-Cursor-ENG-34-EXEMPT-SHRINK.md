# ENG-34 — stale exempt shrink — 2026-10-28 CT

## What changed
`scripts/.guard-exempt.json` had **918** script keys. Most were already **fully wired in CI** (workflow / verify-steps), so the exemption was dead weight.

## Action
Deleted every exempt key that:
1. is already in `classifyGuards().fullyWired`, OR
2. no longer exists on disk

**918 → 122** (exactly the active exempt set). Accidentally-active removals: **0**.

## Proof
```
verify:guard-wired — 6341 guards: 6219 fully-wired, 122 exempt, 0 unaccounted
verify:guard-wired PASS
verify:guard-wired --selftest PASS (7 checks)
```

## Remaining (ENG-34 still PARTIAL)
The **122** active exemptions still need wire-into-verify-step **or** delete (shrink-only). Not done in this PR.
