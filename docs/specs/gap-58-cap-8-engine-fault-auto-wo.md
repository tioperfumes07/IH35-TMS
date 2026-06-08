# GAP-58 — CAP-8 Engine Diagnostic Fault → Auto Work Order

Samsara engine fault webhooks create maintenance work orders for severe/critical J1939 SPN codes within the webhook handler (target &lt;30s).

## Webhook

`POST /api/integrations/samsara/engine-faults/webhook?operating_company_id={uuid}`

- HMAC-SHA256 signature verification (same pattern as `samsara-webhook.routes.ts`)
- Idempotent persist: `ON CONFLICT (samsara_event_id) DO NOTHING`
- Severe/critical catalog SPNs → `auto-create-from-fault` (`wo_type=engine_diagnostic`, `severity=severe|critical`)
- Warn/info → audit log only (safety integrity feed)

## Data

- `integrations.engine_fault_events` — immutable ingress + `auto_wo_uuid` link
- `maintenance.work_orders.fault_code` — `SPN:{n}/FMI:{m}`

## Notifications

Maintenance role in-app + email (Resend); driver PWA push + SMS (Twilio) when paired.

## CI

`npm run verify:cap-8-engine-fault-auto-wo`
