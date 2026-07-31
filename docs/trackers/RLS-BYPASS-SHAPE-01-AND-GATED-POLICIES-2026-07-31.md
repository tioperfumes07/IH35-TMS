# RLS-BYPASS-SHAPE-01 — a policy shape that makes the lucia bypass produce FALSE ZEROS

**Found:** 2026-07-31 during the dispatch/maintenance sweep, by hitting it.
**Status:** OPEN. **1 table CONFIRMED. Population UNVERIFIED — deliberately no count given.**
**Not a security hole.** The affected shape is *more* restrictive than canonical, not less. It is an
**auditability** hole: it silently defeats the technique every GUARD sweep uses to read complete data.

## The defect

Canonical §2 FORCED-RLS shape — bypass is a top-level OR, so it **widens**:

```sql
identity.is_lucia_bypass()
  OR (operating_company_id = NULLIF(current_setting('app.operating_company_id',true),'')::uuid)
```

`dispatch.load_id_reservations` (both `_select` and `_write` policies) instead reads:

```sql
(operating_company_id = NULLIF(current_setting('app.operating_company_id',true),'')::uuid)
AND (identity.current_user_role() = ANY(ARRAY['Owner','Administrator','Manager','Dispatcher'])
     OR identity.is_lucia_bypass())
```

The bypass satisfies only the **role** half. The entity predicate is **mandatory**. So with
`app.operating_company_id` unset — which is exactly how an auditor runs a global count —
the table returns **0 rows**, with no error and no warning.

**Proved on prod, same session, same transaction shape:**

| read | result |
|---|---:|
| `bypass_rls='lucia'`, `operating_company_id` UNSET | **0** |
| `bypass_rls='lucia'`, `operating_company_id` = TRANSP | **2,275** |

This is a false zero produced *by the very technique adopted to defeat false zeros*
(`[[rls-count-completeness-discriminator-law]]`). It is strictly worse than an ordinary RLS mask,
because the agent believes it has already neutralised RLS.

## Why no table count is given here

A text scan of `pg_policies` for quals containing both `operating_company_id` and `AND` returns
**63 tables** across accounting, catalogs, chat, compliance, dispatch, ifta, integrations, mdata,
ops, safety and settlements.

**That number is wrong and must not be used.** The heuristic over-flags: `mdata.loads` matches it,
yet its bypass **does** widen — verified, 10 rows returned with bypass alone and no entity GUC. A
policy may legitimately contain `AND` inside a subclause while still being a top-level
`bypass OR (...)`.

Of **16 tables tested empirically**, exactly **one** — `dispatch.load_id_reservations` — exhibits
the defect. The other 15 (`mdata.loads`, `mdata.customers`, `mdata.vendors`, `mdata.locations`,
`mdata.qbo_customers`, `mdata.qbo_vendors`, `catalogs.items`, `catalogs.classes`,
`integrations.relay_fuel_transactions`, `accounting.factoring_advances`, `chat.messages`,
`ops.daily_tasks`, `safety.civil_fines`, `safety.company_violations`, `dispatch.intransit_issues`)
either widened correctly or are genuinely empty.

## The only valid test — empirical, per table

Text-matching a qual is not proof. For each candidate, in one transaction:

```sql
SELECT set_config('app.bypass_rls','lucia',true);          -- its OWN statement, never a CTE
-- (do NOT set app.operating_company_id)
SELECT count(*) FROM <schema>.<table>;                      -- => A
```
then repeat with `app.operating_company_id` set to each of TRANSP / TRK / USMCA => B, C, D.
**If A = 0 while (B + C + D) > 0, the table is AND-gated.** Anything else is not evidence.

Tables that are genuinely empty are indistinguishable by this test and must be re-tested once they
hold rows — record them as UNDETERMINED, never as clean.

## Fix — a migration, therefore gated

Repointing the affected policies to the canonical `identity.is_lucia_bypass() OR (...)` shape is a
`db/migrations/*.sql` change and therefore **financial-cluster (§1.4): build, show the full SQL,
wait for the owner's explicit OK, never self-merge.** Per the owner's 2026-07-31 instruction this
stays untouched until a migration PR carrying the empirical proof above for every table it changes.

Sequencing: run the empirical sweep first and publish the confirmed list; the migration should
change exactly that list and nothing that was flagged only by text match.

## Consequence worth stating plainly

Any prior audit, count, or "verified 0" that relied on `bypass_rls='lucia'` **without also setting
`app.operating_company_id`** is unreliable for AND-gated tables. That is not a hypothetical — it
produced a wrong statement in this very session, which was caught only because `n_live_tup`
disagreed with the count. **Pair every bypass count with an RLS-immune discriminator; a bare 0 is
still not a verdict, even with the bypass set.**
