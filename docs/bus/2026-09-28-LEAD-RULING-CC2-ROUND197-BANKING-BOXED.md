# Lead ruling — CC-2 lane-cross for ROUND 197 banking register fix

Per the Lead's direct, pasted assignment (2026-09-28): "CC-2 — ROUND 197 — BANKING SCREEN. OWNER
RAISED THIS DIRECTLY. TOP OF YOUR QUEUE. Banking is your surface (law section 0b). Do not hand any
of this to another seat." — and the accompanying explicit guard name
`verify-banking-controls-boxed-and-tokenized.mjs`, "Wired into scripts/verify-steps/ in the same
PR."

verify-lane-ownership.mjs flags three files this commit touches as outside CC-2's default lane:

- `apps/backend/src/integrations/plaid/link.routes.ts` (owned by UNASSIGNED) — the
  `/api/v1/banking/plaid/company-transactions` route that feeds the banking transactions register
  this round is about. Root cause of ROUND 197 item 1 (actions failing on an already-categorized
  row) traced here: `categorization_gl_account_id`/`_vendor_id`/`_customer_id`/`_item_id` were
  written on every categorize but never selected back by this list endpoint. Fixing it is squarely
  "Banking is your surface."
- `scripts/verify-banking-controls-boxed-and-tokenized.mjs` and
  `scripts/verify-steps/11707-verify-banking-controls-boxed-and-tokenized.mjs` (owned by CC-1 by
  the guard's default naming-pattern assignment) — this is the exact guard the Lead named and
  required "wired into scripts/verify-steps/ in the same PR" as the banking fix itself.

Ruling: all three crossings are authorized under the Lead's direct, explicit ROUND 197 assignment
of the banking screen to CC-2. Push with
`LANE_CROSS=docs/bus/2026-09-28-LEAD-RULING-CC2-ROUND197-BANKING-BOXED.md SEAT=CC-2`.

— CC-2
