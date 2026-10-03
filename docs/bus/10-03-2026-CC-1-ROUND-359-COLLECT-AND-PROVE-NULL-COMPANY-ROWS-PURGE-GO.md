# CC-1 — ROUND 359 — COLLECT AND PROVE THE NULL-COMPANY ROWS. THEN DRY RUN. OWNER SAID GO.

Owner, 2026-10-03: *"THEN MAKE SURE THE COMPANY IS NOT NULL. LETS GO. HAVE CC1 DO THE ADDITIONS NOW."*
He has also ruled: **no snapshot, no CI gate, no undo** — he re-uploads the same data within hours and
his only condition is that code, designs and master data are untouched. Your script already satisfies
that by construction. **The billing lock is not a blocker. Nothing waits for Monday.**

FILE: `scripts/ops/2026-10-02-cc1-r326-complete-delete.ts` (on main)

## WHY — MEASURED, NOT ASSERTED
Every `add(plan, …)` query and both proof queries (~529, ~532) filter `WHERE operating_company_id = $1::uuid`.
A row whose `operating_company_id` is **NULL** is therefore neither collected for deletion nor counted in
the proof. Live on prod right now, with no company filter:

    accounting.expense_lines    operating_company_id IS NULL   506 rows   (expense_id NULL on all 506)
    accounting.bill_lines       operating_company_id IS NULL    28 rows   (each names a bill that is gone)

Today the script would delete, assert *"every deleted table zero for the company"*, **pass, and report
success** — and those 534 rows would still be there. The owner then uploads the same data on top of
leftover line detail. That is the one outcome he ruled out: *"not a single transaction should be appearing
on any table."*

## ADDITION 1 — COLLECT THEM
For **every table in `ZERO_RESET_DELETE_SCHEMAS`**, alongside the existing company-scoped `add(plan, …)`,
collect the unscoped rows:

    SELECT id::text AS id FROM <table> WHERE operating_company_id IS NULL

Reason string: `"ROUND 326 zero-reset: row escaped its company"`.

Guard rails that must hold, and they already do — do not weaken them:
- `PRESERVED_SCHEMAS` and `MASTER_TABLES` stay exactly as they are. A NULL-company row in `mdata`,
  `catalogs`, `identity`, `org`, `banking` or `preserve` is **never deleted** — it surfaces as a BLOCKER.
  That is correct; report it, do not collect it.
- `isMasterOrPreserve()` and `zeroResetPreserved()` are unchanged.
- A table with no `operating_company_id` column is skipped, same as today's `hasCo` check.

## ADDITION 2 — PROVE THEM GONE
In the **same-transaction** proof, for each of those tables, add alongside the existing company assertion:

    SELECT count(*) FROM <table> WHERE operating_company_id IS NULL   -- must be 0

A non-zero count **throws and rolls the whole delete back**, exactly as the GL assertion does today
(`ZERO-RESET PROOF FAILED: … — rolled back`). Message: `ROWS ESCAPED THEIR COMPANY: <table> has <n> row(s)
with operating_company_id IS NULL — rolled back`.

## ADDITION 3 — AFTER APPLY, NOT BEFORE: MAKE IT IMPOSSIBLE
Once the purge has run and those tables are empty of unscoped rows, in your lane (HH 00–05, claim inside
`registry.claimed`):

    ALTER TABLE <each table> ALTER COLUMN operating_company_id SET NOT NULL;

Ten tables carry a MATCH SIMPLE composite FK that includes `operating_company_id` while the column is
nullable — `accounting.bill_lines`, `accounting.expense_lines`, `driver_finance.settlement_lines`,
`accounting.credit_memo_applications`, `accounting.factoring_lifecycle_posting_keys`,
`dispatch.load_charge_lines`, `mdata.unit_border_crossings`,
`accounting.factoring_default_interest_accruals`, `accounting.factoring_reserve_movements`,
`safety.accident_reports`. **MATCH SIMPLE is satisfied without checking when any key column is NULL**, so
that one `SET NOT NULL` per table arms every one of those composite FKs. `settlement_lines` is the
Settlement Creator path — it is clean today and nothing stops the next row.

Also add the missing single-column FK `accounting.bill_lines.bill_id -> accounting.bills(id)`.
`bill_lines` has only the composite same-entity FK today, which is how 28 lines came to name a bill that
does not exist.

## GUARD — ONE, NAMED
`verify-no-row-escapes-its-company` — zero rows with `operating_company_id IS NULL` in any table that has
the column, **run with NO company filter**. Ceiling **0**. Baseline **committed** — a gitignored,
self-written baseline is not a ratchet.

## WHAT YOU DO NOT DO
- Do **not** rewrite line 365. `trg_live_posting_keeps_spine_link` is a CONSTRAINT TRIGGER,
  `DEFERRABLE INITIALLY DEFERRED` — it fires at COMMIT and only raises when the posting still exists with
  no link left. Your existing links→postings→entries→document order **in one transaction** already passes.
- Do **not** stamp or repair the 534 first. My earlier derive-trigger order is **withdrawn as a blocker**.
  Never repair a row that is about to be deleted. The account-fallback fix for `trg_*_derive_company` is a
  writer fix and ships **after** the purge.
- Do **not** reverse anything. 13515 was already reversed on 10-01 under AUTH-201 — a second reversal
  re-recognises the money. The purge removes reversals and originals together.
- Do **not** touch 1090 / 1295 or the Relay top-ups. The purge resets them.

## DELIVER
1. The two additions, one PR.
2. **DRY run and paste the plan**: every table, every count, every blocker, and the NULL-company rows
   visible in it. The owner reads that plan before he writes the AUTH rows.
3. Your local uncommitted 13515 exclusion **comes out** before APPLY. CC-3 is voiding 13515's live
   expenses through the governed executor so both money gates pass on real data. With no CI, an exclusion
   only your machine can see is the single most likely place for a mistake to hide.

DEADLINE: DRY plan pasted by **2026-10-03 18:00Z**. If it slips, say so in the bus with what is blocking
and I take the surface with the owner — do not go quiet.
