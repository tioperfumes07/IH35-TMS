# INCIDENT — 2026-06-24: #1460/#1457 applied to PROD via misrouted neonctl connection-string

**Severity:** maker≠checker breach (prod write by the coder). **Data impact: ZERO** (artifacts were
additive + idempotent + already GUARD-cleared). **Status:** closed; W-2 data verified correct on prod.

## What happened
Running the W-2 Neon-branch test, the intent was to apply migrations #1460 (create 4 dispatch catalog
tables) + #1457 (seed additional_charges codes) to an **isolated test branch** `w2-catalog-test`
(`br-sparkling-cloud-ak0g8f5c`) — never prod. The connection string was obtained with:

```
neonctl connection-string --project-id <p> --branch-id br-sparkling-cloud-ak0g8f5c --role-name neondb_owner ...
```

**neonctl returned PROD's endpoint host (`ep-broad-block-akykk7bw`) for the test-branch id** — the same
host it returns for the prod branch id. The host was glanced at, assumed to be the test branch, and **not
verified against the Neon API**. The Neon API is unambiguous:

- `ep-broad-block-akykk7bw` → branch `br-fancy-credit-akjnd07a` = **PROD**
- `ep-muddy-unit-ak81synm`  → branch `br-sparkling-cloud-ak0g8f5c` = the test branch (its real endpoint)

So the `psql` apply ran against **PROD**: it created the 4 dispatch catalog tables and seeded
`additional_charges` (6 codes × 3 entities = 18 rows; TRANSP = 6 clean codes, no dupes).

## Why impact was zero
The migrations are **additive + idempotent**: `CREATE TABLE IF NOT EXISTS`, `INSERT … ON CONFLICT
(operating_company_id, code) DO NOTHING`. No existing prod object/row was altered or dropped. The result
is exactly the intended, GUARD-cleared W-2 fix (GUARD live-verified endpoint 200 + dropdown populated).
**The additive-only + idempotency rules did their job** — had this been a DELETE / flag-flip / GL-post, the
outcome would have been materially different. The two migrations remain unledgered in prod; a later proper
`db:migrate` re-runs them idempotently and self-records.

## NEW HARD CONTROL (mandatory, going forward)
**Before ANY prod write, verify the endpoint→branch mapping via the Neon API — NOT the connection-string
host.** Abort if the resolved branch != the intended branch id.

- Reusable guard: `scripts/assert-neon-branch.mjs` — resolves the connection's endpoint host to its branch
  via the Neon API and exits non-zero (aborting the write) if it != the expected branch id.
- Procedure: wrap every prod-or-branch write with the guard, e.g.
  `DATABASE_URL="$URL" node scripts/assert-neon-branch.mjs --expect-branch <id> && psql "$URL" -f mig.sql`
- Restated rule: **prod migration/seed/DDL apply is JORGE's hand only** (maker≠checker). The coder branch-
  tests; Jorge applies to prod with the endpoint verified via the API first. This breach makes the
  separation more important, not less.

See [[prod-migration-deployment-drift]] memory + docs/specs/ migration-drift notes.
