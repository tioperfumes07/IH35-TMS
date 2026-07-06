# P4 — DB Audit: `operating_company_id` TEXT → uuid+FK (9 flagged tables)

Status: **DESIGN + BUILD-AND-HOLD.** No migration in this PR is to be run against prod. Financial
cluster / RLS / migration gate (constitution §1.3/§1.4) — Jorge merges after explicit "OK to merge",
and even after merge all 7 migrations below must run ONLY on a Neon branch by Jorge's hand per the
`DO NOT RUN ON PROD` / `.held-migrations.json` pattern, then be ledger-backfilled.

**UPDATE 2026-07-05 — prod read-only data-audit complete.** All 7 open tables confirmed **0 rows in
prod**. So there is **no data to remap** — every one is a clean type conversion. All 7 migrations are
now written (2 templates + 5 filled in). See §1 for the audit result and §3 for per-table plans.

## 0. Verified table list (re-checked against `db/migrations/` — not from memory)

The original DB-audit named 9 tables. Verification finds **2 already fixed and merged to `main`**,
**7 still genuinely broken**, and **zero false positives** (every one of the 9 scopes by
`operating_company_id`, not `tenant_id` — the coordinator's tenant_id false-positive concern, raised
mid-task, does not apply to any of these 9; grepped every migration touching each table name for
`tenant_id` — no hits anywhere).

