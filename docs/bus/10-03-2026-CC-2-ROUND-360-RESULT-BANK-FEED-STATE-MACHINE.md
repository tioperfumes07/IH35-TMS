# CC-2 — ROUND 360 RESULT — THE BANK FEED STATE MACHINE — 2026-10-03

Spec: `docs/bus/00-CONTRACT-BANK-FEED-STATE-MACHINE-MATCH-UNMATCH-CATEGORIZE-UNDO.md`. One engine:
`apps/backend/src/banking/bank-line-state-machine.service.ts`. Migration `202615350600_bank_feed_bucket_and_kind.sql`.

## WHAT IS BUILT
- `review_bucket` (for_review | categorized | excluded) + `resolution_kind` (added | matched | transfer | split), DERIVED by
  trigger `banking.bank_line_classify()` from the line's own links on every write — no writer types a bucket. Every writer
  now DECLARES its kind (match -> matched, categorize / post-as-bill / Faro poster -> added, transfer, split).
- CHECKs: three buckets only; categorized <=> kind present AND a live link; for_review/excluded => kind NULL AND no link.
- UNDO by kind, one transaction on the caller's client, re-read + throw if the line is not in For review:
  added -> categorization JE reversed ONCE (already-reversed = GL no-op), the bills / bill payments / payments the line
  created voided through the governed void path; matched -> link broken only (document untouched, its own
  source_bank_transaction_id + cleared_date cleared, every live match row of the line voided, any kind); transfer -> only a
  transfer THIS line minted is revoked, a pre-existing transfer is only unlinked; excluded -> exclusion cleared.
- Entries the MATCH ITSELF creates (deposit sweep of a receipt in a holding account = QuickBooks' Bank Deposit, variance,
  Faro Rsv Deposits, fuel/Relay fill, chargeback) are reversed on unmatch, and re-posted on re-match (`repost`, BANK-F05
  pattern). For a receipt deposited straight to the bank (the 2026-10-02 ruling's default) match posts NOTHING.
- CLEARED = categorized OR matched: the register's C already derives live from the links (account-register.service.ts
  415-442) — fed, not rebuilt; payments / bill payments get cleared_date from the bank line's date on match, cleared on unmatch.
- Tabs read `review_bucket`; Action label from `resolution_kind`; "Action: Matched / Added" is a FILTER, never a tab.
- Both undo routes, /unmatch and link-suggestions undo all run this engine. Transfer create (incl. from a bank line),
  mark-as-transfer and revoke post their GL on the same client.

## GUARDS — ceiling 0, registered in money-pr-local-gate, every one with a planted selftest
verify-bank-line-buckets-are-the-three-tabs · verify-categorized-has-a-document · verify-for-review-has-no-document ·
verify-undo-leaves-no-document-behind · verify-unmatched-document-is-matchable-again · verify-match-posts-nothing ·
verify-undo-is-single-transaction. Live guards run unscoped across every company EXCEPT the frozen one (below).

