# NOW-CURSOR — 2026-09-29 ROUND 222

## HARD LINE — DATA FREEZE (ROUND 219) + LIVE-DB GUARD LAW
Freeze tables unchanged except ROUND 222 chain exception for `accounting.expenses`
(create/void Check Creator only). Factoring STOPPED.

**LIVE-DB guards:** `REQUIRES_LIVE_DB` fails closed with no `DATABASE_URL` (ROUND 29.9-B).
Before calling a guard "broken" or another seat's blocker, re-run WITH the verified
pooled URL from Desktop master-keys. Env miss ≠ their code.

## ROUND 222 — CHECK CREATOR (owner named out loud)

### ROOT CAUSE (before code) — `docs/registers/09-29-2026-R222-CHECK-CREATOR-ROOT-CAUSE.md`
Lead saw registry=3 + live check expenses=0 and read it as "allocation without document."
**Mechanism:** `createCheck` / `assignPrintBatch` write registry+expense in **one transaction**
(rollback on failure). The three numbers **are** documents — voided seat-test fixtures:

| # | Expense | AUTH | What |
|---|---|---|---|
| 1001 | `9b5fcc6c…` | 117 | $1 AMPARTS test → voided |
| 1002 | `a7671a67…` | 120 | $1 allocator proof → voided |
| 1003 | `7728cf89…` | 122 | $1 print-path → voided (print_complete) |

Smithfield `f9c5b0e4…` $25: **voided AUTH-124** via voidCheck; still `payment_type='check'`;
never had a check_number / registry row. All four were **seat tests** — said plainly.

### THIS PR
- AUTH-125 OPEN (full chain proof, void same session)
- Guard `verify-check-registry-has-expense-document` — orphans FAIL
- Ops `scripts/ops/r222-check-creator-full-chain-proof.ts`
- Root-cause register

### AFTER MERGE
`OWNER_AUTH_ID=AUTH-125 DATABASE_URL=<prod> npx tsx scripts/ops/r222-check-creator-full-chain-proof.ts`
Paste REGISTRY / LIVE check BEFORE · MID · AFTER. Stamp AUTH-125 CONSUMED.

## DO NOT
- Steal CC-2 opening-balance / escrow held work
- Touch freeze tables outside this chain
- Leave an unvoided seat check in USMCA
- Blame live-DB guards without DATABASE_URL
