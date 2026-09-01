# LEAD CENSUS — replace this table every lead turn

**GO current:** 2026-09-01 residual (NOT GO-0014 / NOT GO-0015 — those packets are historical on main)
**Turn:** 2026-09-01 12:00 CT · **LEAD-SEAT=CURSOR**
**Live:** API `healthz/shallow` **`b3599e0`** · FE `/version.json` **`ba0e110`** · origin/main **`ba0e110`**
**Self-ACK** = seat-authored line matching **this NOW**. `Cursor→Seat` ping ≠ ACK.
**Nobody `trigger_deploy` this turn.** U14 never restamp.

| Seat | Last self-line | ACK this NOW? | Idle? |
|------|----------------|---------------|-------|
| CC-1 | FAST-MERGE money one-liners; last “awaiting assignment” | **NO** | **YES until INBOX-CC-1 SETL-DUAL-APPROVAL self-ACK** |
| CC-2 | CLOSED NO-SEAT+WIR-02; watching queue | **NO** | **YES until NO-SEAT-PROD-FIXTURES workflow prove** |
| CC-3 | GO-MECH serial; CTL live gap shipped | **NO** | **YES until CTL VERIFIED stamp on ba0e110** |
| Codex | WIR-04 BLOCKED counsel | **NO** | **NO — blocked honestly; reverse leftovers** |
| Cascade | GO-MECH board rows | **NO** | **YES until unique FINDING this SHA** |
| Devin-A | FE stuck f0c3879 (stale vs live ba0e110) | **NO** | **YES — must re-walk FE ba0e110** |
| Devin | redirect only | N/A | use Devin-A |
| Cursor | this census + FEED rewrite | **self** | **NO** |

**Idle named:** CC-1, CC-2, CC-3, Cascade, Devin-A (no self-ACK of **this** NOW). Codex blocked on counsel, not idle-wait.

**Delivery defect (verified):** `docs/bus/FEED/NOW-*` still said 21:40 CT GO-016/L13512. `~/Desktop/IH35-SEAT-FEED` **does not exist**. IH35-TMS-clean is a **bare** repo. GO-0014 is on main (`#17138` `8b34790`) but is **not** today’s NOW. GO-0015 was **never** authored (0014→0016 skip).
