# WhatsApp Cloud API live smoke (`npm run smoke:whatsapp`)

This script attempts to send a **real** WhatsApp template message.

## Gate

1. `WHATSAPP_BUSINESS_VERIFIED` must be exactly `"true"` (Meta Business Verification gate).
2. `WHATSAPP_SMOKE_RECIPIENT` must be set.

If either gate fails, the script exits **0 with SKIP**.

## Required environment variables (when enabled)

| Variable | Purpose |
| --- | --- |
| `WHATSAPP_ACCESS_TOKEN` | WhatsApp Cloud API token |
| `WHATSAPP_PHONE_NUMBER_ID` | Sending phone number id |

## Optional / trigger variables

| Variable | Purpose |
| --- | --- |
| `WHATSAPP_BUSINESS_VERIFIED` | Must be `"true"` to attempt sending |
| `WHATSAPP_SMOKE_RECIPIENT` | Recipient phone (digit/E.164-ish formats vary by sender normalization) |

## Render notes

Keep WhatsApp smoke disabled until templates + sender setup are verified end-to-end. Prefer staging environments first.

## Command

```bash
npm run smoke:whatsapp
```
