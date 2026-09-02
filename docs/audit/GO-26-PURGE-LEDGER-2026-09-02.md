# GO-26 PURGE LEDGER — 2026-09-02

Owner order: `docs/bus/GO-26-PURGE-TO-ZERO-AND-CONSOLIDATE-2026-09-02.md`. Method: void first (where
the table carries `voided_at`), then delete. Tables with no void columns are recorded here in full
before deletion — this file, plus the schema-level PR bodies and Neon MCP transaction results
(live query proof), is the register.

Full raw JSON for the largest tables (`posting_batches` 607 rows, `recon_runs` 66, `outbox_events`
43, `prepaid_amortization_rows` 15, `escrow_postings` 6) is committed alongside this file at
`docs/audit/GO-26-PURGE-LEDGER-accounting-batch1.json` — too large to inline here.

Every row below carries `operating_company_id = 5c854333-6ea5-4faa-af31-67cb272fef80` (USMCA).
None reached a posted `journal_entry_id` (checked live before writing this — `escrow_postings`,
`insurance_claim_recovery_postings`, `prepaid_amortization_rows`, `revenue_recognition_rows` all
have 0 rows with a non-null JE link out of their USMCA rows), so no reversing journal entry is
owed for this batch.

## accounting schema — batch 2 (29 single/few-row tables)

Full row JSON captured live before deletion, one table per section:

### cash_flow_adjustments (4 rows)
`ca1b70fd` "CC3 TEST cash-flow adjustment" $1.00 · `e8f88979` "TEST CC-1 U14 hop" $1.00 (already
archived) · `d53e1f43` "TEST DATA launch hop 2026-08-24 void later" $1,200.00 · `85402548` "TEST
DATA GO-1640 launch-16" $1,200.00

### lease_contract (2 rows)
`cf677452` "LEASE-DRAFT-PENDING-OWNER-TERMS" — already voided 2026-08-30 (owner correction: wrong
lessor), lessor_operating_company_id points to a DIFFERENT company (b49a737b — TRANSP/TRK side,
not touched by this delete, only the USMCA-side row is removed) · `59084283`
"LEASE-DRAFT-PENDING-OWNER-TERMS-TRANSP" — not voided, draft, $0 total

### prepaid_assets (2 rows)
`6fd7760d` "TEST DATA prepaid insurance 2026-08-22 VOID-AT-LAUNCH" $1,200.00, posted, not yet
voided · `a9ff950c` "GUARD USMCA prepaid first-JE 2026-07-29" $300.00 — already voided
2026-08-11 ("owner_void_all_usmca_test_2026-08-11")

### lease_classification (2 rows)
`fd8e18e0`, `63248f72` — classification rows for the two lease_contract rows above, no independent
money value

### parts_purchase_postings (2 rows)
`bfd94504` "WAVE3_TEST_DATA_2026-08-21 -- CC-1 inventory proof-of-path (brake pad set)" $220.00 ·
`be6247d4` "TEST-CC3-BATTERY-PART-20260824" $125.00

### property_tax_accruals (1 row)
`831cbbe1` "TEST DATA keep" $1,200.00 — the "keep" tag is a PRIOR session's caution, superseded by
this session's explicit owner order to purge every test/sample/probe row without exception

### recurring_bill_templates (1 row)
`17f2ab49` "TEST Recurring Bill 20260806 - CC3 battery" $4.25/mo, auto_post=true

### related_party_loan_entries (1 row)
`30d7f43f` "TEST DATA owner VOID-AT-LAUNCH 2026-08-22" $12.00

### factoring_reserve_movements (1 row)
`131ab171` — $55.50 reserve hold against factoring_advances row 87e6389a (below)

