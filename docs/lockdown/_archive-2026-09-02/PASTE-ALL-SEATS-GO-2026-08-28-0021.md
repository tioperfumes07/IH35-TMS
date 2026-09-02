# PASTE ALL SEATS — GO-0021 (GO-0020 closed · leftover unique · no PROG-01 · no U14)

**THIS IS NOW.** GO-0020 is **closed as NOW**. Instruction = `docs/bus/FEED/NOW-<SEAT>.md` after `git pull --ff-only origin main`. Cursor runs `node scripts/ops/sync-seat-feed.mjs`.

Live API **`4e5db76`**. `origin/main` is **ahead**. Deploy rides Rule 42 (5–10 min **and** 5–10 PRs). **Nobody `trigger_deploy`.** Cursor only when that gate fires.

U14 never restamp. Skip #15546 #16895. Jorge is not the messenger. FAST-MERGE: local gate exit 0 → push → `gh pr create` → same-turn squash. Never `gh pr checks --watch`.

## GO-0020 credited (do not redo)

| Seat | Credited |
|------|----------|
| CC-1 | DSP-MONEY-F7132A already on main. Closed stale `LV-JE-SOURCE-LINKS-INVOICE-NOT-VISIBLE`. Narrowed VEND sample-flag residual. **Do not** pick settlement-generation features as leftover bugs. |
| CC-2 | L3 rebroadcast already shipped. **TASK-XTENANT-SCOPE** shipped (RLS/company on `tasks.task`). |
| CC-3 | BANK Plaid chrome `#17211`. BANK-F02/F03 tracker `#17219`. False RLS retracted `#17220`. Banking sweep clean except owner-gated `INFRA-F9935`. |
| Devin | Vendor PATCH `#17200` already on main. Continue unique leftover `/vendors` only. |
| Cascade | Guard-stale / registry rows 50092–50095 shipped. No product 500/dead/silent in that sweep. |

## Settled (do not reopen)

- **ACCT-F9877 / `fbeb1974`:** OWNER-GATED. Do not re-run A/P. Do not hand JE.
- **RETIRE `mdata.vendors`:** VOID. Canonical AP hub.
- **PROG-01 / `202613270000`:** **SKIP.** Jorge does not need this. Cursor does **not** author it.
- **Urgent 6:** already ran as **GO-0006** this morning (acct/bank/settl/factor/dispatch/vendors). Do **not** wait for another U6 launch.
- **KEEP TEST.** No COMPLETE. No U14 restamp.

## ACK (PREPEND OUTBOX line 1)

| Seat | ACK |
|------|-----|
| CC-1 | `CC-1 \| ACK \| GO-0021 \| NOW=leftover-usmca-money-not-9877 \| SHA=4e5db76 \| GO` |
| CC-2 | `CC-2 \| ACK \| GO-0021 \| NOW=leftover-unique-reports-cash-flow-finance \| SHA=4e5db76 \| GO` |
| CC-3 | `CC-3 \| ACK \| GO-0021 \| NOW=leftover-unique-cust-crm-or-post \| SHA=4e5db76 \| GO` |
| Codex | `CODEX \| ACK \| GO-0021 \| NOW=dispatch-unique \| SHA=4e5db76 \| GO` |
| Devin | `DEVIN \| ACK \| GO-0021 \| NOW=vendors-unique-leftover \| SHA=4e5db76 \| GO` |
| Cascade | `CASCADE \| ACK \| GO-0021 \| NOW=unique-FINDING-not-u14 \| SHA=4e5db76 \| GO` |
| Cursor | `CURSOR \| ACK \| GO-0021 \| NOW=lead+feed \| SHA=4e5db76 \| GO` |
