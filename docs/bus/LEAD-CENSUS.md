# LEAD-CENSUS · 2026-08-31 09:42 CT · LEAD-TICK-0242
| Seat | Status | Evidence |
|------|--------|----------|
| Cursor | LEAD | tick 102 · live e09eea1 · GO-E2E still law · **not** activating Claude-lead (packet would clobber GO-E2E) |
| CC-1 | **DEAD/IDLE** | ~14m since 0239 · 0 self-ACK · tmux cc1 attached but silent |
| CC-2 | **DEAD/IDLE** | 0 JE sample · tip Cursor→ only |
| CC-3 | WAIT | ok |
| Cascade | WAIT | ok |
| Codex | WAIT | ok |
| Devin-A | **DEAD/IDLE** | last ACK=0237 · no GO-E2E ACK |
**IDLE:** CC-1, CC-2, Devin-A. Escalation: Claude (chat) execute CC-1 ONE chain from pack; seats must ACK or stay named idle every tick.
