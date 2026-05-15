# WhatsApp Cloud API smoke test (live send)

This repo includes a **gated** CLI smoke script that can send a **real WhatsApp template message**.

## Default state (Meta approval pending)

WhatsApp sending remains **disabled** until business verification is complete:

- `WHATSAPP_BUSINESS_VERIFIED` must be exactly `true` or the script exits **0** with `SKIP`.

This matches production safety defaults (Cloud API sends should not run until verified).

## Prerequisites (when enabled)

- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- Optional: `WHATSAPP_TEMPLATE_LANGUAGE` (defaults to `en_US`)

Recipient gate:

- `WHATSAPP_SMOKE_RECIPIENT`

## Run

```bash
npm run smoke:whatsapp
```

## Behavior

- If `WHATSAPP_BUSINESS_VERIFIED !== true`, exits **0** (`SKIP`).
- If `WHATSAPP_SMOKE_RECIPIENT` is missing, exits **0** (`SKIP`).
- Uses template `ih35_settlement_ready_v1` with harmless smoke variables.

## Safety

Only run against recipients you control. Live sends may be billed according to your Meta/WhatsApp pricing tier.
