# ENG-26 DONE-LIVE — 2026-10-28 CT

## Migrations applied
- `202616301300_posting_source_load_id_factoring_deposit.sql` — deposit + lifecycle types
- `202616301400_posting_source_load_id_factoring_rule3_and_backfill.sql` — RULE 3-safe + 15 stamp backfill

## Guards
- `verify-every-load-born-posting-carries-its-load` **OK** — 8121 since stamp mig, **0** mismatched; 7139/7139 stamped
- `verify-every-load-born-document-and-posting-traces-to-its-load` PASS

## Residual (named, not RULE 2)
ENG-26 shrink print: 245/260 factoring_advance+driver_settlement without load_id (historical multi-load / no-invoice) — separate backfill if owner orders.
