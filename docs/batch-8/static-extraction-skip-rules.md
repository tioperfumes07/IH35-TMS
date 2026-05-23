# BATCH-8 static extraction skip rules

## Why these rules exist

The BATCH-8 generator validates that historical migrations can be safely ledger-backfilled without replaying DDL. Some extracted targets cannot be validated with pure static name matching and create false failures unless they are filtered with deterministic rules.

## Rule 1: dynamic identifiers are not statically verifiable

Skip target existence checks when an extracted target contains dynamic placeholder markers:

- `%I`
- `%L`
- `%s`
- `${...}`
- `format(...)`-driven identifier templates

These are runtime-resolved identifiers. Static extraction cannot reliably infer final object names from those forms.

## Rule 2: retired names should not be treated as missing

Skip the original-name existence check when a target is renamed or dropped by a subsequent migration in the same `db/migrations` chain.

The detection follows later SQL for:

- `ALTER ... RENAME TO ...`
- `ALTER ... SET SCHEMA ...`
- `DROP TABLE|VIEW|INDEX ...`
- `CREATE OR REPLACE VIEW ...` replacement cases

When a rename chain is found, validation follows the final resolved name and checks that target instead of the original name.

## Operational impact

- Prevents false positives that previously blocked BATCH generation.
- Keeps checks strict for static, still-active targets.
- Preserves stop-on-failure behavior for genuine mismatches.
