# P0 — PROD AND REPO DISAGREE ABOUT WHAT MIGRATION `202609160000` IS

**Found:** 2026-07-26, while numbering an unrelated migration (FLT-02). The collision was the symptom;
the drift below is the defect.

**Evidence:** `ih35_migrations.applied_migrations` + `_system._schema_migrations` on
`br-fancy-credit-akjnd07a`, read under `app.bypass_rls='lucia'` with positive control
`mdata.vendors = 2789`, cross-referenced against `git ls-tree origin/main -- db/migrations`.

---

## The divergence

| Number | `origin/main` | PROD ledger | Applied (UTC) |
|---|---|---|---|
| `202609160000` | `..._bank_dom_05_intercompany_transfers.sql` | **`..._c9_form_roundtrip_persist_columns.sql`** | 21:27:03 |
| `202609170000` | *absent* | `..._c9_book_load_fields.sql` | 21:27:05 |
| `202609180000` | *absent* | `..._c9_accident_wo_persist_columns.sql` | 21:27:08 |
| `202609190000` | *absent* | `..._c9_form_roundtrip_persist_columns.sql` | 21:28:23 |
| `202609200000` | *absent* | `..._set_02_driver_netpay_clearing_liability.sql` | 21:38:03 |
| `202609210000` | *absent* | `..._intercompany_coa_8000_block_seed.sql` | 21:39:44 |

## Three distinct defects

**1. One number, two different migrations.** `202609160000` is BANK-DOM-05 in the repo (merged #3608)
and a C9 form-roundtrip migration on prod. This is exactly the collision the numbering law forbids.

**2. FIVE migrations are applied on prod and do not exist in the repo.** This is prod-ahead-of-repo
drift — the reverse of the usual direction, and the more dangerous one: **the repo can no longer
rebuild prod.** CI builds a fresh DB from `db/migrations/`, so CI's schema and prod's schema have
silently diverged. One of the five is a money migration
(`set_02_driver_netpay_clearing_liability`), and one seeds the intercompany CoA block.

**3. The same file is applied twice under two numbers.**
`c9_form_roundtrip_persist_columns.sql` at `202609160000` AND `202609190000`, 61 seconds apart.

## What is NOT broken (checked, so nobody over-reacts)

- **BANK-DOM-05 is not blocked.** `scripts/db-migrate.mjs:368` keys the skip decision on **`file`**
  plus a checksum comparison, not on the number. So the duplicate number does not cause a false
  "already applied" skip. `202609160000_bank_dom_05_intercompany_transfers.sql` remains genuinely
  unapplied and still applies cleanly — which is why `banking.intercompany_entity_pairs` is still
  MISSING on prod: nobody has run it, not because it was skipped.
- No data loss is implied by any of the above. This is a bookkeeping/integrity failure, not corruption.

## Required, in order

1. **Commit the five missing migration files to the repo** (owner: whoever authored/applied them —
   they are not mine to author). Until then every fresh-DB CI run builds a schema prod does not have.
2. **Resolve the `202609160000` duplicate.** The repo's file is merged on main; prod's ledger row
   names a different file. Decide which keeps the number and forward-fix the other — never edit an
   applied migration (2026-07-25 outage).
3. **Investigate the double-apply** of `c9_form_roundtrip_persist_columns.sql`.
4. **A guard** asserting every ledgered migration exists in `db/migrations/` and every number maps to
   exactly one filename. This class is invisible today: nothing compares the prod ledger to the repo.

## Numbering practice that would have prevented it

The existing guidance — "number strictly above main's current max, re-checked at push time" — reads
**`git log --all` for the max**, which cannot see a number that exists only in the prod ledger. The
max on all refs was `202609180000`; the real max on prod was `202609210000`. **The prod ledger is the
authority for the next free migration number, not the repo.** FLT-02 was renumbered `202609190000` →
`202609220000` on that basis.
