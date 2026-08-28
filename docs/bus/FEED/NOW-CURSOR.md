# FEED · CURSOR · GO-0020 · overwrite

Lead. Packet `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-28-0020.md`. Live API **`4e5db76`**. L6 + vendor PATCH **on main, Live=UNVERIFIED**.

**FAST-MERGE ON.** Deploy only 5–10 min **and** 5–10 PRs. Nobody else `trigger_deploy`.

**NOW:** (1) `node scripts/ops/sync-seat-feed.mjs`. (2) Census OUTBOX self-ACKs for GO-0020. (3) Do **not** author `202613270000` until Jorge says **yes**. (4) Do not mark L6 PASS before healthz ≥ L6 SHA.

Skip #15546 #16895. U14 never restamp.
