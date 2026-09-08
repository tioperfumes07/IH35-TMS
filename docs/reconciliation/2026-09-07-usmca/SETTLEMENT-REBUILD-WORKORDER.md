# USMCA settlement rebuild — measured work order (2026-09-07)

**Goal:** app-rendered USMCA driver settlements equal the signed AlwaysTrack documents
dollar-for-dollar. Measured target total net = **$27,487.36** (21 signed USMCA docs).
Current DB total net = **$31,147.37** across 17 GL-posted driver-settlements → **+$3,660.01 over**.

## Proven blocker (why this is a build, not a script)

1. **No pay-run reversal poster.** All 17 USMCA settlements were GL-posted via
   `closeSettlementPayRun` → `driver_finance.payrun_gl_runs` (one balanced JE:
   Dr Cost of Labor / Cr driver escrow / Cr advance-recovery / Cr Bank net, plus escrow
   contribution + advance recovery + records-only disbursement).
   `apps/backend/src/driver-finance/settlement-payrun-close.service.ts` only ever *writes*
   that run (INSERT + the posting UPDATE at line ~1022). There is **no** `reverse*` / `reopen*`
   export for the pay-run path anywhere in the backend (grep-verified 2026-09-07).
2. The only packaged settlement reverse poster — `reverseSettlementBillPayment*` in
   `apps/backend/src/accounting/settlement-posting/settlement-bill-payment-posting.service.ts`
   — targets the **other** poster (`driver_settlement_gl_runs`). Called on these it returns
   `nothing_to_reverse` and the `/settlements/:id/reverse` route would still cancel the header +
   deactivate lines → **orphaned pay-run JE** (ledger desync). Unsafe. Do not use it here.
3. **Grouping mismatch.** DB = one settlement per driver (17). Signed docs = one per period
   (21); several drivers have 2–3 docs. So the fix must re-group, not just re-price.

## Required build (Tier-A money, reviewed PR — never a solo prod hack)

### A. Author `reverseSettlementPayRunInClientTx` (new, mirrors bill-payment reversal rigor)
Compose EXISTING posters only (no new GL math):
- `reverseJournalEntryNoFlip(client, { journalEntryId: payrun_gl_runs.journal_entry_id, … })`
- Un-recover advances: restore `driver_finance.driver_advances.outstanding_balance`,
  `recovered_in_settlement_id = NULL`, and mirror `driver_liabilities.current_balance/paid_to_date`
  (inverse of close lines ~920–958).
- Reverse escrow contribution: inverse of `recordEscrowContribution` + `recordEscrowPostingOnly`
  (escrow_ledger / escrow_balances / accounting.escrow_postings delta trigger).
- Clear records-only disbursement + `driver_settlements.posted_at/posted_by_user_id`.
- Flip `payrun_gl_runs` → `status='reversed', reversed_at, reversed_by_user_id, reversal_reason`.
- **Equal-and-opposite proof** at (account_id, class_id, entity_uuid) grain = 0 residual, same
  shape as bill-payment reversal lines ~1096–1137. Fail-loud on any mismatch.
- Verify-step guard asserting the residual-zero proof.

### B. Rebuild orchestration script (`scripts/ops/cursor-2026-09-08-rebuild-usmca-settlements.ts`)
Per signed doc (source: `docs/reconciliation/2026-09-07-usmca/usmca-settlement-lines-from-signed-docs.csv`):
1. Reverse the current driver-settlement(s) via (A).
2. `openLoadBookendedSettlement` per doc period; attach that doc's loads only.
3. Materialize exact lines: `appendSettlementLineFromDriverBillIfMissing` +
   `appendEscrowContributionLineIfMissing`; `createSettlementDeduction` / `createDriverReimbursementCore`
   for each signed deduction/reimbursement at exact cents; `materializeSettlementLines`;
   `backfillExistingSettlementLineAccounts`; `aggregateSettlementTotals`.
4. `setSettlementSourceDocumentRef` = the 4-digit AlwaysTrack doc number.
5. `closeSettlementPayRun({ previewOnly: true })` → assert JE net == signed doc net BEFORE posting.
6. Only when preview ties out for a doc → `closeSettlementPayRun({ previewOnly: false })`.

### C. Proof
- Per-driver tie-out (`usmca-perdriver-settlement-tieout.csv`) delta column → all 0.
- DB total net == $27,487.36. Live render check on app dispatch/settlements.

**Lane:** CC-1 money (owns pay-run poster). **Do not** run (B) on prod until (A) is merged +
its guard green, and each doc passes the preview tie-out in step B.5.
