# P6-T11205 — Seed loader verification

**Date:** 2026-05-12  
**Environment:** Local developer machine; `DATABASE_URL` present in `.env` (Neon-backed dev/staging — **not** production).

## Expected vs repo reality

| Ticket expectation | Status @ Block A |
| --- | --- |
| `scripts/seed-real-data.ts` | Present — orchestrates `npm run seed:from-csv` passes declared in `tests/fixtures/seed-test-data.csv`. |
| Loads / bank accounts / bank transactions fixtures | `tests/fixtures/p6-t11205/{loads,bank-accounts,bank-transactions}.csv` ship **10 / 4 / 50** rows respectively and mark `loader_support=seed_from_csv` in the manifest. |
| Loader coverage | `apps/backend/scripts/seed-from-csv.ts` implements **loads**, **bank_accounts**, **bank_transactions** with FK pre-checks + idempotent natural keys (`load_number`, `plaid_account_id` / institution+mask, `plaid_transaction_id`). |
| 2 operating companies | **TRK** + **TRANSP** continue to resolve via `org.companies.code`; multi-company CSVs carry an explicit `company_code` column. |

## Synthetic bundle

- **Manifest:** `tests/fixtures/seed-test-data.csv`
- **Fixture files:** `tests/fixtures/p6-t11205/*.csv`
- **Counts:** 4 drivers, 3 customers, 3 vendors, 5 asset rows (existing), **10 loads**, **4 bank accounts**, **50 bank transactions** (new templates).

## Execution

```bash
# Manifest-driven dry-run (each CSV invokes seed-from-csv inside its own transaction semantics)
npx tsx scripts/seed-real-data.ts --dry-run

# Individual smoke passes
npm run seed:from-csv -- --dry-run --file tests/fixtures/p6-t11205/loads.csv
npm run seed:from-csv -- --dry-run --file tests/fixtures/p6-t11205/bank-accounts.csv
npm run seed:from-csv -- --dry-run --file tests/fixtures/p6-t11205/bank-transactions.csv
```

**Result expectations:** Each pass finishes with `errors: []`. Manifest-wide `npx tsx scripts/seed-real-data.ts --dry-run` runs **one subprocess per CSV**, so earlier inserts roll back before later files execute. Rows that require FK targets supplied by an earlier CSV file therefore report `skipped` counts (`loads`, `bank_transactions`) instead of hard errors — this keeps CI/schema validation green while still enforcing FK checks on real applies. For fully materialized counts in one shot, omit `--dry-run` on a disposable database after reviewing the manifest ordering.

## RLS / policy checks

```bash
npm run db:verify:mdata-rls
```

**Result:** **PASS** — `scripts/db-verify-mdata-rls.mjs` now inserts fixture identities with `preferred_language='en'`, matching the `NOT NULL` constraint added in migration `0127_p8a_pr3_user_language_preference.sql`.

## Loader bugs found & fixed

- **P7-FIX-SEED-LOADER-001** — Extended CSV orchestration for operational loads + banking drill data without introducing duplicate scripts.

## Operator commands

```bash
npm run seed:real-data -- --dry-run   # wrapper (manifest driven)
npx tsx scripts/seed-real-data.ts --dry-run
npx tsx scripts/seed-real-data.ts     # apply — disposable DBs only
```
