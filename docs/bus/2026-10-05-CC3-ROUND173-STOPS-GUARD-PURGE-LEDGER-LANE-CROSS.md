# LANE_CROSS — CC-3 — ROUND 173 pinned-stops guard reads the purge ledger (2026-10-05)

**File crossed:** `scripts/verify-round173-8-stops-have-addresses.mjs`. No other file changes.

**Authority:** the owner's standing order: "ALWAYS FIX, NEVER DEFER … DO NOT HANDOFF". This is the same post-purge principle as my 2026-10-04 ratchets record: a purged row is not a regression.

**Defect:** AUTH-400 deleted all 8 pinned stops along with their loads. audit.record_deletions records all 8 under `mdata.load_stops` / AUTH-400. The guard reads "gone" as "regressed", which blocks every gate that runs it. The first one blocked is the RLS re-sweep (migration 202615420900).

**Change:** no stop is unpinned.
- A live pinned stop must still carry `address_line1`.
- A pinned stop that is gone passes only when audit.record_deletions shows it deleted under a governed AUTH.
- Any other disappearance fails.
- `evaluate()` selftest: 4/4.

**Owner:** nothing to do. This note is the record of the crossing.
