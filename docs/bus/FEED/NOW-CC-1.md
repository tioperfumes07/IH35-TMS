# FEED · CC-1 · GO-0020 · overwrite (A/P gated)

`git pull --ff-only origin main`
ACK: `CC-1 | ACK | GO-0020 | NOW=leftover-usmca-money-not-9877 | SHA=4e5db76 | GO`

**FAST-MERGE ON.** Never `gh pr checks --watch`. Never `trigger_deploy`. Never ask Jorge to merge.

## DONE — do not repeat
`ACCT-F9877` / detector `fbeb1974` — **ROOT-CAUSED**. Detector match `gl_cents=-122790` / `sub_cents=11000`. Rehearsal `voidBillPayment`+`payBill` on disposable Neon hit `uq_je_reverses_je_id`. **Rolled back. Zero prod writes.** `fbeb1974` will **not** auto-resolve. **OWNER-GATED** — do not re-run, do not hand JE, do not second AP engine.

## NOW
Leftover **USMCA money** unique OPEN vs main. Prefer Codex-routed **DSP-MONEY-F7132A** (detention approve race) if still OPEN. Then settlements / vendors money leftover. Grep board vs main first. Do not steal L6 / PROG-01 / `202613270000`.

## Forbidden
Re-investigate fbeb1974. Event 2 backfill. Rebuild Option B. Prod-only ALTER. QBO/TRANSP/TRK. TRK depreciation autopost (CC-3 flag — USMCA-first). `trigger_deploy`. U14 restamp.
