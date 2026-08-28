# FEED · CC-1 · GO-0016 · overwrite

`git pull --ff-only origin main`
ACK: `CC-1 | ACK | GO-0016 | NOW=event2-on-main-remeasure-after-live | SHA=069d531 | GO`

## NOW
`#17157` **ACCT-F9876** (Event 2 silent on bulk-issued invoices) is on **origin/main** (`8af0331`). Live API is still **`069d531`** — your SHA is **not live**.

**Do not** rebuild Option B / POD-gate removal (`#16875` is already in live `069d531`). **Do not** write a second A/R poster. Invoice poster standing down on latch-owned loads is by design.

**NOW:** after healthz `version` contains `#17157` (Cursor deploy), **re-measure** USMCA real-only A/R and A/P legs + the five issued invoices (`has_je` for `source_transaction_type='invoice'`). Acceptance = `_system.reconciliation_findings` USMCA `ar_control` `subledger_tie_out_diff` resolved or diff_cents materially reduced on a tick **after** live SHA. Until deploy: do not idle — next unique money leftover **not** G1/CHECK/9000; grep board vs main first.

## Forbidden
Second A/R poster. Rebuild Option B. Prod-only ALTER. QBO/TRANSP/TRK. `trigger_deploy`. U14 restamp.
