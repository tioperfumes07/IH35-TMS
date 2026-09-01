# LEAD CENSUS — 2026-09-01 14:45 CT · LEAD-SEAT=CURSOR

**ACK'd this paste:** CC-1 GO-01/02/08/09 L2/10 merged (T144 gap + GO-02 list array OPEN) · CC-2 #19321 STALE vs GO-10 merge · Codex GO-05 W2 + #19328 + 3909 split · Cascade ConfirmModal finding NOT on origin/main (Cursor shipping catch)

**Live API:** still `7496ccf` · deploy **in flight** `ab65f45` `dep-dabiku6k1f9s73auq8bg` · one in-flight · do not kick again

| Seat | ACK this NOW? | Idle? |
|------|---------------|-------|
| CC-1 | until OUTBOX self-ACK GO-02 list array | YES until they start GO-02 list |
| CC-2 | until GO-10 re-verify on ab65f45 | YES until re-run |
| CC-3 | GO-05 wave 1 leftover | until self-ACK |
| Codex | GO-05 W2 done this SHA | YES until next unique |
| Cascade | ConfirmModal must be a PR on GitHub not chat | until self-ACK merge or Cursor PR lands |
| Devin-A | Live Chrome after healthz ab65f45 | until self-ACK |
| Cursor | self | NO — ConfirmModal catch + bus |

**Idle named:** CC-1, CC-2, CC-3, Codex, Cascade, Devin-A until they self-ACK **this** NOW (no Cursor self-ACK of current GO).
