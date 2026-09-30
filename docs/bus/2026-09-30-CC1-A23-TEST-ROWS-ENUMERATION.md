# A-23 — Test/proof/sample rows in USMCA: enumeration only (no writes)

CC-1, 2026-09-30. Per the standing law (M-03 / r294c A-23): enumerate only, never write, never void
a new row to prove this one. Widened search: memo containing test/proof/AUTH-/live-test/demo/sample,
or $1.00/$25.00 round proof amounts, written in the last 14 days; plus a direct scan of every table
carrying `is_sample_data` for `= true` rows in USMCA; plus the test driver named in A-12.

USMCA = `5c854333-6ea5-4faa-af31-67cb272fef80`. All reads under
`SET ROLE neondb_owner; SET app.bypass_rls = 'lucia'`.

## Group 1 — accounting.expenses: 6 rows, ALL already voided AND their JEs already reversed

| id | amount | created_at | created_by | memo |
|---|---|---|---|---|
| 4194581a-f13c-4383-bb34-387073309b63 | $1.00 | 2026-09-29T17:00:00Z | jorge@ih35trucking.net | VOID: AUTH-126 R224 full-chain proof — VOID same session |
| 00e50ba8-bb3c-4d6e-bd35-9fe069d2a00c | $1.00 | 2026-09-29T02:33:49Z | jorge@ih35trucking.net | VOID: AUTH-125 R222 full-chain proof — VOID same session |
| 7728cf89-6ca2-4819-b610-7a013e4dbd61 | $1.00 | 2026-09-28T21:15:42Z | jorge@ih35trucking.net | VOID: AUTH-122 R206 print-path proof — VOID same session |
| a7671a67-6b8a-4282-901a-2fd6dd7991ca | $1.00 | 2026-09-28T18:44:09Z | jorge@ih35trucking.net | VOID: AUTH-120 R-197 G-16 allocator registry proof #1002 — VOID same session |
| 9b5fcc6c-6d8c-4e14-83ab-49c79c9132e9 | $1.00 | 2026-09-28T17:19:30Z | jorge@ih35trucking.net | VOID: VOID: AUTH-117 R-191 G-16 Check Creator live proof — VOID same session |
| f9c5b0e4-644c-4b03-b7c2-424d540ea65f | $25.00 | 2026-09-28T09:32:43Z | tioperfumes07@gmail.com | VOID: Check · Smithfield Foods Inc |

The last row (f9c5b0e4, $25.00, a different `created_by_user_id` than the other five) is the "CC-2
live-test check" named in the ruling; the five $1.00 rows are the "AUTH-NNN proof line" rows,
written by this session's own AUTH-117/120/122/125/126 proof steps.

**Every JE/posting touched (all 6, same shape):** each expense posted one 2-line JE (a debit + an
offsetting credit, $1.00 or $25.00), and every one of those 6 JEs was **already reversed** the same
session — each carries a live `reversed_by_je_id` pointing at a real reversing JE, confirmed for
all 6 via `accounting.journal_entries`/`journal_entry_postings`. Example (4194581a): JE
`06628a5e-...` → `reversed_by_je_id = 2f774a6c-...`; two postings, $1.00 debit / $1.00 credit, both
already offset by the reversal.

**Trial-balance impact if removed:** **$0.00**. All 6 are already void + already GL-reversed —
their net effect on the current trial balance is already zero today. "Removing" them in the sense
of a hard DELETE is not physically possible under this system's WORM law
(`accounting.refuse_financial_row_delete()` refuses DELETE on `accounting.expenses` and
`accounting.journal_entries` for every role, confirmed by the trigger's own existence) — the
standing-law violation is that these rows exist in USMCA's PERMANENT LEDGER HISTORY at all (create-
then-void-same-session proof artifacts), not that they are currently miscounted anywhere.

## Group 2 — the A-12 test driver + its one document row (NOT voided, still live)

Two `first_name='TEST'` drivers exist in USMCA `mdata.drivers`:

| id | name | created_at |
|---|---|---|
| 3b6b5903-a671-49db-a025-09bcde65e30c | TEST Autoprovisionwalk-void | 2026-09-09T15:32:00Z |
| 9f35cf21-01bb-467e-bc31-e96bb9c60dfe | TEST DriverTESTMTDP79YF | 2026-08-29T01:24:50Z |

Only the second one has a linked document. `safety.driver_documents` in USMCA has **exactly one row
total, company-wide** (per A-12's own finding), and it belongs to this test driver:

| id | driver_id | doc_type | voided_at |
|---|---|---|---|
| 51a81bd0-fb13-4d50-b7ab-bb83781abbea | 9f35cf21-01bb-467e-bc31-e96bb9c60dfe | cdl | **NULL — not voided** |

Unlike Group 1, neither the driver row nor the document row has been voided — both are still live,
un-flagged (no `is_sample_data` column on `mdata.drivers`/`safety.driver_documents` to even self-
mark them). No GL/JE/posting is touched by either (drivers and driver_documents are not financial
tables) — trial-balance impact if removed: N/A, not applicable, no money ledger involved.

## Group 3 — direct `is_sample_data = true` scan (27 tables carry the column)

One hit in USMCA: `downtime.events` id `5232705c-0889-4341-81e4-b35b4508fe2c`
(`unit_id=9aae52c1-...`, `started_at=2026-09-20`, `closed_at=2026-09-29T18:42:42Z`,
`created_at=2026-09-29T18:42:42Z`, `is_sample_data=true`). Not a financial table — no GL/JE/posting
touched. Not voided (no void mechanism on this table). Every other one of the 27
`is_sample_data`-carrying tables returned zero USMCA rows with the flag set.

## Widened memo/amount search — no additional hits beyond Group 1

Checked `accounting.invoices`, `accounting.credit_memos`, `accounting.bill_payments`,
`banking.bank_transactions`, `accounting.bills` (14-day window, same memo/amount criteria). Three
apparent hits were investigated and ruled OUT as false positives from the broad `%AUTH-%` memo
match, not test rows:
- 3 `accounting.bills` rows (AUTH-150 ROUND 290.2 re-entries) — real business re-entries that merely
  mention an AUTH- number in their memo; amounts ($47.25/$269.10/$250.00) don't match the $1/$25
  round-proof pattern.
- 1 `accounting.invoices` row (AUTH-148, $4,000.00) — a real self-carried invoice; memo mentions
  AUTH-148 for provenance, not a test artifact.
- 1 `banking.bank_transactions` row (-$1.00, "ACH Fee 1") — a real live bank-feed transaction (Plaid
  origin, not coder-created); $1.00 ACH fees are a normal real-world amount, not a proof artifact.

## Summary

| Group | Count | Voided? | GL/TB impact if removed |
|---|---|---|---|
| accounting.expenses proof rows | 6 | Yes, all 6 (void + JE reversed same session) | $0.00 (already net zero) |
| TEST driver rows | 2 | No | N/A (non-financial) |
| TEST driver's document row | 1 | No | N/A (non-financial) |
| `is_sample_data=true` rows | 1 (downtime.events) | No | N/A (non-financial) |

Nothing written. Nothing voided. No new test row created to prove this one.
