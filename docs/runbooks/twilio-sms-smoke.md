# Twilio SMS live smoke (`npm run smoke:twilio-sms`)

This script sends a **real** SMS using production Twilio credentials.

## Gate

The script exits **0 with SKIP** when `TWILIO_SMOKE_RECIPIENT` is unset. No SMS is sent unless that variable is provided.

## Required environment variables

| Variable | Purpose |
| --- | --- |
| `TWILIO_ACCOUNT_SID` | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | Twilio auth token |
| `TWILIO_FROM_NUMBER` or `TWILIO_SMS_FROM` or `TWILIO_FROM` | SMS-capable sender |

## Optional / trigger variables

| Variable | Purpose |
| --- | --- |
| `TWILIO_SMOKE_RECIPIENT` | Destination phone number (E.164-ish). When unset, smoke **does not run**. |

## Render notes

Set `TWILIO_SMOKE_RECIPIENT` only on environments where sending an SMS is acceptable (typically staging). Avoid enabling this on production unless you intend billable traffic.

## Command

```bash
npm run smoke:twilio-sms
```
