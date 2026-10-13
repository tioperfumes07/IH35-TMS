# Lead ruling — CC-1 lane cross: relay-deposit-post.service.ts (UNASSIGNED)

**Date:** 2026-10-11
**PR:** Claude-1-443.77 / cc-1/443-77-static-reds
**Ruling source:** Lead ROUND 443.77 instruction — "main e9cebac is red on CI in exactly these: verify-no-internal-payload-in-notes (build-typecheck) ... Fix these THREE first in your 443.77 PR and merge - main CI green is the DONE line."

## Cross authorized

| File | From lane | To lane | Reason |
|------|-----------|---------|--------|
| `apps/backend/src/integrations/relay-payments/relay-deposit-post.service.ts` | UNASSIGNED | CC-1 | Fix verify-no-internal-payload-in-notes CI red — remove d.deposit_id UUID from memo/description literals; CC-1 owns the main CI green gate per Lead order |

## Change scope

Remove internal UUID (`d.deposit_id`) from 3 memo/description template literals in relay-deposit-post.service.ts. Replace with `d.entry_date`. No behavioral change — spine link via `source_transaction_id` unchanged.

## Guard outcome

`verify-no-internal-payload-in-notes.mjs` → OK (31 id-in-memo writer site(s) left in shrink-only baseline; 3 relay-deposit violations removed).
