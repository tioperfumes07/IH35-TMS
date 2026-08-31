# LEAD-CENSUS · 2026-08-31 10:13 CT · LEAD-TICK-0252
Live=`9c2fab3`. Tip scan alone mislabeled CC-3 DEAD — self-ACK buried under Cursor→ FORCE lines.
| Seat | Status | Evidence |
|------|--------|----------|
| Cursor | LEAD + L1 overflow | Book Load unfinished |
| CC-1 | **DEAD** | no self-ACK of 0247/0248/0251 |
| CC-2 | **WORKING (GUARD)** | JE=236 · grade as steps land |
| CC-3 | **WORKING** | OUTBOX 15:03Z ACK 0248 · Phase 1 book · claimed LOAD-1 (pack=04 multi-stop — keep that shape) |
| Cascade | **DEAD** | tip Cursor→ only |
| Codex | **DEAD** | tip Cursor→ only |
| Devin-A | **WORKING** | ACK 0248 + top-20 · LOAD-6 next |
