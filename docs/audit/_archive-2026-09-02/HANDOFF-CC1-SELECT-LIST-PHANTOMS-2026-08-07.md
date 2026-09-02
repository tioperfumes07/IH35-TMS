# HANDOFF → CC-1 (money lane) — CLS-SCHEMA-DRIFT-SELECT-LIST, 3 money-path phantom columns

**From:** CC-2 (mechanical lane). **Date:** 2026-08-07. **Board rows:** three `CLS-SCHEMA-DRIFT-SELECT-LIST`
rows in `docs/audit/GUARD-WORKORDERS.md`, status `OPEN — CC-1`.

These three were surfaced when CC-2 widened `scripts/verify-sql-column-existence.mjs` to check the SELECT
list (previously only WHERE / SET / ORDER-BY were parsed, so a merely-PROJECTED phantom column passed at
exit 0). All three live on money paths — driver settlements, QBO expense push, relay fuel wallet — so CC-2
**did not edit the files**. They are ratcheted in `scripts/verify-sql-column-existence.allowlist.json`, which
blocks any NEW phantom while these stay tracked as live defects.

**Every one of them carries a units trap: the obvious one-word rename is a 100x money error.** That is the
whole reason this is a handoff and not a fix.

---

## Prod evidence (Neon branch `br-fancy-credit-akjnd07a`, `information_schema.columns`, 2026-08-07)

Each row carries the completeness discriminator (total column count on the same table), so a `0` is a real
verdict and not an empty read:

| table | total cols | phantom probed | hits | real column | type / unit |
|---|---|---|---|---|---|
| `driver_finance.driver_settlements` | 54 | `net_settlement_cents` | **0** | `net_pay` | `numeric(14,2)` — **DOLLARS** |
| `accounting.expenses` | 32 | `total_amount` | **0** | `total_amount_cents` | `bigint` — **CENTS** |
| `fuel.fuel_transactions` | 35 | `total_amount_cents` | **0** | `total_cost` | `numeric(12,2)` — **DOLLARS** |

---

## 1. `apps/backend/src/banking/obligation-reconcile.routes.ts` (L116-118, L133)

**Correction to the first reading of this defect — it does NOT 500.** The query is wrapped in
`withSavepoint` (`apps/backend/src/auth/db.ts:193-209`), whose bare `catch` rolls back to the savepoint and
returns the `{ rows: [] }` fallback. So the 42703 is swallowed and the obligation-reconcile screen renders
loads, fuel, work orders, invoices and bills while listing **ZERO settlement obligations**. An empty section
reads as "no settlements to reconcile", not as a broken query — this is a `CLS-SILENT-SUCCESS` instance
layered on top of the phantom column, and it is why the defect survived. Fixing the column does not fix the
swallow; that swallow will hide the next one too.

Reading `net_pay` (dollars) into the consumer field `amount_cents` without `* 100` understates every driver
settlement obligation by 100x. Patch below is prod-verified and matches the `* 100` shape the fuel branch in
the same function already uses for `total_cost`:

```diff
-      client.query<{ id: string; net_settlement_cents: number | null; created_at: string }>(
+      client.query<{ id: string; net_pay: unknown; created_at: string }>(
         `
-        SELECT id, net_settlement_cents, created_at::text
+        SELECT id, net_pay, created_at::text
         FROM driver_finance.driver_settlements
         WHERE operating_company_id = $1
         ORDER BY created_at DESC
@@
-      amount_cents: Math.abs(Math.round(Number(r.net_settlement_cents ?? 0))),
+      amount_cents: Math.abs(Math.round(Number(r.net_pay ?? 0) * 100)),
```

Also check whether the sibling `gross_pay` / `deductions_total` / `reimbursements_total` (all
`numeric(14,2)` dollars) are read into `_cents` fields anywhere else.

## 2. `apps/backend/src/integrations/qbo/sync-outbound-accounting.entities.ts` (L941, L990)

Throws 42703 today, so building an expense Purchase payload always failed and **no expense could ever push
to QBO**. The units trap runs the OPPOSITE way from #1: renaming to `total_amount_cents` while leaving
`Number(e.total_amount_cents)` feeding a QBO dollar payload pushes every expense to QuickBooks at **100x
overstated** (`translators/expense.ts` sends `Amount: input.totalAmount` verbatim).

```diff
       const ex = await client.query<{
         transaction_date: string;
-        total_amount: string;
+        total_amount_cents: string;
         memo: string | null;
         vendor_uuid: string | null;
         payment_account_uuid: string | null;
       }>(
         `
-          SELECT transaction_date::text, total_amount::text, memo,
+          SELECT transaction_date::text, total_amount_cents::text, memo,
                  vendor_uuid::text, payment_account_uuid::text
           FROM accounting.expenses
@@
-      const total = Number(e.total_amount);
+      // cents (bigint, TMS) → dollars (decimal, QBO). Rounded to 2dp so float division cannot emit
+      // 123.45000000000002 into a financial payload.
+      const total = Math.round(Number(e.total_amount_cents)) / 100;
```

This file already carries a second ratcheted phantom (`mdata.qbo_customers.customer_uuid`), so it deserves a
full read rather than a spot fix.

## 3. `apps/backend/src/integrations/relay-payments/relay-wallet-balance-control.service.ts` (L110)

`SELECT COALESCE(SUM(ABS(total_amount_cents)),0)::text AS drawn_cents FROM fuel.fuel_transactions` throws
42703, so `drawn` is never computed and the whole wallet control — `expected = funded - drawn` — is dead.

**Units trap:** `funded` comes from `integrations.relay_deposits.total_amount_cents`, which IS real cents
(verified present, 17 columns on that table). A bare rename to `total_cost` would subtract DOLLARS from
CENTS and understate the draw 100x. Correct fix is `ROUND(SUM(ABS(total_cost)) * 100)::bigint`.

**Correction to CC-2's own first reading, recorded so nobody repeats it:** L97-98's `total_amount_cents` /
`classification` were initially attributed to `fuel_transactions` too — they are on
`integrations.relay_deposits`, where **both columns genuinely exist**. Only L110 is defective.

---

## Closing the loop

As each is fixed, remove its key from `scripts/verify-sql-column-existence.allowlist.json` (and decrement
`total_entries`) — that file's contract is that every key is a live defect until removed, never an accepted
false positive — and flip the matching board row to DONE with the merge SHA.
