# BANK-LINK-01 — counterparty same-entity FK (schema LIVE — ops/browser)
**FINDING:** BANK-LINK-01 (P1) · **Lane:** NON-FINANCIAL ops/browser · **Module:** banking.
**REWRITE 2026-07-25:** migration `202608050000_bank_link_01_counterparty_same_entity_fk` is **APPLIED on Neon** (`bank_tx_categorization_vendor_same_entity_fkey` exists). Drop any remaining Neon-apply hold language. Remaining = **ops density + browser both-way drill**.

## RESPOND-BEFORE-CODING (Rule 00/02)
Spec: Law §9 banking linkage · WF-012 single-link · NEVER-DELETE
NEW SPEC: None · no flag flips · OWNER decides · Fine GL decided

## PROD TRUTH  [GUARD-VERIFIED 2026-07-25 Neon]
- Constraint `bank_tx_categorization_vendor_same_entity_fkey` (and peer customer FK per mig) **present**.
- Scoreboard must not claim migration hold.
- Live counterparty FK density + categorize→reload→reverse drill TRANSP+USMCA still required before PASS (Rule 23).

**Step 1:** lucia counts of bank_transactions with categorization_vendor_id / categorization_customer_id populated; browser categorize with vendor/customer → reload hydrate → reverse from vendor/customer.

## LINKAGE
1. `banking.bank_transactions` ↔ `mdata.vendors` / `mdata.customers` (same-entity composite FKs)
2. Hubs: org.companies · bills/payments/transfers EntityLink where applicable
3. Banking Categorize F+R
4. Deployed SHA: coder fills

## THE FIX
1. Scoreboard: **applied; ops-density / browser only** — clear Neon-apply HOLD / `future_block` Neon-apply text.
2. Operator categorize volume or targeted smoke to raise FK density.
3. Browser both-way proof; keep guards 1441/1482.

## GUARD
`verify-bank-link-01-counterparty-fk` (1482) + code-level 1441. Density/browser honesty before PASS.

## GIT-GATE COMMIT KEYS
FINDING: BANK-LINK-01
LANE: NON-FINANCIAL
DOD-C / VERIFY-4: UNVERIFIED until live density + browser F+R
MODULE_PROGRESS: banking N of M
ITEMS_TOUCHED: BANK-LINK-01
MIGRATE: **APPLIED** `202608050000` — no further Neon-apply for this mig
ROOT CAUSE: schema half was held; now live — remaining is ops/browser linkage proof
FIX: scoreboard honesty + categorize density + browser reverse drill
GUARD: 1482 / 1441
LIVE PROOF: UNVERIFIED: FK exists; browser F+R + density not closed
REMAINING: ops categorize + TRANSP+USMCA hydrate
