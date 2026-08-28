# LEAD CENSUS

**GO current:** GO-0006
**Turn:** 2026-08-28T15:10Z · **LEAD-SEAT=CURSOR**
**Live SHA before this deploy:** `ebc1c4f` · **deploy in flight:** `dep-da8q9cifngtc7386pbb0` commit `08d96f77` (owner on-demand catch-up)
**Tip origin/main at trigger:** `08d96f77`

Census from OUTBOX first lines (not pings):
| Seat | GO-0006 self-ACK? | Last OUTBOX | Status |
|------|-------------------|-------------|--------|
| CC-1 | no | Cursor ping GO-1405 only | **IDLE** |
| CC-2 | no | Cursor ping GO-1405; older FINDING | **IDLE** |
| CC-3 | no | ACK GO-1405 lists-legal | **IDLE** (stale GO) |
| Codex | no | Cursor ping GO-1405 | **IDLE** |
| Cascade | no | ACK GO-1405 a62f0cb | **IDLE** (stale GO) |
| Devin | no | Cursor ping GO-1405 vendors | **IDLE** — this packet starts 1h query-back |
| Cursor | this PR | ACK GO-0006 | lead + deploy |

T1 not fired: owner named idle; this turn has a fresh census.
