# Relay TRANSP live proof checklist (API only)

Updated: 2026-07-16 (Cursor live Neon probe)

## Locked facts

| Item | Value |
|------|--------|
| Entity | TRANSP `91e0bf0a-133f-4ce8-a734-2586cfa66d96` |
| Staging table | `integrations.relay_fuel_transactions` |
| Canonical (after #2538) | `fuel.fuel_transactions` (no GL) |
| Flag | `RELAY_FUEL_INGEST_ENABLED` in `lib.feature_flags` **default_enabled = false** |
| Neon 2026-07-16 | TRANSP `relay_txns=0`, `fuel_txns=0` |
| Override rows for TRANSP | **none** (flag effectively OFF for TRANSP) |

## Render env (exact names)

1. `RELAY_API_BASE` = production Relay fuel-transactions base URL (no staging fallback in prod).
2. `RELAY_API_KEY_TRANSP` = Transportation key. With entity code set, code **does not** fall back to bare `RELAY_API_KEY` (`relayApiKey` in `relay-client.ts`).
3. After env change: **Manual Restart** on API service.

## DB flag (required before backfill pulls TRANSP)

**2026-07-16 Neon:** TRANSP has **no** `lib.feature_flag_overrides` row for
`RELAY_FUEL_INGEST_ENABLED`. Global default is **false**. Backfill/cron will skip TRANSP until an override is ON.

Enable per-entity override via Owner feature-flag UI (preferred — do **not** flip global default).

```sql
-- preview
SELECT flag_key, default_enabled FROM lib.feature_flags WHERE flag_key = 'RELAY_FUEL_INGEST_ENABLED';
SELECT * FROM lib.feature_flag_overrides
 WHERE flag_key = 'RELAY_FUEL_INGEST_ENABLED'
   AND operating_company_id = '91e0bf0a-133f-4ce8-a734-2586cfa66d96';
```

## Trigger backfill (Owner/Administrator session)

```http
POST /api/integrations/relay/fuel/backfill
Content-Type: application/json

{ "months": 24 }
```

Returns `202` `{ "status": "relay_fuel_backfill_started", "months": 24 }`. Cron alone only pulls **yesterday**.

## Prove

```sql
SELECT COUNT(*) FROM integrations.relay_fuel_transactions
 WHERE operating_company_id = '91e0bf0a-133f-4ce8-a734-2586cfa66d96';
-- after #2538 deploy:
SELECT COUNT(*) FROM fuel.fuel_transactions
 WHERE operating_company_id = '91e0bf0a-133f-4ce8-a734-2586cfa66d96'
   AND notes ILIKE '%relay_bridge=1%';
```

## Merge order remaining

1. #2538 Relay canonical bridge (`JORGE-APPROVED`) when CI green
2. #2539 QBO Step-2 mdata (`JORGE-APPROVED`) when CI green

Owner helper: `CONFIRM=1 bash OWNER-MERGE-REMAINING.sh`
