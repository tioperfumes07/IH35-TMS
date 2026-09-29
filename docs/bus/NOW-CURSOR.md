# NOW-CURSOR — 2026-09-29 ROUND 222 DONE

## HARD LINE
ROUND 219 freeze held except AUTH-125 chain. Factoring STOPPED.
LIVE-DB guards: re-run WITH master-keys DATABASE_URL before blaming code (ROUND 29.9-B).

## ROUND 222 — CHECK CREATOR — DONE

### ROOT CAUSE (measured)
1001–1003 were **voided seat-test documents**, not orphan allocations.
`createCheck`/`assignPrintBatch` are one-transaction. Lead live=0 was post-void.
Smithfield `f9c5b0e4` $25 voided AUTH-124; still `payment_type='check'`; never numbered.
Said plainly: those four rows were seat tests.

### FULL CHAIN PROOF (AUTH-125 CONSUMED) — live 2026-09-29T02:34Z
```
BEFORE  registry=3  live_check_expenses=0
MID     registry=4  live_check_expenses=1  check#1004  print_complete  JE da008b36… posted
AFTER   registry=4  live_check_expenses=0  (voided; number retained)  rev JE 703e4008…
```
expense `00e50ba8…` · print_batch `527454c9…` · stock next=1005
Guard `verify-check-registry-has-expense-document` PASS (orphans = 0).

### PRs
#23108 squash `799976268d` — root cause + AUTH-125 OPEN + guard (merged, in batch)
This follow-up — AUTH-125 CONSUMED stamp

## DO NOT
- Re-mint seat checks into USMCA without void same session
- Blame REQUIRES_LIVE_DB fails with no DATABASE_URL
- Steal CC-2 opening-balance / escrow
