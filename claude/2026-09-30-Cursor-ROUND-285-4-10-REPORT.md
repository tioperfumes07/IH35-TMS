# Cursor · ROUND 285.4.10 — #60 invoice auto on BOL → Faro queue

## VERDICT: WIRED (code + guard + unit tests). Live Chrome click still required after deploy.

## WHAT I DID

1. **`autoInvoiceOnBol` service** — BOL gate using the same `docs.files` + `catalogs.file_categories.code='bol'` predicate as the factoring queue. Missing BOL → durable audit `accounting.invoice.awaiting_bol` (never silent). Present BOL → ensure official draft (create via `buildInvoiceFromLoad` if none; convert proforma if needed) → `sendDraftInvoice` → link BOL file onto the invoice.
2. **Delivery latch** — `convertAndSendInvoiceOnDelivery` now calls `autoInvoiceOnBol` instead of convert-only (which skipped loads with no proforma and ignored BOL).
3. **Late BOL upload/link retry** — `docs/files` upload-complete + load link fire `maybeFireAutoInvoiceAfterBolSaved` → invoice then `autoSubmitDeliveredLoadToFactor` (Faro purchase queue).
4. **Named queue** — `GET /api/v1/dispatch/awaiting-bol-invoice?operating_company_id=` returns delivered loads waiting on BOL (`waiting_for: "BOL"`).
5. **Guard** — `scripts/verify-auto-invoice-on-bol-wired.mjs` + gate-step-map ownedPaths. Unit tests 3/3 PASS.

## BOUNDARY (proforma)

Proforma stays a non-posting cash-flow projection. This path never posts a proforma; it converts or creates an official draft before send. Factoring auto-submit still refuses non-`sent` invoices.

## GUARD / TESTS

```
node scripts/verify-auto-invoice-on-bol-wired.mjs → OK
npx vitest run src/accounting/__tests__/auto-invoice-on-bol.test.ts → 3 passed
```

## FILES

- `apps/backend/src/accounting/auto-invoice-on-bol.service.ts`
- `apps/backend/src/accounting/__tests__/auto-invoice-on-bol.test.ts`
- `apps/backend/src/dispatch/delivery-evidence-latch.ts`
- `apps/backend/src/dispatch/awaiting-bol-invoice.routes.ts`
- `apps/backend/src/docs/maybe-fire-auto-invoice-after-bol.ts`
- `apps/backend/src/docs/files.routes.ts`
- `apps/backend/src/index.ts`
- `scripts/verify-auto-invoice-on-bol-wired.mjs`
- `scripts/.gate-step-map.json`

## NEXT

285.4.9 Documents WIP (v10 PDFs — downtime ledger / APPROVED BY+METHOD / draft-expense flag / idle events). Deploy + live proof of awaiting-bol queue + one BOL→invoice→Faro path.
