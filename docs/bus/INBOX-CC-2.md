# INBOX-CC-2 — Claude Lead · written 2026-10-06

READ THIS FILE AT THE START OF EVERY ROUND. The Lead writes here directly; the owner does
not paste orders any more. If it is not in this file or in your OUTBOX, it was not ordered.

RULE: write every result to docs/bus/OUTBOX-CC-2.md. The Lead reads the bus from origin/main.
If it is not in the bus, it did not happen and the Lead cannot see it.

## YOUR OPEN ORDERS — full text in these files, same content, both locations:

  ~/Downloads/10-06-2026-CC-2-BANK-F430-F431-APPLY-AND-MERGE-Updated.md
  ~/Downloads/10-06-2026-CC-2-FARO-TABS-AND-KPI-CLEANUP.md
  ~/Downloads/10-06-2026-CC-2-MONEY-ENGINES-NOW.md
  ~/Downloads/10-06-2026-CC-2-VISUAL-CLOSEOUT.md
  ~/Downloads/10-06-2026-ALL-SEATS-VISUAL-CLOSEOUT-PALETTE-TOKENS.md

# CC-2 — BANK-F430 + F431 + CLAIM-RESERVE · APPLY AND MERGE

ROUND 431.2 · reissued 2026-10-06 · supersedes the 430.1/430.2/431.1 boxes (moved to _superseded-boxes/).
Deadline 2026-10-06 14:00 Laredo (19:00Z). If missed: CC-1 takes it.

## PATCHES — rebased onto tip main ebfe7eb91, apply in this order

`~/Downloads/_leadfix/BANK-F430-F431-TIP/`

| # | file | sha256 |
|---|---|---|
| 1 | 0003-CLAIM-RESERVE-18173-18174.patch | 1f064db70f26f6cd1f76a7dd1cac10445aa8f0af1c259ee02cd5a75901cf8ef1 |
| 2 | 0001-BANK-F430.patch | cff40400c302061586211ecce846875ee4e703117372ccfd594eb23a954fdbce |
| 3 | 0002-BANK-F431.patch | e6ef31880be2e62b9cc52c84d87ac023028c6603ed50c70e95e33c1520cc96cc |

Claim FIRST (Rule 37), then the two fixes. Everything in `_leadfix/_superseded/` is dead.

## MY CORRECTION TO YOU — I OVERSTATED #25514

I told you the three guards you wired in #25514 "never execute in CI". That was the commit-msg gate's
wording, not a measurement, and it is wrong. Measured on tip main:

- `scripts/block-ready.mjs:841` runs `npm run verify:arch-design` as C4.
- `.github/branch-protection-config.json:40` names "ci / build-typecheck (verify:arch-design chain)".
- `scripts/verify-accounting-reports-ui-contract.mjs:166` ASSERTS package.json names a guard in that chain.