### factoring_advances (1 row)
`87e6389a` "FAC-2026-00001" — status ALREADY voided (own memo: "ACCT-F10129: reserve/fee were
folded into one wrong number... Reversed under WORM; a correctly-priced replacement advance is a
separate, later submission, not this reversal"). $1,850.00 invoice total. Already-reversed test
fixture — deleting the reversed row itself, not reversing again.

### ap_import_batches (1) + ap_import_preview_lines (1)
`77f34bf3` batch "TEST DATA keep", `f17f4a69` its one preview line "TEST DATA keep" $1,200.00 —
line deleted before batch (child before parent)

### revenue_contracts (1) + revenue_obligations (1) + revenue_recognition_rows (1)
`fb5e7e46` contract "TEST DATA keep" $1,200.00 -> `7196cd8b` obligation -> `1dc64bc7` recognition
row — deleted recognition row, then obligation, then contract (children before parent)

### recon_exceptions (1 row)
`402717c9` "TEST DATA keep", COUNT_MISMATCH class

### tax_document_batch (1) + tax_document (1)
`c8fcb83f` batch, `f23b9459` document (batch_id NULL on the document — independent, no ordering
constraint found)

### factoring_default_interest_accruals (1 row)
`8f438a37` — accrual against factoring_advances row 87e6389a, $1,200.00 interest

### warranty_reimburse_postings (1 row)
`9960292f` "TEST DATA keep" $1,200.00

### related_party_loan_schedule (1 row)
`e7d33a6d` — schedule row for related_party_loan_entries row 30d7f43f, $1,200.00 payment (deleted
before the loan entry)

### insurance_claim_recovery_postings (1 row)
`bc8760c7` "CODEX-LAWSUIT-NESTED-CLM-20260816-0354" $1,200.00

### sales_tax_returns (1 row)
`dcc68c93` — $6,263.00 taxable sales, $0 tax owed/collected

### civil_fine_postings (1 row)
`ad690154` "TEST DATA FMCSA -- TEST DATA company civil fine keep" $1,200.00

### ob_register_audit_events (1) + period_cash_basis_snapshot (1) + ob_source_finality (1) + ob_register_staging_lines (1)
`fb73976c`, `b0ef55ef`, `de160758`, `af537094` — all "TEST DATA keep" / $0-value opening-balance
register test rows

### recurring_templates (1 row)
`8634c5f1` — weekly invoice template, run_count=0

### vendor_payment_methods (1 row)
`b3bde0bb` "TEST DATA keep" — ACH method for vendor a1f4c2b6 (the same factoring-company vendor id
referenced by factoring_advances 87e6389a)

---

**"TEST DATA keep" note:** several rows above carry a literal "keep" marker from an earlier,
narrower sweep. This session's owner order is explicit, blanket, and later in time: "i asked and
ordered to delete every single test, sample, demo, probe, hop transaction... none of it is real."
That supersedes the earlier per-row tags, the same way the owner's direct sample-driver ruling
superseded this session's own earlier KEEP-tag hold. Not guessing — citing the specific, dated,
verbatim owner instruction this purge PR implements.

---

## RESULT — accounting schema, applied live on Neon (tiny-field-89581227 / br-fancy-credit-akjnd07a)

**Void step** (13 tables carrying `voided_at`): `ap_import_batches`, `civil_fine_postings`,
`insurance_claim_recovery_postings`, `lease_contract` (1 of 2 rows already voided by an earlier
owner correction — left as-is, only the unvoided row got a new void stamp), `parts_purchase_postings`,
`prepaid_assets` (1 of 2 already voided, same treatment), `property_tax_accruals`, `recon_exceptions`,
`recon_runs`, `revenue_contracts`, `tax_document`, `vendor_payment_methods`, `warranty_reimburse_postings`
— all stamped `void_reason`/`voided_by_user_id` (where the column exists) with
`GO-26 OWNER PURGE 2026-09-02 -- non-real fixture, entity reset to zero`.

**Delete step**, children before parents where an FK exists (caught live: `prepaid_amortization_rows`
FKs to `prepaid_assets` — reordered before retrying, transaction rolled back atomically on the
first attempt, zero partial damage): all 30 tables above except the 3 below, confirmed via a live
re-run of the owner's own done-gate query — every row gone.

**3 rows COULD NOT be deleted — hard append-only protection, not a missing grant:**
- `accounting.escrow_postings` (6 rows) — `ERROR: accounting.escrow_postings is append-only`
- `accounting.ob_register_audit_events` (1 row) — `ERROR: ... is append-only: DELETE not allowed.`
- `accounting.period_cash_basis_snapshot` (1 row) — `ERROR: IH35_CASH_BASIS_SNAPSHOT_LOCKED period_id=235675f4-...`

These are genuine architectural safeguards (the exact append-only protection the void-not-delete
law exists to provide), not something to force through with an elevated role. `escrow_postings`
specifically needs a REVERSING posting (insert the opposite-sign entry, let
`accounting.apply_escrow_posting_delta()`'s existing trigger bring the balance back to zero) rather
than a delete — that is the correct way to "wipe" an append-only ledger, reusing the existing
posting mechanism (`recordEscrowPostingOnly` / `postEscrowTransactionOnClient` in
`apps/backend/src/accounting/escrow/service.ts`), not a new one. Not built this pass — flagged as
a precise, narrow follow-up rather than guessed at under time pressure. `ob_register_audit_events`
and `period_cash_basis_snapshot` are opening-balance-register audit tables; same reasoning applies.

**escrow_accounts (21 rows) intentionally NOT touched** — this is the "report, don't guess" table
per PART 2 of the owner's own order. See the separate report posted to `docs/bus/OUTBOX-CC-1.md`.

### Live done-gate, accounting schema only, BEFORE vs AFTER

BEFORE (46 nonzero tables) — see the full baseline captured earlier this session.

AFTER (15 nonzero tables, all expected):
```
qbo_accounts 365 · chart_of_accounts_roles 49 · expense_category_account_map 33 · periods 24 ·
escrow_accounts 21 (HOLD — report not guess) · escrow_postings 6 (append-only, needs reversal) ·
fixed_asset_classes 4 · sales_tax_agencies 2 · vendor_classifications 1 · customer_classifications 1 ·
banking_rules 1 · period_cash_basis_snapshot 1 (append-only) · settlement_posting_config 1 ·
cash_forecast_settings 1 · ob_register_audit_events 1 (append-only)
```
Every one of the 15 is either PART-2 keep-list config, the explicitly-held ambiguous table, or a
hard append-only block — none is an unexplained leftover.