| # | Table | Created in | Current state | Verdict |
|---|-------|-----------|----------------|---------|
| 1 | `dispatch.border_crossing_events` | `202606080111` | **FIXED** — `202607051215_e2_3_border_crossing_events_integrity.sql` (PR #2126, merged) converted TEXT→uuid + added FK + type-agnostic RLS | ✅ DONE, no action |
| 2 | `dispatch.driver_layovers` | `202606080113` | **FIXED** — `202607051230_e2_2_driver_layovers_integrity.sql` (PR #2122, merged) converted TEXT→uuid + added FK | ✅ DONE, no action |
| 3 | `accounting.recurring_bill_templates` | `202606072351` | `operating_company_id TEXT NOT NULL`, no FK. `202606281050_force_rls_financial_tables.sql` added FORCE RLS only — did NOT touch the column type. Policy compares as plain text (`operating_company_id = current_setting(...)`) | 🔧 WRITTEN — P4-3 (§3.3) |
| 4 | `dispatch.stop_extra_rates` | `202606080202` | `operating_company_id TEXT NOT NULL`, no FK. Policy already casts `operating_company_id::uuid IN (SELECT org.user_accessible_company_ids())` | 🔧 WRITTEN — **cleanest**, P4-1 (§3.1) |
| 5 | `qbo.reconciliation_alerts` | `202606080212` | `operating_company_id TEXT NOT NULL DEFAULT 'default'`, no FK. `'default'` is not a valid uuid | 🔧 WRITTEN — **most urgent**, P4-2 (§3.2) |
| 6 | `reports.scheduled_subscriptions` | `202606080206` | `operating_company_id TEXT NOT NULL`, no FK, UNIQUE(operating_company_id, report_slug). Seeded at migration time via `c.id::text` (real company uuid cast to text) | 🔧 WRITTEN — P4-4 (§3.4) |
| 7 | `safety.anomaly_alert_rules` | `202606080211` | `operating_company_id TEXT NOT NULL`, no FK, UNIQUE(operating_company_id, rule_slug) | 🔧 WRITTEN — P4-5 (§3.5) |
| 8 | `safety.anomaly_alerts` | `202606080211` | `operating_company_id TEXT NOT NULL`, no FK | 🔧 WRITTEN — P4-6 (§3.6) |
| 9 | `safety.integrity_findings` | `202606080112` | `operating_company_id TEXT NOT NULL`, no FK | 🔧 WRITTEN — P4-7 (§3.7) |

**tenant_id false-positive check (coordinator instruction):** grepped every migration file that
mentions each of the 9 table names for the string `tenant_id` — zero matches on any of them. All 9
scope exclusively by `operating_company_id`. No false positives to report; all 7 open items are real.

## 1. Data-audit — RESULT (read-only prod queries, run 2026-07-05)

**RESULT: all 7 open tables have 0 rows in prod.** No data to remap; every migration is a clean type
conversion. This resolves every per-table data-question below (there is no data to be dirty). The
queries used were:

```sql
-- (a) row count
SELECT count(*) FROM <schema>.<table>;

-- (b) distinct current operating_company_id TEXT values + whether each is uuid-shaped
SELECT operating_company_id,
       count(*) AS n,
       (operating_company_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') AS looks_like_uuid
FROM <schema>.<table>
GROUP BY operating_company_id
ORDER BY n DESC;
```

| Table | Prod rows | Verdict |
|-------|-----------|---------|
| `accounting.recurring_bill_templates` | 0 | clean conversion |
| `dispatch.stop_extra_rates` | 0 | clean conversion |
| `qbo.reconciliation_alerts` | 0 | clean conversion (no `'default'` row exists) |
| `reports.scheduled_subscriptions` | 0 | clean conversion (see CI-seed note below) |
| `safety.anomaly_alert_rules` | 0 | clean conversion |
| `safety.anomaly_alerts` | 0 | clean conversion |
| `safety.integrity_findings` | 0 | clean conversion |

**CI vs prod note (`reports.scheduled_subscriptions`):** prod is empty, but this table's *creation*
migration (`202606080206`) SEEDs per-company subscription rows via `c.id::text`. So on a fresh CI DB
the table is NOT empty — it holds valid-uuid seed rows. This is why the P4 conversion guard checks
**castability** (are all values uuid-shaped?), not raw emptiness — a literal "RAISE if non-empty"
guard would false-fail CI on this one table. The other 6 have no in-migration seed and are empty in CI
too. (The coordinator's instruction phrased the guard as "RAISE if unexpectedly non-empty"; the
castability form is the CI-correct realization of that same intent — it still fails loud on any
genuinely unexpected non-uuid value, while staying green on empty AND valid-uuid-seeded tables.)

### Original per-table data-questions (now all answered by "0 rows")

Run for **each** of the 7 open tables before writing/running its real migration:

```sql
-- (a) row count
SELECT count(*) FROM <schema>.<table>;

-- (b) distinct current operating_company_id TEXT values + whether each is uuid-shaped
SELECT operating_company_id,
       count(*) AS n,
       (operating_company_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') AS looks_like_uuid
FROM <schema>.<table>
GROUP BY operating_company_id
ORDER BY n DESC;
```

Per-table data-questions:

1. **`accounting.recurring_bill_templates`** — any recurring bill template rows yet (GAP-20 shipped
   but is it in active use)? If rows exist, are all `operating_company_id` values real
   `org.companies.id` uuids (as text)? Financial-cluster table regardless — extra care.
2. **`dispatch.stop_extra_rates`** — any per-stop extra-rate rows written? Because the RLS policy
   already casts `::uuid`, any row that has ever been *readable* through the app is provably
   uuid-shaped already — but confirm zero rows were ever inserted directly (migration/seed/backfill
   script) bypassing RLS, which could carry a non-uuid string un-noticed.
3. **`qbo.reconciliation_alerts`** — **the urgent one.** Does any row literally carry
   `operating_company_id = 'default'` (the column DEFAULT)? That would mean some INSERT omitted the
   column (the one known write path, `reconciliation-report.service.ts`, always supplies it
   explicitly — so if `'default'` rows exist, they came from a different/older write path, a manual
   insert, or a since-removed caller). Every `'default'` row is unscopeable — it can never match any
   real `operating_company_id` in RLS, so on FORCE RLS those rows become permanently invisible to the
   app (silent data loss from the operator's point of view) unless remapped first.
4. **`reports.scheduled_subscriptions`** — the seed INSERT used `c.id::text` for every
   `org.companies` row (TRK/TRANSP/USMCA) at migration time, so the seeded rows are provably clean.
   Question: has the app itself (`subscription.service.ts createSubscription`) ever written a row
   with a non-uuid `operatingCompanyId`? Confirm all rows are valid uuid-shaped text.
5. **`safety.anomaly_alert_rules`** — `seed-default-rules.ts` seeds per-tenant default rules keyed by
   a real `operatingCompanyId`. Confirm no rows carry a non-uuid value.
6. **`safety.anomaly_alerts`** — findings written by `rule-engine.service.ts` from
   `rule.operating_company_id` (itself read back from the rules table above) — so its cleanliness is
   coupled to #5. Confirm independently since this is the higher-volume table (one row per detected
   anomaly, not per rule).
7. **`safety.integrity_findings`** — written by `detector.service.ts` / the Samsara geofence
   reconciliation job / `driver-vendor-mapping.ts`. Confirm no rows carry a non-uuid value (this table
   is also used across two separate detector families — geofence GAP-27 and driver↔vendor GAP-52 — so
   check both write paths).

**Outcome:** all 7 returned 0 rows, so the "remap non-uuid values first" branch below did not fire for
any table. Each migration is the clean path: `ALTER COLUMN operating_company_id TYPE uuid USING
NULLIF(operating_company_id,'')::uuid` + `ADD CONSTRAINT fk_<table>_company FOREIGN KEY
(operating_company_id) REFERENCES org.companies(id)` (plain FK — validates instantly on an empty or
valid-uuid-only table). The conversion is still **guarded**: each migration counts non-uuid values and
`RAISE EXCEPTION`s (never a blind UPDATE, never a silent skip) if any appear — a tripwire against data
landing between the 2026-07-05 audit and Jorge's hand-apply. Had any table been dirty, the remap rule
would have been: remap to a real `org.companies.id` resolved by `code` (never a hardcoded uuid), asking
Jorge where the entity isn't inferable.

## 2. The landmine — DROP POLICY before ALTER COLUMN, re-CREATE after

Every one of the 7 open tables has an RLS policy that directly references `operating_company_id`.
Postgres refuses `ALTER TABLE ... ALTER COLUMN ... TYPE` while any policy references that column
("cannot alter type of a column used in a policy definition"). The already-merged E2-2/E2-3
migrations hit exactly this and estabish the pattern followed here:

1. `DROP POLICY IF EXISTS <every policy that references the column>` — this includes a policy on a
   *child* table whose USING/CHECK subqueries the parent's `operating_company_id` (see §3.3 / §3.4),
   because Postgres tracks that transitive dependency too.
2. Guarded `TEXT -> uuid` conversion: check `information_schema.columns.data_type`, count non-uuid
   non-null values, `RAISE EXCEPTION` if any (the data-audit proved all 7 clean/empty, so any value is
   unexpected — fail loud, never a blind `UPDATE`, never a silent skip), else `ALTER COLUMN ... TYPE
   uuid USING NULLIF(operating_company_id,'')::uuid`. This RAISE-on-non-castable form (not RAISE-on-
   non-empty) stays CI-green even where the creation migration seeds valid-uuid rows (§1 CI-seed note).
3. Re-`CREATE POLICY` with the canonical predicate, cast-safe regardless of whether the ALTER ran
   (`operating_company_id::text = current_setting('app.operating_company_id', true)` — works whether
   the column is still text mid-migration-run or already uuid).
4. `ADD CONSTRAINT fk_<table>_company FOREIGN KEY (operating_company_id) REFERENCES org.companies(id)`
   — guarded by `pg_constraint` existence check. Plain (validated) FK, not `NOT VALID`: since the
   data-audit confirmed every table empty/clean, validation is instant and we get a fully-trusted
   constraint immediately (no follow-up `VALIDATE CONSTRAINT` pass needed).
5. Re-assert `ENABLE` + `FORCE ROW LEVEL SECURITY` + `ih35_app` grants (0065 pattern), idempotent.

## 3. Per-table migration plan — ALL 7 WRITTEN (data-audit confirmed 0 rows → clean conversions)

Each is a separate idempotent PROTECTED migration, `DO NOT RUN ON PROD`, registered in
`db/migrations/.held-migrations.json`. Numbers `202607091500`–`202607091560` (§4).

### 3.1 `dispatch.stop_extra_rates` — `202607091500_p4_1_stop_extra_rates_opco_uuid.sql`
Cleanest: its original RLS policy already casts `operating_company_id::uuid`. Policy
`stop_extra_rates_tenant_isolation`. No child-policy entanglement. FK `fk_stop_extra_rates_company`.

### 3.2 `qbo.reconciliation_alerts` — `202607091510_p4_2_qbo_reconciliation_alerts_opco_uuid.sql`
Most urgent: `DEFAULT 'default'` is a non-uuid literal that could never satisfy
`operating_company_id::uuid` — any row that received it would be permanently unscopeable/invisible
under RLS. The data-audit found **0 rows** (so nothing is orphaned today), but the migration still
**drops the bad `DEFAULT 'default'`** before the type conversion (a text `'default'` default can't be
cast to uuid) so the bug class cannot recur. **No new default is added** — every write path
(`reconciliation-report.service.ts`) supplies `operating_company_id` explicitly; a silent uuid default
would re-hide the same class of bug. Policy `rls_qbo_recon_alerts`. FK `fk_qbo_recon_alerts_company`.

### 3.3 `accounting.recurring_bill_templates` — `202607091520_p4_3_...`
Financial-cluster (accounting.*); already FORCE-RLS from `202606281050`. Two policies dropped/recreated:
parent `rbt_tenant_scope` (direct) AND child `rbgl_tenant_scope` on
`accounting.recurring_bill_generation_log`, which **subqueries the parent's `operating_company_id`** —
so it references the altered column transitively and must be dropped before the ALTER, recreated
cast-safe after (the child table itself has no `operating_company_id`; no FK added to it).
FK `fk_recurring_bill_templates_company`.

### 3.4 `reports.scheduled_subscriptions` — `202607091530_p4_4_...`
Two policies: parent `scheduled_subs_tenant_scope` (direct) + child
`scheduled_delivery_log_tenant_scope` on `reports.scheduled_delivery_log` (subqueries the parent's
opco) — both dropped/recreated cast-safe. `UNIQUE(operating_company_id, report_slug)` survives the type
change (index rebuilt automatically). **This is the one table seeded by its own creation migration**
(valid `c.id::text` uuids) → non-empty in CI but clean; the castability guard handles it (§1 CI-seed
note). FK `fk_scheduled_subscriptions_company`.

### 3.5 `safety.anomaly_alert_rules` — `202607091540_p4_5_...`
Split from its companion per the one-table-per-migration rule. Policy `rls_anomaly_rules_company`.
`UNIQUE(operating_company_id, rule_slug)` survives. FK `fk_anomaly_alert_rules_company`.

### 3.6 `safety.anomaly_alerts` — `202607091550_p4_6_...`
Companion of 3.5 (shares creation migration `202606080211`, split into its own P4 file). The existing
`rule_uuid` FK → `anomaly_alert_rules.uuid` is unaffected. Policy `rls_anomaly_alerts_company`.
FK `fk_anomaly_alerts_company`.

### 3.7 `safety.integrity_findings` — `202607091560_p4_7_...`
Extended twice (GAP-27 geofence, GAP-52 driver↔vendor via `202606080213`) but neither touched
`operating_company_id` — only the `anomaly_class` CHECK. Single policy
`rls_safety_integrity_findings_company`. FK `fk_integrity_findings_company`.

## 4. Numbering
Main's current highest migration prefix (re-checked at push time): `202607090000`
(`202607090000_event_log_guc_reconcile.sql`, itself HOLD-FOR-JORGE and unrun). This PR's 7 migrations
use `202607091500`–`202607091560` — strictly above main's max. **Re-check at push time** — main moves
fast.

## 5. Held-migration registration
All 7 migrations are committed to `main` as part of this PR (schema/RLS-hardening files only — merging
the PR does not run them), and each additionally carries a `DO NOT RUN ON PROD` marker + is registered
in `db/migrations/.held-migrations.json`, so the normal preDeploy `db:migrate` step SKIPS them even
after the PR merges. Jorge runs each by hand on a Neon branch, then ledger-backfills so prod skips it.
This is stricter than the E2-2/E2-3 precedent (which shipped the guarded conversion as a normal
HOLD-FOR-JORGE-gated migration that ran automatically on prod once merged) — chosen because these touch
a financial-cluster table (`recurring_bill_templates`) and a known-bad-default table
(`qbo.reconciliation_alerts`), and because the whole set is an RLS/type change on live entity-scoping.

## 6. What is NOT in this PR
- No migration is run against prod. Build-and-hold; Jorge applies each on a Neon branch by hand.
- No merge, no label. The hold-merge-gate correctly marks this PR PROTECTED (title `[HOLD-FOR-JORGE]`).
- The conversion guard is a `RAISE EXCEPTION` tripwire, so if data lands on any table between the
  2026-07-05 audit and Jorge's apply, the migration fails loud rather than converting blindly — at
  which point the remap-by-code path (§1) is added before re-running.
