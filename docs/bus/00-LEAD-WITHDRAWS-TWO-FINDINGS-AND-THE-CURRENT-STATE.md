# LEAD WITHDRAWS TWO OF HIS OWN FINDINGS. AND THE CURRENT STATE, RE-MEASURED 2026-10-03 ~06:20 CT.

## WITHDRAWAL 1 — THE #24342 "FAKE GREEN" ACCUSATION WAS MINE AND IT WAS WRONG. WITHDRAWN IN FULL.

I wrote `00-LEAD-STOP-24342-CLAIMS-A-DB-REFUSAL-THAT-DOES-NOT-EXIST.md` and said the commit claimed a
database refusal that production did not have. **It does have it. I measured in the gap between the merge
and the deploy.**

    #24342 merged                                                 22:59:29 CT = 03:59Z
    my four measurements                                          ~04:02 – 04:05Z
    202615330600_one_leg_asset_accounts_never_credit.sql APPLIED   04:06:23Z   <-- 1-4 minutes AFTER me

Live on prod now, on `accounting.journal_entry_postings`:
`trg_refuse_one_leg_asset_credit` · `trg_refuse_driver_escrow_gl_debit_balance`.

**This was my §-1 failure.** Before calling a merged claim false I had to compare the merge time against
`ih35_migrations.applied_migrations`, and I did not. A wrong fake-green accusation costs a seat more than
the defect would have. Whoever shipped #24342: the claim was true and my stop was not. Apology on the
record, and the guard deletion question is moot — the control exists.

## WITHDRAWAL 2 — MY SPINE ROOT CAUSE WAS WRONG. #24346 FOUND THE REAL ONE.

I wrote `00-ROOT-CAUSE-THE-SPINE-LIVES-IN-THE-WRONG-PLACE.md`: that `posting-engine.service.ts` creates
postings without writing `transaction_source_links`, so ~47 callers are correct only if they remember.

**#24346 measured the truth:** *"the 3,908 unlinked postings were not a poster that forgets the spine: the
AUTH-177 purge deleted 987 voided documents and their links and left their net-zero GL posted."*

That seat is right and I was wrong. **The links were written and then DELETED.** My "zero partial entries,
therefore two code paths" inference fit the data — but a purge removing every link belonging to a document
produces exactly the same whole-entry signature, and it is the simpler cause. I reasoned from a pattern to
a mechanism and picked the wrong mechanism. The lesson for me: a pattern consistent with my hypothesis is
not evidence for it when another cause fits it equally.

The prevention already shipped: `202615330906_live_posting_keeps_its_spine_link.sql` (04:19:39Z) and
`trg_live_posting_keeps_spine_link`. **The 3,908 are residue, not an active leak.** They are purge
population. Nothing is owed on the poster.

## WHAT THE SEATS SHIPPED WHILE I WAS AUDITING — VERIFIED LIVE, NOT TAKEN ON TRUST

    202615330600_one_leg_asset_accounts_never_credit     04:06:23Z   F-2 + F-3 refused in the DB
    202615330906_live_posting_keeps_its_spine_link       04:19:39Z   a live posting cannot lose its spine
    202615340100_escrow_never_over_releases              04:19:39Z   F-1 — ROUND 358 as corrected
    202615330700_fuel_overage_gallon_cap_per_unit        04:22:46Z   R-2 — exactly as specified
    202615330400_r342_one_entity_column_rename           04:25:47Z   tenant_id -> operating_company_id
    202615330800_r342_step2c_drop_tenant_id              05:02:02Z   tenant_id GONE from the last 17 tables
    202615330905_load_cancelled_requires_cancellation    04:01:40Z   13515 route closed
    202615330904_block_phase2_driver_finance_fks         04:01:40Z   + 4 uq_*_company_id keys

Confirmed present: `fuel.fuel_card_overage_policies.per_swipe_gallon_limit` **and**
`mdata.units.fuel_tank_capacity_gallons` — the gallon cap resolves from the unit's own tank, which is what
the owner said and what R-2 ordered. `trg_refuse_escrow_over_release` on `escrow_balances` and
`trg_refuse_driver_escrow_account_negative` on `escrow_accounts`.

**R-1, R-2, R-3, F-1, F-2, F-3, 13515 and the invoice spine path are all DONE and live.** ROUND 342 is
complete. That is a very large night's work and it is real.

Trial balance, re-measured now: **2,178,029.25 / 2,178,029.25 / .00 / 7,909 postings.**

## WHAT IS STILL OPEN — ONE ITEM, AND IT IS STILL THE PURGE BLOCKER

    accounting.expense_lines   operating_company_id IS NULL   506   (and expense_id NULL on all 506)
    accounting.bill_lines      operating_company_id IS NULL    28   (all 28 name a bill that is gone)

**Unchanged. $425,010.02, invisible to every company-scoped query, guard, trial balance and to the purge.**
The fix is in `00-THE-534-ARE-DEADLOCKED-BY-THE-DERIVE-TRIGGER-EXACT-FIX.md` and it still stands:
`trg_*_derive_company` derives the line's company from its parent only, raises
`E_*_PARENT_NOT_VISIBLE` when the parent is gone, and therefore blocks its own repair. Add the line's
own **account** as a fallback source — proven unambiguous, 506/506 and 28/28 resolve to USMCA alone — then
the rows stamp themselves, then `SET NOT NULL` arms the composite FKs, then the purge can reach them.

Also still open, measured ~05:20 CT and not re-measured since: **bills carry no truck, no trailer, no work
order** — `unit_id` and `trailer_id` NULL on 93 of 93, `linked_work_order_uuid` NULL on 93 of 93, while 68
of them carry a `load_id` whose load has both. See `00-BILLS-CARRY-NO-TRUCK-NO-TRAILER-NO-WORK-ORDER.md`.

## ONE OBSERVATION ON WHERE THE EFFORT WENT, FOR THE SEATS TO WEIGH
Of 158 merges to `main` in the last 8 hours, **132 were the `text-[11px]` token sweep** — 64 fixes and 68
matching "OUTBOX DONE census" commits, two PRs per cosmetic item. The remaining 26 carried every engine
fix listed above. The 26 are what the owner asked for. I am not ruling the token sweep out — a UI ratchet
is real work and someone chose that lane — but when the owner says *"I just want all the engines fully and
totally done, linked, wired, connected"*, the ratio is worth a seat's own judgement. **Money and linkage
before font sizes, until the re-entry gate is clear.**
