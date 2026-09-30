# Cursor · ROUND 285.4.10 — #60 invoice auto on BOL → Faro queue

## VERDICT: BE + FE WIRED ON MAIN. Chrome click waits on FE deploy carrying `1f96a24c34`.

## WHAT I DID

1. **`autoInvoiceOnBol` service** (BE, `#23249` `ee3a6290fe`) — BOL gate; missing BOL → audit `accounting.invoice.awaiting_bol`; present → draft/send + Faro submit.
2. **Delivery latch + late BOL upload retry** — wired.
3. **Named queue API** — `GET /api/v1/dispatch/awaiting-bol-invoice`.
4. **FE queue (this turn, `#23297` `1f96a24c34`)** — `listAwaitingBolInvoice` · `AwaitingBolInvoicePage` · route `/dispatch/awaiting-bol-invoice` · Documents › Awaiting BOL (red badge) · sidebar flyout · arch design tab · guard FE asserts.

## LIVE (Neon USMCA, bypass measured)

Awaiting BOL (no `docs` BOL category file): **3 loads** — **13626**, **13625**, **13615** (all `completed_docs_received`, `has_invoice=true`).

Detention METHOD Chrome: **0** USMCA `detention_requests`, **0** `detention_events` — no seat fixtures; Print METHOD waits for a real approve with `approval_method`.

## GUARD / TESTS

```
node scripts/verify-auto-invoice-on-bol-wired.mjs → OK (BE + FE needles)
npx vitest run AwaitingBolInvoicePage + DispatchSubnav → 7 passed
```

## FILES (FE)

- `apps/frontend/src/api/dispatch.ts`
- `apps/frontend/src/pages/dispatch/AwaitingBolInvoicePage.tsx`
- `apps/frontend/src/pages/dispatch/__tests__/AwaitingBolInvoicePage.test.tsx`
- `apps/frontend/src/components/dispatch/DispatchSubnav.tsx` (+ planners test)
- `apps/frontend/src/routes/manifest.tsx`
- `apps/frontend/src/components/layout/sidebar-config.ts`
- `scripts/verify-auto-invoice-on-bol-wired.mjs`
- `docs/specs/IH35_ARCHITECTURAL_DESIGN.md`

## NEXT

1. FE deploy carrying `1f96a24c34` (Rule 42: on-demand for Chrome, not per-merge spam).
2. Chrome: Documents › Awaiting BOL → table shows 13626/13625/13615.
3. One BOL upload on a waiting load → invoice send → Faro queue proof (screenshots + live row).
4. METHOD Print when a real detention approve stamps `approval_method`.
