# Twilio SMS smoke test (live send)

This repo includes a **gated** CLI smoke script that can send a **real SMS** via Twilio.

## When to use

- Validate Twilio credentials + messaging permissions on Render (or locally) without going through the full TMS UI flows.

## Prerequisites

Set standard Twilio env vars (same as production SMS):

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_FROM_NUMBER` (aliases supported by sender: `TWILIO_SMS_FROM`, `TWILIO_FROM`)

Set the **optional** recipient gate:

- `TWILIO_SMOKE_RECIPIENT`: owner cell number (recommended E.164, e.g. `+15551234567`)

## Run

```bash
npm run smoke:twilio-sms
```

## Behavior

- If `TWILIO_SMOKE_RECIPIENT` is **not set**, the script exits **0** and prints `SKIP` (safe for CI).
- If Twilio credentials are missing/misconfigured, Twilio returns an error and the script exits **non-zero**.

## Safety

Only run this against numbers you own/control. This sends a real outbound SMS billed to your Twilio account.