## FINISH TEST — fork br-billowing-heart-akkt6s3g (prod copy, migration applied with scripts/db-migrate.mjs in prod mode, second pass 0), PASTED
```
=== 1. EXPENSE — categorize -> UNDO ===
  start      bank 152394.11  expense 5.00  line {"review_bucket":"for_review","resolution_kind":null,"review_state":"for_review","status":"pending_categorization"}
  categorized bank 152270.66  expense 128.45  line {"review_bucket":"categorized","resolution_kind":"added","review_state":"matched","status":"categorized"}
   ok: account carries it (bank -123.45, expense +123.45)
  UNDO       bank 152394.11  expense 5.00  line {"review_bucket":"for_review","resolution_kind":null,"review_state":"for_review","status":"pending_categorization"}  reversed 1
   ok: account no longer carries it
   ok: line back in For review
   ok: re-categorize after undo posts again
   ok: second undo removes it again, no double reversal
=== 1. EXPENSE — match -> UNMATCH ===
  start      bank 152394.11  TB aaed4f7bdc8b532f21bf682d40f8eae7  expense 101e4ac4-6a23-4391-8cce-1b39a2e5de9d 5.00  candidate=true
  matched    bank 152394.11  TB aaed4f7bdc8b532f21bf682d40f8eae7  line {"review_bucket":"categorized","resolution_kind":"matched","review_state":"matched","status":"pending_categorization"}
   ok: match posts nothing (trial balance unchanged)
  UNMATCH    bank 152394.11  TB aaed4f7bdc8b532f21bf682d40f8eae7  line {"review_bucket":"for_review","resolution_kind":null,"review_state":"for_review","status":"pending_categorization"}
   ok: unmatch reverses nothing (trial balance unchanged)
   ok: expense untouched (still live)
   ok: expense matchable again
=== 2/3. BILL + BILL PAYMENT — categorize (post as bill) -> UNDO ===
  start      bank 152394.11  A/P -3542.98  uncategorized expense 5.00
  categorized bank 152159.55  A/P -3542.98  expense 5.00  bill 96869882-db26-49cb-aa7a-69def051db5d  bill_payment 86bdfa61-fce8-4cf6-8a8e-6725bca532e2  gl [{"bill_id":"96869882-db26-49cb-aa7a-69def051db5d","bill_payment_id":"86bdfa61-fce8-4cf6-8a8e-6725bca532e2","bill_posted":true,"bill_payment_posted":true}]  line {"review_bucket":"categorized","resolution_kind":"added","review_state":"matched","status":"categorized"}
   ok: bank carries it, A/P nets to zero (bill + its payment)
  UNDO       bank 152394.11  A/P -3542.98  expense 5.00  voided [{"type":"bill_payment","id":"86bdfa61-fce8-4cf6-8a8e-6725bca532e2"},{"type":"bill","id":"96869882-db26-49cb-aa7a-69def051db5d"}]  line {"review_bucket":"for_review","resolution_kind":null,"review_state":"for_review","status":"pending_categorization"}
   ok: accounts no longer carry it
   ok: the bill and bill payment the line created are voided
=== 3. BILL PAYMENT — match -> UNMATCH ===
  start      TB aaed4f7bdc8b532f21bf682d40f8eae7  bill_payment 9ad25e2a-bbd2-4e08-8775-af595ce26fa1 935.10  candidate=true
  matched    TB aaed4f7bdc8b532f21bf682d40f8eae7  cleared_date 2026-09-25  line {"review_bucket":"categorized","resolution_kind":"matched","review_state":"matched","status":"pending_categorization"}
   ok: match posts nothing (trial balance unchanged)
   ok: bill payment CLEARED from the bank line's date
  UNMATCH    TB aaed4f7bdc8b532f21bf682d40f8eae7  cleared_date null  line {"review_bucket":"for_review","resolution_kind":null,"review_state":"for_review","status":"pending_categorization"}
   ok: unmatch reverses nothing (trial balance unchanged)
   ok: bill payment untouched, uncleared, its own flags released
   ok: bill payment matchable again
=== 4. RECEIVE PAYMENT — categorize (deposit to income) -> UNDO ===
  start bank 152394.11 income -460560.72 -> categorized bank 152739.78 income -460906.39  line {"review_bucket":"categorized","resolution_kind":"added","review_state":"matched","status":"categorized"}
   ok: account carries it
  UNDO       bank 152394.11  income -460560.72  line {"review_bucket":"for_review","resolution_kind":null,"review_state":"for_review","status":"pending_categorization"}
   ok: account no longer carries it
=== 4. RECEIVE PAYMENT — match -> UNMATCH ===
  start      TB ac47e0d3eb3e197d378f6e10c83ee2ac  payment ca2ecd0c-db57-4085-9531-dd8d567db163 678.91 deposited to c7af1219-f6a6-4169-a2d8-8f556fb0c2f3  line bank e83028a5-dcda-4233-b660-5b9923b3d39c  candidate=true
  matched    TB ac47e0d3eb3e197d378f6e10c83ee2ac  cleared_date 2026-10-03  line {"review_bucket":"categorized","resolution_kind":"matched","review_state":"matched","status":"pending_categorization"}
   ok: match posts nothing (deposited straight to the bank: no sweep)
   ok: payment CLEARED
  UNMATCH    TB ac47e0d3eb3e197d378f6e10c83ee2ac  cleared_date null  line {"review_bucket":"for_review","resolution_kind":null,"review_state":"for_review","status":"pending_categorization"}
   ok: unmatch reverses nothing (trial balance unchanged)
   ok: payment untouched and uncleared
   ok: payment matchable again
=== 5. TRANSFER — categorize (mark as transfer: mints it) -> UNDO ===
  start bank 153073.02 petty 0.00 -> transfer 6fdee846-45a8-451a-835c-d39d6168cedb bank 152616.24 petty 456.78  line {"review_bucket":"categorized","resolution_kind":"transfer","review_state":"matched","status":"transfer"}
   ok: both accounts carry it
  UNDO       bank 153073.02  petty 0.00  revoked 6fdee846-45a8-451a-835c-d39d6168cedb  line {"review_bucket":"for_review","resolution_kind":null,"review_state":"for_review","status":"pending_categorization"}
   ok: transfer removed, accounts no longer carry it
=== 5. TRANSFER — match (existing transfer) -> UNMATCH ===
  start TB 8ca54ba2e2e43af0e2da97e41be76fbf -> linked to transfer d2874634-9183-4899-959c-5220502b37f5  TB 8ca54ba2e2e43af0e2da97e41be76fbf  line {"review_bucket":"categorized","resolution_kind":"transfer","review_state":"matched","status":"transfer"}
   ok: linking an existing transfer posts nothing
  UNMATCH    TB 8ca54ba2e2e43af0e2da97e41be76fbf  transfer live=true  revoked=null  line {"review_bucket":"for_review","resolution_kind":null,"review_state":"for_review","status":"pending_categorization"}
   ok: existing transfer untouched, trial balance unchanged
RESULT: PASS
```

