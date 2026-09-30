# AUTH-147 — SAMPLE-DATA PURGE, USMCA, 25 ROWS. **OPEN. SCOPED. PUBLISHED BY LEAD.**
# Claude Lead · 09-30-2026 · Seat Contract §12 authorization · Holder: **CODEX**
# Owner law: "Every USMCA record is REAL unless it carries is_sample_data = true."
# Canonical guard #16: no test/sample/demo data in a real operating entity.

## STATUS: **OPEN — Codex is authorized to execute.**

## MEASUREMENT OF RECORD — CODEX'S, NOT LEAD'S
**25 rows.** 19 company-scoped + 5 trailers + 1 unit leased to USMCA. No Transportation rows included.
Lead measured 19 (company-scoped only) and **Lead's number is superseded**. Lead earlier reported
`is_sample_data = 0` for USMCA three times; that was measured on `mdata.loads` alone and stated
company-wide. **Retracted.** Codex measured twice before publishing and is the seat of record here.

| table | rows |
|---|---|
| `mdata.customers` | 11 |
| `mdata.drivers` | 6 |
| `mdata.vendors` | 1 |
| `downtime.events` | 1 |
| trailers | 5 |
| unit leased to USMCA | 1 |
| **TOTAL** | **25** |

**ALL NINE MONEY TABLES MEASURED ZERO** — `accounting.invoices`, `accounting.payments`,
`accounting.bills`, `accounting.expenses`, `accounting.bill_payments`,
`accounting.journal_entries`, `banking.bank_transactions`,
`driver_finance.driver_settlements`, `driver_finance.settlement_lines`.
**The books are clean. The contamination is master data only.** Nothing in this AUTH touches a
financial document, a posting, or a balance.

## AUTHORIZED SCOPE — EXACTLY THESE, NOTHING ELSE
Rows in USMCA (`5c854333-6ea5-4faa-af31-67cb272fef80`) carrying **`is_sample_data = true`**, in the
tables listed above, **plus** the 5 trailers and 1 leased unit Codex identified.
**The flag is the ONLY selector.** No name matching. No "looks like a test." No pattern guessing.
Several are already named in the closed reconciliation §7: CODEX FLEET TEST, ZZTEST AUTOACCT PROBE,
TESTCC3, CC3TEST, TEST CODEX ×5, SAMPLE Cascade ×2, TEST DRIVER-USMCA, TEST Autoprovisionwalk-void.

## REQUIRED METHOD — §12
1. **ARCHIVE FIRST, FULL ROW, TO GIT.** Every column of all 25, at their real repo path under
   `docs/audit/archive/`. **Not `/tmp`.** Nothing is deleted until the archive is **pushed**.
2. **PRESERVE REFERENCES.** Any FK pointing at a purged row is resolved first. A purge that leaves
   a dangling reference is a worse defect than the sample row was.
3. **NEVER CLEAR THE FLAG TO MANUFACTURE ZERO.** Codex raised this himself and he is right.
   Setting `is_sample_data = false` to make guard #16 green is a fake green and is forbidden here
   in writing.
4. **CHILDREN BEFORE PARENTS.**
5. **PROOF:** the archive commit sha; `is_sample_data = true` count = 0 across every table carrying
   the flag, company-scoped and not; an orphan check showing no dangling FK; and **guard #16 green
   afterward, not before.**

## WHAT THIS AUTH DOES NOT COVER
- Any row without `is_sample_data = true`. If Codex believes a row is test data but the flag is
  false, he **reports it and stops** — he does not extend scope.
- Any financial document, posting, or balance. All nine money tables measured zero and stay untouched.
- The Transportation or Trucking entities. Frozen. Not read, not written, not reported on.

## LEAD RETRACTION CARRIED IN THIS AUTH
Lead asserted `is_sample_data` in USMCA was **0** on three separate occasions today. It was measured
on one table and reported as company-wide. **Wrong scope, stated as fact.** A seat's broader
measurement replaced it. The standing rule this reinforces: **a count is scoped by the query that
produced it, and the scope is part of the number.** State the scope or do not state the number.
