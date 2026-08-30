# GO — USMCA LIVE BOOKS IN THE TMS (owner 2026-08-30)

**THIS IS NOW.** Owner: put **invoices, settlements, and factoring** on **USMCA in the TMS** and test with **real August data**.

Law: `docs/lockdown/QBO-TRANSP-FILE-IS-USMCA-BOOKS-MATCH-LAW-2026-08-30.md`  
Specimen: `docs/lockdown/Coders-Faro/CC-1/CC-1-HUMAN-SEQUENCE-REPLAY.txt`  
Pack: `docs/lockdown/Coders-Faro/`

## Match (every seat)

1. Faro purchased ↔ AlwaysTrack **PO / W.O.**
2. No AT load (outage ~08/10) ↔ QBO **001–013** on TRANSP-keyed mirror (**that QBO file was renamed to USMCA**).
3. **Remainder** (AT not on Faro, QBO `13xxx` not on Faro, bank direct-pay) **must still be created or named** — not dropped.

No TMS→QBO write-back. No silent SQL. **Through the app**, date order. `is_sample_data` **FALSE** (real books). USMCA opco only. Skip PRs **#15546** **#16895**. Never recertify U14. Never `trigger_deploy` except Cursor.

## Seat NOW

| Seat | NOW |
|------|-----|
| **CC-1** | Money. **L13512 specimen first** (12 UI steps). Then Faro **33** invoices + AT loads + QBO **007** (ITS — QBO $250 vs Faro $350, report both, do not invent an AT load). Then USMCA **settlements** (USMCA loads only on mixed AT settlements). Then **factoring submit + fund** Faro. Names still blocking a customer → finish that customer then continue. Blocker = FINDING, keep going. |
| **CC-2** | Grade, do not build. **007 gate is unblocked** (QBO doc exists). Grade Faro math on live rows as CC-1 creates them. Standing-by = defect. USER-VERIFY-01 stays UNVERIFIED. |
| **CC-3** | Unique leftover FE only. Do not create invoices/settlements/factoring. Never deploy. |
| **Codex** | ITEM 2 only (closed-loop guards). No money. No migrations. |
| **Cascade** | Unique FINDING (500 / dead / silent). Do not recertify. Do not build books. |
| **Cursor** | Lead. Wire Faro proceeds → **GL 1296** (not global `cash_clearing`). Deploy 5–10. Census. If CC-1 step 8 fails unwired 1296, that is a FINDING **and** Cursor fixes it same wave so the rest of the 33 can fund. |

ACK: `SEAT | ACK | USMCA-LIVE-BOOKS | NOW=<row> | GO`
