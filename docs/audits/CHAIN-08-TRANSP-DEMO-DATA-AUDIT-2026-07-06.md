# CHAIN-08 — TRANSP demo/seed data audit (2026-07-06)

**Read-only. No rows archived or deleted by this document.** Per the CHAIN-08 block spec
(`docs/blocks/ACCOUNTING-FINANCE-CONNECTIONS/CHAIN-08-transp-demo-data-purge.txt`): "RESPOND-BEFORE-CODE
— produce the full list of seed/test rows for Jorge to approve BEFORE any deletion." This is that list.

**Method note:** live prod DB access (even read-only `SELECT`) is gated per §1.5 of the repo
constitution — not a standing capability, must be asked for per-connection, and no prod
connection string may be reused. This audit is therefore built from **code-level evidence** (past
migrations, GUARD-verified counts already on record, canonical archive predicates, and live
audit/reconciliation artifacts already checked into the repo) rather than a fresh prod query. Where a
number below is "GUARD-verified" it was live-checked by a prior session and is on record in
`docs/specs/BLOCK-6-DEMO-PURGE-PLAN.md`; where it is "PATTERN ONLY" it is a predicate that has not
been re-counted against live prod in this session and needs a fresh GUARD/Jorge count before any
action.

---

## 0. CORRECTION to the CHAIN-08 block doc's founding premise — READ THIS FIRST

The CHAIN-08 block spec states: *"TRANSP's live trial balance contains a seed/test account literally
named 'Unauthorized Expenses Ignacio…'. The 2 existing journal entries are 0-line test artifacts. This
demo/test data must not be in the live company at go-live."*

**This is wrong for the account, and unverified for the JEs. Do not purge the "Unauthorized Expenses"
accounts.**

- `docs/specs/qbo-parity/OPENING-BALANCE-TIEOUT-CEREMONY-2026-07-04.md` and
  `docs/audits/COA-QBO-RECONCILIATION.json` (`.matched[83]`) both show **"Unauthorized Expenses Ignacio
  Muñoz"** ($350,451.38) and **"Anarely Alcazar"** ($73,253.48) as **real, QBO-mirrored accounts** —
  misclassified under A/R in the real QuickBooks chart of accounts, carried into the TMS opening
  balance as-is (provisional, pending a CPA-signed embezzlement reclass — see memory
  `qbo-balance-in-flux-embezzlement`). They are live financial/legal-evidence data (a real embezzlement
  matter), not seed/test rows.
- `apps/backend/src/accounting/coa-roles/resolver.service.ts` (line 83) references this exact account
  as the root cause of a real posting bug (GUARD Module 15 — A/R was debited to "Unauthorized Expenses
  Ignacio Muñoz" instead of the true A/R control account) that has since been fixed by failing closed
  on ambiguous control-account roles. That fix assumes the account **stays** in the chart.
- **The "2 zero-line test JEs" claim is unverified in this audit** — no migration, seed script, or
  fixture in the repo creates a deliberately empty/test journal entry in TRANSP's live books. This may
  itself be a stale/incorrect claim from the same original (evidently wrong) premise. **Needs a live,
  GUARD-run count** (`SELECT je.id, je.memo, je.entry_date FROM accounting.journal_entries je LEFT JOIN
  accounting.journal_entry_postings jep ON jep.journal_entry_uuid = je.id WHERE je.operating_company_id
  = <TRANSP> GROUP BY je.id HAVING count(jep.id) = 0`) before assuming it's real, and before any action.

**Recommendation:** drop "Unauthorized Expenses Ignacio Muñoz" / "Anarely Alcazar" from any CHAIN-08
purge scope entirely. Re-verify the "0-line JE" claim live before including it in scope.

---

## 1. ALREADY PURGED (PASS 1 — migration `202606161700_block6_archive_demo_test_data.sql`, merged
2026-06-16, GUARD-verified + Jorge OK)

Soft-archived (reversible via `migration.block6_demo_purge_ledger`), scope locked by Jorge after a
GUARD prod pre-check:

| Table | Predicate | Column set | Count (GUARD-verified) |
|---|---|---|---|
| `mdata.drivers` | `first_name ILIKE '%Demo%' OR last_name ILIKE '%Demo%'` | `archived_at` | 4 (Juan/Maria/Carlos/Ana "Demo") |
| `mdata.loads` | `load_number ILIKE 'DEMO-L%'` | `soft_deleted_at` | 5 (DEMO-L001..L005) |
| `mdata.units` | `unit_number ILIKE 'TEST-%'` | `deactivated_at` | 4 (TEST-TRUCK-1/2/3/4) |
| `mdata.customers` | — | — | **0 — explicitly NOT touched.** "3 Rivers Logistics" was *suspected* demo (it sat next to `DEMO-L00x` loads) but confirmed **real** (real email, FMCSA/late-pay tags, real 1209-row QBO customer roster). The demo marker was on the loads, not the customer. |

Separately, migration `0320_archive_test_seed_data.sql` (earlier, general-purpose) already archives, on
the canonical `TEST-`/`seed-` display-name and `@seed.invalid`/`seed-test-` email patterns
(`apps/backend/src/mdata/test-seed-archive.ts` — `TEST_SEED_DISPLAY_PATTERN`,
`TEST_SEED_EMAIL_PATTERN`, the pattern CI guards + the app's own listing filters
(`EXCLUDE_ARCHIVED_*_SQL`) already enforce): `mdata.drivers`, `mdata.qbo_customers`,
`accounting.qbo_customers`, `identity.users`.

