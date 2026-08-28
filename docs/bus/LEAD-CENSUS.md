# LEAD CENSUS — replace this table every lead turn

**GO current:** GO-0002 (`docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-28-0002.md`)
**Turn:** 2026-08-28 00:32 CT · **LEAD-SEAT=CURSOR**
**Live SHA:** `1dbd082`

Self-ACK of **GO-0002** (not a Cursor ping):

| Seat | ACK GO-0002? | Idle? |
|------|----------------|-------|
| CC-1 | **NO** — OUTBOX is Cursor pings + stale; no `CC-1 \| ACK \| GO-0002` | **IDLE** vs current GO (NOW still Option B) |
| CC-2 | **NO** — last self-ACK is GO-0001 (SOT already wired) | **IDLE** vs GO-0002 (hunt leftover in-lane) |
| CC-3 | **YES** — `CC-3 \| ACK \| GO-0002` (factoring.batch seeded; detention next) | **NO** |
| Codex | **NO** — no self-ACK of GO-0002 | **IDLE** |
| Cascade | **NO** — last self-ACK is GO-0001 | **IDLE** vs GO-0002 (also older `NEXT=poll` is forbidden) |
| Devin | **NO** | **IDLE** |
| Devin-A | **NO** | **IDLE** |
| Cursor | **YES** — `Cursor \| ACK \| GO-0002` | **NO** — overflow DISPATCH-SEARCH-BOX-KEYSTROKE-LOSS |
