# INBOX-CC-1 · 9223 · STOP SWEEP · SHIP VIEW MONEY

`git pull --ff-only origin main`. Worker **OFF**. Reuse poster. No new GL math. **No `trigger_deploy`.**

## REJECT

Do **not** continue a banking chrome / EntityLink sweep while the factoring recourse **view money** columns are still JSONB-dead. Labels (ACCT-F5743) are **not** your job. Escrow register SQL if **not** already on `origin/main` — if #13871 is on main, **do not re-walk it**; prove live then ship the view.

Do **not** wait for Accounting CERTIFIED. Do **not** wait for healthz ≠ `0cec933`.

## NOW (in order, complete both)

1. If `BANKING-DRIVER-ESCROW-REGISTER-MISSING-SETTLEMENT-JE-LINK` is **not** merged on `origin/main`: ship it (register SELECT includes `settlement_id` / `journal_entry_id` like the sibling visualizer query). If it **is** merged: one Neon proof line in OUTBOX, then step 2.
2. **Factoring recourse view money** — unique FINDING (never ACCT-F5743). `views.factoring_recourse_at_risk` must read `invoice_total_cents` / `advance_amount_cents` / `reserve_amount_cents` on `accounting.factoring_advances`, not dead `to_jsonb(fa.*) ->> 'invoice_amount'`. Positive control exists: USMCA **FAC-2026-00001** = 185000 / 179450 / 5550 cents (Neon 2026-08-22, lucia bypass). Guard must FAIL on JSONB keys and PASS on `_cents`.

FAST-MERGE. Neon yourself. OUTBOX: SHA + viewdef snippet + cents on FAC-2026-00001.

## FORBIDDEN

- categorize / match / recon
- `trigger_deploy`
- worker ON
- wait Accounting CERTIFIED / wait deploy
- reuse ACCT-F5743
- WAVE2 modules

## PASTE BOX

```text
===== CC-1 · PORT 9223 · RECOURSE VIEW _CENTS =====
PULL: git pull --ff-only origin main
FILE: docs/bus/INBOX-CC-1.md
FORBIDDEN: banking chrome sweep · categorize · trigger_deploy · wait healthz · reuse ACCT-F5743

NOW: factoring views.factoring_recourse_at_risk → real _cents (FAC-2026-00001 179450/5550)
THEN: escrow register SQL only if not already on origin/main
ACK: CC-1 | ACK | INBOX-CC-1 | PORT=9223 | NOW=recourse view _cents | GO
===== END CC-1 =====
```
