# SILENT-SUCCESS — banking.routes.ts per-swallow triage (discovery done, fixes NOT started)

**Date:** 2026-07-31. **Status:** ANALYSIS ONLY — no code changed. Next session starts here.
**Why this file exists:** the bucket spec ordered `banking.routes.ts` first on live density
(10,857 bank transactions, 16 accounts). Reading the actual call sites found two cases the
*occurrence count* did not distinguish, and one of them outranks everything else in the class.

## ★ TOP OF THE ENTIRE BUCKET — L159, a false ZERO CASH BALANCE

```ts
const authoritativeTotalCash = await sumAuthoritativeDepositoryCashCents(client, companyId, {...})
  .catch(() => 0);
```

This is **the authoritative total-cash figure**. On any query failure the banking surface reports
**$0.00 total cash as a fact**, against 16 live bank accounts.

Worse, the comment immediately above it states the contract:

> `total_cash / cash-flow opening / accounts/all must agree via sumAuthoritativeDepositoryCashCents`

So the swallowed zero does not stay on one screen — it propagates into the **cash-flow opening
balance and the forecast**. A false $0 cash position is the most consequential single number in the
system: it is what an owner, a lender or a CPA reads first.

This is the same shape as Form 425-C (failure → rendered as "nothing"), but on the cash position
rather than a document list. **Fix this first, ahead of the rest of the bucket.**

## ★ A SWALLOWED **WRITE** — L520 (the count-based triage could not see this)

```ts
  UPDATE ... WHERE id = $1 AND operating_company_id = $2 RETURNING id
).catch(() => ({ rows: [] as { id: string }[] }));
if (!res.rows[0]) return false;
```

Every other instance in this class swallows a **read**. This one swallows a **write**, and then maps
the failure onto the SAME return value as a legitimate miss (`false` = "row not found"). The caller
cannot distinguish *"the record does not exist"* from *"the update failed"*.

Two consequences:
1. The write silently does not happen and the API reports an ordinary not-found.
2. `appendCrudAudit(...)` on the next line is **skipped**, so a failed mutation leaves **no audit
   row** — an append-only audit trail with a hole in it, which is the one thing §2 says must never
   happen.

A failed write must never be reported as a clean negative result. Fix alongside L159.

## Full site inventory (12 sites, not the 9 the regex counted — some are multi-line)

| line | shape | verdict |
|---|---|---|
| **159** | `.catch(() => 0)` on authoritative total cash | **CRITICAL — false $0 balance, propagates to cash-flow** |
| **520** | `.catch(() => ({rows: []}))` on an UPDATE…RETURNING | **CRITICAL — swallowed write + skipped audit** |
| 147 | `countPendingBills` | count-as-fact — remove swallow |
| 148 | `countDriverEscrowKpis` | count-as-fact — remove swallow |
| 165 | `countUncategorizedTransactions` | count-as-fact — headline KPI |
| 172 | `countTotalBankTransactions` | count-as-fact — headline KPI |
| 330 · 357 · 379 · 402 · 453 | `.catch(() => ({rows: []}))` on SELECTs | read each; list vs. total decides |
| 429 | SELECT description, amount_cents | money rows — read |

## Method for the next session (unchanged from the spec)

Read each query first. A swallow is only a defect if the query **can** fail — so check the columns
against prod before removing it. Remove the swallow (fail loud) or justify it in place. **No bulk
sed**, and do not convert the non-money 91 wholesale: a `.catch(() => null)` on an optional lookup
is legitimate defensive code, and blanket-throwing would take working endpoints down.

Money "green" per the owner directive = CI-green **AND** live tie-out to the ledger **AND** the
surface renders. CI-green alone is what shipped the false 425-C.

## Not claimed here

- No code changed, no swallow removed, no PR opened for this file.
- Whether each L330–L453 SELECT is a list (empty is honest) or a total (empty is a lie) is
  **UNVERIFIED** — that is the per-site read the next session must do.
- The L159 and L520 verdicts are from reading the call sites; neither has been reproduced as a live
  failure, because forcing the underlying query to fail on prod is not something to do casually.
