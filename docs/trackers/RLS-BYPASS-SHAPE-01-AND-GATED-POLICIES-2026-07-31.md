# RLS-BYPASS-SHAPE-01 — a policy shape that makes the lucia bypass produce FALSE ZEROS

**Found:** 2026-07-31 during the dispatch/maintenance sweep, by hitting it.
**Status:** OPEN. **Full empirical sweep COMPLETE 2026-07-31 — 2 tables confirmed of 63 flagged.**
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

## RESULT — the full sweep has now been run (2026-07-31)

All 63 text-flagged candidates were tested empirically. **The text scan was wrong by 30×.**

Method refinement worth keeping: instead of *unsetting* `app.operating_company_id` (which throws
`invalid input syntax for type uuid` on policies that cast without `NULLIF`), set it to a **valid
but non-existent** UUID `00000000-0000-0000-0000-000000000000`. The entity predicate then matches
nothing, so any rows returned came from the bypass alone. Cleaner, and it cannot error.

| verdict | tables | meaning |
|---|---:|---|
| **CONFIRMED AND-GATED** | **2** | bypass returns 0 while the entity reads return rows |
| CANONICAL (bypass widens) | **33** | returned full data against a non-existent entity |
| UNDETERMINED (genuinely empty) | **28** | 0 everywhere; re-test when they hold rows |

### The 2 confirmed

| table | bypass-only | TRANSP | TRK | USMCA |
|---|---:|---:|---:|---:|
| `dispatch.load_id_reservations` | **0** | 2,276 | 41 | 16 |
| `safety.safety_settings` | **0** | 1 | 1 | 1 |

`safety.safety_settings` is the more dangerous of the two despite holding only 3 rows: it is
per-entity configuration, so an audit that reads it under bypass sees **no safety settings
configured for any entity** and would reasonably conclude the feature is unconfigured. It also sits
next to a known landmine (`safety_settings` has no INSERT policy — creating a company 500s).

### The 28 UNDETERMINED

`accounting.ar_collection_contacts` · `accounting.factoring_advances` · `chat.attachments` ·
`chat.message_receipts` · `chat.messages` · `chat.participants` · `chat.threads` ·
`compliance.property_tax_rendition_lines` · `compliance.property_tax_renditions` ·
`dispatch.intransit_issues` · `expense_attribution.expense_seq_per_load` ·
`ifta.personal_conveyance_miles_by_quarter` · `ifta.state_gallons_by_quarter` ·
`ifta.state_miles_by_quarter` · `ifta.state_tax_by_quarter` · `integrations.qbo_sync_conflicts` ·
`master_data.customer_terms_history` · `mdata.driver_teams` · `mdata.location_contacts` ·
`mdata.qbo_invoices` · `ops.daily_task_alerts` · `ops.daily_task_events` · `ops.daily_tasks` ·
`owner.todays_attention_snapshot` · `safety.civil_fines` · `safety.company_violations` ·
`safety.integrity_alerts` · `settlements.settlement_disputes`

These are empty, so the test cannot distinguish "bypass works" from "bypass is AND-gated." They are
**not cleared** — the four `ifta.*` tables in particular will hold real quarterly filing data soon,
and if any is AND-gated, an IFTA audit under bypass would read zero miles and zero gallons.
**Re-run the test on each the first time it holds a row.**

## Why the raw text-scan number must never be used

A text scan of `pg_policies` for quals containing both `operating_company_id` and `AND` returns
**63 tables** across accounting, catalogs, chat, compliance, dispatch, ifta, integrations, mdata,
ops, safety and settlements.

**That number is wrong and must not be used.** The heuristic over-flags: `mdata.loads` matches it,
yet its bypass **does** widen — verified, 10 rows returned with bypass alone and no entity GUC. A
policy may legitimately contain `AND` inside a subclause while still being a top-level
`bypass OR (...)`.

All 63 were then tested empirically (see RESULT above): **2 confirmed, 33 canonical, 28
undetermined-because-empty**. The heuristic over-reported the real population by **30×**. Had the
63 been published as a finding, it would have driven a migration touching 61 policies that do not
need changing — including `mdata.loads`, the single most-read table in the system.

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

Scope is now known: **`dispatch.load_id_reservations` (2 policies) + `safety.safety_settings`
(2 policies) = 4 policies on 2 tables.** Nothing else.

Repointing the affected policies to the canonical `identity.is_lucia_bypass() OR (...)` shape is a
`db/migrations/*.sql` change and therefore **financial-cluster (§1.4): build, show the full SQL,
wait for the owner's explicit OK, never self-merge.** Per the owner's 2026-07-31 instruction this
stays untouched until a migration PR carrying the empirical proof above for every table it changes.

Sequencing: the empirical sweep is DONE and the confirmed list is above. The migration must change
exactly those 4 policies and nothing that was flagged only by text match.

**Preserve each role check exactly — they are NOT the same.** The fix is to make the bypass widen
entity scope, never to drop the role gate. Target shape:
`identity.is_lucia_bypass() OR (operating_company_id = ... AND role = ANY(...))`.

Verified quals as they stand on prod today:

| policy | cmd | roles that must survive the rewrite |
|---|---|---|
| `load_id_reservations_select` | SELECT | Owner · Administrator · Manager · Dispatcher |
| `load_id_reservations_write` | ALL | Owner · Administrator · Manager · Dispatcher |
| `safety_settings_select_policy` | SELECT | Owner · Administrator · Manager · **Safety · Accountant** |
| `safety_settings_update_policy` | UPDATE | Owner · Administrator · **Safety** |

The two `safety_settings` policies carry **different** role sets — SELECT admits Manager,
Safety and Accountant; UPDATE admits only Owner, Administrator and Safety. A rewrite that
copy-pastes one role list onto both would silently grant Manager and Accountant the ability to
change safety configuration. Rewrite them independently and diff the role arrays before and after.

## Consequence worth stating plainly

Any prior audit, count, or "verified 0" that relied on `bypass_rls='lucia'` **without also setting
`app.operating_company_id`** is unreliable for AND-gated tables. That is not a hypothetical — it
produced a wrong statement in this very session, which was caught only because `n_live_tup`
disagreed with the count. **Pair every bypass count with an RLS-immune discriminator; a bare 0 is
still not a verdict, even with the bypass set.**
