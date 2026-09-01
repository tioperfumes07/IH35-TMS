# PASTE ALL SEATS · GO-0020 · 2026-08-28

**Packet:** `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-28-0020.md`  
**One-pager (pull this, not INBOX history):** `docs/bus/FEED/NOW-<SEAT>.md`  
**Desktop mirror:** `~/Desktop/IH35-SEAT-FEED/` after `node scripts/ops/sync-seat-feed.mjs`

```
CURRENT-LAW
- USMCA only · no TMS→QBO write-back · U14 never restamp
- git pull --ff-only origin main → docs/bus/FEED/NOW-<SEAT>.md → ACK → code
- FAST-MERGE 4 min · never gh pr checks --watch · CC never trigger_deploy
- Live SHA 069d531 until next 5–10 deploy · KEEP TEST · no void-all · no 9000 fail-closed
- Idle / HOLD / awaiting next order = defect

CC-3 | 9225 | NOW=BOOKLOAD-OVERRIDE-DISPATCH-DEAD-CLICK (#17045 dead click, zero network)
CC-1 | 9223 | NOW=G1 is_sample_data THEN dual bill-pay GL (reuse poster) THEN C6 39-gap · rebase #17038/#17039
CC-2 | 9224 | NOW=BANK-F9515–9518 fail-loud · HOLD INV-10 · skip INV-1
CODEX | 9226 | NOW=/dispatch leftover unique · do not steal Override
CASCADE | NOW=unique FINDING only · do not re-file silent-catch class
DEVIN | NOW=STOP expanding 11 VEND-F · query-back after G1+Override
DEVIN-A | NOW=reproduce Override as auditor
CURSOR | LEAD · keep FEED overwrite current

ACK: SEAT | ACK | GO-0009 | NOW=<id> | SHA=069d531 | GO
```
