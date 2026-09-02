# GO-ACCT-01 — THE RECONCILIATION SITUATION
2026-08-30 · QuickBooks connected live (USMCA Freight Solutions, Inc., NAICS 488510)
Neon prod read with `SET LOCAL app.bypass_rls='lucia'`, `je_control = 2214` on every query.

**THIS IS NOW.** Seat pastes: `docs/lockdown/GO-ACCT-01/` and Desktop `IH35-CURSOR-AUDIT/GO-ACCT-01/`.
Skip #15546. Never restamp U14. **No TMS→QBO write-back** (standing law; restated below).

Cursor **does not start period close in this session** (multi-session; CC-1 was right to stop).

---

## HEADLINE — THE $261K IS NOT THE PROBLEM. IT IS A SYMPTOM.

Live QBO Balance Sheet as of 2026-08-31 (accrual):

| QuickBooks, as of Aug 31 2026 (accrual) | Amount |
|---|---|
| **Total Assets** | **−$7,945,173.68** |
| Bank Accounts (21 accounts) | $827,666.57 |
| Accounts Receivable | −$352,512.14 |
| Other Current Assets | −$8,420,328.11 |
| Total Liabilities | $2,054,448.97 |
| **Total Equity** | **−$9,999,622.65** |
| Working capital | −$9,991,095.81 |
| Current ratio | −3.88 |

**Total assets cannot be negative.** A balance sheet in this state cannot be reconciled,
cannot support a loan application, and would not survive review.

### The single account driving it
```
RTS FINANCIAL-VIRTUAL ACCT        −$8,270,020.28     (classified: Other Current Asset)
```
**That one line is 98% of the negative asset total.** An asset account carrying an
$8.27M credit balance means it has been credited $8.27M more than it has been debited.
This is the factoring virtual account — advances and collections are flowing through it and
it is never being cleared or offset against the AR it funds.

**Nothing in the TMS caused this and no coder can fix it.** Chart-of-accounts and
factoring-settlement treatment is **OWNER + Martin**. Not a software defect.

### Two other balance-sheet items the owner should see
```
Unauthorized Expenses Ignacio Muñoz     $336,751.38   (AR sub-account)
Unauthorized Expenses Anarely Alcazar    $70,253.48   (AR sub-account)
```
$407,004.86 is carried as a receivable from two named individuals under accounts titled
"Unauthorized Expenses." Report the balance-sheet fact only. Classification and reserve
are CPA / attorney questions, not software.

**Not accounting advice.** Figures are quoted from QuickBooks / prod Postgres with the query shown.

---

## TMS SIDE — SOFTWARE IS AT FAULT HERE

### Three USMCA reconciliation sessions (same bank account, Aug 2026)

| status | beginning | statement | dep. in transit | outstanding checks | adj. bank | adj. book | variance |
|---|---|---|---|---|---|---|---|
| open | $93.68 | $93.68 | $154,981.73 | $16,490.63 | $138,584.78 | −$126,389.10 | **$264,973.88** |
| reconciled* | $0.00 | $93.68 | $135,598.73 | $384.80 | $135,307.61 | −$126,482.78 | **$261,790.39** |
| open | $93.68 | $1,293.68 | $185,145.33 | $59,082.55 | $127,356.46 | −$126,389.10 | **$253,745.56** |

\* closed by owner `force_complete` — note: *"TEST DATA recon Accept hop BANK-F03 … owner voids after launch."*

Variance formula is correct (`adjusted_bank − adjusted_book`). Defect is **adjusted BOOK −$126,389.10**.

### GL (USMCA bank `ledger_account_id` postings)

```
USMCA FREIGHT                 259 postings   debits $13,503.70   credits $177,411.20   = −$163,907.50
TEST DATA Amex TESTMTDP79YF   259 postings   debits $13,503.70   credits $177,411.20   = −$163,907.50
Relay Fuel Wallet              13 postings   debits    $276.85   credits     $820.30   =     −$543.45
```

**DEFECT B — two bank accounts share one GL cash account**
`ledger_account_id c7af1219-f6a6-4169-a2d8-8f556fb0c2f3`
→ "TEST DATA Amex TESTMTDP79YF" AND "USMCA FREIGHT" (same company).
Guard demanded non-null mapping, not unique. 1:1 bank account ↔ GL cash is the bar (QBO/NetSuite).

**DEFECT A — $177K out, $13.5K in.** Customer payments are not debiting cash. 53 invoices.
Walk invoice → payment → GL. Posting-path gap. Reuse existing poster; no new GL math.

---

## INSTRUCTIONS

### CC-1 — band ≡1
1. DEFECT B first: own GL cash for TEST Amex **or** deactivate fixture. UNIQUE among active bank accounts per company on `ledger_account_id` + guard. Non-null was never the bar.
2. DEFECT A: trace cash debit on one real invoice payment.
3. Do not touch QuickBooks. Never TMS→QBO write-back.

### CC-2 — band ≡3
`BANK-ECON-04` and `BANK-SURF-04` stay **honest FAIL**. Do not stamp until adjusted book is credible.
One reconciliation session per account per period. Close duplicates. Leave `force_complete` (Owner + reason). Void TEST session after launch.

### CURSOR — band EVEN
Period close/reopen is missing as enforcement (columns already exist on `banking.reconciliation_sessions`: `reopened_at` / `reopened_by_user_id` / `reopen_reason`). Owner-only close/reopen + period-status on every money-write. **Multi-session. Do not start at the tail of this session.**

### OWNER + MARTIN
1. RTS FINANCIAL-VIRTUAL ACCT −$8,270,020.28 — factoring clear/offset.
2. Unauthorized Expenses AR sub-accounts $407,004.86 — classification / reserve.
3. **Do not connect TMS to write into QuickBooks** until those are resolved. TMS currently only reads.

---

## REPRODUCE (Neon prod `br-fancy-credit-akjnd07a` — separate statements, never CTE)

```sql
BEGIN;
SET LOCAL app.bypass_rls = 'lucia';
SELECT (SELECT count(*) FROM accounting.journal_entries) AS je_control,   -- must read 2214
       ba.account_name, count(jep.id) AS postings,
       sum(CASE WHEN jep.debit_or_credit='debit'  THEN jep.amount_cents ELSE 0 END)/100.0 AS debits,
       sum(CASE WHEN jep.debit_or_credit='credit' THEN jep.amount_cents ELSE 0 END)/100.0 AS credits
FROM banking.bank_accounts ba
LEFT JOIN accounting.journal_entry_postings jep ON jep.account_id = ba.ledger_account_id
WHERE ba.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80'
  AND ba.deactivated_at IS NULL
GROUP BY ba.account_name;
COMMIT;
```

Empty result here is RLS, not an empty table. Always carry `je_control`.
QBO: Balance Sheet, accrual, as of 2026-08-31.
