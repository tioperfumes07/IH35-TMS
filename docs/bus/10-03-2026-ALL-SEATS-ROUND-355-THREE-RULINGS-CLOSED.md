# ROUND 355 — THREE OWNER RULINGS CLOSED 2026-10-03 — NEVER ASK AGAIN

Owner closed these. Lead executes / seats build. No owner questions.

## STEP 1 — DONE

PR #24328 MERGED (docs only, ROUNDS 352/353/354). Tip includes
`docs/bus/10-03-2026-ALL-SEATS-ROUND-352-*.md` through ROUND 354. First seat that could push
did; content is on `origin/main` as squash `3b9b9d2aa2`.

## R-1 — DRIVER DAMAGE LOSS IS THE DRIVER ESCROW FAMILY → CC-1

Owner: "DAMAGE LOSS IS THE ESCROW FOR DRIVERS."
Escrow FIRST and PRIMARY. Loss is the TERMINAL leg of the same chain.

1. driver escrow `2100-00-<nnn>` — draw to zero, NEVER below
2. driver net pay — to the 5% floor, or past it on owner/accountant/admin override
3. Driver Damage Loss — the uncollectible remainder — company absorbs it

Build:
- Create `6176 Driver Damage Loss`, OtherExpense, postable, `system_purpose='driver_damage_loss'`
- Declare role `driver_damage_loss`, active, via `resolveRoleAccount` (fail closed)
- Wire leg 3 into the settlement deduction chain; escrow drawn first always
- DO NOT net against `7210 Driver Damage Recovery Income` — two numbers, not one
- Guard `verify-driver-damage-loss-chain`, ceiling 0 (committed baseline, not gitignored)

PROOF: fork case $3,000 damage / $500 escrow / $1,500 pay — three legs pasted, escrow exactly
$0.00 and not below (interlocks F-1), spine link in the SAME transaction.

## R-2 — THE FUEL CAP IS GALLONS, PER UNIT, FROM THE UNIT'S OWN TANK → CC-2

Owner: "YES, BUT SOME TRUCKS MIGHT HAVE LARGER TANKS."
Flat 150 and dollar caps are wrong.

Build:
- Resolve gallon limit from `mdata.units.fuel_tank_capacity_gallons` (add column if missing)
- `per_swipe_gallon_limit` on the policy as FALLBACK only, default 150
- Evaluate gallons FIRST: overage = (gallons − limit) × unit price
- `per_transaction_limit_cents` last fallback when no gallon quantity
- Refuse an `is_active` policy carrying neither limit
- Non-fuel on a fuel card = personal = recover FULL (except repairs/authorized spend)
- Approve-then-recover stands; signed contract required; receivable on `1250` never Cash Advance
- Same package as F-3 (Relay Fuel Wallet −$33,839.80). One engine, one report.

PROOF: large-tank unit and small-tank unit, same gallons, correct overage on each.

## R-3 — FACTORING FEES COME OFF BANK CHARGES → LEAD ON PROD · CC-1 GUARD

Owner: "THEY SHOULD NOT SIT UNDER BANK CHARGES."
ASC 860 financing cost. All four accounts had 0 postings — free reclass.

Locked shape (LIVE PROVEN 2026-10-03 on `br-fancy-credit-akjnd07a`, lucia bypass, USMCA):

| number | name | parent | subtype | postings | status |
|--------|------|--------|---------|----------|--------|
| 6400 | Factoring Fees | 6810 | OtherExpense | 0 | live |
| 6405 | Factoring Transaction Fees | 6400 | OtherExpense | 0 | live |
| 6830 | Factoring Default Interest | 6810 | OtherExpense | 0 | live |
| 6810 | Interest & Financing Expense | — | OtherExpense | 0 | live parent |
| 6820 | Factoring Fees (duplicate) | — | OtherExpense | 0 | DEAD |

Lead: CoA already matches the ruling on prod — no further UPDATE required. Guard
`scripts/verify-factoring-fees-are-financing-costs.mjs` locks ceiling 0 (refuses bank-charge
subtype or wrong parent; 6820 must stay dead).

Do not re-open Faro's "NOT A LOAN" representation vs the owner's accounting determination.

## REPORT BACK — ROUND 352 NINE-POINT TABLE CONTRACT

Report PER TABLE with measurement + live row/query + guard name. Eight of nine is not done.
Fix writers, not rows. Nobody seeds/feeds/demo-loads USMCA for any reason including proof.
