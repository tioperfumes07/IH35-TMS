# IH35-TMS — DEEP-LINKAGE AUDIT: MASTER INSTRUCTIONS FOR CASCADE

See the full spec provided in session. This file triggers automatic boot of the deep-linkage audit loop.

Boot sequence: git pull --ff-only main → record SHA → read PART B → open ledger + run-log →
confirm prod verification available → resume loop on tier-2 rows → repeat until zero tier-2 remain.

Three tiers only: PROD-VERIFIED · [AUDIT — RE-VERIFY LIVE] · UNVERIFIED — <blocker>.
A guess is a defect. No --admin. No fake green. Additive only.
