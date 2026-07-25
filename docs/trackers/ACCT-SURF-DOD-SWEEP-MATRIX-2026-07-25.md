# ACCT-SURF-DOD-SWEEP — per-surface DoD A–E + VERIFY 1–8 structural matrix

**Packet:** ACCT-SURF-DOD-SWEEP · **FINDING:** SURF-01..09 · **Lane:** FINANCIAL-HOLD  
**Machine source:** `docs/trackers/ACCT-SURF-DOD-SWEEP-MATRIX-2026-07-25.json`  
**Manifest binding:** `docs/module-completion/accounting.json` — **8 of 25** (no status flips in this PR)  
**Surface map (frozen):** `docs/trackers/ACCT-08-SURF-SURFACE-MAP-2026-07-25.md`  
**Guard:** `scripts/verify-acct-surface-dod-sweep.mjs` · verify-step **1476**  
**Desktop click-through (separate):** `~/Desktop/IH35-CURSOR-AUDIT/modules/accounting-surf-dod-2026-07-25.md`

> Rule 23/24: this matrix records **UNVERIFIED** or **STRUCTURAL** evidence only. No FAIL→PASS. Browser TRANSP+USMCA click-through is required before any cell or manifest item may move to PASS.

## Enumerated surfaces (16 leaves · 14+ spec minimum)

| Leaf ID | Label | Route | `accounting.json` item |
|---|---|---|---|
| `bill` | Bill (Bills hub) | `/accounting/bills` | ACCT-SURF-01 |
| `repair-bill` | Repair bill | `/accounting/bills/repair` | ACCT-SURF-01 |
| `fuel-bill` | Fuel bill | `/accounting/bills/fuel` | ACCT-SURF-01 |
| `vendor-bill` | Vendor bill | `/accounting/bills/vendor` | ACCT-SURF-01 |
| `recurring-bills` | Recurring bills | `/accounting/bills/recurring` | ACCT-SURF-01 |
| `expenses` | Expenses | `/accounting/expenses` | ACCT-SURF-02 |
| `receipts` | Receipts | `/accounting/receipts` | ACCT-SURF-02 |
| `bill-payment` | Bill payment | `/accounting/bill-payments` | ACCT-SURF-03 |
| `ap-aging` | AP Aging | `/reports/ap-aging` | ACCT-SURF-03 |
| `invoices` | Invoices | `/accounting/invoices` | ACCT-SURF-04 |
| `receive-payment` | Receive Payment | `/accounting/payments` | ACCT-SURF-04 |
| `journal-entries` | Journal Entries | `/accounting/journal-entries` | ACCT-SURF-05 |
| `chart-of-accounts` | Chart of Accounts / Detail Types | `/lists/accounting/chart-of-accounts` | ACCT-SURF-06 |
| `account-register` | Account Register (+ All Transactions) | `/accounting/account-register` | ACCT-SURF-07 |
| `period-close` | Period close (+ audit + lineage) | `/accounting/period-close` | ACCT-SURF-08 |
| `accounting-more` | More ▾ Factoring/Escrow/Settlements | `/accounting/factoring` | ACCT-SURF-09 |

Each leaf × **TRANSP** + **USMCA** × **13 layers** (DOD-A…E, VERIFY-1…8) = **416 cells** in the JSON matrix.

## Cell law

| Status | Meaning |
|---|---|
| **UNVERIFIED** | Browser click-through not run; `blocker` names what is missing |
| **STRUCTURAL** | Repo/route/guard/Neon density citation only; `evidence` cites guard or manifest item — **not** a SURF PASS |

Forbidden in this matrix: **PASS**, **FAIL** (manifest scoreboard owns FAIL/PASS; matrix does not flip them).

## ACCT-SURF manifest binding coverage

Every `ACCT-SURF-01…09` row in `accounting.json` must appear as `manifest_item` on ≥1 leaf above. Guard step 1476 fails if any SURF item is unbound or any enumerated leaf is missing.

## Next work (out of scope for this structural PR)

1. Run Desktop Expected vs Actual click-through per cell (TRANSP then USMCA).
2. Open one additive fix block per manifest FAIL/UNVERIFIED leaf (M grows per Rule 21).
3. Only after live evidence: move manifest `status` — never from structural guard alone.
