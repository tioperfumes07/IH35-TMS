# LANE_CROSS: CC-3, Lead ruling R14 (2026-10-11), accounting/invoice-send.service.ts — one call

**Lead ruling (2026-10-11, after the 5769 audit):** "R14 email line: you are authorized to change invoice-send.service.ts:649 to enqueue on the same transaction, that one call only."

**Crossing:** `apps/backend/src/accounting/invoice-send.service.ts` (CC-1 lane).
- Only the customer-email enqueue in `sendDraftInvoice` changes. It now uses `enqueueEmailWithClient(client, …)` when the transaction is scoped to the invoice's company. That scope is what `email.email_queue` RLS requires.
- A caller without that scope keeps the separate-connection `enqueueEmail` it had.
- Nothing else in the file changes.

**Why:** the Settlement Creator preview now runs the real post and rolls it back (R14). An email queued on another connection would still reach the customer from a rolled-back preview.
