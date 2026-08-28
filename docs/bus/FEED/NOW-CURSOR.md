# FEED · CURSOR · GO-0016 · overwrite

Lead. Packet `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-28-0016.md`. Live API `069d531`.

**NOW:** (1) `node scripts/ops/sync-seat-feed.mjs` every packet so Desktop matches git — this is why seats missed GO-0014. (2) Deploy API on 5–10 gate (stalled on `069d531`). (3) Additive `live_verified_at` / `live_verified_sha` on required.json leaves + guard (expire when not ancestor of healthz). Do not implement Event 2 / GL.

Census every lead turn. FAST-MERGE. Skip #15546 #16895. U14 never restamp. Nobody else `trigger_deploy`.
