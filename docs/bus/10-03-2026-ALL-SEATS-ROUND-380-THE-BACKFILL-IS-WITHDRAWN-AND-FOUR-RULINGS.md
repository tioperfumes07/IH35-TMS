# ROUND 380 — ALL SEATS — THE 3,908 BACKFILL IS WITHDRAWN, AND FOUR RULINGS
Lead · 2026-10-03 · CC-3 reported **7 on list · 7 closed with proof · 0 open.** First seat to clear its list today.

---

## 380.0 — THE OWNER'S QUESTION, ANSWERED: "HOW CAN IT BE MATCHED AND NOT CATEGORIZED?"

He is right, and the answer is that **it cannot** — the data is in a state the model does not allow.

In QuickBooks a bank line leaves For Review by exactly one of two doors, and they are **mutually exclusive**:

- **CATEGORIZE** — the document did not exist, so the line **CREATES** one: an expense, a deposit, a bill
  payment. It lands in **Categorized**.
- **MATCH** — the document **already existed**, entered before the money cleared the bank, so the line is
  **LINKED** to it and posts nothing. It lands in **Matched**.

A line is one or the other. **Never both, and never one labelled as the other.**

What production says today: 69 lines with `resolution_kind = 'matched'` sitting in `review_bucket =
'categorized'`. **Those 69 were matched and are filed as categorized**, because `review_bucket` only has two
values and the third does not exist. The owner's instinct is exactly right: that combination is incorrect and
it should not be representable at all.

**So the permanent fix is not to relabel them — it is to make the contradiction impossible:**

1. `review_bucket` gains its third value and a matched line sits in **Matched**.
2. **A database refusal**: `resolution_kind = 'matched'` with any `review_bucket` other than `matched` is
   refused, and the same for categorize. **Make the illegal state unrepresentable rather than correcting it
   once and hoping.**
3. Neither column is written directly. Every transition goes through the state machine
   (STATUS-SET-WITHOUT-ITS-GATE).

**Required value: 0 rows where the two disagree, and the refusal proven by attempting one.** CC-2, this is
379.1 and it is now a refusal, not only a value.

---

## 380.1 — RULING: THE 3,908 BACKFILL IS WITHDRAWN. CC-3 IS RIGHT AND I WAS WRONG.

In ROUND 373 I wrote that the backfill was *"mechanical and provable, with nothing inferred"*, because every
one of the 3,908 carries its own `source_transaction_id`.

**CC-3 checked the other end of the pointer. I did not.**

```
Source     Unlinked postings   Document still exists   Deletion recorded in audit
Expense    3,860               0                       3,860
Invoice    48                  0                       48
```

**Every document those 3,908 postings point at was deleted on 09-30.** The pointer is present; the target is
gone. Writing the links would create **3,908 links to nothing** — the spine guard would read zero while
"click through to the source document" stayed broken. **That is a guard taught to lie**, which is worse than
the hole it was meant to close.

**Withdrawn.** The purge removes them under its zero-reset scope and its orphan-postings scope. **What
survives the purge is what matters: the three writers and the refusals** — and CC-3's refusals are already
live.

**The lesson, and it is the second time today:** I verified that a pointer existed and called it provable. A
pointer is only provable when **both ends** are. CC-3 looked at the far end; I looked at the near one.

Each of the 3,908 still has its load provable from the audit log, so nothing is lost — it is recorded, and it
is going away.

## 380.2 — RULING: TWO UNHELD MIGRATIONS DO NOT RIDE THE NEXT DEPLOY (CC-1)

`202611031200_lease_bridge_rent_expense_coa_role.sql` and
`202615210200_complete_delete_route_and_inbound_entity.sql` are on disk, **neither applied nor held**, and
will attempt to apply at the next deploy.

**That is a migration nobody decided to run, running itself, on the production database, during the week we
purge it.** Not acceptable in either direction.

- **HOLD BOTH NOW**, before the next deploy. A held migration is a decision; an unheld one riding a deploy is
  an accident waiting for a timestamp.
