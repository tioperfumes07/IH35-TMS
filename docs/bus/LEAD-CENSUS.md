# LEAD CENSUS — replace this table every lead turn

**GO current:** GO-0016
**Turn:** 2026-08-28 16:00 CT · **LEAD-SEAT=CURSOR**
**Live SHA:** `069d531`
**Delivery defect:** Desktop `IH35-SEAT-FEED` was GO-0013 while origin/main FEED was GO-0014. Seats that never git-pull missed 0014.

| Seat | ACK GO-0016? | Idle? |
|------|----------------|-------|
| CC-1 | NO until OUTBOX self-ACK | YES until ACK |
| CC-2 | NO (closed 0014 in chat; FEED was 0013) | must ACK 0016 |
| CC-3 | NO until ACK | unknown |
| Codex | NO until ACK | unknown |
| Cascade | NO until ACK | unknown |
| Devin | NO until ACK | YES if OUTBOX still GO-0002 |
| Cursor | self | NO |
