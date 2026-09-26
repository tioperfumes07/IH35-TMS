# LANE_CROSS — CURSOR — Settlement Creator invoice mint + Faro Post — 2026-09-26

## Authorization

Owner, verbatim (session 2026-09-26 CT), after Creator AlwaysTrack numbers live (`44bba06e0f`):

> "OK CONTINUE LETS GO."

Preceding MEMORY_BANK open item (R-186.2): invoice mint + Faro auto-submit on Creator Post
(`buildInvoiceFromLoad` / `sendDraftInvoice` / `autoSubmitDeliveredLoadToFactor` /
`syncSettlementLoadsToBilling`).

Cursor owns R-186.2 Creator live delivery. This is owner-ordered continuation of the same Creator
vertical — not a new CC-1/CC-3 sweep.

## Files touched outside CURSOR's default lane map

1. `apps/backend/src/driver-finance/settlement-creator.service.ts` — delivered → mint+send invoice
2. `apps/backend/src/driver-finance/settlement-creator.routes.ts` — after-commit Faro + billing sync
3. `apps/backend/src/driver-finance/settlement-creator.types.ts` — `invoice_ids` / factoring ids
4. `scripts/verify-settlement-creator-ties-document.mjs` — guard asserts invoice/Faro wire
5. `docs/MEMORY_BANK.md` — close the BE follow-up

## What is NOT claimed

- No QBO write-back
- No Neon INSERT seed as feed substitute
- Not-delivered loads still skip invoice/Faro
- Faro auto-submit is submit-only (no funding JE) — funding stays Faro CSV / advance path
- R-186.1 (no AT mint on Book Load open) unchanged

## Gate wire

```
LANE_CROSS=docs/bus/09-26-2026-LEAD-RULING-CURSOR-CREATOR-INVOICE-FARO-POST-LANE-CROSS.md
```
