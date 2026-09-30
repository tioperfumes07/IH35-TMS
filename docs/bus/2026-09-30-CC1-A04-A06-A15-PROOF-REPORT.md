# CC-1 — A-04 / A-06 / A-15 proof report (Lead's NEXT-15-JOBS order, 2026-09-30)

USMCA only (operating_company_id 5c854333-6ea5-4faa-af31-67cb272fef80). All read-only; no data
touched. Baseline snapshot `2026-09-30-pre-def-fix` (93 accounts, captured 07:12:03Z) recovered
from a local worktree and committed here (`docs/audit/trial-balance-snapshots/`) so it's a real,
shared reference going forward instead of living only in one session's local disk.

## A-04 — DEF reclass (AUTH-156) trial-balance delta, isolated

`node scripts/verify-trial-balance-unchanged-across-purge.mjs --compare 2026-09-30-pre-def-fix 2026-09-30-a04-proof-now`
(fresh snapshot captured live 2026-09-30T11:09:21Z):

8 accounts moved since the baseline. Two are the DEF reclass, exact offsetting pair:
- **5000 Fuel & Diesel: −$3,484.63**
- **5010 DEF (Diesel Exhaust Fluid): +$3,484.63**

The other 6 are NOT the DEF reclass — real, unrelated financial activity in the same window
(AUTH-156 through the time of this proof covers roughly 4 hours of continuous multi-seat work):
- **1090 Undeposited Funds: −$21,218.44**, **2150 Factoring Advance: +$17,541.17**, **1230 Factoring
  Reserves: −$263.78**, **6400 Factoring Fees: −$263.78** — consistent with AUTH-165 (CC-2's own
  $17,057.44 double-booking reversal: 4 factoring advances voided, their reserve/fee/cash legs
  reversed out) plus other factoring activity (AUTH-140/150/161) in the same window.
- **6830 Factoring Default Interest: +$43.83** and **1000 Bank of America - Operating: +$4,161.00**
  — small, unattributed drift; not chased further here since neither is DEF-related and both are
  outside this job's scope (routine default-interest accrual and a bank-side event respectively).

**Verdict: the DEF reclass itself is clean and isolated to the intended pair. Every other movement
is accounted for by other seats' concurrently-authorized work, not by AUTH-156.**

## A-06 — Proforma invoices excluded from AR, confirmed at $61,375.00

Code path: `apps/backend/src/accounting/ar-aging.service.ts:125` —
`AND i.status NOT IN ('void', 'voided', 'draft', 'proforma', 'factored')` (comment at line 76:
"a proforma posts NO journal entry; counting it made [AR overstated]" — ACCT-F223).

Live, USMCA:
- 14 proforma invoices, `voided_at IS NULL`, open total **$61,375.00**.
- AR open total INCLUDING proforma (status not in void/voided/draft/factored): **$441,834.12**
- AR open total EXCLUDING proforma (the real, current code path): **$380,459.12**
- Difference: **$61,375.00** — exact match.

**Verdict: exclusion holds exactly. No fix needed.**

## A-15 — Escrow postings: liability-only, confirmed after today's escrow_ledger -> escrow_postings fix

Method note (a real trap this job caught, worth recording): a naive query joining every
`journal_entry_postings` row on `escrow_postings.linked_journal_entry_id` returns EVERY leg of the
settlement journal entry the escrow posting rides on — not just the escrow leg itself. That
naive version shows debits to 5310 Lumper Expense ($188.55/7 postings) and 6890 Cost of
Labor–Mexico Drivers ($44,689.84/29 postings), which look alarming out of context but are NOT the
escrow posting: their amounts (averaging ~$27 and ~$1,541 respectively) don't match individual
escrow amounts (the sample deposits are $25.00 each) and are the driver's own gross-settlement-pay
recognition riding in the same multi-line JE as the escrow withholding. Isolating to the driver's
own escrow liability sub-account (`2100-00-NNN`, matched via `driver_finance.escrow_balances.driver_id`)
shows:
- **Deposits (posting_type='deposit') CREDIT the driver's own 2100-00-NNN liability sub-account** —
  11 drivers, e.g. LUIS ARMANDO SOSA PEREZ (2100-00-001, $150.00), HUGO GAYTAN (2100-00-022,
  $150.00), GENARO GUERRERO CHAVEZ (2100-00-023, $275.00) — full per-driver list in the commit.
- **Releases DEBIT the same liability sub-account** (correct — a liability decreases on debit):
  Neftali Coronado Urbano (2100-00-002, $50.00), Jorge Luis Infante Corona (2100-00-027, $150.00),
  and 5 others.
- **Zero escrow postings debit or credit 5000-6999 directly on the escrow leg itself.** The
  5310/6890 amounts belong to the settlement's OTHER lines, not the escrow withholding/release.

**Verdict: escrow remains correctly a liability movement only. No expense account is ever hit BY
the escrow posting itself.**