Trial balance fingerprint (md5 over every USMCA account balance) identical before/after every match and unmatch.

## FOUND AND FIXED IN THIS BLOCK
1. Bulk Undo reversed `matched_journal_entry_id` blindly — on an unmatch that reverses a document the line never created.
2. Unmatch retired match rows for 6 kinds only: 75 of 144 live USMCA match rows sat on released lines, hiding 8 live
   expenses + 21 live driver settlements from the Match drawer permanently (46 more on voided factoring advances). The
   writer now retires every kind; the migration retires those 75 once (voided with reason, never deleted).
3. Unmatch never reversed the deposit sweep / variance / Faro Rsv Deposit entries the match created.
4. Post-as-bill never stamped the bill with its bank line, so Undo could not find the bill it created.
5. My own WIP treated a transfer with no recorded origin as created by the line — would have revoked a transfer someone
   entered directly. Now only `minted_from_bank_transaction_id = the line` is ever revoked.

## NEEDS THE LEAD — decisions, not defects I can close alone
A. **TRANSPORTATION freeze vs "run UNSCOPED".** Owner ruling 2026-10-02 §3: TRANSP is not read or written. The migration
   does not backfill TRANSP rows (columns nullable, CHECKs NOT VALID, post-conditions prove every non-frozen row) and the
   guards skip TRANSP and say so on every PASS line. If you want TRANSP included, that is the owner's call.
B. **Bill payments the operator enters are NOT match candidates.** The Match drawer offers only settlement-born bill
   payments / bills (ROUND 157-C, #22960; contradiction already filed #23345). The owner's 10-03 workflow ("enter the bill
   payment, match it when the bank line lands") needs that widened. Proven on the fork with a settlement-born bill payment.
C. **Match to an OPEN bill** is refused today (`bill` is a view-only kind). QuickBooks creates the bill payment on that
   match — a created document, so Undo must void it. Not built; say if you want it in this engine.
D. **Post-as-bill GL still posts after commit** (best-effort, own connection). Moving it into the transaction runs through
   the bill-payment poster, which you assigned to CC-1. Board row for CC-1, not duplicated here.
E. **Pre-existing red, not mine:** verify-fuel-gl-no-double-post fails on main — `isParentRule` is gone from
   apps/backend/src/integrations/plaid/plaid.service.ts.
