# Design: normalize the `banking.bank_transactions` amount/sign convention

**Status:** DESIGN — for Jorge's review. **No data change.** Tier-3 (the doc); becomes **Tier-1** only if §2's
violation query returns > 0 and a backfill is approved. Follow-up to #1159 (which removed *opening cash* and
*KPI total_cash* from the broken transaction re-sum but left the underlying convention un-normalized).
**Author:** agent (paired) · **Date:** 2026-06-17

---

## 0. Why this exists
#1159's −$4,789,956 phantom opening cash was caused by an aggregation (`CASE WHEN is_credit THEN amount_cents
ELSE -amount_cents`) that assumed `amount_cents` was a positive **magnitude**, while the Plaid importer stores
it **signed**. #1159 fixed cash-flow/KPI by reading reconciled balances instead. But `banking.bank_transactions`
still has **two write paths that can disagree on the sign convention**, and other consumers still read the
transactions directly. This doc pins one canonical convention, enforces it on every write, audits every
reader, and proposes a guard — so the class of bug cannot recur.

## 1. The two conventions today

**(a) Plaid path** — `integrations/plaid/plaid.service.ts` (~L556, L566):
```ts
amount_cents = toCents(transaction.amount)   // SIGNED. Plaid: +amount = money OUT, -amount = money IN
is_credit    = transaction.amount < 0        // is_credit = (amount_cents < 0)  → is_credit ⟺ money-in
```
So Plaid rows are **signed**, and `is_credit` is **derived from the sign** — internally consistent.

**(b) CSV-seed path** — `seed/csv-seed-import.ts` (~L1166, L1171):
```ts
amountRaw  = nonempty(row.amount_cents); /^-?[0-9]+$/  // accepts a SIGNED integer (may be + or -)
isCredit   = parseBoolLoose(row.is_credit, false)      // DEFAULTS TO false on blank/unparseable
```
**The hazard:** the seed takes `amount_cents` and `is_credit` from **independent columns**. Nothing forces
`is_credit = (amount_cents < 0)`. A seed row with a negative `amount_cents` but blank `is_credit` becomes
`(amount_cents = -X, is_credit = false)` — a row where **`is_credit` does NOT mirror the sign**. Any consumer
that trusts `is_credit` for direction and a different consumer that trusts the sign will then disagree —
exactly the divergence that produced the phantom number.

Other write paths to include in scope: `banking/transaction-ingestion.ts` (manual/import upserts) and any
future importer.

## 2. The decisive fact — run the violation query (read-only)
The whole remediation hinges on whether mixed-convention rows actually EXIST in prod. **This requires a prod
read I cannot perform (§1.5 gated); GUARD or Jorge must run it.** Per `app.operating_company_id`:
```sql
SELECT source,
       COUNT(*)                                                  AS total,
       COUNT(*) FILTER (WHERE is_credit <> (amount_cents < 0))   AS convention_violations
