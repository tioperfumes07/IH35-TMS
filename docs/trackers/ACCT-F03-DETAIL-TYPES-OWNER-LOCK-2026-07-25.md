# ACCT-F03 — detail_types island · OWNER LOCK: account_subtype stays TEXT

**FINDING:** F03 · **Lane:** FINANCIAL-HOLD · **Status:** RECORD ONLY — no schema change, no FK wire.

## Owner lock (frozen 2026-07-25)

`catalogs.accounts.account_subtype` remains **free TEXT** (QBO AccountSubType spelling). It is **NOT**
wired to `catalogs.detail_types` via FK. This is a deliberate owner decision — not a linkage defect to
auto-fix.

| Object | Prod truth (lucia 2026-07-25) | Decision |
|---|---|---|
| `catalogs.detail_types` | 144 rows, all `operating_company_id` NULL, 0 inbound FKs | SHARED-CANONICAL island — excluded from per-entity scoping |
| `catalogs.accounts.account_subtype` | `text` column, populated per entity | **OWNER-LOCKED TEXT** — no `detail_type_id` column |

## Pre-condition to wire the FK (do NOT build without all three)

1. **Written owner unlock** containing the marker `DETAIL_TYPES_FK_OWNER_UNLOCK` in the same PR/migration.
2. **CPA review** of CoA subtype normalization impact (parallel books; no silent balance-sheet moves).
3. **Additive migration only** — never delete the TEXT column history; backfill FK separately if approved.

Until then: Lists/CoA pickers may **read** `catalogs.detail_types` for UX filtering, but persistence stays
`account_subtype` TEXT.

## Regression lock

`scripts/verify-detail-types-owner-lock.mjs` + verify-step **1470** — FAILs on forbidden FK /
`detail_type_id` DDL without the unlock marker; PASSes while TEXT lock is recorded.

## Companion pointers

- `docs/trackers/FINAL-TABLES-WIRING-FOR-CODER-2026-07-05.md` §A.1 FK islands
- `docs/trackers/GLOBAL-BY-DESIGN-CATALOGS-2026-07-25.md` — detail_types explicitly NOT in GLOBAL set
- `docs/module-completion/accounting.json` — `ACCT-LINK-02` owner HOLD
