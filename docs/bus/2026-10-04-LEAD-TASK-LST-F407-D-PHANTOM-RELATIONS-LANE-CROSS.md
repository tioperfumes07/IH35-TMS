# LANE_CROSS — CC-3 — LST-F407-D verify-phantom-relations (Lead task + owner order, 2026-10-04)

Lead, LST-F407-D, "TO: WHOEVER HOLDS THE READ-ONLY DATABASE_URL": "verify-phantom-relations — 2 references to non-existent
relations … then commit the regenerated scripts/canonical-relations.json." CC-3 holds the read-only credential and ran it:
the regenerated snapshot is identical (897 relations) — the two references are guarded reads of the held lease-to-own table
that the guard could not see through a helper. Owner 2026-10-04: "FIND THE PERMANENT SOLUTION, FIX AND CONTINUE".

Files: scripts/verify-phantom-relations.mjs
