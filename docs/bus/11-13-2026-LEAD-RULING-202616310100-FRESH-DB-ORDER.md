# LEAD RULING — 202616310100 checksum override (fresh-DB migration order) — 11-13-2026 06:55Z

Main red (build-typecheck-heavy, security-audit-heavy) on 09f316f2b: on a fresh database `202616310100_eng60_drop_insurance_lawsuit.sql` runs before `202616311200_eng60_matters_lawsuit_fk_to_legal_matters.sql`, while `legal.matters.matters_insurance_lawsuit_id_fkey` still references `insurance.lawsuit` → `cannot drop table insurance.lawsuit because other objects depend on it`.

Production applied them in the other order (`202616311200` 2026-11-03 18:03Z, `202616310100` 2026-11-13 05:19Z), so on production the FK already references `legal.matters`.

Change: before the DROP, the file drops `matters_insurance_lawsuit_id_fkey` ONLY while it still references `insurance.lawsuit`; `202616311200` re-creates it against `legal.matters`. On production the condition is false — the edited file does nothing new there. Verified on a scratch database in both orders (fresh order: drop → FK re-created to legal.matters; re-run: no-op).

Override: ledger 27a2b34ff4d2fb409b4a78ba2bc080c1c7d7b649f6e1035cb1497887ebb9c4c3 (prod _system._schema_migrations) → disk 567528164169a60fd61c5a5ff5d22fd45c4e32c48a6616509a3192351d6213c4.
