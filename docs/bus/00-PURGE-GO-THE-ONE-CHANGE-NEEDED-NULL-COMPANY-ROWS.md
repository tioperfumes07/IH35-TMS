# PURGE: GO. NO SNAPSHOT, NO CI. ONE CHANGE TO THE SCRIPT AND IT IS READY. → CC-1

Owner: *"I DON'T WANT AN UNDO ON A PERMANENT DELETE. We are deleting the transactions and loads I will
upload in a few hours. **As long as code and designs are not affected, I don't care about the data, I am
uploading exactly the same data.**"*

Correct, and my snapshot requirement is **withdrawn in full**. A restore point protects data you are about
to replace with the same data — it buys nothing and costs a weekend. The CI gate is withdrawn with it.
**The billing lock is no longer a blocker for anything.**

What actually needed checking was scope: *can this script touch code, designs, or master data?* I read
`scripts/ops/2026-10-02-cc1-r326-complete-delete.ts` on main rather than asking.

## IT ALREADY PROTECTS WHAT THE OWNER NAMED. VERIFIED IN THE CODE, NOT ASSUMED.
- `PRESERVED_SCHEMAS` — `identity · org · catalogs · preserve · audit · _system · lib · mdata · banking`.
- `MASTER_TABLES` — customers, drivers, vendors, locations, units, equipment, **accounts, items**, users,
  companies, bank_accounts.
- **A master or preserve table that would be touched is a BLOCKER, not a silent delete.** A `SET NULL` or
  multi-column reference is *reported*, never silently nulled.
- `mdata.loads` and `mdata.load_stops` are deliberately exempted from the mdata shield, so **loads do get
  deleted** — which is the order.
- Bank lines are **KEPT**; only their links into deleted documents are cleared.
- A child is cascaded **only if it belongs to the deleted record**. Anything independent — a settlement
  spanning several loads, a vendor bill, a bank line — is reported for a per-row decision.
- Every deleted row is written to **`audit.record_deletions`** with what, why, and the row's own data,
  before it goes. **That is a record of everything deleted, and it survives the purge.** It is a better
  fit for this job than a snapshot and it costs nothing.
- Leaves are deleted first, **in ONE transaction** — which is exactly what makes the deferred spine
  trigger pass, per the earlier finding. Nothing to change there.
- DRY run is the default and read-only. APPLY requires the owner's AUTH rows in
  `_system.purge_authorized_rows`, and `assertIsIntendedProduction` stands in front of it.
- The proof runs **in the same transaction**: GL postings to zero, every deleted table to zero, master
  counts unchanged — and **any failure rolls the whole thing back.**

**Code and designs are not in the database at all.** They cannot be touched by this script. The owner's
condition is satisfied by construction.

## THE ONE GAP — AND IT IS THE DIFFERENCE BETWEEN "CLEAN" AND "LOOKS CLEAN"
Every plan query and **every proof query** is filtered `WHERE operating_company_id = $1::uuid`
(plan: the `add(plan, …)` calls; proof: lines ~529 and ~532).

So a row whose `operating_company_id` is **NULL** is neither collected for deletion nor counted in the
proof. The script would delete, assert "every deleted table zero for the company", **pass, and report
success** — while the orphaned line rows that have no company sit untouched.

Then the owner uploads the same data **on top of leftover line detail**, which is the one outcome he
ruled out: *"not a single transaction should be appearing on any table."*

## THE CHANGE — TWO ADDITIONS, SAME SHAPE AS WHAT IS ALREADY THERE
1. **Collect them.** For every table in `ZERO_RESET_DELETE_SCHEMAS`, in addition to the existing
   company-scoped `add(plan, …)`, collect `WHERE operating_company_id IS NULL`. Reason string:
   `"ROUND 326 zero-reset: row escaped its company"`.
2. **Prove them gone.** In the same-transaction proof, for each of those tables also assert
   `count(*) WHERE operating_company_id IS NULL = 0`. A table that still has one **fails the proof and
   rolls the delete back** — same as the GL assertion already does.

`PRESERVED_SCHEMAS` and `MASTER_TABLES` are untouched by this, so a NULL-company row in `mdata`,
`catalogs`, `identity`, `org` or `banking` is still never deleted — it would surface as a blocker, which
is correct.

## AND THIS WITHDRAWS MY OWN EARLIER ORDER
I ordered CC-1 to fix `trg_*_derive_company` with an account fallback **so the 534 rows could be stamped
and then seen by the purge.** That is the long way round, and it breaks my own rule: **fix writers, not
rows — and never repair a row that is about to be deleted.** The purge does not need those rows stamped.
It needs to be able to *see* them, which is change 1 above.

So: `00-THE-534-ARE-DEADLOCKED-BY-THE-DERIVE-TRIGGER-EXACT-FIX.md` is **no longer a purge blocker** and
**no longer gates the delete.** The derive-trigger account fallback is still a correct writer fix to stop
new unscoped rows being born — **ship it after the purge**, not before.

## THE SEQUENCE NOW — SHORT
1. **CC-1** — the two additions above, then DRY run, then paste the plan: every table, every count, every
   blocker, and the NULL-company rows appearing in the plan.
2. **CC-3** — 13515's live expenses voided through the governed executor, so both money gates pass on
   real data and CC-1's local uncommitted exclusion comes out. With no CI, an exclusion only one machine
   can see is the thing most likely to hide a mistake.
3. **Owner** — reads the DRY plan, writes the AUTH rows, says go.
4. **APPLY.** One transaction. Proof in the same transaction or it rolls back.
5. Then `--compare`, then the owner uploads, then the overage engine on.

Nothing here waits for Monday. Nothing here waits for a snapshot. **The only work left is items 1 and 2.**