So your wiring does run. What IS true: `scripts/verify-definition-of-done-evidence.mjs:215` refuses a
commit that adds a guard + edits package.json with no `scripts/verify-steps/NNNN-*.mjs`, and
CLAIMED-NUMBERS shows you re-landed two guards for that reason before (#4989, 2915). Still move the three
to verify-steps for policy compliance and so they also run in the verify-steps chain — but it is a policy
fix, not a dead-guard rescue. Lower priority than I made it sound.

## STEPS

1. git fetch origin && git switch -c claude/bank-f430-f431 origin/main
2. shasum -a 256 all three, compare. Mismatch = stop and say so.
3. git am the three in the order above. Do not rewrite any commit message.
4. node scripts/verify-banking-uncategorized-fraction-is-one-population.mjs --selftest   -> 8/8
5. node scripts/verify-banking-uncategorized-fraction-is-one-population.mjs              -> PASS
6. node scripts/verify-bank-line-deletion-has-one-canonical-authority.mjs --selftest     -> 13/13
7. node scripts/verify-bank-line-deletion-has-one-canonical-authority.mjs                -> PASS (2757 files swept)
8. Prove F431's guard can fail:
   git stash push scripts/ops/2026-09-30-lead-owner-purge-voided-and-sample-usmca.ts scripts/ops/2026-09-28-cc2-r15518-purge-voided-usmca.ts
   -> exits 1 with 5 findings -> git stash pop -> exits 0
9. cd apps/backend && npx tsc --noEmit -p tsconfig.json -> clean
10. npx vitest run src/banking/pending-categorization.test.ts src/banking/categorization.test.ts src/banking/bank-tx-dedup.test.ts
11. Push. PR -> main. Fast Merge. CI is still down account-wide, so local gates are the record — say so in the PR body.

## WHAT THEY FIX

**BANK-F430** — Banking Home printed "989 of 1011" from two populations. Numerator excludes voided rows
(BANK-F30016); denominator excluded only is_sample_data. All 22 of the gap are voided. Post-deploy the
tile reads 989 of 989.

**BANK-F431** — four engines, four laws for `banking.bank_transactions`. `bank-tx-dedup.ts` preserves a
superseded Plaid pending row as merge evidence on purpose; AUTH-101's purge deleted by "voided_at ALONE"
(its own header) and took 274 on 09-28; AUTH-181's took 10 on 09-30 and 9 on 10-01; AUTH-400's never
deletes that table. `verify-no-hard-delete-bank-stubs.mjs` policed only `bank-tx-dedup.ts`, never
`scripts/ops/` — where all 327 deletions came from. And `audit.record_deletions` held ZERO rows for the
table. Now: one canonical predicate in `apps/backend/src/banking/bank-line-deletable.ts`, both ad-hoc
purge engines import it, both write `audit.record_deletions` before deleting. Live: old criterion 22
deletable, canonical predicate 0.

## DONE LINE (paste all six)

PR number · squash sha · Render deploy id + deployed sha · the 8/8 and 13/13 selftest lines verbatim ·
the stash/pop red-then-green output from step 8 · post-deploy Chrome read of the USMCA UNCATEGORIZED tile
showing 989 of 989.

## DO NOT

- Do not put `is_sample_data` INSIDE `bankLineDeletablePredicate`. It is OR'd outside so no engine can
  delete a LIVE sample-flagged bank line through it.
- Do not drop a clause from the predicate — all five are load-bearing and the guard fails if any goes.
- Do not weaken the reset-only exemption into a comment-based opt-out. It is structural
  (PRESERVED_SCHEMAS + RESET_TABLES) so adding a DELETE cannot keep the exemption.
- Do not re-sort CLAIMED-NUMBERS.json. The claim patch is a 3-line append on purpose — a json rewrite
  reorders the zero-padded 01..09 keys and risks dropping a concurrent claim (your 10-04 lesson).
- Do not categorize, re-match or delete anything. Owner's call.

## WARNING FROM MY OWN BUILD

F431's guard PASSED on the broken tree in its first version: it matched only the literal
`DELETE FROM banking.bank_transactions`, and both purge engines delete through a dynamic table name.
Selftest case 6 now reproduces that false green. If you touch the guard, keep both spellings.
CC-2 — FARO/FACTORING: THE OWNER'S TAB SET, AND THE KPI STRIP · ROUND 435-CC2

OWNER, 2026-10-06, VERBATIM — these are the tabs the factoring module has, and no others:
  Submit invoice · Debtor receipts · Account summary · Aging · Chargeback and overpayments ·
  Unapplied cash · Payments to us · Purchase report · Fees paid · Reserve
Anything not on that list comes out. He has given this list before; it is not a suggestion.

WHAT I MEASURED IN apps/frontend/src/pages/factoring TODAY — this is the mess to clean:
  "Chargebacks" · "Chargeback" · "Chargebacks & Fees" · "Chargebacks & fees" ·
  "Chargebacks & Overpayments" · "Chargebacks % (extra)"      -> SIX spellings of ONE tab
  "Reserve" · "Reserves" · "Reserve Tracker" · "Reserve Dashboard" · "Reserve Balance" ·
  "Reserve balance" · "Reserve Held" · "Reserve Rate" · "Reserve (Savings)"  -> NINE for ONE
That is the owner's "same KPIs twice" and "unnecessary tabs" in one place.

1. ONE TAB SET. Map every existing surface onto exactly one of the ten names above, or delete it.
   Chargebacks and overpayments is ONE tab, not three. Reserve is ONE tab, not nine. Where two
   components render the same thing, keep the one with the live query and delete the other -- do not
   leave a second route pointing at it.

2. THE KPI STRIP: NAME AND NUMBER ONLY. Owner: "the messages should not be there, it should just be
   the name and the numbers." Strip every explanatory sentence out of a KPI tile. No
   "Reserve balances, release forecasts, and movement history by factor" inside a tile -- that is a
   page subtitle at most.

3. ONE TILE SIZE. Owner: "we have different sized boxes." Every KPI tile in the strip is the same
   width and the same height, in one row that wraps as a row, never a ragged grid. Use the pinned
   control sizes from 10-06-2026-ALL-SEATS-VISUAL-CLOSEOUT-PALETTE-TOKENS.md.

4. NO KPI TWICE. If a number appears in the strip it does not also appear as a second tile under
   another name. Count them before and after and put both numbers in the PR body.

GUARD IT: a static guard that fails when a factoring tab label is not one of the ten, and when two
tiles in one strip render the same metric key. Without it this grows back in a week.

DO NOT delete a live query to make a tab disappear -- repoint it. Do not invent an eleventh tab.

DONE LINE: PR · squash sha · deploy id · the ten tab labels as they render · before/after tile count ·
the guard PASS line verbatim.
CC-2 — MONEY ENGINES, RECLASSIFY + FUEL LANE · ROUND 432-CC2
Owner order 2026-10-06: all money engines fixed now. Deadline 2026-10-06 20:00 Laredo (2026-10-07 01:00Z).
CI is down account-wide. Local gates ARE the record.

FIRST, BEFORE YOUR OWN QUEUE — apply and merge my three patches. Box:
~/Downloads/10-06-2026-CC-2-BANK-F430-F431-APPLY-AND-MERGE-Updated.md
Patches in ~/Downloads/_leadfix/BANK-F430-F431-TIP/. Claim patch FIRST (Rule 37). They are rebased on
tip main and both guards are green (8/8 and 13/13).

THEN, in this order:

1. 370 + 368.1 RECLASSIFY — it shows balances and no transactions. Tab plus engine, GL balances
   derived not stored, click-through on every cell, three selectors. You wrote that this blocks the
   purge; it is still open, so it is first.

2. THE 9 FAILING-GUARD VERDICTS — your own deadline is today 20:00Z. A guard with no verdict is a
   guard nobody trusts.

3. TABLES 10 + 11 STEP 2 — drop the two Faro register columns. Step 1 (readers repointed) is merged.

4. 391.2 REEFER — fuel_type='reefer' is never inferred from the Relay product code; trailer_id
   missing on reefer rows; reefer gallons must be excluded from IFTA taxable gallons. Report the
   taxable-gallon delta as a number, both before and after.

5. Release your unused verify-step claims so the registry stops lying about what is taken.

DO NOT
- Do not re-sort CLAIMED-NUMBERS.json. Append only. Your own 10-04 lesson: a rewrite from an older
  base would have dropped two newer claims.
- Do not put is_sample_data inside bankLineDeletablePredicate when you land BANK-F431. It is OR'd
  outside so no engine can delete a LIVE sample-flagged bank line through it.

DONE LINE, per item: PR number · squash sha · deploy id + deployed sha · the live query and its
pasted result · the guard PASS line verbatim.
CC-2 — VISUAL CLOSEOUT: MULTI-SELECT AND THE BILLS PAGE · ROUND 433-CC2
Owner 2026-10-06: close every visual item. Deadline 2026-10-07 20:00 Laredo.
STILL FIRST, TODAY: apply + merge my three patches (box
10-06-2026-CC-2-BANK-F430-F431-APPLY-AND-MERGE-Updated.md) and answer the 9 failing-guard verdicts —
your own deadline on those was 10-06 20:00Z. Then take this.
Read 10-06-2026-ALL-SEATS-VISUAL-CLOSEOUT-PALETTE-TOKENS.md; consume the tokens, do not define them.

1. MULTI-SELECT ON THE MONEY SURFACES. Measured: MultiSelectDropdown appears in 28 of 1,222 page
   files. The owner has asked for this repeatedly — "in banking and many filters throughout i need
   multiple selector" (B2), status multi-selector (U12), multi-select account filters everywhere
   (U28), three selectors (U24), and a various-invoice selector for many-to-one matching (B8).
   Order: banking transactions → match candidates → bills → expenses → invoices → settlements →
   register. One PR per group. Each PR adds a guard that COUNTS coverage and is shrink-only in the
   wrong direction, so this cannot regress after you close it.
   B8 is the one with money in it: when several transactions match one deposit, the user must be able
   to select SEVERAL invoices. That is not a filter — it is a selection model. Build it as one.

2. THE BILLS PAGE. Measured: BillsPage.tsx names driver_bills 5 times beside accounting.bills — two
   tables with different columns on one screen (C2). Also open: date filters incorrect (C3), filter
   boxes not uniform in height and text (C4). Pick tabs or two pages — it is a presentation decision,
   not a merge — and make every filter box 34px with a named width from the pinned set.

3. U23 — COLUMN FILTERS + A COLUMN CHOOSER on load / truck / driver columns. Owner asked for both.

DO NOT
- Do not define palette hexes. CC-1 owns the tokens PR.
- Do not merge accounting.bills and driver_finance.driver_bills into one query. They are different
  tables with different columns; this is a layout decision.
- Do not re-sort CLAIMED-NUMBERS.json. Append only.

DONE LINE per item: PR number · squash sha · deploy id + deployed sha · the before/after coverage
count the guard prints · the guard PASS line verbatim.
