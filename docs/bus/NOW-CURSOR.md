# NOW-CURSOR — 2026-09-26 (Creator invoice + Faro Post LIVE)
## CURRENT
**SHIPPED + DEPLOYED:** #22843 squash `8942623a99` · healthz `git_sha=8942623a99…` (shallow HTTP 200).

Creator Post (delivered loads): `buildInvoiceFromLoad` + `sendDraftInvoice(historical_backfill)` in-tx;
after commit `faro_usmca` → `autoSubmitDeliveredLoadToFactor` + `syncSettlementLoadsToBilling`.
Not-delivered skips invoice/Faro.

## NEXT
1. Owner Chrome: Settlements `?creator=1` Post a delivered faro_usmca load → prove invoice `sent` + Faro `submitted`
2. Edit = void + repost (next slice)

## COORD
- LANE_CROSS: `docs/bus/09-26-2026-LEAD-RULING-CURSOR-CREATOR-INVOICE-FARO-POST-LANE-CROSS.md`
- USMCA only · Never POST Book Load · No QBO write-back
