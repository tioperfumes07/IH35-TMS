# GO — SAMSARA HOS ROSTER FIX (USMCA)

**Date:** 2026-09-01 · **Entity:** USMCA `5c854333-6ea5-4faa-af31-67cb272fef80`  
**Seat:** CC-3 mechanical · **Lane:** NON-FINANCIAL

---

## ROOT CAUSE

HOS pull scoped to drivers with an **OPEN** `telematics.vehicle_driver_assignments` row (INNER JOIN). Only **5** drivers met that bar on prod; **3** of the workbook **19** had open pairings. Samsara connection + cron were healthy — the roster gate was too narrow, so most Active mapped drivers never received `/fleet/hos/logs` or `/fleet/hos/clocks` polls. UI then showed in-app fallback / "—" (not certified ELD).

---

## LIVE COUNTS (Neon prod `br-fancy-credit-akjnd07a`, 2026-09-01 ~05:20Z)

| Metric | Count |
|--------|------:|
| USMCA drivers `deactivated_at IS NULL` | 94 |
| USMCA `status='Active'` + `samsara_driver_id` | 82 |
| Manifest 19 with `samsara_driver_id` | 19 |
| Manifest 19 still Active (`deactivated_at IS NULL`) | 15 |
| Manifest 19 with OPEN vehicle assignment (old roster) | **3** |
| Old HOS roster (paired-only) | **5** |
| New HOS roster (Active + samsara id, post-fix query) | **82** → **~19** after CC-1 D1 bulk inactive |
| `hos.duty_status_events` last 8d (USMCA) | 10,792 rows / 10 drivers |
| `samsara.hos_snapshots` polled last 1h | 5 drivers |
| `integrations.samsara_config` USMCA | `is_enabled=true`, `last_health_status=ok` |
| Last `samsara_hos_pull` cron | 2026-09-01T05:20:15Z, `active_drivers=5`, success |

**Samsara config columns:** `id`, `operating_company_id`, `samsara_org_id`, `api_token_encrypted`, `encrypted_api_token`, `webhook_secret_encrypted`, `is_enabled`, `last_health_check_at`, `last_health_status`, `last_error`, `connected_at`, `disconnected_at`, `token_key_version`, timestamps.

---

## FIX (code — this PR)

**File:** `apps/backend/src/integrations/samsara/active-hos-driver-roster.service.ts`

- Change `JOIN telematics.vehicle_driver_assignments` → **`LEFT JOIN`** (assignment optional).
- Add **`d.status = 'Active'`** filter alongside `deactivated_at IS NULL` + `samsara_driver_id IS NOT NULL`.
- `unit_id` still resolved from newest OPEN assignment when present (`ORDER BY a.started_at DESC NULLS LAST`).

**Guard:** `scripts/verify-samsara-hos-pull-real-clocks.mjs` — ratchet updated for Active-mapped scope (not paired-only).

**Consumers unchanged:** `syncSamsaraHosLogs`, `syncSamsaraHosClocks`, `DriverHosClocks.tsx` (reads API store — no FE change).

---

## REMAINING (CC-1 D1 — not this PR)

1. **Bulk inactive reconcile not landed:** 94 Active vs target 19 — until D1 migration merges, HOS cron will poll 82 Active+samsara (better than 5; still noisy).
2. **4 manifest REACTIVATE rows still deactivated:** Fernando Mecor Hernandez, Jose Gerardo Ruiz Flores, Ruben Pedro Perez Garcia, Vicente Santos Contreras — no HOS until reactivated.
3. After deploy + next */5 positions cron tick: expect `integration_sync_log.payload.active_drivers` ≈ 82 (now) → 19 (post-D1).

---

## PROOF TARGET (post-deploy)

```sql
SET app.bypass_rls = 'lucia';
SELECT payload->>'active_drivers' AS active_drivers
  FROM integrations.integration_sync_log
 WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80'
   AND sync_kind = 'samsara_hos_pull'
 ORDER BY finished_at DESC LIMIT 1;
-- expect >> 5

SELECT COUNT(DISTINCT driver_uuid) FROM samsara.hos_snapshots
 WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80'
   AND polled_at >= now() - interval '15 minutes';
-- expect >> 5 after one cron cycle
```

App: Book Load / dispatch board → driver with samsara id but no truck pairing → **Certified ELD** badge (not "In-app fallback").
