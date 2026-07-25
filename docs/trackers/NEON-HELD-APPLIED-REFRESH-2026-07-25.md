# Neon held-apply refresh — 2026-07-25 (night)

**Source:** Owner/GUARD notice — held migrations applied + ledger-backfilled on prod (`br-fancy-credit-akjnd07a`). Checksums = `sha256(repo file)` (no drift).

## What changed in the manifests

| Action | Result |
|---|---|
| `db/migrations/.held-migrations.json` | **20** held files flipped `applied_on_prod: false → true` with Neon evidence |
| `scripts/lib/prod-migration-ledger-checksums.json` | Pinned checksums refreshed from `_system._schema_migrations` (disk sha verified match) |
| `docs/module-completion/accounting.{json,md}` | LINK-01/04/05 + SURF-05: **FAIL → UNVERIFIED** (schema-live → browser/ops only). ECON-03/04 + SURF-04 stay **FAIL-BY-DESIGN** (projection flags OFF) |
| `docs/module-completion/banking.{json,md}` | ECON-04 + SURF-04: **HOLD → UNVERIFIED** (RLS bypass schema-live; sessions still 0). LINK-01 stays **UNVERIFIED** (mig unapplied). ECON-03 stays **FAIL** (transfers=0) |

**N of M after refresh:** accounting **8 of 25** · banking **4 of 13** (BANK-ECON-04/SURF-04 no longer count as qualifying HOLD — schema-live ≠ PASS/owner-HOLD).

## Named schema-live effects (lucia-verified)

| Migration | Effect |
|---|---|
| `202607960000` | `journal_entries.journal_entry_type_id` + FK (LINK-01 / SURF-05 schema) |
| `202608020000` | `expense_lines_expense_category_same_entity_fkey` (LINK-04) |
| `202607950000` | `posting_batches.posting_template_id` + `source_template_code` (LINK-05) |
| `202608030000` | `bank_accounts` RLS `bypass_rls='lucia'` escape (ECON-04 / SURF-04 path unblocked) |
| `202607990000` | `account_role_bindings` entity-scope + `UNIQUE(opco, role_key)` |
| `202608000000` / `202608040000` | payment_terms + posting_templates per-entity (payment_terms **15** across **3** opcos) |
| `202608050000` | BANK-LINK-01 counterparty same-entity FKs + indexes LIVE |

## STILL UNAPPLIED (do not mark applied)

1. **`202607790000_cost_of_labor_mexico_drivers_transp_usmca.sql`** — owner account numbers pending

## Applied this turn (owner SQL proof)

- **`202608050000_bank_link_01_counterparty_same_entity_fk.sql`** — BANK-LINK-01 LIVE (BEGIN/4×DO/2×CREATE INDEX/COMMIT + dual ledger INSERT). FKs verified lucia.

## Hard non-flips (owner law)

- **No SURF item → PASS** without authenticated TRANSP + USMCA click-through (Rule 23)
- **No new SURF structural guards**
- **detail_types WIRE|LOCK** — owner decision still open; keep text subtype; no code
- **Projection flags ECON-03/04** stay **OFF** (live Neon: `QBO_EXPENSES_PROJECTION_ENABLED` / `QBO_AR_PAYMENTS_PROJECTION_ENABLED` `default_enabled=false`)
- Pile purge (#3518) + honesty PRs endorsed — keep the **47** real GAP/owner rows; do not rebuild discarded duplicates

## MERGED≠APPLIED honesty PRs

Superseded for the 20 flipped migrations: prior “MERGED≠APPLIED until Neon” claims on F02 / F07 / F08 / BANK-ECON-04 / held-registry split are now **schema-live**. Those PRs should merge as historical honesty or close as superseded by this refresh — Claude merge queue.
