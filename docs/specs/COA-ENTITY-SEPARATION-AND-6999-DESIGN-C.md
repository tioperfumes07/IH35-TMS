# COA Entity Separation + #6999 Design C (revised)

**Status:** DESIGN-FIRST — read-only investigation complete, NO branch / NO build. STOP for Jorge.
**Date:** 2026-06-15 (CT)
**Schema facts below are MEASURED on prod** (`ep-broad-block`, role `neondb_owner`, read-only). No assumptions.

---

## PART 1 — ENTITY SEPARATION AUDIT (measured)

### 1.1 Is `catalogs.accounts` per-entity or global?

**GLOBAL / shared. It has NO entity column.** Full column list:

```
id, account_number, account_name, account_type, account_subtype,
parent_account_id, qbo_account_id, qbo_account_qrn, is_postable,
currency_code, opening_balance_cents, notes, created_at, updated_at,
deactivated_at, created_by_user_id, updated_by_user_id,
qbo_synced_at, qbo_sync_status, qbo_sync_error, is_locked, opening_balance_as_of
```

- **No `operating_company_id`, no `entity`, no `company` column.** 371 rows, one shared pool.
- RLS on the table is scoped **by role only**, not by entity:
  - `accounts_select`: `is_lucia_bypass() OR current_user_role() IS NOT NULL` (any authenticated user sees ALL accounts).
- For contrast, ~33 sibling `catalogs.*` tables **do** carry `operating_company_id` (e.g. `chart_of_accounts_seeds`, `expense_categories`, `tax_codes`, `payment_methods`, `parts`). So per-entity scoping is the house pattern **everywhere except the accounts table itself.**

### 1.2 How is per-entity separation enforced today?

Separation lives **only in the `accounting.*` mapping layer** (your option **(c)**), not in the accounts pool:

| table | entity column | purpose |
|---|---|---|
| `accounting.chart_of_accounts_roles` | `operating_company_id` | maps `(entity, role) → account_id`, `is_active` |
| `accounting.expense_category_account_map` | `operating_company_id` | maps `(entity, category) → account_id`, `posting_side` |

`chart_of_accounts_roles` already has a per-entity uniqueness index:

```sql
uq_coa_roles_company_role_active
  UNIQUE (operating_company_id, role) WHERE (is_active = true)
```

**Entities (confirmed on prod, `org.companies`):**

| code | id | legal_name |
|---|---|---|
| TRANSP | `91e0bf0a-133f-4ce8-a734-2586cfa66d96` | IH 35 Transportation LLC |
| TRK | `b49a737b-6cf0-43bb-8758-a6c8ff8a2c4e` | IH 35 Trucking LLC |
| USMCA | `5c854333-6ea5-4faa-af31-67cb272fef80` | USMCA Freight Solutions Inc |

### 1.3 The gap — measured commingling

Because the accounts pool is global and the mapping layer does **not** prevent two entities from binding the same account, commingling **exists today**:

| global account | shared by | role |
|---|---|---|
| `16ba4453-…` | **TRANSP + TRK** | `ar_control` |
| `3d580499-…` | **TRANSP + TRK** | `undeposited_funds` |
| `47c792e9-…` | **TRANSP + TRK** | `ap_control` |

TRANSP and TRK share the **same physical** AR-control, AP-control, and undeposited-funds accounts. With separate federal tax IDs and "share nothing," a posting to "AR" cannot be unambiguously attributed to one legal entity's books — an audit defect.

`uncategorized_expense` is **not** commingled, but USMCA is **unmapped**:

| entity | uncategorized_expense account |
|---|---|
| TRANSP | `4cec8ed2-…` |
| TRK | `b8a46eff-…` |
| USMCA | **MISSING** |

> Caveat (honest): this is early seed-stage data — 8 role rows, only 2 of 3 entities mapped. It reads as seed scaffolding, not necessarily live posted balances. But the **schema permits** commingling, which is the structural problem regardless of current row counts.

### 1.4 VERDICT

**P1 multi-entity-integrity gap.** The COA is **not** correctly per-entity: `catalogs.accounts` is a single global pool with no entity partition, separation depends on mapping-layer convention, nothing enforces ≤1 entity per account, and 3 control accounts are commingled between TRANSP and TRK today. This blocks a clean USMCA July-2026 launch.

**Tracker rows to log:**
- `COA-ENTITY-COMMINGLING-P1` — TRANSP/TRK share `ar_control`/`ap_control`/`undeposited_funds`; `catalogs.accounts` has no entity partition.
- `COA-USMCA-UNCATEGORIZED-MISSING` — USMCA has no `uncategorized_expense` mapping; must seed before launch.

---

## PART 2 — #6999 DESIGN C (revised)

### 2.0 Plainly: what it does

Make a **second active uncategorized-expense account, per entity, structurally impossible** — so #6999 (duplicate active uncategorized account) can never recur. Anchored on a stable **`system_purpose`** identity, **per entity** (entities share nothing), resolved by **QBO link** (never `gen_random_uuid`).

### 2.1 BLOCKER — anchor cannot live on `catalogs.accounts` yet

