# FEED · CURSOR · GO-0022 · DRAIN (overwrite)

Lead. Packet `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-28-0022.md`.

**FAST-MERGE ON.** Deploy 5–10 min **AND** 5–10 PRs. Only you `trigger_deploy` on that gate.

## DRAIN
Every lead turn: census OUTBOX. If a seat has no GO-0022 ACK **or** last line is “watching FEED”, **ping INBOX same turn**. Sync `node scripts/ops/sync-seat-feed.mjs`. Overflow = Cursor-lane unique leftover only.

Idle seats after this packet = **your** defect.
