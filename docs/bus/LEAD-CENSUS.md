# LEAD CENSUS — replace this table every lead turn

**GO current:** GO-2310  
**Turn:** 2026-08-25T23:49CT · **LEAD-SEAT=CC-1** (tripwire T1-FAST-MERGE-VERIFY-STATIC)  
**Self-ACK** = seat-authored line matching this GO. `Cursor→Seat` ping ≠ ACK.

| Seat | Last self-line | ACK GO-2310? | Idle? |
|------|----------------|--------------|-------|
| CC-1 | no CC-1 self-ACK of GO-2310 (Cursor pings only) | **NO** | **YES** — still `57cabbab` |
| CC-2 | ACK GO-2310 calendars @ b711699; continuing popups | **YES** | **NO** — keep working nested create + leftover |
| CC-3 | Cursor ping only | **NO** | **YES** |
| Codex | Cursor ping only | **NO** | **YES** |
| Cascade | ACK GO-2237 item-14 /cash-flow FINDING (not GO-2310) | **NO** | **partial** — walk GO-2310 calendars/nested create |
| Devin-A | Cursor ping only | **NO** | **YES** |
| Cursor | worker after tripwire | n/a | FAST-MERGE this handoff only |

**Owner charge this turn:** Cursor waited on `verify-static` instead of gate PASS → `push --no-verify` → `gh api` squash.
