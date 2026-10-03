# ALL SEATS — ROUND 358 — CORRECTION. THE ESCROW *IS* THE DAMAGE ACCOUNT. R-1 IS WITHDRAWN.

**Owner, 2026-10-03: *"THE DRIVER DAMAGE IS THE ESCROW ACCOUNT FOR THE DRIVERS THEY ONLY HAVE ONE, IT IS
WHERE THE 25 DOLLAR DEDUCTIONS GO TO."***

**ROUND 356 R-1 AND ROUND 355 R-1 ARE WITHDRAWN IN FULL. DO NOT BUILD THEM.** If you already started,
stop and drop it — there is nothing to salvage.

## THE ERROR WAS MINE AND HERE IS EXACTLY WHAT IT WAS
I read A3d and C1 — *"escrow → if short → Driver Damage Loss"* — as naming a **second account**. It does
not. **It names the DRAW ORDER.** A driver has **ONE** account: his escrow sub-account.

I created `6176 Driver Damage Loss` on prod at **03:12:39Z** and **deleted it at 03:17Z**. It carried
0 postings, 0 role bindings and 0 children, so nothing referenced it and nothing was disturbed. The
`tg_audit_row_accounts` trigger holds both the INSERT and the DELETE, so the mistake is auditable rather
than erased. Verified after: **zero rows named 6176 in USMCA.**

## THE RULING, CORRECTED. THIS IS SETTLED — IT IS IN THE CLOSED REGISTER NOW.

    2100            Driver Escrow – Held in Trust       Liability   role escrow_liability_default (ACTIVE)
    2100-00-nnn     <driver> — Driver Escrow            Liability   ONE PER DRIVER. THIS IS THE DAMAGE ACCOUNT.
    6175            Driver Accident Damages & Repairs   OtherExpense  role damage_recovery (ACTIVE)
    7210            Driver Damage Recovery Income       Income        role damage_recovery (INACTIVE) — leave it

- **A driver has exactly ONE account: `2100-00-nnn`.** It is his escrow and it is his damage fund. They
  are not two things.
- It is funded by the **per-settlement deduction** — the $25 the owner named, and the other amounts
  already live on prod (measured: $25, $50, $75, $100 and $250 credits across the 2100-00 children).
- Damage is **drawn from that one account, never below zero.**
- If the escrow plus the pay do not cover the damage, the uncollected remainder is a **company cost on
  `6175`**, which already exists and already carries the active `damage_recovery` role.
- **NO new account. NO new role. NO migration.** `damage_loss` is **not** to be added to the
  `chart_of_accounts_roles` CHECK allow-list. CC-1: that migration is cancelled.

## WHAT THIS DOES TO F-1 — IT MAKES IT THE MOST IMPORTANT ITEM ON THE BOARD → CC-1

The escrow is not a side ledger. **It is the driver's damage fund, built out of his own deductions**, and
three of them are over-released:

    2100-00-027   Jorge Luis Infante Corona     +150.00 debit balance   34 lines
    2100-00-002   Neftali Coronado Urbano        +50.00 debit balance   20 lines
    2100-00-004   Rafael Rogelio Rivero Reynoso  +25.00 debit balance    7 lines
                                                 225.00 total

A debit balance on that account means **we paid out money the driver never put in.** With the owner's
correction, that is not a rounding nuisance — it is the damage fund running negative on three real
drivers, and a settlement that draws against it will draw money that is not there.

Build, unchanged in substance and now higher in priority:
- Refuse a release larger than `escrow_balances.current_balance_cents` **in the DATABASE** — trigger or
  CHECK — so an import, a backfill or a direct call cannot route around the service.
- `current_balance_cents` never negative. `total_released_cents` never exceeds `total_held_cents`.
- Guard `verify-escrow-never-over-releases`, ceiling **0**: zero drivers whose released exceeds held, zero
  negative balances, zero `2100-00-%` sub-accounts with a debit balance.
- PROOF: the refusal pasted from a fork attempt, and the three accounts before and after.

Also measured and worth your attention: **`escrow_liability_default` has two rows on `2100`, one active
and one inactive.** The partial unique indexes allow that and it is legal, but say in your PR whether the
inactive row is intentional history or residue.

## UNCHANGED AND STILL LIVE — DO NOT RE-MEASURE
- **R-3 is done on prod.** `6400` / `6405` / `6830` off Bank Charges, under `6810`, 0 postings. Trial
  balance re-measured after: **2,178,029.25 / 2,178,029.25 / .00 / 7,909 postings.**
- **R-2 stands exactly as written in ROUND 356** — gallons per unit from the unit's own tank, 150 as
  fallback only, `mdata.units` has no tank column and is scoped by `owner_company_id` /
  `currently_leased_to_company_id`. CC-2, that order is untouched by this correction.
- **ROUND 357 stands in full** — the wrong-sign family is bounded at five, and the spine is broken in
  exactly two writers with zero partial entries, which proves two separate expense posting paths. That is
  still the biggest engine defect on the board. Its only reference to 6176 was in the "already done"
  footer; ignore that line.

## THE STANDING CORRECTION, SHARPENED
The owner decides what has not been decided. **Everything else is in a file.** Before forming a question
— or writing a ruling — read `docs/bus/00-CLOSED-ASKED-AND-ANSWERED-NEVER-REOPEN.md`,
`~/Desktop/CPA ANSWERS.docx`, and `claude/00-IH35-CURRENT-STATE-AND-LAW-READ-FIRST.md`.

And the lesson from my own error, which is worth more than the correction: **a locked answer that
describes an ORDER OF OPERATIONS is not describing a new object.** I invented an account out of a
sentence about sequence. Read the answer for what it says, not for what it implies.
