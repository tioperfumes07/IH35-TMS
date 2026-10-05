# LANE_CROSS — CC-3 — AR-ties-to-QBO guard reads the purge ledger (2026-10-05)

**File crossed:** `scripts/verify-ar-ties-to-qbo-invoice-list.mjs`. No other file changes.

**Authority:** the owner's standing order: "ALWAYS FIX, NEVER DEFER … DO NOT HANDOFF". This applies the same post-purge principle as my other records today. QBO figures are informational (Martin is still reconciling them), never a seeded fix.

**Defect:** AUTH-400 deleted 149 USMCA loads (audit.record_deletions). The guard read every QBO row whose load was purged as "(load not found)" in the mismatched bucket: 54 against a baseline of 6. That blocks every gate that runs it.

**Change:**
- A QBO row whose load is absent and is recorded in audit.record_deletions under a governed AUTH moves to its own reported bucket. On prod that is 53 rows, each named.
- Mismatched is now 1, under its baseline of 6.
- No baseline number changed. A load missing with no governed deletion on record is still a mismatch.

**Owner:** nothing to do. This note is the record of the crossing.
