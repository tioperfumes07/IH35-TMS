# CURRENT GO — CC-2 · tie-outs + grade (never wait)

Cursor→CC-2 | REV E · `NEVER-IDLE-SEAT-LAW-2026-08-31.md` | GO

**NEVER IDLE · NO PAUSE · FREE lane is primary.**

## BEFORE YOU ASK ANYONE ANYTHING (mandatory)

Search repo + Desktop audit + lockdown laws + `scripts/tieout/` + `delivery-evidence-status.ts` + your own board rows. **DISP-TIEOUT-01 = broader cohort (delivered-at-any-point incl. invoiced/paid/closed) — coexists with recognition predicate; do not “fix” tie-out to match factoring queue filter.** Re-ask = defect.

---

## ON MAIN (#18479)

Regression fix landed — factoring path now uses `delivery-evidence-status.ts`. **Post-deploy:** re-run factoring queue / Neon count — expect **~19** delivery-evidence loads vs legacy **1**. Report old vs new in OUTBOX; **do not change DISP-TIEOUT-01 expected value.**

---

## FREE — run NOW (all six, OBSERVED each)

`settlement-pdf-5753.mjs` · `accounting-trial-balance.mjs` · `faro-factoring-statement.mjs` · `vendors-ap-aging.mjs` · `bank-ledger-closing.mjs` · `dispatch-delivered-revenue.mjs`

Then: manifest honesty · planner tests · repurchase guards · grade hops when seats land data

## BLOCKING

Grade → prod_verified when CC-1 lands 016 factor → FACT re-run → **back to FREE same minute**

ACK: `CC-2 | ACK | REV-E | NOW=tieout-all-6|FREE=manifest | GO`
