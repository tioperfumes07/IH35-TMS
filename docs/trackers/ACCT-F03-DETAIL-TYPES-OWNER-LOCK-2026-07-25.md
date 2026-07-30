# ACCT-F03 / LINK-02 — detail_types · OWNER WIRE (unlocked)

**FINDING:** F03 / LINK-02 · **Lane:** FINANCIAL · **Status:** WIRED on Neon (2026-07-25 apply) · scoreboard PASS 2026-07-30

## Owner ruling (final)

| Decision | Source |
|---|---|
| **WIRE** real FK `catalogs.accounts.detail_type_id` → `catalogs.detail_types` | Owner 2026-07-25 + questionnaire LOCK `LINK-02 = WIRE` |
| Unlock marker | `DETAIL_TYPES_FK_OWNER_UNLOCK` in `db/migrations/202608080000_acct_link_02_accounts_detail_type_fk.sql` |
| `account_subtype` | Remains **TEXT display cache** (QBO spelling) — never drop / never coerce to uuid |

## Prod truth (Neon `br-fancy-credit-akjnd07a`, lucia 2026-07-30)

| Object | Truth |
|---|---|
| `catalogs.accounts.detail_type_id` | Column + FK `accounts_detail_type_id_fkey` present |
| Ledger | `202608080000_acct_link_02_accounts_detail_type_fk.sql` in `_system._schema_migrations` |
| Backfill density | 42 / 1238 live accounts bound (best-effort); NULL OK until operator re-save |
| `account_subtype` | Still TEXT |

## Regression lock (post-WIRE)

`scripts/verify-detail-types-owner-lock.mjs` + verify-step **1470**:

1. Forbidden: any **new** migration adding `detail_type_id` / FK **without** `DETAIL_TYPES_FK_OWNER_UNLOCK`.
2. Forbidden: `ALTER account_subtype TYPE uuid`.
3. Required: unlock migration present; `ACCT-LINK-02` / `ACCT-SURF-06` may be **PASS** when evidence cites live `detail_type_id` column + ledger.

## Companion

- `docs/trackers/NEON-APPLY-LINK-02-DETAIL-TYPE-FK-2026-07-25.md`
- Prior TEXT-only lock language below is **superseded** by WIRE (kept for audit trail only).

---

### Historical (superseded 2026-07-25 WIRE)

Earlier draft locked TEXT-only with no FK. Owner unlocked with `DETAIL_TYPES_FK_OWNER_UNLOCK`. Do not re-lock.
