# FEED · CC-1 · GO-0013 · overwrite

`git pull --ff-only origin main`
ACK: `CC-1 | ACK | GO-0013 | NOW=ledger-finding-type-check | SHA=069d531 | GO`

## NOW
USMCA money monitor is dark. Land **one** additive migration that widens `_system.reconciliation_findings` `finding_type` CHECK: keep the 8 live values from `pg_get_constraintdef` (do not retype from TypeScript) and add the five detector literals. Number **`202613260000`** if still strictly above `origin/main` max **and** live `_system._schema_migrations` max (`202613241200` applied; repo already has `202613250100` unapplied on prod). Idempotent DROP+ADD CHECK. No ledger row rewrite. No new GL math.

Then **one** guard that parses `findingType:` literals from `ledger-integrity-detectors.service.ts` (and worker FindingType if needed) vs allowed list in `db/migrations/*.sql`. `--selftest` must plant the miss in a **migration copy**, not in the service. Claim-reserve ≡1 **before** authoring `NNNN-*.mjs`. Apply on Neon yourself after merge. Do not prod-only ALTER.

Do not rebuild G1 / dual-pay / F9519 / #17039.

## Forbidden
Prod-only patch. New GL math. 9000 fail-closed. Void-all. INV-10. QBO / TRANSP / TRK work. `trigger_deploy`. U14 restamp. Skip #15546.
