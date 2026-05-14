# Email queue smoke — operator notes (`npm run smoke:email-queue`)

## What it proves

`scripts/smoke-tests/email-queue-e2e.ts` inserts one row into `email.email_queue` addressed to **`test@ih35dispatch.com`**, waits up to **60 seconds** for the asynchronous processor to reach a terminal state (`sent` or `failed`), prints **PASS/FAIL with timing**, then deletes the row (and any dependent `email.email_alerts` rows).

## Prerequisites

| Requirement | Why |
| --- | --- |
| `DATABASE_URL` **or** `DATABASE_DIRECT_URL` | Script talks to Postgres with Lucia bypass (`SET ROLE ih35_app`). |
| Worker tick enabled where email cron runs | Rows only leave `queued` when `processEmailQueueTick` executes (`EMAIL_CRON_ENABLED=true` in API processes per `apps/backend/src/email/cron.ts`). |
| Valid template payload | Uses allowed key `report-cadence` + vars `{ subject, htmlBody, textBody }`. |

## Environment knobs

| Variable | Purpose |
| --- | --- |
| `EMAIL_QUEUE_SMOKE_SKIP=1` | Skip cleanly (exit 0). |
| `EMAIL_SMOKE_OPERATING_COMPANY_ID` | Force company UUID (defaults to `org.companies.code = 'TRANSP'` when unset). |

## Expected outcomes

- **PASS (`sent`)** — provider credentials OK and cron picked up the row within the polling window.
- **FAIL (`failed`)** — provider rejected render/send; inspect `email.email_queue.error_message` **before** cleanup if you patch script temporarily.
- **FAIL (timeout)** — cron disabled, provider missing, or backlog contention.

## CI guidance

Local developer machines run this after `npm run dev` with email cron enabled. CI without Postgres/email should export `EMAIL_QUEUE_SMOKE_SKIP=1` **or** omit DB URLs so the script exits **SKIP (0)** intentionally.