Your spec asks for a `system_purpose` column **and** a **per-entity** partial-unique index **on `catalogs.accounts`**. Measured fact: **`catalogs.accounts` has no entity column.** A per-entity unique index there is **impossible** until Part 1's gap is resolved.

> **Design C as framed (anchor on `catalogs.accounts`) is BLOCKED until `catalogs.accounts` is entity-partitioned (Part 1 fix below).**

Two viable paths follow. **Path A is buildable now; Path B is your framing and needs the Part 1 fix first.**

### 2.2 Path A — anchor at the binding layer (buildable now, no schema gap)

The per-entity "≤1 active uncategorized-expense" guarantee **already exists** via `uq_coa_roles_company_role_active` on `chart_of_accounts_roles` for `role = 'uncategorized_expense'`. So #6999 is **already structurally prevented at the (entity, role) layer** — no new index required. Net-new work is a runtime guard + data convergence.

- **`system_purpose` equivalent** = the existing stable `role` text key (`'uncategorized_expense'`) — already not a name-pattern.
- **Per-entity uniqueness** = existing `UNIQUE (operating_company_id, role) WHERE is_active`.
- **Convergence (data only, idempotent `DO`/`IF NOT EXISTS`):**
  1. Resolve each entity's intended uncategorized account **by QBO link** (`catalogs.accounts.qbo_account_id` / `qbo_account_qrn`), never by generating a new id.
  2. Seed USMCA's missing `uncategorized_expense` binding to USMCA's own account.
  3. Decommingle: give TRK its own distinct `ar_control`/`ap_control`/`undeposited_funds` accounts (separate from TRANSP).
- **Limitation:** Path A enforces uniqueness of the *binding*, but two entities can still **point at the same global account** (the Part 1 commingling gap remains). Path A does not fix commingling.

### 2.3 Path B — your framing (anchor on `catalogs.accounts`); requires Part 1 fix

1. **Part 1 fix first** — add `operating_company_id` + `system_purpose text` to `catalogs.accounts` (each account belongs to exactly one entity). Financial-cluster migration; assign all 371 accounts, rewrite RLS to entity-scope, backfill FKs. **NEVER self-merge.**
2. **Then** the exact per-entity partial-unique index Jorge specified:

```sql
CREATE UNIQUE INDEX uq_accounts_one_active_uncategorized_per_entity
  ON catalogs.accounts (operating_company_id, system_purpose)
  WHERE system_purpose = 'uncategorized_expense'
    AND deactivated_at IS NULL;
```

> Per-entity (`operating_company_id` leads the key), **not** global. `system_purpose` is the anchor — never `account_name` / number / QBO-derived string.

### 2.4 Converge-then-constrain (Path B order)

1. **Converge first** (cannot add the unique index while duplicates exist): for each entity, resolve the canonical uncategorized account **by QBO link**; set its `system_purpose='uncategorized_expense'`; `deactivated_at = now()` on any other active uncategorized account for that entity (void-not-delete). No `gen_random_uuid`.
2. **Verify** zero entities have >1 active uncategorized account.
3. **Then constrain** — add the partial-unique index (step 2.3.2). Idempotent (`IF NOT EXISTS`).
4. Index numbering strictly above main's max; `security_invoker` unaffected (no view change); add GRANTs only if new objects created.

### 2.5 Runtime guard (fail-loud; both paths)

A startup/posting-time assertion that **throws** (never silently falls back to a shared/global default) on any of:

- **>1 active uncategorized-expense account for an entity** (defense-in-depth even with the index).
- **An active #6999-style duplicate** detected by the convergence query returning >1 row per entity.
- **Role drifted off its QBO link** — the bound account's `qbo_account_id`/`qbo_account_qrn` is null or no longer matches the canonical QBO uncategorized account (detects silent re-pointing).
- **Missing mapping** — an entity (e.g. USMCA) has zero active uncategorized binding → throw, do not auto-create.

Resolution is always `WHERE operating_company_id = $entity AND role/system_purpose = 'uncategorized_expense' AND is_active/deactivated_at IS NULL`, account located **by QBO link** — keyed on `(entity, purpose)`, never by name, never minting a uuid.

### 2.6 Recommendation

Option **B** (entity-partition `catalogs.accounts`) is the audit-correct end state for three independent tax IDs, but it is a **financial-cluster schema change — will not be built solo.** Suggested sequence:
1. Log the two Part 1 tracker rows.
2. Ship **Path A** convergence (seed USMCA, decommingle TRK) + the fail-loud runtime guard — buildable now, prevents #6999 recurrence at the binding layer, fixes the USMCA gap.
3. Author the **Path B / Part 1** entity-partition migration as a separate design doc for explicit review before any build.

---

## STOP — awaiting Jorge

Decisions needed:
- **A vs B** for the COA anchor (binding-layer now vs entity-partition `catalogs.accounts`).
- Go-ahead to **log the two tracker rows**.
- Confirm convergence may **decommingle TRK's** ar/ap/undeposited control accounts (data change, finance cluster → your OK required).

No branch, no migration, no build until you choose.
