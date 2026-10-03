# ALL SEATS — ROUND 356 — R-3 IS DONE ON PROD. R-1 HALF DONE. HERE IS THE REST, WITH THE DISCOVERY ALREADY MADE.

I did the parts that needed no migration. **Do not re-measure these; they are live.** What is left needs
a migration lane, so it is yours.

## DONE ON PROD BY THE LEAD — 2026-10-03 03:11–03:12 UTC, USMCA

### R-3 — factoring fees are off Bank Charges. CLOSED.

    account  name                          type     subtype        parent  postings
    6400     Factoring Fees                Expense  OtherExpense   6810    0
    6405     Factoring Transaction Fees    Expense  OtherExpense   6400    0
    6830     Factoring Default Interest    Expense  OtherExpense   6810    0
    6810     Interest & Financing Expense  Expense  OtherExpense   —       0
    6820     Factoring Fees (duplicate)    Expense  OtherExpense   —       0   DEAD, left dead

All four carried 0 postings, so this was a free catalog move and not a reclassification. The reason is
written into each account's `notes` on prod so it survives me.

**Trial balance re-measured immediately after, live, under bypass:**

    debits 2,178,029.25 · credits 2,178,029.25 · difference .00 · 7,909 postings

Unchanged. The move touched no money.

### R-1 — the account exists. 6176.

    6176  Driver Damage Loss  OtherExpense / VehicleRepairs  postable  system_purpose driver_damage_loss
          created 2026-10-03T03:12:39Z

The full chain and the owner's own 3,000 / 500 / 1,500 → 1,000 case are written into its `notes` on prod.

## ALSO MEASURED SO YOU DO NOT HAVE TO — TWO THINGS THAT CHANGE THE WORK

**1. `accounting.chart_of_accounts_roles.role` is a CHECK allow-list of 66 values and `damage_loss` is
NOT in it.** That is why I could not declare the role — it needs a migration, not an insert. Existing
naming is `damage_recovery`, not `driver_damage_recovery`, so **the new role is `damage_loss`**, matching
convention. Do not invent a third naming style.

**2. `mdata.units` has NO tank-capacity column of any kind**, and it is **not scoped by
`operating_company_id`** — it carries `owner_company_id` and `currently_leased_to_company_id`. USMCA runs
leased units. Any gallon limit resolved off the unit must respect that lease model, not assume a company
column that is not there.

**One thing I checked and it is CLEAN — do not "fix" it.** The role resolver is protected by two partial
unique indexes (`uq_coa_roles_company_role_active`, `ux_coa_roles_one_active_per_company_role`), both
`(operating_company_id, role) WHERE is_active`. Zero companies have two active rows for one role. I
suspected non-determinism in `resolveRoleAccount` and I was wrong. They are redundant duplicates of each
other — note it in the key sweep, drop neither today.

## R-1 — CC-1. ONE PR.
1. Migration in **your lane (HH 00–05)**, claim inside `registry.claimed` — nothing else is read.
   Extend the `chart_of_accounts_roles_role_check` allow-list with `damage_loss`.
2. Insert the role row for USMCA → **6176**, `is_active = true`. The partial unique index enforces one
   active row; let it.
3. Resolve it through `resolveRoleAccount(client, operatingCompanyId, 'damage_loss')`. Fails closed.
4. Wire leg 3 of the chain into the settlement deduction path:
   **escrow to zero and never below → net pay to the 5% floor or past it on an owner/accountant/admin
   override → remainder to 6176.** Escrow is drawn FIRST, always.
5. **Never net 6176 against `7210 Driver Damage Recovery Income`.** Recovery and write-off are two numbers.
6. Guard `verify-driver-damage-loss-chain`, ceiling **0**. New guard, no legacy debt. A gitignored
   self-written baseline is NOT a ratchet — commit it or replace the measure.
7. Spine link written in the SAME transaction as the posting.

PROOF: the owner's case on a fork — $3,000 damage, $500 escrow, $1,500 pay — three legs pasted, escrow at
exactly $0.00 and not below (**interlocks F-1**, which is also yours), and the trial balance still at
2,178,029.25 / 2,178,029.25 / .00.

## R-2 — CC-2. ONE PR, FOLDED INTO F-3.
Owner: **"SOME TRUCKS MIGHT HAVE LARGER TANKS."** A flat 150 is wrong and the dollar cap we have is worse —
at $4.50/gal $900 is 200 gallons, at $7.00/gal it is 128, so the same policy begins flagging ordinary
full-tank fills and posting receivables **AGAINST DRIVERS** for normal fueling.

1. Migration in **your lane (HH 06–08)**: add `fuel_tank_capacity_gallons numeric` to `mdata.units`
   (CHECK > 0 when present). Do not build a lookup table. Do not assume `operating_company_id` on that
   table — see discovery 2 above.
2. Add `per_swipe_gallon_limit numeric` to `fuel.fuel_card_overage_policies`, default **150**, used ONLY
   when the unit carries no tank capacity.
3. Resolution order, exactly: **unit tank capacity → policy gallon limit → `per_transaction_limit_cents`**
   (last, and only for rows with no gallon quantity).
4. Evaluate **gallons first**: `overage_gallons = gallons − limit`; `overage = overage_gallons × unit price`.
5. Refuse an `is_active` policy that carries neither a gallon limit nor a dollar limit.
6. Non-fuel on a fuel card = personal = recover FULL, **except** repairs and authorized company spend.
7. Unchanged: approve-then-recover (A3b), signed driver contract required (FUEL-03), receivable on
   **1250 Driver Fuel-Overage Receivable**, never Cash Advance.
8. **Same PR closes F-3**: declare role `fuel_wallet_relay` for `1295 Relay Fuel Wallet`, repoint the Relay
   ingest at `resolveRoleAccount`, and constrain 1295 against a credit balance. 1295 is one of the
   accounts with no declared role, which is exactly how it drifted to **−$33,839.80** unseen.

PROOF: one large-tank unit and one small-tank unit, identical gallons, correct and DIFFERENT overage on
each · a swipe under the unit's tank producing **zero** overage · 1295 refusing a credit balance · and the
name of the funding path that was not posting.

## THE STANDING ORDER
The owner is not a decision queue. **The lead rules; seats build.** Nothing reaches him that is not a
finished engine with live proof. ROUND 352's nine points are the definition of done — eight of nine is not
done. Report **per table**: the measurement, the live row or query pasted, the guard name.

**Fix writers, not rows.** Every row here is about to be purged; the guard is what protects what the owner
types next. **Nobody seeds, feeds or demo-loads anything into USMCA, for any reason, including proof.**
