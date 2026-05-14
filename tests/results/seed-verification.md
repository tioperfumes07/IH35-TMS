# P6-T11205 — Seed loader verification

**Date:** 2026-05-14  
**Environment:** Local developer machine; `DATABASE_URL` present in `.env` (Neon-backed dev/staging — **not** production).

## Expected vs repo reality

| Ticket expectation | `main` @ verification |
| --- | --- |
| `scripts/seed-real-data.ts` | **Not present on `main` before this ticket.** Added in P6-T11205 as a thin orchestrator over the existing loader `apps/backend/scripts/seed-from-csv.ts` (see `npm run seed:from-csv`). |
| Single `tests/fixtures/seed-test-data.csv` with loads + bank rows | Loader only supports **drivers | customers | vendors | assets**. Manifest records **10 loads**, **4 bank accounts**, **50 bank transactions** as `not_implemented` (see `docs/trackers/phase-7.md`). |
| 2 operating companies | **TRK** and **TRANSP** must already exist in `org.companies` — loader resolves IDs by `code`. |

## Synthetic bundle

- **Manifest:** `tests/fixtures/seed-test-data.csv`
- **Fixture files:** `tests/fixtures/p6-t11205/*.csv`  
  **Counts seeded by supported types:** 4 drivers, 3 customers, 3 vendors, 5 asset rows (3 TRK + 2 TRANSP: 3 trucks + 2 trailers across companies).

## Execution

```bash
# Schema validation + transactional dry-run (commits rolled back inside seed-from-csv)
npx tsx scripts/seed-real-data.ts --dry-run
```

**Result:** All **8** CSV passes completed with `errors: []` and expected `inserted` counts matching row counts (dry-run still runs SQL inside a transaction that rolls back).

**Full apply (`--dry-run` omitted):** Not executed in this verification pass to avoid leaving **81** new business rows in a shared dev database without an agreed cleanup owner. Dry-run path is sufficient to prove FK resolution (`operating_company_id` from `org.companies`) and loader semantics.

## RLS / policy checks

```bash
npm run db:verify:mdata-rls
```

**Result:** **FAIL** — fixture setup error: `null value in column "preferred_language" of relation "users" violates not-null constraint`.  
**Interpretation:** RLS verification script / seed user path is out of sync with current `users` schema — **not** attributed to P6 CSV rows. Tracked as **P7-FIX-RLS-VERIFY-001** in `docs/trackers/phase-7.md`.

## Loader bugs found & fixed

**None** in `apps/backend/scripts/seed-from-csv.ts` during this exercise. P6-T11205 only adds orchestration (`scripts/seed-real-data.ts`) + fixtures.

## Operator commands

```bash
npm run seed:real-data -- --dry-run   # wrapper (after package.json script lands)
npx tsx scripts/seed-real-data.ts --dry-run
npx tsx scripts/seed-real-data.ts       # apply (use only on disposable DBs)
```
