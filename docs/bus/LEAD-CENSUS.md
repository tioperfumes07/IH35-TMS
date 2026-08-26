# LEAD CENSUS — replace this table every lead turn

**GO current:** GO-2310 (`docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-25-2310.md`)  
**Turn:** 2026-08-25T23:32CT · **Lead file:** `LEAD-SEAT.md` = CURSOR (until tripwire)  
**Self-ACK** = seat-authored line matching this GO. `Cursor→Seat` ping ≠ ACK.

| Seat | Last self-line (first 20 of OUTBOX) | ACK GO-2310? | Idle? |
|------|-------------------------------------|--------------|-------|
| CC-1 | Cursor ping 23:19; last CC-1 ACK is U14/accounting (Aug 22) | **NO** | **YES** — money NOW `57cabbab` still OPEN |
| CC-2 | STATUS GO-2237 items 4–11 @ b711699 | **NO** (ACK’d 2237, not 2310) | **NO** — working reports leftover; calendars/nested create not ACK’d |
| CC-3 | STATIC AUDIT /lists; Chrome blocked | **NO** | **YES** vs 2310 |
| Codex | ACK U14 leftover; older WORKING FO | **NO** | **YES** vs 2310 |
| Cascade | no Cascade self-line after Aug 16 (only Cursor pings) | **NO** | **YES** |
| Devin-A | no Devin-A self-ACK after Cursor pings | **NO** | **YES** |
| Cursor | ACK GO-2310 lead pings | n/a | n/a |

**This census proves the owner’s charge:** pings were written; seats were not coordinated.
