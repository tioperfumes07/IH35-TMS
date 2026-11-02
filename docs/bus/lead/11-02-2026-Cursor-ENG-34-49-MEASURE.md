# ENG-34 shrink + ENG-49 measure — 2026-11-02 CT

## ENG-34 PARTIAL → shrink 123 → 108 → 83

Wired **15** static/selftest-passing exempts into `scripts/verify-steps/18921…19089-*` and removed them from `.guard-exempt.json`.

```
verify:guard-wired — 6342 guards: 6259 fully-wired, 83 exempt, 0 unaccounted
PASS
```

Wave-2: +25 static guards (19101–19389). Remaining **83** still need wire-or-delete (shrink-only). No invented deletes of active checks.

## ENG-49 OPEN — document-first (settlement 5787 → P-0018)

LIVE USMCA:

| Field | Value |
| --- | --- |
| `display_id` | P-0018 |
| `source_document_ref` | 5787 |
| status | closed |
| gross / deductions / reimbursements / net | 1075.72 / 211.99 / 22.00 / 885.73 |

Active settlement lines (no $235.01 rollup):

| Type | Description | Amount |
| --- | --- | --- |
| earnings | 13549 loaded 745.5 @ 0.45 | 335.48 |
| deadhead_pay | 13549 empty 520.2 @ 0.45 | 234.09 |
| earnings | 13555 loaded 958.1 @ 0.45 | 431.15 |
| extra_pay | Layover Estancia 22–24 Aug | **75.00** |
| reimbursement | Flying 16751… | **22.00** |
| deduction | Admin fee - GAS | **10.00** |
| escrow_contribution | Driver-Escrow | 25.00 |
| escrow (inactive) | Driver-Escrow | 25.00 |

Claimed **$235.01 vs signed $140.20** is **not** a single live line total. Closest document-adjacent non-miles stack = layover+reimb+admin = **$107.00** (or **$132.00** with active escrow).  

**Next (Codex FULL):** locate the signed PDF / Dreamline or settlement print that shows $235.01 / $140.20 and map each figure to a source row — never invent balancing lines.

## ENG-48 AUTH seat (not invented)

LIVE: **147** `fuel.fuel_transactions` with no live `accounting.expenses` via `source_fuel_transaction_id`.  
Bridge script `2026-09-30-cc1-r290-1-fuel-expense-bridge-backfill.ts` is ready; `--apply` needs a **new OPEN OWNER_AUTH_ID** (AUTH-145 CONSUMED). Owner must issue — seats must not invent.