**Status: real data (77 real drivers, all real customers incl. 3 Rivers) confirmed untouched by both
migrations.**

---

## 2. OUTSTANDING — PASS 2 (never executed; count-first queries ready, live counts NOT yet re-taken)

`docs/specs/BLOCK-6-DEMO-PURGE-PLAN.md` already staged this exact follow-up in 2026-06-16 and it was
never run to completion. Restating it here as CHAIN-08's outstanding list — **PATTERN ONLY, needs a
fresh GUARD/Jorge live count** before any archive action (data may have changed since 06-16; some rows
may already be gone via unrelated cleanup):

| Table | Predicate (unchanged from BLOCK-6 plan) | Soft-delete column | Last known status |
|---|---|---|---|
| `mdata.equipment` | `equipment_number ILIKE 'TEST-%'` OR phantom SAM-* (a truck's `samsara_vehicle_id` also present on an `mdata.units` row — a mis-sync, not literally "demo" but a data-integrity duplicate; tracked separately as deferred item 2F) | `deactivated_at` (exists) | Never counted this session; BLOCK-6 flagged "confirm these rows actually exist before archiving any" |
| `mdata.vendors` | `vendor_name ILIKE 'TEST-%' OR vendor_name ILIKE 'seed-%'` | `deactivated_at` (exists) | Never counted this session |
| `maintenance.work_orders` | `display_id ILIKE '%TEST%'` OR linked to a `TEST-%`/`TEST%`-VIN unit | **none today** — needs `ALTER TABLE maintenance.work_orders ADD COLUMN IF NOT EXISTS archived_at timestamptz` first (idempotent, additive) before any archive; or defer (BLOCK-6's §WO option b) | Never counted this session |

Exact count-first SQL (unchanged, reuse verbatim — run with `SET app.operating_company_id` to TRANSP's
id, per RLS):

```sql
-- EQUIPMENT
SELECT
  count(*) FILTER (WHERE equipment_number ILIKE 'TEST-%') AS test_equipment,
  count(*) FILTER (WHERE samsara_vehicle_id IS NOT NULL
           AND EXISTS (SELECT 1 FROM mdata.units u WHERE u.samsara_vehicle_id = e.samsara_vehicle_id)) AS phantom_sam
FROM mdata.equipment e WHERE e.deactivated_at IS NULL;

-- VENDORS
SELECT count(*) AS demo_vendors FROM mdata.vendors
WHERE deactivated_at IS NULL AND (vendor_name ILIKE 'TEST-%' OR vendor_name ILIKE 'seed-%');

-- WORK ORDERS
SELECT count(*) AS demo_work_orders FROM maintenance.work_orders wo
WHERE COALESCE(wo.display_id,'') ILIKE '%TEST%'
   OR wo.unit_id IN (SELECT id FROM mdata.units WHERE unit_number ILIKE 'TEST-%');
```

## 3. NOT YET CHECKED at all (new since BLOCK-6's 06-16 pass; needs a fresh live count, no predicate
built yet)

- **`accounting.journal_entries` zero-line rows in TRANSP** — see §0; unverified claim from the
  original CHAIN-08 doc. Needs the query in §0 run live before treating as real or purging.
- **Test bills/invoices/payments "created during chain proving"** (CHAIN-08 doc §1 scope item) — the
  CHAIN-03/04/05/06 posting-engine work (`bank-driver-advance.db.test.ts`,
  `bank-feed-gl-posting.db.test.ts`, `settlement-bill-payment-posting.db.test.ts`, etc.) runs
  exclusively against **ephemeral CI Postgres** (`describe.skipIf(GITHUB_ACTIONS!=='true')`, fresh DB
  per run) — those tests should leave **zero** residue in prod by construction. If any test/dry-run
  bill/invoice/payment DOES exist in prod TRANSP books, it did not come from this repo's automated
  test suite and would need its own investigation (who/when/how it got there) rather than a
  pattern-match purge.
- **`identity.users` test accounts beyond migration 0320's coverage** — 0320 already covers this table;
  no new predicate needed unless a fresh live count shows rows outside its pattern.

## 4. Explicitly OUT of scope (never touch)

- TRK and USMCA books — CHAIN-08 is TRANSP-only per the block spec's entity-independence lock.
- "Unauthorized Expenses Ignacio Muñoz" / "Anarely Alcazar" — see §0, real data.
- "3 Rivers Logistics" customer — confirmed real in PASS 1.
- The 77 real drivers, all real customers, all real units/equipment/vendors not matching a TEST-/seed-
  pattern.

## 5. Recommended next step

This audit is the "produce the list" deliverable — no action taken. Before any further archiving:
1. Jorge/GUARD re-runs the §2 count-first SQL live (fresh counts — plan is 3 weeks old) and the §0/§3
   journal-entry query.
2. Jorge explicitly approves (or rejects) each category.
3. Only then does a PASS-2 migration get built, mirroring the exact `migration.block6_demo_purge_ledger`
   / soft-archive pattern PASS 1 already used (idempotent, reversible, void-not-delete) — never a bare
   `DELETE`, and never touching `Unauthorized Expenses` or any row outside the approved predicates.
