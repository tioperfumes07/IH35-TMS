# Schema-Parity Table-Count Reconcile (verification, read-only)

**Date:** 2026-06-28 (CDT, Laredo) · **Task:** CODER-23 / SCHEMA-PARITY-COUNT-RECONCILE
**Tier:** T3 verification — READ-ONLY. No `schema-parity-baseline.json` edit. No prod touch.

## TL;DR verdict
**No real missing or extra base table.** The "654 vs 493" gap is a **scope + snapshot**
difference, not drift. The `schema-parity` baseline is *correct-but-narrow by design*: it counts
only base tables it can statically parse from `CREATE TABLE` literals in the migration SQL (for
column-drift detection). A live `information_schema` count additionally includes views, partition
children, and dynamically/seed-created lookup tables — none of which the column-drift baseline needs.

---

## 1. What each number actually measures

| Source | Method | Count |
|---|---|---|
| CAS-03 audit (#1585) | `information_schema.tables` on a fresh-migrated DB (earlier snapshot) | **654** |
| FA-MIG schema-parity baseline (then) | `verify-schema-parity.mjs` — **parses `CREATE TABLE` in `db/migrations/*.sql`** | **493** |
| This reconcile — baseline (now) | same parser, current migrations | **502** |
| This reconcile — fresh DB (now) | `information_schema.tables`, app schemas* | **619 BASE TABLE + 47 VIEW = 666** |

\* app schemas = all except `pg_catalog, information_schema, pg_temp, ih35_migrations, topology`.

**Method (this reconcile):** created a fresh local DB `ih35_db7recon`, applied all 530 migrations
(local socket only — `current_database()=ih35_db7recon`, local; no prod), then counted
`information_schema.tables` and diffed the base-table set against the baseline's 502 keys.

The CAS-03 **654** and this run's **666** differ only by the ~12 tables added in the migrations
applied since CAS-03 (e.g. `202606281000…1070`: auto_deduction_policies, team_split_configs,
road_service_tickets, maintenance_parts_catalog, payroll_integration_cache, fixed_assets×4,
revenue_recognition×3). Consistent growth — not a discrepancy.

---

## 2. Reconcile: baseline 502 (base tables) vs fresh-DB 619 (BASE TABLE)

```
  499  overlap (in both)
+ 120  in DB, not in baseline   (parser doesn't see these)
-   3  in baseline, not in DB   (parser artifacts)
─────
  619  fresh-DB BASE TABLE      (499 + 120)
  502  baseline                 (499 +   3)
```

### The 120 "in DB, not in baseline" — all benign, by category
| Category | Count | Why the baseline parser misses them |
|---|---:|---|
| `public.audit_log_YYYY_MM` | **48** | **partition children** (48/48 confirmed `relispartition`) — created by partitioning, not a literal `CREATE TABLE schema.table (`. |
| `catalogs.*` lookups | **65** | seed/lookup tables created via a pattern the `CREATE TABLE` regex doesn't capture (e.g. dynamic/looped DDL). Real tables (accident_types, currency_codes, license_classes-style). |
| `reference.*` lookups | **5** | same — `cdl_endorsements`, `cdl_restrictions`, `license_classes`, `medical_card_statuses`, `employment_statuses`. |
| `safety.civil_fines` | **1** | the **renamed** target of `safety.fines` (see below). |
| `_system._schema_migrations` | **1** | migration-runner bookkeeping variant. |

### The 3 "in baseline, not in DB" — all parser artifacts, NOT missing tables
| Baseline key | Reality (verified `to_regclass` on fresh DB) | Cause |
|---|---|---|
| `safety.fines` | does not exist; **`safety.civil_fines` exists** | renamed (RENAME ×2: `0050` + `202606151200` repair). Parser tracked the original CREATE, didn't follow the rename. |
| `dispatch.loads` | does not exist (real = `mdata.loads`) | **phantom** — `CREATE TABLE dispatch.loads` count = 0; parser picked it up from an `ALTER`/`REFERENCES` mention. |
| `driver_pay.settlements` | does not exist (real = `driver_finance.settlement_lines` / `driver_settlements`) | **phantom** — `CREATE TABLE` count = 0; same parser false-positive. |

### Plus 47 VIEWs
The baseline scope is **base tables only**; `information_schema` counts the 47 `security_invoker`
views on top. (Also present but not in `information_schema.tables`: 1 materialized view, 1
partitioned parent.)

**Full identity:** `666 = 619 BASE TABLE + 47 VIEW`, and `619 = 502 baseline − 3 artifacts + 120 parser-invisible`.

---

## 3. Verdict & recommendation

- **Baseline is correct-but-narrow, NOT stale.** It tracks statically-parseable base tables for the
  column-drift guard; it is *not* a full object inventory and was never intended to equal an
  `information_schema` count. The 654/493 pair was never in conflict — different scopes + snapshots.
- **No real missing/extra base table.** Every one of the 120 extras is a legitimate
  partition/lookup table; all 3 baseline-only entries are parser artifacts (one rename, two known
  phantoms). **No Tier-1 migration concern — no STOP required.**

**Recommendations (for GUARD/Jorge — not done here, read-only task):**
1. **No action needed on the count.** The discrepancy is expected scope difference.
2. *(Optional hygiene, separate PR in the migration lane — must NOT touch `schema-parity-baseline.json`
   here, it conflicts with the migration PRs):* drop the 2 phantom keys (`dispatch.loads`,
   `driver_pay.settlements`) and rename `safety.fines → safety.civil_fines` in the baseline so it
   carries zero known-stale entries. Purely cosmetic — the guard still works correctly today.
3. *(Optional)* add a one-line note to `verify-schema-parity.mjs` documenting that its count is
   "base tables parsed from CREATE TABLE DDL — excludes views, partitions, and dynamically-created
   tables" so the next reader doesn't re-chase this gap.

## 4. PROD ground-truth (GUARD-verified) — locks the verdict

GUARD verified the 3 "baseline-only" names directly against **prod** (Neon
`br-fancy-credit-akjnd07a`) via `information_schema`. **Result: none of the 3 exist on prod.**
This confirms (does not just infer) the parser-artifact conclusion — they were CREATE'd under old
schema names in early migrations, then moved/renamed/replaced, and the DDL parser still counts the
old names. **No STOP-flag. No missing table.** The 654-vs-493 (now 666-vs-502) item is **BENIGN, closed.**

### Each renamed-away name → its current canonical table (targets verified to exist)
| Baseline-only name (parser artifact) | Exists on prod? | Canonical table(s) today | How verified |
|---|---|---|---|
| `dispatch.loads` | no | **`mdata.loads`** | `CREATE TABLE mdata.loads` present; `CREATE TABLE dispatch.loads` count = 0 (§4 known phantom) |
| `driver_pay.settlements` | no | **`driver_finance.driver_settlements`** (header) + **`driver_finance.settlement_lines`** (lines); related `settlement_disputes`, `driver_settlement_deductions` | `CREATE TABLE driver_pay.settlements` count = 0; the `driver_finance.*` set is CREATE'd in migrations |
| `safety.fines` | no | **`safety.civil_fines`** (external/civil) + **`safety.internal_fines`** (internal) | `safety.fines` was CREATE'd then `ALTER … RENAME`'d (RENAME ×2); `civil_fines` has 0 `CREATE` (came from the rename) and exists on the fresh-migrated DB; `internal_fines` is separately CREATE'd |

(Safety v6.4 lock splits fines into **Internal Fines** + **External Fines** tabs — consistent with
`safety.internal_fines` + `safety.civil_fines` being the live tables, and bare `safety.fines` being gone.)

### Recommendation (propose only — NOT implemented here)
Teach `verify-schema-parity.mjs` to honor later `DROP TABLE` / `ALTER TABLE … RENAME TO` /
`ALTER TABLE … SET SCHEMA` so the parser stops counting renamed-away names (it currently tracks the
original `CREATE` and never follows the move). This removes the 3 false-positives and makes the
baseline a faithful "live base tables from DDL" model. **Baseline/parser changes are their own
reviewed PR** — not this read-only doc, and not bundled with migration PRs (which already touch
`schema-parity-baseline.json`).

## Reproduction
```bash
# fresh local DB (local socket only — never prod)
createdb ih35_db7recon
DATABASE_DIRECT_URL= DATABASE_URL='postgres://<user>@/ih35_db7recon?host=/tmp&sslmode=disable' npm run db:migrate
psql "$DB" -c "SELECT table_type, count(*) FROM information_schema.tables
  WHERE table_schema NOT IN ('pg_catalog','information_schema','pg_temp','ih35_migrations','topology')
  GROUP BY table_type;"   -- BASE TABLE 619 | VIEW 47
# diff vs baseline keys (docs/schema-parity-baseline.json → 502)
```
