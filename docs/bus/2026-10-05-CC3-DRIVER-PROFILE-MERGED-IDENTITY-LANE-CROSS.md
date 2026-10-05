# LANE_CROSS — CC-3 — driver profile reads merged duplicates; linkage guard measures the purge (2026-10-05)

**Files crossed:**
- `apps/backend/src/mdata/canonical/driver-profile.service.ts` (UNASSIGNED; CC-3 authored it, ROUND 326.3 #23960)
- `scripts/verify-driver-profile-linkage.mjs` (CC-1 by path; CC-3 authored it, same round)

**Authority:** the owner's standing order: "FIND THE ROOT CAUSES … PERMANENT FIX, NOT PATCH … ALWAYS FIX, NEVER DEFER … DO NOT HANDOFF". Lead ACCT-F406: no row re-pointed. The Lead's 2026-10-05 measured-empty rule (the exemption ends on the first live row) is applied inside the guard.

**Defects (measured on prod):**
1. The profile read only the surviving driver id, so rows a merge left on a duplicate disappeared. ANGEL ALFONSO SOSA's 10 file links sit on fba21d80, which was merged into 52037e93.
2. After AUTH-400 the guard failed every gate that touched its domain or a migration, including the RLS re-sweep (#25493 claim). The causes:
   - settlements, advances, deductions, fuel and loads are 0 company-wide;
   - AUTH-400 deleted EDUARDO AZAEL FLORES ORTIZ's 2 driver file links (audit.record_deletions).

**Change:**
- The profile reads every block through the identity set: the driver's id plus every duplicate merged into it.
- The guard excuses a block only while that kind of row is measured at 0 company-wide, and a driver's documents only when audit.record_deletions shows their links were purged.
- No baseline number changed.

**CC-1:** nothing to do. This note is the record of the crossing.
