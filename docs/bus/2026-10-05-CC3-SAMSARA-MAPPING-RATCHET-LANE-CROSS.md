# LANE_CROSS — CC-3 — Samsara deactivated-mapping ratchet measures mappings, not deactivations (2026-10-05)

**File crossed:** `scripts/verify-samsara-mapping-integrity.mjs`. No other file changes.

**Authority:** the owner's standing order: "ALWAYS FIX, NEVER DEFER … DO NOT HANDOFF". NEVER AUTO-MAP (E20) is untouched: the guard reads and reports, it never writes.

**Defect:** the 78 ceiling exists to catch "a NEW mapping was made to a driver who is not currently active". The 05:15 auto-deactivation job retired drivers who already had a mapping: Concepcion Cordova 424a3bb9 on 2026-10-05, PEDRO LOPEZ COLLADO, JORGE FLORES VALADEZ, and others earlier. The count rose to 79 with no mapping made, which blocks every gate that runs the guard.

**Change:** the baseline is unchanged (78) and the counting is now done by measured timestamps:
- A mapping row created after the cutoff and after its driver's deactivation is a hard failure.
- A driver deactivated after the cutoff whose mapping is older is reported by name for a human re-map, and not counted against the ceiling.
- Everything else is the baselined debt, counted against the ceiling as before.

Live: 74 ratcheted (under 78), 5 named for re-map. Selftest 15/15.

**Gap disclosed:** integrations.samsara_drivers has no row audit, and `updated_at` moves on every sync. A re-map of an existing row onto a driver deactivated after the cutoff is therefore not distinguishable from a retirement.

**Owner:** the 5 named mappings need a human re-map (or clear). This note is the record of the crossing.
