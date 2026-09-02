# PASTE ALL SEATS — GO-0022 · DRAIN UNTIL LAUNCH-READY (Urgent 6 first, then every leftover module)

**THIS IS NOW. It does not expire after one finding.**  
Owner: Urgent 6 modules must become **launch-ready**. Idle = defect. Waiting for the next GO = defect. One-task NOW = defect.

`git pull --ff-only origin main`  
Instruction = **this packet** + `docs/bus/FEED/NOW-<SEAT>.md` (overwrite).  
Cursor runs `node scripts/ops/sync-seat-feed.mjs` → `~/Desktop/IH35-SEAT-FEED/`.

Live API `GET https://api.ih35dispatch.com/api/v1/healthz/shallow` → `version`. **Live Chrome counts only on that SHA.** Main-ahead ≠ live.

**Never restamp U14 exclusive table.** Drain unique leftover until **CERTIFIED COMPLETE** = Fully-Wired **1–12** + Live Chrome on **current** healthz + **zero unique OPEN leftover** (`docs/lockdown/CERTIFIED-MEANS-ZERO-UNIQUE-LEFTOVER-LAW-2026-08-24.md` + `FULLY-WIRED-COMPLETE-BAR-2026-08-13.md`). McLeod / Alvys / QBO-product / NetSuite quality. Not scoreboard. Not CI-green. Not a stamp from August.

KEEP TEST on books. CREATE-TEST-THEN-VOID. Empty TMS expected. No TMS→QBO write-back. USMCA only. FAST-MERGE: local gate exit 0 → push → PR → same-turn squash. Never `gh pr checks --watch`. **Nobody `trigger_deploy` except Cursor on the 5–10 min AND 5–10 PR gate.** Skip #15546 #16895.

## The loop (next 500 — every seat)

Until **your assigned modules** are CERTIFIED COMPLETE:

1. Grep board vs `origin/main`. Do not redo shipped.
2. Prove one unique **500 / dead click / silent no-op** (money: Neon reverse-empty) **live**.
3. Fix root + guard + FAST-MERGE.
4. File `GUARD-WORKORDERS.md` same turn if another lane.
5. **Immediately** start the next unique on the **same module**. Do not ACK and watch.
6. When that module has **honestly zero unique leftover** on current live SHA, **take the next module in YOUR list below**. Do not wait for GO-0023.

Cap is **not** 500. 500 means **do not stop at 1 or 2**. Drain.

## Urgent 6 — drain these first (launch-ready)

| # | Module | Route | Seat that **owns the drain** |
|---|--------|-------|------------------------------|
| 1 | accounting | `/accounting` | **CC-1** |
| 2 | banking | `/banking` | **CC-2** |
| 3 | settlements | `/settlements` | **CC-1** (after accounting unique is moving; serial money) |
| 4 | factoring | `/factoring` | **CC-3** |
| 5 | dispatch | `/dispatch` | **Codex** |
| 6 | vendors | `/vendors` | **Devin** (product unique). **CC-3** does not steal Devin’s `/vendors` URL. |

## After Urgent 6 (same loop, no new GO)

| Seat | Next modules (in order) |
|------|-------------------------|
| CC-1 | remaining USMCA **money** unique (customers money, fuel money if OPEN) — never `/425c` loop |
| CC-2 | `/reports` → `/cash-flow` → `/finance` → `/tasks` leftover POST unique (never GL) |
| CC-3 | `/customers` CRM leftover → leftover POST not owned by CC-2 |
| Codex | leftover `/dispatch` until dry, then steal **claimed** next (fuel/dispatch-adjacent). Never restamp customers/drivers/fleet U14. |
| Devin | `/vendors` until dry. One Devin. ACCT-F5436 = do not SQL-deactivate duplicates (code/name-match only if still a unique leftover). |
| Cascade | unique FINDING overlay **every** Urgent-6 + leftover POST surface. Append ledger. Never restamp U14. Never product-steal CC-1 money. |
| Cursor | Lead. Census every turn. Ping idle same turn. FAST-MERGE bus. Deploy 5–10. Cursor-lane FE unique only as overflow. |

## Accounting 9877 (CC-1 — CODE, not a Jorge question)

`ACCT-F9877` / detector `fbeb1974`: **fix the posting engine** so `executeSourceReversalOnClient` recognizes reversals already created via `reverseJournalEntryNoFlip` / `postVoidReversal` (do not double-reverse; `uq_je_reverses_je_id`). Reversal JEs **inherit** `is_sample_data` from the reversed JE. Rehearse on disposable Neon. **Do not** ask Jorge. KEEP TEST. Do not void-all-TEST.

## Forbidden (all seats)

HOLD / “watching FEED” / “ready for next packet” / one finding then idle. U14 restamp. TRANSP/TRK/QBO campaigns. `trigger_deploy` (non-Cursor). Dual-Devin. PROG-01 `202613270000`. Body-scoped vendor PATCH.

## ACK (PREPEND OUTBOX line 1) then **work** — ACK is not done

| Seat | ACK |
|------|-----|
| CC-1 | `CC-1 \| ACK \| GO-0022 \| NOW=drain-accounting-then-settlements \| SHA=<healthz> \| GO` |
| CC-2 | `CC-2 \| ACK \| GO-0022 \| NOW=drain-banking-then-post \| SHA=<healthz> \| GO` |
| CC-3 | `CC-3 \| ACK \| GO-0022 \| NOW=drain-factoring-then-crm \| SHA=<healthz> \| GO` |
| Codex | `CODEX \| ACK \| GO-0022 \| NOW=drain-dispatch \| SHA=<healthz> \| GO` |
| Devin | `DEVIN \| ACK \| GO-0022 \| NOW=drain-vendors \| SHA=<healthz> \| GO` |
| Cascade | `CASCADE \| ACK \| GO-0022 \| NOW=unique-FINDING-overlay \| SHA=<healthz> \| GO` |
| Cursor | `CURSOR \| ACK \| GO-0022 \| NOW=lead-drain-census-deploy \| SHA=<healthz> \| GO` |
