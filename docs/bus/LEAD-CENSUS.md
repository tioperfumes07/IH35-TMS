# LEAD CENSUS — 2026-08-29 (Cursor)

**Lead:** CURSOR · **Live:** `b276443` · **NOW:** GO-0055→0104

| Seat | OUTBOX top signal | INBOX TOP | Idle? |
|------|-------------------|-----------|-------|
| CC-1 | Shipping DSP-MONEY fixes; Live=UNVERIFIED cluster | GO-0055→0104 money | no if they pull |
| CC-2 | Last ACK GO-0035; GUARD lane active earlier | GO-0055 GUARD-NOW binding+TXH | needs ACK GO-0055 |
| CC-3 | Reported GO-0030→0054 complete; L6 stamps | GO-0055 FE/TEST | needs ACK |
| Codex | WORKING DSP-F7263 / many Live=UNVERIFIED | GO-0055 dispatch | working |
| Cascade | ACK GO-0030→0054 series on old SHA 4e5db76 | GO-0055 FINDING | stale SHA — rewake |
| Devin | vendors rate-limit drain; Live=UNVERIFIED | GO-0055 vendors | working |
| Devin-A | Mostly Cursor pings; no self-ACK | GO-0055 customers | **idle risk** |
| Cursor | Lead send GO-0055 + binding guard | self | active |

**Tripwire:** none this tick (seats have FEED). Devin-A idle → ping INBOX (done).
