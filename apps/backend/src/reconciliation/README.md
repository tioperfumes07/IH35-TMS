# Reconciliation

## Alert Routing (DS-REMEDIATE-5)

- Hook point is inside `persistFinding()` in `reconciliation-worker.service.ts`, after successful INSERT/UPDATE.
- Severity gate:
  - SMS alert only for `critical`.
  - `important` and `cleanup` do not enqueue SMS.
- Idempotency:
  - Initial critical insert uses dedupe key `recon_alert:{finding_id}:initial`.
  - Severity escalation to critical uses `recon_alert:{finding_id}:escalation`.
- Recipient resolution priority:
  1. `org.companies.phone`
  2. `ALERT_PHONE_<COMPANY_CODE>` (from `org.companies.code`)
  3. If neither exists, emit audit event `alert_recipient_missing` and skip enqueue.
- Enqueue target is `outbox.events` with event type `twilio.sms.send`.
