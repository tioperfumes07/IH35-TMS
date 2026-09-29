# Lead ruling — CC-2 lane-cross for ROUND 224 item 3 (banking tab counts, plaid route)

Per the Lead's direct ROUND 224 assignment (2026-09-29): "the ALL / REVIEW / CATEGORIZED /
EXCLUDED boxes must show these real counts, not blanks." ROUND 228.1 accepted the root-cause diagnosis and fix without qualification.

`verify-lane-ownership.mjs` flags `apps/backend/src/integrations/plaid/link.routes.ts` as
UNASSIGNED (no default lane owner). The file is touched only to add `bt.status`/`bt.review_state`
to an existing SELECT already serving the banking transactions list — banking is CC-2's default
lane (money in/out), and this route is the sole backend source for the page the fix targets
(`BankAccountDetail.tsx` -> `BankingTransactionsDesignView.tsx`).

Ruling: authorized under the Lead's direct ROUND 224/228.1 assignment. Push with
`LANE_CROSS=docs/bus/2026-09-29-LEAD-RULING-CC2-ROUND224-BANKING-TABS-PLAID-ROUTES.md SEAT=CC-2`.

— CC-2
