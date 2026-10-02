# Engine audit — all 642 engines, CC-1, 2026-10-02

**Done means every engine has a verdict line: 642 of 642.** Table: `engines-642.tsv` (one row per engine, nine answers + verdict + note). Generator: `audit.cjs` (TypeScript-parser structural pass). Writers then read by four reviewers, every row, no sampling.

Trees: structural pass on origin/main `6b273ef29441`; writer reviews on `622d653bcf05` (groups 1–2) and `167f6c37a013` (groups 3–4) — the only differences between those SHAs are CC-1's own settlement fixes (#24197, #24202) and docs.

## Verdicts
| Verdict | Rows |
|---|---|
| OK | 418 |
| DEFECT — header only (check 9) | 147 |
| CLEARED (structural flag wrong on reading) | 28 |
| RULED (Lead ROUND 301: QBO keeps lease / fixed-asset documents non-voidable) | 7 |
| **DEFECT — real** | **42** |

## Counts vs the Lead's (derived independently, then compared)
| Number | CC-1 | Lead | Diff and why |
|---|---|---|---|
| Population | 642 (564 service · 66 cron · 5 job · 4 worker · 3 engine) | ~632 (555/65/5/4/3) | +10 — tree grew (9 services, 1 cron) |
| Writers | 337 | 333 | +4 — tree grew |
| Money writers | 10 | 11–13 | the 11th is a **comment** (settlement-contract-terms:4); +2 outside the population (journal-entry-type-resolver.ts, manual-je.routes.deprecated.ts) |
| Wired / orphan / test-only | 620 strict (623 any prod importer) / 9 / 10 | 620 / 12 / 8 | wired exact; 5 of the 9 orphans are operator tools imported by repo-root scripts |
| A-SPINE | **0** | 1 | Lead's 1 is the comment above — every money writer is on the spine |
| B-ATOMIC | 84 → after reading: **0 unwrapped** (80 caller-tx, 4 wrapped) | ~96 | the real atomicity defects are elsewhere: 5 posters split JE and link row across two transactions (below) |
| C-SCOPE | 97 files (company_id / tenant_id counted) | ~97 | exact; under RLS bypass every unscoped write read as id/parent/company-scoped |
| F-RETRY | 37 → after reading: 1 real (random-pool draw) + 2 low (compliance reminder, QBO recon alerts) | ~33 | "scheduled" is broader than *.cron.ts: jobs/*-worker.ts and daily-sync-job also schedule (≥16 engines the structural pass missed; all idempotent but random-pool) |
| G-SILENT | **0** truly empty catch | 1 | 9 comment-only catches in writers; none discards an error silently |
| I-HEADER | 163 writers / 327 all | ~162 / ~328 | match; 5 "missing" headers sit after the imports (cleared) |

## The five P0s
- #001 settlement-contract-terms — **CLEARED**: writes no JE (the A-SPINE hit is a comment). Real gap found instead: a voided settlement leaves `referral_reward_paid_at`, reimbursement `settled` and the fine→deduction links in place (row below).
- #002 amortization-posting, #003 lease-posting, #004 settlement-posting — **CLEARED** for atomicity: `withCurrentUser` wraps every write.
- #006 (same file as #001) — **CLEARED**: runs only on the caller's transaction (weekly-close → withCompany → withCurrentUser; load-event callers inside withCurrentUser / withCompanyScope).

## Real defects (42), ranked by money risk
**Posted twice on a retry (atomic):** insurance-claim-recovery, parts-inventory, safety-fine, warranty, property-tax posters write the JE in one transaction and the posting row (their idempotency latch) in another; bank-driver-advance creates / disburses / stamps its dedupe key in three transactions; the recurring-bill generator's createBill commits outside the template lock.
**Settlement path the owner runs by hand:** cash-advance reverse never voids the repayment deduction (driver charged for a reversed advance — 2 engines); voiding a settlement leaves contract-terms markers; abandonment reverse flips status only; detention-pay line, escrow forfeit / separation / historical hold, legacy per-line escrow hold have no reverser; bank-categorized driver deduction's bucket charge cannot be undone.
**Other no-undo documents:** broker advances, factoring batch reconcile / draft batch / letter of release, loan with schedule, fuel-card overage (3), billed / approved detention (2), approved leave, applied late fee, property-tax rendition, historical settlement attribution.
**Data integrity:** IFTA re-prepare resets a FILED quarter to draft and erases its confirmation; random-pool quarterly draw can run twice.
**Unwired:** relay-deposit-stage1-transfer and samsara config-bootstrap (writers, never called); 8 non-writer orphan / test-only engines.

Full list with file:line — the `verdict` column of `engines-642.tsv` (filter `DEFECT`, excluding header-only).

## Fixed in this round already (CC-1)
#24194 (13 UPDATEs name their company — recurring.worker runs under RLS bypass, so that one was real) · #24197 (every settlement close through the A/P chain failed — bill numbered as its load) · #24202 (one settlement reverser, fork-proven) · #24212 (collected deductions read 'applied').

## The 42 real defects, every one with file:line

| Engine | Verdict |
|---|---|
| `accounting/bills/recurring/generator.service.ts` | DEFECT (atomic: generator.service.ts:107 createBill commits outside the template-lock txn; a failure at :132-:150 rolls back the template advance but keeps the bill, so the next run duplicates it; createBillInClientTx exists at bills.service.ts:3091) + header |
| `accounting/broker-advances.service.ts` | DEFECT (R7: no void/reverse engine for a broker advance, broker-advances.service.ts:161/:252/:453) |
| `accounting/insurance-claim-recovery-posting/poster.service.ts` | DEFECT (atomic + R7: JE :214 and link :233 in separate txns while the idempotency latch :134 sums link rows, so a failure between them double-posts on retry; no reverser) |
| `accounting/parts-inventory-posting/poster.service.ts` | DEFECT (atomic + R7: JE and link row in separate txns while the latch :153 reads link rows; partial failure double-posts; no reverser) |
| `accounting/property-tax-posting/poster.service.ts` | DEFECT (atomic + R7: same JE-then-link split; ON CONFLICT on accrual does not stop a second JE on retry; latent, TEST-ONLY reach) |
| `accounting/safety-fine-posting/poster.service.ts` | DEFECT (atomic + R7: JE :263 and link :282 in separate txns while latch :214 reads link rows; no reverser) |
| `accounting/warranty-posting/poster.service.ts` | DEFECT (atomic + R7: JE :149 and link :168 in separate txns while latch :106 reads link rows; no reverser) |
| `banking/bank-driver-advance.service.ts` | DEFECT (R4 bank-driver-advance.service.ts:227/251/263: dedupe key linked_bank_txn_id (checked :117-126) is written last in its own txn; a disburse failure leaves an unlinked advance+liability+schedule and a retry creates a second; a failure after the JE posts lets a retry double-book) |
| `banking/bank-driver-expense-deduction.service.ts` | DEFECT (R7 bank-driver-expense-deduction.service.ts:204 bucket charge unreversible; undo leaves deduction live) |
| `compliance/property-tax/property-tax.service.ts` | DEFECT (R7 property-tax.service.ts:186/:292 rendition and lines cannot be voided/removed) |
| `cron/event-spine-heartbeat.cron.ts` | DEFECT (non-writer ORPHAN: no production importer — delete or wire) |
| `dispatch/detention-approval.service.ts` | DEFECT (no reverser for an approved detention, detention-approval.service.ts:386; + header) |
| `dispatch/detention.service.ts` | DEFECT (no un-bridge for billed detention, detention.service.ts:378; + header) |
| `driver-finance/abandonment.service.ts` | DEFECT (reverse route flips status='reversed' only - an APPLIED chargeback keeps its settlement_lines row + escrow forfeit + load status 'abandoned', abandonment.routes.ts:202) |
| `driver-finance/cash-advance-owner-approval.service.ts` | DEFECT (advance reverse cash-advance-create.ts:689 / cash-advances.routes.ts:578 never voids the cash_advance_repayment deduction minted at :506 - reversed advance still withheld from next settlement; +header) |
| `driver-finance/cash-advance-requests.service.ts` | DEFECT (same gap: advance reverse cash-advance-create.ts:689 leaves the repayment deduction from :869 active; +header) |
| `driver-finance/detention-pay-posting.service.ts` | DEFECT (no reverser for a detention_pay settlement line - file self-declares reversal-on-void slice 3 not built, detention-pay-posting.service.ts:28/:37) |
| `driver-finance/escrow-forfeit.service.ts` | DEFECT (no reverser for an escrow forfeiture: escrow_balances/escrow_ledger/driver_liabilities decrement have no undo engine, escrow-forfeit.service.ts:98) |
| `driver-finance/escrow-separation.service.ts` | DEFECT (no reverser for separation release: escrow_balances/escrow_ledger release + separation status, escrow-separation.service.ts:275) |
| `driver-finance/historical-escrow-backfill.service.ts` | DEFECT (no reverser: escrow_ledger hold rows carry no settlement_id so settlement-payrun unwind never touches them, historical-escrow-backfill.service.ts:151) |
| `driver-finance/settlement-contract-terms.service.ts` | DEFECT (settlement void voids lines but never clears mdata.drivers.referral_reward_paid_at (:389), driver_reimbursements status='settled' (:706) or fine->deduction links (:552/:628) - re-settle silently skips them) |
| `driver-finance/settlement-historical-attribution.service.ts` | DEFECT (no reverser for historical_settlement_attributions, settlement-historical-attribution.service.ts:298; writer has no prod caller; +header) |
| `factoring/bank-match.service.ts` | DEFECT (no unmatch for factoring_batch reconcile, bank-match.service.ts:261; +header) |
| `factoring/batch.service.ts` | DEFECT (draft batch irreversible and strands invoices, batch.service.ts:205/:134; +header) |
| `factoring/factor.service.ts` | DEFECT (letter_of_release has no void/correct, factor.service.ts:627; +header) |
| `finance/amortization/amortization.service.ts` | DEFECT (loan document created by createLoanWithSchedule has no reverser, amortization.service.ts:52) |
| `fuel/fuel-card-overage-posting.service.ts` | DEFECT (no reverser for posted overage receivable/event, fuel-card-overage-posting.service.ts:107) |
| `fuel/fuel-card-overage.service.ts` | DEFECT (no void path for overage events, fuel-card-overage.service.ts:232) |
| `fuel/fuel-fraud-recovery.service.ts` | DEFECT (opens overage recovery event with no void path; message at fuel-fraud-recovery.service.ts:75 references nonexistent void) |
| `insurance/coi-pdf-renderer.service.ts` | DEFECT (non-writer TEST-ONLY: no production importer — delete or wire) |
| `insurance/late-fee.service.ts` | DEFECT (R7: no waive/reverse for an applied late fee, late-fee.service.ts:41) + header |
| `integrations/relay-payments/relay-deposit-stage1-transfer.service.ts` | DEFECT (orphan: materialiseRelayDepositAsTransfer has zero non-test callers in src; writer never runs) |
| `integrations/samsara/geofences/arrival-prompt.service.ts` | DEFECT (non-writer TEST-ONLY: no production importer — delete or wire) |
| `integrations/samsara/projection.service.ts` | DEFECT (non-writer TEST-ONLY: no production importer — delete or wire) |
| `program/module-matrix.worker.ts` | DEFECT (non-writer ORPHAN: no production importer — delete or wire) |
| `qbo/bill-payment-mapper.service.ts` | DEFECT (non-writer TEST-ONLY: no production importer — delete or wire) |
| `reports/ifta/quarterly-preparer.service.ts` | DEFECT (prepareFiling ON CONFLICT DO UPDATE has no status guard: re-preparing a FILED quarter resets status=draft and nulls filed_at/confirmation_number, quarterly-preparer.service.ts:120; +header) |
| `safety/driver-scheduler.service.ts` | DEFECT (approved leave irreversible, driver-scheduler.service.ts:964/:984; + header) |
| `safety/drug-alcohol/random-pool.service.ts` | DEFECT (non-idempotent quarterly draw, random-pool.service.ts:197) |
| `settlements/approval.service.ts` | DEFECT (R7 settlements/approval.service.ts:314 legacy per-line escrow hold has no reverser) |
| `telematics/driver-day-summary.service.ts` | DEFECT (non-writer TEST-ONLY: no production importer — delete or wire) |
| `telematics/heatmap.service.ts` | DEFECT (non-writer TEST-ONLY: no production importer — delete or wire) |
