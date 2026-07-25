# Fixture writers without a prod refusal — frozen debt inventory (2026-07-25)

**Origin:** LST-SEED-01. `scripts/verify-no-cross-carrier-data-leak.mjs` wrote **259**
`USMCA-1 leak test <hex>` rows into **live prod** `catalogs.complaint_types` (TRANSP). The audit then
misread the resulting 271/12/12 skew as a TRK/USMCA *seed gap*, and a migration to seed that garbage to all
three entities reached PR **#3452** (closed, withdrawn) before the owner's common sense stopped it.

**Future block:** `LST-SEED-02` — retire this list to empty.
**Guard holding the line:** `scripts/verify-steps/1353-verify-no-leak-test-pollution.mjs`.

---

## The defect class

A script that (a) opens a pg connection and (b) `INSERT`s into a business schema
(`catalogs` / `mdata` / `accounting` / `safety` / `banking` / `driver_finance`) is a **fixture writer**.
Every one of them inherits this repo's landmine: `dotenv.config()` loads `.env`, `.env` carries the **prod**
`DATABASE_DIRECT_URL`, and the resolution order `DATABASE_DIRECT_URL || DATABASE_URL` means an inline local
`DATABASE_URL` is **silently overridden**. `scripts/db-migrate.mjs` has refused prod since 2026-06-28. The
fixture writers never did.

CI is **not** the source: `.github/workflows/ci.yml` runs these in `build-typecheck`, whose job env points at
an ephemeral `postgres:16-alpine` on `localhost:54329/ih35_verify`, and no `secrets.DATABASE*` exists in the
workflow. The prod rows came from **local runs**.

Two aggravating factors made it invisible rather than merely possible:

1. The fixtures were **committed** and cleaned up with `DELETE`, executed under `SET ROLE ih35_app` — which
   has no `DELETE` grant. Reproduced live 2026-07-25 against a local DB: `cleanup threw: permission denied
   for table drift_log`, on every run.
2. That failure was **swallowed** (`.catch(() => {})`), and nothing asserted the fixtures were gone.

## Fixed in this PR

- **`scripts/lib/prod-target-guard.mjs`** (new) — one shared `assertNotProdTarget()`; prints the resolved
  target and exits non-zero on the prod compute endpoint. **No override flag by design**, and deliberately
  does *not* honour `ALLOW_PROD_MIGRATE` (prod deploys set that, which would reopen the hole every deploy).
- **`scripts/verify-no-cross-carrier-data-leak.mjs`** — refuses prod before opening a pool; runs every
  fixture in **one transaction that is always ROLLED BACK**; proves 0 residue on a fresh connection. No
  `DELETE`, so no grant is needed and §F.24 holds by construction. Verified: prod-marker target → REFUSED
  exit 1; local target → 3/3 assertions PASS, `fixtures rolled back, 0 residue`, exit 0 (same DB where the
  old design left 3 orphans).

## Remaining debt — 12 fixture writers, list may only SHRINK

These are the same defect class but not this PR's ranked finding, so they are **frozen in the guard** rather
than silently ignored. The guard fails if a **new** unrefused fixture writer appears, and also fails if a
listed script has since been fixed but not removed from the list — so this cannot become a parking lot.

| # | Script |
|---|---|
| 1 | `scripts/ci-boot-aggregate-smoke.mjs` |
| 2 | `scripts/db-verify-catalog-registry.mjs` |
| 3 | `scripts/db-verify-catalogs-rls.mjs` |
| 4 | `scripts/db-verify-catalogs-workflows.mjs` |
| 5 | `scripts/db-verify-cust-driver-fields.mjs` |
| 6 | `scripts/db-verify-driver-profile.mjs` |
| 7 | `scripts/db-verify-equipment-catalog.mjs` |
| 8 | `scripts/db-verify-mdata-rls.mjs` |
| 9 | `scripts/db-verify-mdata-workflows.mjs` |
| 10 | `scripts/db-verify-multi-tenant.mjs` |
| 11 | `scripts/db-verify-phase1-audit-coverage.mjs` |
| 12 | `scripts/sec-audit-rls-policies.mjs` |

`scripts/sec-audit-rls-policies.mjs` is the highest risk of the twelve: it inserts into
`catalogs.complaint_types`, the exact table that was polluted.

**LST-SEED-02 scope:** give each of the twelve the `assertNotProdTarget()` preflight and convert its fixtures
to the rollback pattern, removing entries from `KNOWN_UNREFUSED_DEBT` as they land. Prefer one PR per script
or per tight group so each carries its own live proof.

## Deliberate exemption — NOT debt

| Script | Why exempt |
|---|---|
| `scripts/ingest-samsara-to-mdata-units.mjs` | Documented **operator** ingest, meant to be run against prod by hand — `docs/samsara/ingestion-runbook.md`, `docs/CLAUDE.md` §8. It populates `mdata.units` from `integrations.samsara_vehicles`. A fail-closed prod refusal would break a real procedure. |

## False positive corrected while writing the guard

`scripts/verify-double-entry-balance-trigger.mjs` was flagged by the first matcher. It is a **static** guard
whose job is to *forbid* `INSERT INTO accounting.journal_entry_lines`, so it quotes that phrase in a comment
and in its failure message. The matcher now requires an actual column list (`table (col, …`), which
distinguishes a statement from prose. A guard that flags already-correct code burns trust as fast as one that
misses (DoD §4).

## Prod state at time of writing (Neon `br-fancy-credit-akjnd07a`, `SET app.bypass_rls='lucia'`)

- `catalogs.complaint_types`: TRANSP **12 active / 259 inactive** · TRK **12 / 0** · USMCA **12 / 0**
- Active `%leak test%` rows: **0** (the 259 were soft-deactivated by the owner — preserved, §F.24)
- Sweep of all **113** `catalogs.*` base tables via full-row `to_jsonb ILIKE '%leak test%'`: only
  `complaint_types`, all inactive → contained
- Positive control `catalogs.accounts` = **1392** visible, so the zeros are real absence, not RLS masking
