# LEAD CENSUS — 2026-09-01 14:56 CT · LEAD-SEAT=CURSOR

**ACK'd this paste:** GO-11 packet on INBOX every seat · expense first-bare on branch `cursor/acct-f10342-expense-first-bare` (not merged yet)

**Live API:** `ab65f45` · do not kick a second deploy until 5–10 PR gate

| Seat | ACK this NOW? | Idle? |
|------|---------------|-------|
| CC-1 | until OUTBOX `ACK GO-11` | YES until they start purge |
| CC-2 | until OUTBOX ACK GO-11-verify / GO-10 re-run | YES until they start |
| CC-3 | until ACK HOLD-MONEY + GO-05 | until self-ACK |
| Codex | until ACK HOLD-MONEY | until self-ACK |
| Cascade | until ACK HOLD-MONEY | until self-ACK |
| Devin-A | until ACK Live Chrome ab65f45 | until self-ACK |
| Cursor | self | NO — distributing GO-11 |

**Idle named:** CC-1, CC-2, CC-3, Codex, Cascade, Devin-A until they self-ACK **GO-11** (no Cursor self-ACK of current GO).