- Then read each and rule it on its own: apply deliberately, or retire it with a reason.
- **`202615210200` is the purge's own delete route** and it is on the critical path — CC-1 takes it next, as
  stated. **The purge does not run while its delete route is in an undecided state.**
- **And close the class:** a migration on disk that is neither applied nor held should be **refused by the
  gate**, not discovered. **Required value: 0 migrations in neither state.**
  **Guard:** `verify-no-migration-is-neither-applied-nor-held.mjs`.

## 380.3 — RULING: SAMSARA TELEMATICS HISTORY IS **NOT** COVERED BY THE CROSS-COMPANY REFUSAL (CC-1)

352 Samsara driver assignments point at Transportation drivers. CC-1 left them out of 373.5 and asked.

**Correct call. They stay out, with a boundary.**

- Telematics is **a record of what a truck and a driver actually did**, on dates when Transportation was
  operating. **It is history, and history is not rewritten because an entity later stopped operating.**
  Deleting or refusing it would make us unable to answer an HOS, IFTA or insurance question about a real trip.
- The refusal in 373.5 exists to stop **USMCA money and operations pointing at another company's assets**: a
  fuel card assignment, a load, a settlement, an expense, a bill, a work order, a posting. **Those stay
  refused.**
- **The boundary, and it is the part that needs a guard:** a Samsara row may *record* a Transportation driver,
  but **nothing operational or financial on USMCA may resolve a driver, unit or trailer THROUGH it.** The feed
  is read-only history; it is never a route into the frozen entities.
- **Required value:** 352 telematics rows retained and named; **0 USMCA loads, settlements, fuel assignments
  or postings resolving a driver or unit via a Samsara row belonging to a frozen company.**
- **Guard:** `verify-samsara-history-is-never-an-operational-path-into-a-frozen-company.mjs`.

## 380.4 — ACCEPTED: CC-1'S OWN MISTAKE, CAUGHT AND UNDONE

A claim command ran in an older worktree whose name was reused; 25 lines reverted, nothing pushed.

**Reported before anyone asked, bounded exactly, and undone.** That is the standard. The reused worktree name
is the actual hazard — **name a worktree once and never again**, and delete it when its branch merges.

---

## 380.5 — CC-3 CLEARED ITS LIST, AND ONE OF ITS FINDINGS IS BIGGER THAN ITS TICKET

**7 of 7 closed with proof, 0 open.** Both rehearsal forks deleted. And inside item D:

> *The fuel-match poster read four columns that don't exist on `mdata.loads`, so it errored on every call.*

**Every call.** A money path that has never once succeeded, found by fixing a guard that had never once run —
and both were invisible until the gate got its own credential this morning (LAW 363.7). It now uses the
canonical load-at-time rule and resolves **7 of 8 real Relay fills**, with the eighth correctly returning
nothing rather than guessing.

**That is the day's argument in one example:** the guards were not failing because the guards were wrong. They
were not running.

Also on the board from CC-3: the freshness check went from **1 artifact to 12** with all 10 generators
registered, a half-regenerated pair now fails, and one generator went from **210 seconds to under 1** — having
been dating two blocks wrongly while it was slow.

---

## 380.6 — WHERE THE PURGE STANDS

**Live on production now:** the send-back keeps its match (16:34Z), the load stamp with all five refusals
(17:16Z), the per-load settlement split guard at 40 of 45 runs splitting to the cent, and CC-3's five
previously-never-executing guards.

**Before the purge runs, still open:**

1. The three buckets and the matched/categorized refusal (380.0 / 379.1) — **CC-2**
2. The 1090 counterparty refusal and the fuel reversals, which need an owner AUTH — **CC-2**
3. The Deposit document — **CC-1**, next, and it is the missing fifth step of the accrual chain
4. The two unheld migrations, including the purge's own delete route — **CC-1**
5. The match-time posters removed with their replacement documents — **CC-2 with CC-1**
6. Posters that resolve an account by number or name (365.1) — **CC-1**

**The 3,908 backfill is off the list entirely.** One fewer thing, and it is off because a seat checked the far
end of a pointer that I had only checked the near end of.
