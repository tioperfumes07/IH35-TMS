# CC-1 → CC-2: 281.1 assist — every path in the repo that writes `voided_at` directly (2026-09-30)

Per Lead order ("enumerate every path that writes voided_at directly — raw UPDATEs, ops scripts,
repair rounds, imports — that list is what the engine fix has to eliminate"). Grepped for
`voided_at\s*=\s*(now\(\)|\$N)` (an actual assignment, not a `voided_at IS NULL` predicate) across
`apps/backend/src` and `scripts/`, then hand-filtered out non-financial modules (safety/, dispatch
cancellation/trailer-interchange, mdata driver-training/w8ben/safety-events, scheduled-reports,
work-orders/parts-inventory outside the financial void chain) — those use their own local `voided_at`
columns unrelated to the GL/void-cascade problem this round is about.

**Context for why this matters:** independently found live (this round, before this ask arrived) —
842 USMCA `accounting.expenses` rows are voided (`voided_at IS NOT NULL`) but still carry a live
(non-voided) `journal_entry_postings`-linked JE, $165,753.94 gross. Of those, 61 already have a
reversal posted against them (`reversed_by_je_id` set on the JE — net GL effect already $0, just the
JE row's own `voided_at` was never set); the other **781 have no reversal at all — a real, live,
unremediated overstatement, $79,899.34.** This enumeration is the "why": at least one of the writers
below (`accounting/expenses.routes.ts:1739`) does the void+reverse correctly in the normal case but
independently implements its own reversal call rather than going through one shared, engine-owned
path — its own comment literally says *"this route is the third writer"* of `expenses.voided_at`.
Three-plus independent reimplementations of the same void-then-reverse logic is exactly the shape
that produces a population like the 781/842 above: one writer's edge case (a JE that
`reversePostedSourceTransactionInClientTx` doesn't find, a status check that doesn't match, a path
taken before the reversal call) diverges from the others over time.

**Raw `voided_at =` writers, `apps/backend/src/accounting/**` (the core financial-document set):**
- `expenses.routes.ts:1739` — reverses via `reversePostedSourceTransactionInClientTx` first (mostly
  correct; see above)
- `expenses-bulk.routes.ts:75`
- `bills.service.ts:3056`, `:3389`, `:3521` — 3 separate writers in the SAME file
- `invoices.routes.ts:1150`
- `payments.routes.ts:734`
- `credit-memos.routes.ts:517`, `:529`
- `vendor-credits.routes.ts:527`, `:543`
- `prepaid-expenses.routes.ts:654`
- `bulk-void.service.ts:176`
- `void.service.ts:496`
- `checks/check-void.service.ts:83`
- `amortization-posting/amortization-posting.service.ts:896`
- `finance-hub-amortization-posting/loan-payment-posting.service.ts:403`
- `settlement-posting/settlement-posting.service.ts:618`

**Other financial-adjacent modules:**
- `factoring/factoring.routes.ts:517`
- `liabilities/liabilities.routes.ts:422`
- `driver-finance/void-open-driver-bill.service.ts:135`, `:141`
- `driver-finance/void-document-callees.service.ts:113`
- `driver-finance/settlement-deduction-void.service.ts:102`, `:127`, `:163`
- `driver-finance/edit-settlement-deduction.service.ts:171`
- `driver-finance/retype-settlement-deduction.service.ts:124`
- `maintenance/work-orders.routes.ts:1731`
- `maintenance/parts-invoice-links.routes.ts:334`
- `banking/reconciliation.routes.ts:508`
- `banking/bank-transaction-splits.service.ts:320`, `:1125`
- `banking/bank-tx-dedup.ts:178`, `:254`
- `banking/link-suggestions-actions.routes.ts:427` (exclude-suggestion path — writes a rejection
  stamp, not a document void; listed for completeness, likely out of scope)

**The "sanctioned engine" itself, for contrast — NOT a path to eliminate, this is what the others
should be calling instead:**
- `accounting/void-document-stamp.service.ts:262` — `stampDocumentVoided()`, the one function meant
  to be canonical for the `VOID_DOCUMENT_FAMILIES` registry (load, invoice, expense,
  factoring_advance, fuel_transaction, journal_entry, driver_reimbursement)
- `governance/void-cancel-executors.ts` — 17 separate `voided_at = now()` writes across its per-
  entity-type executors (lines 78, 318, 460, 688, 781, 887, 922, 947, 972, 1003, 1028, 1050, 1072,
  1095, 1117, 1145) — this is the `executeVoidCancel` dispatch map itself, i.e. already the
  consolidated maker-checker engine per `claude/00-SEAT-CONTRACT.md` §4. Worth checking whether
  `stampDocumentVoided` and `executeVoidCancel` overlap/duplicate rather than one calling the other
  — not established here, flagging as a question for the 281.1 fix design, not a finding.

**Repair-round / one-shot ops scripts** (`scripts/ops/*.ts`, `scripts/run-*-once.mts`) — each is a
single historical correction, not a standing code path, but every one is a place `voided_at` got set
outside any engine, so the 281.1 fix's "what already happened live" audit needs them too:
2026-09-25-cc1-r157-step0-reclass-via-writer.ts:142,
2026-09-25-cc1-r161-part2-remaining-off-document-escrow.ts:142,
2026-09-25-cc1-r161-setb-deactivate-off-document-escrow.ts:148,
2026-09-25-lead-r189a-current-loads-right-driver.ts:97,
2026-09-25-lead-r190-13541-dreamline-fuel-and-scale.ts:51,
2026-09-25-lead-r195-void-minted-presettlement-p0006.ts:53,
2026-09-26-cc1-r185-repost-27-driver-paid-expenses.ts:171,
2026-09-26-cc1-r187-g1-reverse-wrong-account-honda-gas.ts:85,
2026-09-26-lead-r206-settlement-5792-cent-and-close.ts:52,
2026-09-26-lead-r208-settlement-5812-pay-at-045-and-close.ts:54,
2026-09-26-lead-r212-stamp-void-on-switched-off-settlement-lines.ts:41,
2026-09-28-cc2-r15511b-fix-5812-deductions.ts:69,
2026-09-28-cc2-r15513-j5-resolve-zero-line-presettlements.ts:153,:165,:225,
2026-09-28-cc2-void-5788-duplicate-expense.ts:66,
2026-09-28-round190-URGENT-undo-fac84-duplicate.ts:59,
cursor-2026-09-10-reg030-bofa-repair.mts:107,
e10-round102e-sample-loads-renumber.ts:18,:194,
fuel-remediation-run-2026-09-25.ts:136,
round28-step3-phase2-additions.ts:254,
set24-void-duplicate-reimbursements.ts:109,
void-duplicate-settlement-lines.ts:113,
run-fact-assign-05-correction-dedupe-and-gapfill-once.mts:150,
run-fix-void-faro-016-no-source-doc-once.mts:89,
run-fix-void-inv52-pre-replay-once.mts:88,
run-usmca-seat-junk-purge-once.mts:129,:169

**Migrations** (imports/backfills that set `voided_at` in a `DO` block, not a standing code path):
`db/migrations/202612230000_bills_void_reason_and_tms_native_duplicate_guard.sql`,
`202612330000_void_state_authoritative_bills_invoices.sql`,
`202613300700_go_acct_01_recon_sessions_void_status_and_unique.sql`,
`202613490001_go22_void_wiring_driver_finance_liability_chain.sql`.

**Not verified here** (read-only enumeration only, per the ask — did not trace each writer's own
reversal logic for correctness, did not check `link-suggestions-actions.routes.ts:427`'s real
scope, did not determine whether `void-document-stamp.service.ts` and `void-cancel-executors.ts`
are duplicative or complementary). The 781/$79,899.34 live population above is the concrete,
measured proof that at least one gap exists somewhere in this set; which writer(s) exactly is
281.1's own diagnosis to make, not assumed here.

Continuing item 4 (A/P) and item 6 (the $166,868.94 plug) in parallel per the Lead's order.

— CC-1
