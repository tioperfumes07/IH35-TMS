# Seed real production-ish data (staging first, production last)

This guide tells **Owners** and **implementation partners** how to use the CSV templates under [`tests/fixtures/production-seed/`](../tests/fixtures/production-seed/) without corrupting bookkeeping.

**Also read:** [`docs/user-guides/README.md`](./user-guides/README.md) for end-user training.

---

## 1. Golden rules

1. **Always start on Neon staging / disposable branch** — never first-run rich financial seeds on production.
2. **Backup before mutate** — Neon branch snapshot or logical export (`pg_dump`) recorded somewhere Jorge can find during panic.
3. **Strip comment lines** starting with `#` from CSVs before piping into tooling that expects pure tables.
4. **Match company scope** — most operational rows require `TRK`, `TRANSP`, or another `org.companies.code` that already exists.
5. **No secrets in git** — Plaid tokens / live bank credentials belong in **Render env** or a **private vault**, not committed CSVs.

---

## 2. What `npm run seed:from-csv` actually does

Command surface (repo root):

```bash
npm run seed:from-csv -- --company TRK --type drivers --file tests/fixtures/production-seed/trk_drivers.csv
npm run seed:from-csv -- --dry-run --company TRK --type drivers --file path/to/file.csv
```

Implementation: [`apps/backend/scripts/seed-from-csv.ts`](../apps/backend/scripts/seed-from-csv.ts).

**Supported `--type` values today:** `drivers` | `customers` | `vendors` | `assets`

**Filename inference:** Basenames like `trk_drivers.csv` or `transp_assets.csv` auto-derive `--company` + `--type` if you omit flags.

**Idempotency:** Drivers skip on duplicate `cdl_number` per company; customers/vendors skip duplicate declared codes; assets skip duplicate `unit_number` / equipment numbers.

There is **no** `--csv-dir` flag and **no** single-call multi-table loader in this repository — run **one file per command**.

---

## 3. Suggested fill order (FK dependencies)

| Step | Template file | Loader / path |
| ---: | --- | --- |
| 0 | *(already in DB via migrations)* | `org.companies` rows such as **TRK** / **TRANSP** |
| 1 | `users.csv` | Ops: `ops:bootstrap-owner` / manual SQL / identity tooling |
| 2 | `drivers.csv` | Split/rename per org → `seed:from-csv` **drivers** |
| 3 | `units.csv` | Split/rename per org → `seed:from-csv` **assets** (trucks+trailers) |
| 4 | `customers.csv` | `seed:from-csv` **customers** |
| 5 | `vendors.csv` | `seed:from-csv` **vendors** |
| 6 | `loads.csv` | **Future** / manual UI or dedicated importer — needs customers, units, users |
| 7 | `bank-accounts.csv` | **Manual / Plaid Link** after prod credentials — rarely CSV-only |
| 8 | `bank-transactions.csv` | Prefer **Plaid replay** vs hand typing |
| 9 | `scheduled-reports.csv` | Prefer **UI** or API — JSON params validate against product catalog |

`operating-companies.csv` is a **planning artifact** if you ever stand up a fresh environment; most MVP launches already have companies from migrations.

---

## 4. Staging vs production workflow

### Staging (recommended sequence)

1. `DATABASE_URL` → **staging** branch connection string (Neon).
2. Migrate: `npm run db:migrate` (from automation or CI image).
3. Strip `#` lines → save as `*.clean.csv` if you want belt-and-suspenders.
4. `seed:from-csv --dry-run` for each file → expect `errors: []`.
5. Re-run **without** `--dry-run`.
6. Run product smoke: login, dispatch board, banking tiles, scheduled report trigger.

### Production

- Repeat **only** after staging sign-off and during a **named maintenance window** for heavy imports.
- **Plaid production** keys must already be live on Render **before** expecting bank balances to reconcile.
- For partial imports (e.g., **customers only**), communicate with Accounting — AR aging reports may jump.

---

## 5. If seed goes wrong

1. **Stop** further imports immediately.
2. **Snapshot** current DB (Neon PITR branch).
3. Identify **last good CSV** revision from your private archive (not necessarily git).
4. Option A: **Restore** Neon branch to pre-import timestamp (`docs/dr-runbook.md`).
5. Option B: **Selective delete** via supervised SQL (advanced; involve engineering) — never ad-hoc in prod without a written row scope.

Document incident with: timestamp, files run, command logs, user impact.

---

## 6. Template inventory

| File | Purpose |
| --- | --- |
| `operating-companies.csv` | Legal entities (manual / SQL) |
| `users.csv` | Identity bootstrap |
| `drivers.csv` | `seed-from-csv` drivers |
| `units.csv` | `seed-from-csv` assets |
| `customers.csv` | `seed-from-csv` customers |
| `vendors.csv` | `seed-from-csv` vendors |
| `bank-accounts.csv` | Banking metadata post-Plaid |
| `loads.csv` | Historical load skeletons (future tooling) |
| `bank-transactions.csv` | Reconciliation research |
| `scheduled-reports.csv` | Email automation definitions |

---

## 7. Cross-links

- Catastrophe recovery: [`docs/dr-runbook.md`](./dr-runbook.md)
- Optional orchestration of synthetic QA bundles: `npm run seed:real-data` (P6 harness — not required for production fill)
- Driver training screenshots: [`docs/user-guides/driver-quickstart.md`](./user-guides/driver-quickstart.md)

_Last updated: 2026-05-14_
