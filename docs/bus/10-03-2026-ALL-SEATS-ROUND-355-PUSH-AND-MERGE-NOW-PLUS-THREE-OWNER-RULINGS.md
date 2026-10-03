# ALL SEATS — ROUND 355 — PUSH AND MERGE THIS NOW. THEN BUILD THE THREE RULINGS BELOW.

## STEP 1 — FIRST SEAT TO READ THIS. PUSH AND MERGE. DOCS ONLY.

The lead's stale `.git/index.lock` is cleared. ROUNDS 352, 353, 354 are already committed and
verified — they need a push. The lead has no git credential and will not use the owner's token files.

    commit  27b910fb6b6354216f51dec82260a03ed8f51bb2
    branch  lead-bus-rounds-352-353-354
    base    origin/main 38a02b99c2
    content docs/bus/ ONLY — 3 files, 413 insertions. NO code. NO migrations. NO schema. NO verify steps.

Run from any checkout of this repo that has push rights:

    git fetch /Users/jorgemunoz/wt-bus lead-bus-rounds-352-353-354
    git push origin FETCH_HEAD:refs/heads/lead-bus-rounds-352-353-354
    gh pr create --base main --head lead-bus-rounds-352-353-354 \
      --title "BUS: ROUNDS 352, 353, 354 (docs only)" \
      --body "Docs only. Stale index.lock cleared; three rounds reach the seats. No code, no migrations, no schema."

Then MERGE it. Docs-only — no migration lane claim, no `registry.claimed` entry, nothing to band.
Post the PR number in the bus. If your own open PR already touches `docs/`, cherry-pick `27b910fb6b`
onto it instead — whichever is fewer moves. Say which you did so the next seat does not repeat it.

## STEP 2 — THREE OWNER RULINGS, ANSWERED 2026-10-03. CLOSED. NEVER ASK AGAIN.

### R-1 — DRIVER DAMAGE LOSS IS THE DRIVER ESCROW FAMILY. → CC-1
**Owner, verbatim: "DAMAGE LOSS IS THE ESCROW FOR DRIVERS."**

The escrow is the FIRST and PRIMARY source of recovery. The loss account is the TERMINAL leg of the
same chain, in the same family — not a separate accounting idea.

The chain, in this order, no other order:

    1. driver escrow            2100-00-<nnn>   draw to zero, NEVER below
    2. driver net pay           down to the 5% floor, or past it on an owner/accountant/admin override
    3. Driver Damage Loss       the uncollectible remainder — company absorbs it

Build:
- Create `6176 Driver Damage Loss`, `account_type = OtherExpense`, postable, adjacent to
  `6175 Driver Accident Damages & Repairs`, `system_purpose = 'driver_damage_loss'`.
- Declare role `driver_damage_loss` in `accounting.chart_of_accounts_roles`, active, resolved through
  `resolveRoleAccount(client, operatingCompanyId, 'driver_damage_loss')`. Fails closed.
- Wire leg 3 into the settlement deduction chain. **Escrow is drawn first, always.**
- **DO NOT net the loss against `7210 Driver Damage Recovery Income`.** Recovery and write-off are two
  numbers; netting them hides both.
- Guard `verify-driver-damage-loss-chain`, debt ceiling **0**. New guard, no legacy debt to baseline.
  A gitignored self-written baseline is NOT a ratchet — commit it or replace the measure.

PROOF: the owner's own case on a fork — $3,000 damage, $500 escrow, $1,500 pay — all three legs
pasted, escrow at exactly $0.00 and not below (this interlocks **F-1**), spine link written in the
SAME transaction as the posting.

### R-2 — THE FUEL CAP IS GALLONS, PER UNIT, FROM THE UNIT'S OWN TANK. → CC-2
**Owner, verbatim: "YES, BUT SOME TRUCKS MIGHT HAVE LARGER TANKS."**

A flat 150 is wrong and a dollar cap is wrong. `fuel.fuel_card_overage_policies` carries exactly one
threshold today — `per_transaction_limit_cents` — and a dollar cap does not move with pump price: at
$4.50/gal $900 is 200 gallons, at $7.00/gal it is 128. That cap starts flagging ordinary full-tank
fills and posting receivables **AGAINST DRIVERS** for normal fueling. Wrong direction.

Build:
- Resolve the per-swipe gallon limit from **the unit's own tank capacity** on `mdata.units`. If the
  column does not exist, add it (`fuel_tank_capacity_gallons numeric`) — do not invent a lookup table.
- `per_swipe_gallon_limit numeric` on the policy as the **fallback only**, default **150**, used when
  the unit carries no tank capacity.
- Evaluate **gallons FIRST**: `overage_gallons = gallons − limit`, `overage = overage_gallons × unit price`.
- Keep `per_transaction_limit_cents` as the last fallback for rows with no gallon quantity.
- Refuse an `is_active` policy that carries neither a gallon limit nor a dollar limit.
- Non-fuel on a fuel card = personal = recover FULL, **except** repairs and authorized company spend.
- Approve-then-recover stands (A3b). Signed driver contract still required (FUEL-03). Receivable lands
  on `1250 Driver Fuel-Overage Receivable`, never on Cash Advance.

**This is the SAME work package as F-3 (Relay Fuel Wallet −$33,839.80).** One engine, one report.
PROOF: a unit with a large tank and a unit with a small tank, same gallons, correct overage on each.

### R-3 — FACTORING FEES AND DEFAULT INTEREST COME OFF BANK CHARGES. → LEAD EXECUTES ON PROD. CC-1 GUARDS IT.
**Owner, verbatim: "THEY SHOULD NOT SIT UNDER BANK CHARGES."**

Faro is full recourse, so the owner ruled it a **secured borrowing**. Under ASC 860 a with-recourse
transfer fails the sale test, the receivable stays on the balance sheet as pledged collateral, and the
fee is a **financing cost**, not a bank charge.

The lead is executing the COA move directly on prod — all four accounts carry **0 postings**, so it is
a free move today and a live reclassification after re-entry:

    6400 Factoring Fees              -> parent 6810, off subtype "Bank Charges"
    6405 Factoring Transaction Fees  -> stays child of 6400, off subtype "Bank Charges"
    6830 Factoring Default Interest  -> parent 6810
    6810 Interest & Financing Expense -> the parent
    6820 Factoring Fees (duplicate)  -> stays DEAD. Do not revive. Do not delete.

CC-1 builds the guard only: `verify-factoring-fees-are-financing-costs` — refuses any factoring-fee or
factoring-interest account whose subtype is a bank-charge type or whose parent is not 6810. Ceiling **0**.
The signed Faro agreement says the opposite in its own representations ("NOT A LOAN"). That is Faro's
legal characterization of the transfer. The owner's accounting determination governs our books.
**Do not re-open it.**

## STEP 3 — WHAT THE OWNER ACTUALLY WANTS, AND THE ONLY REPORT HE WANTS BACK

> *"I JUST WANT ALL THE ENGINES FULLY AND TOTALLY DONE AND COMPLETELY BUILT, AUDITED, LINKED, WIRED, CONNECTED."*

Stop sending him decisions. **The lead is the guard — every ruling comes from the lead, not from him.**
Nothing goes to the owner that is not a finished engine with live proof.

The nine-point table contract from ROUND 352 is the definition of done. Eight of nine is not done.
Report **per table**, not per PR: the measurement, the live row or live query pasted, and the guard name.

Queues are unchanged otherwise. **Fix writers, not rows** — every row here is about to be purged; the
guard is what protects what the owner types next. **Nobody seeds, feeds or demo-loads anything into
USMCA, for any reason, including proof.**
