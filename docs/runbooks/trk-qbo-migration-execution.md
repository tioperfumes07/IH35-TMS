# TRK → TMS QBO Migration Runbook (P5-T24)

Status: read-only verification scaffold shipped  
Entity: **TRK** (IH 35 Trucking LLC asset holder)  
Constraint: **No QBO writes** without explicit per-step chat approval from Jorge.

## Preconditions

1. `QBO_REALM_ID_TRK` configured in Render env.
2. TRK read-only migration window scheduled (4–6h).
3. Neon backup verified (`docs/operations/BACKUP_DR.md`).

## Runbook steps

| Step | Action | TMS endpoint |
|------|--------|--------------|
| 1 | Preflight env + realm | `GET /api/v1/integrations/qbo/trk-migration/status` |
| 2 | Snapshot QBO archive baseline | Verify `archive_entity_count > 0` in status |
| 3 | Map chart of accounts | Confirm `tms_coa_count` matches expected TRK COA |
| 4 | Import open AR/AP | Compare `tms_open_ar_cents` / `tms_open_ap_cents` |
| 5 | Reconcile trial balance | `POST /api/v1/integrations/qbo/trk-migration/verify` |
| 6 | Post-cutover verification | Re-run verify; all checks must pass |

## Verification

```bash
curl -s "$API/api/v1/integrations/qbo/trk-migration/verify?operating_company_id=$OC_ID" \
  -X POST -H "Cookie: ..." | jq '.all_pass, .verification'
```

## Rollback

- Do not mutate QBO during read-only window.
- If TMS import fails, restore Neon branch per `docs/dr-runbook.md`.

## Out of scope (this block)

- Live QBO POST/PUT/DELETE calls
- TRANSP entity data