FROM banking.bank_transactions
WHERE operating_company_id = '91e0bf0a-133f-4ce8-a734-2586cfa66d96'
GROUP BY source;
```
**Live evidence so far (GUARD, via the banking API, TRANSP):** of the 50 *uncategorized* rows readable from the
UI, **all are `source='plaid'` and 0 violate** (`is_credit` exactly mirrors `sign(amount_cents)`). So live Plaid
data is clean under the signed convention. **What is NOT yet known:** categorized rows and any `source='csv'`/
seed rows were not readable from the browser — so the **full per-source `convention_violations` count is
PENDING the query above.** Do not assume zero until it's run.

**Branch on the result:**
- **`convention_violations = 0` across all sources** → no data backfill. Ship enforcement (§4) + the guard (§6)
  only. (Tier-3.)
- **`> 0`** → a **targeted, reversible, Jorge-gated backfill** of only the violating rows (§5). Never auto-run.

## 3. Canonical convention (recommended)
**Keep `amount_cents` SIGNED; treat `is_credit = (amount_cents < 0)` as a DERIVED, enforced invariant**
(money-in is negative, mirroring Plaid). Rationale: live Plaid data — the larger, authoritative source —
already follows it; `current_balance_cents` (the real balance) is Plaid-reported on the same convention; and a
single signed column with a derived boolean removes the chance of the two diverging. The cash delta of any row
is then simply `-amount_cents` (money-in negative → adds).

## 4. Enforcement on EVERY write path
Make `is_credit` non-authoritative — always derive it from the sign at insert, on every path:
- **Plaid** (`plaid.service.ts`): already `is_credit = amount < 0`; keep, add an assertion.
- **CSV-seed** (`csv-seed-import.ts`): STOP defaulting `is_credit=false`. Set `is_credit = (amountParsed < 0)`
  and ignore/validate the CSV's `is_credit` column (error if it disagrees with the sign, rather than trusting it).
- **transaction-ingestion / manual / any future importer**: same — derive `is_credit` from the signed amount.
- **DB-level backstop**: a `CHECK (is_credit = (amount_cents < 0))` constraint (added only after §2/§5 confirm no
  violating rows remain — a CHECK on dirty data fails the migration). This makes divergence impossible.

## 5. Backfill (ONLY if §2 > 0 — Tier-1, Jorge-gated, reversible)
For violating rows, the correct normalization is **`is_credit := (amount_cents < 0)`** (trust the signed amount;
`is_credit` was the unreliable column — it defaulted to false). Steps: snapshot the violating rows to an audit
table first; UPDATE only `WHERE is_credit <> (amount_cents < 0)`; produce a before/after diff for Jorge to
approve; never delete. Reversible from the snapshot. **Owner-approved; never auto-run** (financial data).

## 6. Consumer audit — every reader of `bank_transactions`
#1159 fixed cash-flow opening + KPI total_cash. The remaining direct readers must each be correct under the
canonical (signed, `is_credit ⟺ amount<0`) convention:

| Consumer | Reads | Verdict under canonical convention |
|----------|-------|------------------------------------|
| `cash-flow.service.ts` opening cash | (was) signed re-sum | **FIXED #1159** — reads depository balances |
| `banking.routes.ts` KPI total_cash | (was) tile view = 0 | **FIXED #1159** — reads depository balances |
| `banking.routes.ts` register view (~L339) | `amount_cents >= 0 → deposits`, `< 0 → withdrawals` | **⚠️ AUDIT — likely BACKWARDS:** Plaid `+`=money-OUT, but this labels `+` as *deposits*. Either the register is inverted or amounts are normalized upstream. **Must confirm against a real account's deposits/withdrawals.** |
| `banking/categorization.routes.ts` (~L137) | `SUM(ABS(amount_cents))` | **OK** — magnitude only, sign-agnostic |
| `banking/reconciliation.routes.ts` (~L126) | `is_credit` + `ABS(amount)` for match buckets | **OK if** `is_credit ⟺ sign` (guaranteed once §4 enforced) |
| `banking-rules.engine.ts`, `suggestion-engine.ts`, `bulk-transactions.ts`, `factoring/bank-match.service.ts`, `cron/bank-recon-auto-match.cron.ts`, `accounting/month-close.service.ts`, `compliance/form-425c.routes.ts` | various | **AUDIT each** — confirm they use `ABS()` (magnitude) or `is_credit` (now reliable), not a raw signed-amount assumption. |

> Note: `accounting/bank-recon/*` and `account-balance.routes.ts` sign-logic operate on **journal-entry
> postings** (`debit_or_credit`, `jep.amount_cents`), a different double-entry table — not affected by this
> bank-transactions convention.

The register-view (`banking.routes.ts:339`) is the highest-priority audit item — if it's inverted, the
deposits/withdrawals columns the user sees are swapped.

## 7. Static guard (proposed)
`verify-bank-tx-convention.mjs`:
- Every write path that INSERTs `banking.bank_transactions` must set `is_credit` from the signed amount
  (`is_credit = (… < 0)` / `amount … < 0`), never default it to a literal `false`/`true`.
- No consumer may reintroduce `CASE WHEN is_credit THEN amount_cents ELSE -amount_cents` (the magnitude
  assumption on signed data — the #1159 bug). (Already partly locked by `verify-cash-surfaces-reconcile`.)
- Once the CHECK constraint lands, assert the migration exists.

## 8. Sequence
1. Jorge/GUARD run §2 → record the real per-source `convention_violations`.
2. If 0 → ship §4 enforcement + §6 register-view fix + §7 guard (Tier-3 each, on green). If > 0 → §5 backfill
   first (Tier-1, Jorge OK), then the CHECK constraint, then §4/§6/§7.
3. GUARD verifies post-fix: `convention_violations = 0`, deposits/withdrawals correct, all cash surfaces still
   reconcile to the depository balance.
