# REPAIR C — Wire the boundary auto-posts (DESIGN)
2026-07-04 · financial-cluster §1.4 · DESIGN DOC. Owner sign-off gate.

## Problem (BF4/BF6)
Invoice /send posts NO GL (AR only via a hand-run batch); customer payment posts NO GL (AR never clears;
factoring liability never settles — `postFactoringCustomerPaymentEvent` called nowhere); bill/bill-payment
GL not auto-wired (`postBillPaymentGlIfEnabled` dead); source-row + GL span two commits (orphan-JE window).

## Design (recognize-at-invoice lock; everything links to the load — decision H)
1. Invoice → AR at create/send (Dr ar_control / Cr revenue), synchronously in the create/send txn or via a
   worker on the existing `invoice.sent` spine event. Retire the manual batch as the sole path.
2. Customer payment (same txn as the application): factored → `postFactoringCustomerPaymentEvent`
   (Dr factoring_advance_liability / Cr ar_control); unfactored → Dr cash / Cr ar_control.
3. Bill / bill-payment: call the posters inside the create/pay txn; wire the dead `postBillPaymentGlIfEnabled`;
   wire `/categorize-bulk` to the same GL path as single categorize (BF10-A). Requires the `ap_control`
   designation migration to land first.
4. Give the posters an optional `client` param so each 'source + GL' is ONE atomic txn (closes G4-TX1).
5. Idempotency key per source (payment_id, bill_id) so a retry can't double-post (coordinate with G4-IDEM1).

## CI guards / rollout
Contract tests: /send posts AR; payment reduces ar_control (+ settles liability if factored); no poster call
outside its handler's txn; bulk-categorize posts. Neon test branch: create→send→factor→pay a load's invoice,
assert AR posts on send + clears on pay + trial balance ties. Owner sign-off before merge.
