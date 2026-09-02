# WORKORDER — Driver Account Provisioning Reconciliation (2026 USMCA Cohort)

**Owner:** DEVIN-A (data reconciliation) → CC-1 (migration + provisioning job)
**Date:** 2026-09-01
**Scope:** 2026 USMCA load-assignment cohort only. Do NOT widen to the broader ~70 active USMCA driver roster.
**Operating company:** USMCA Freight Solutions Inc (`5c854333-6ea5-4faa-af31-67cb272fef80`)
**Source of population:** `mdata.loads` assignment fields, NOT `driver_bills` (39 loads have no bill; bill-based counting hides 5 drivers).

---

## 1. Population query (authoritative)

```sql
-- Run with SET LOCAL app.bypass_rls = 'lucia'
WITH load_drivers AS (
  SELECT DISTINCT driver_id FROM (
    SELECT assigned_primary_driver_id AS driver_id
    FROM mdata.loads
    WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80'
      AND created_at >= '2026-01-01'
      AND load_number NOT ILIKE 'DEMO-L%'
      AND soft_deleted_at IS NULL
      AND assigned_primary_driver_id IS NOT NULL
    UNION ALL
    SELECT assigned_secondary_driver_id AS driver_id
    FROM mdata.loads
    WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80'
      AND created_at >= '2026-01-01'
      AND load_number NOT ILIKE 'DEMO-L%'
      AND soft_deleted_at IS NULL
      AND assigned_secondary_driver_id IS NOT NULL
  ) x
)
SELECT d.id, d.first_name, d.last_name, ...
FROM mdata.drivers d JOIN load_drivers ld ON ld.driver_id = d.id;
```

**IMPORTANT — `is_sample_data` is DEPRECATED:** Do NOT filter on `mdata.loads.is_sample_data` (per its column comment: "DEPRECATED 2026-07-25 — DO NOT FILTER ON THIS COLUMN"). Sample loads are identified by `load_number ILIKE 'DEMO-L%'`.

**Result: 16 drivers returned** (14 production + 2 test drivers).

---

## 2. Cohort inventory (16 drivers, live Neon evidence 2026-09-01)

### 2a. Production drivers — 14 (the owner's stated count)

| # | Driver ID | Name | Status | Samsara ID | Loads | Has USMCA Cash Advance? | Has USMCA Escrow? | Provision? |
|---|-----------|------|--------|------------|-------|-------------------------|-------------------|------------|
| 1 | `a785bea7-6dde-4bf9-81b9-b9135c2df4b5` | PEDRO ABRAHAM LOPEZ COLLADO | Active | 60195185 | 6 | YES | YES | N/A — both exist |
| 2 | `fba21d80-628b-4228-ae54-336f9cbb73b6` | ANGEL ALFONSO SOSA | Active | 55857614 | 1 | NO | NO | **HOLD — identity ambiguity** (see §4) |
| 3 | `45fac397-860e-4fe8-ae18-67e12e1959c1` | JOSE ANTONIO VICENTE MARTINEZ | Active | 58302928 | 3 | NO | NO | **PROVISION** (identity clean) |
| 4 | `4ff53886-41cc-434f-ae23-a36a0e3ec8e2` | LUIS ARMANDO SOSA PEREZ | Active | 57224412 | 1 | YES | YES | N/A — both exist |
| 5 | `ac9ea24d-25a5-4e4f-b23e-aa90294357ac` | Leonel Antonio Morales Noguez | Active | 13680780 | 9 | YES | YES | N/A — both exist |
| 6 | `424a3bb9-60c2-4f16-8d9c-afa6be475ad7` | Concepcion Cordova Dominguez | Active | 1589367 | 1 | YES | YES | N/A — both exist |
| 7 | `a32a35c8-7cd5-4368-83f0-35e185092433` | Neftali Coronado Urbano | Active | 50550933 | 9 | YES | YES | N/A — both exist |
| 8 | `6e908ee1-c626-4aae-83c0-4b1e4e0f683b` | GENARO GUERRERO CHAVEZ | Active | 56507640 | 12 | NO | NO | **HOLD — identity ambiguity** (see §4) |
| 9 | `40823a77-d8d4-481c-88cb-1387556aa98e` | ALFONSO HIDALGO CHAVEZ | Active | 60309682 | 2 | YES | YES | N/A — both exist |
| 10 | `3e138476-06db-4b08-9ebe-527a5d8c591d` | Jorge Luis Infante Corona | Active | 35268314 | 2 | NO | NO | **PROVISION** (identity clean) |
| 11 | `49427973-e93e-4ea7-a2eb-eb9eefa7f331` | Jorge Pablo Guadalupe Muñoz Gonzalez | Active | (null) | 6 | YES | YES | N/A — both exist (also has TRANSP accounts — context only) |
| 12 | `5f9f4932-e745-4d2b-a04e-82d2e18a690c` | Antonio Navarrete Leon | Active | 1450273 | 2 | NO | NO | **HOLD — identity ambiguity** (see §4) |
| 13 | `c864a4bb-a7ff-4373-a5e1-c1590eefe3b7` | Rafael Rogelio Rivero Reynoso | Active | 41389643 | 6 | YES | YES | N/A — both exist |
| 14 | `1e9384e4-8eef-416b-9632-b9a3cd1b008f` | Javier Vargas Solis | Active | 13399547 | 2 | NO | NO | **HOLD — identity ambiguity** (see §4) |

**Summary of 14 production drivers:**
- 8 have BOTH accounts (USMCA cash advance + USMCA escrow) — matches owner's count.
- 6 have NEITHER account — matches owner's list exactly:
  - ANGEL ALFONSO SOSA
  - Antonio Navarrete Leon
  - GENARO GUERRERO CHAVEZ
  - JOSE ANTONIO VICENTE MARTINEZ
  - Javier Vargas Solis
  - Jorge Luis Infante Corona

### 2b. Test drivers — 2 (flagged, owner decides)

| # | Driver ID | Name | Status | Samsara ID | Loads | Has USMCA Cash Advance? | Has USMCA Escrow? | Flag |
|---|-----------|------|--------|------------|-------|-------------------------|-------------------|------|
| T1 | `e901be6e-cee7-41cd-8827-8b5c320c9a20` | TEST CODEX ONBOARD 20260824 | Active | (null) | 3 | YES | YES | **TEST DRIVER in production roster** — `is_sample_data=FALSE`, email `test.codex.onboard.20260824@example.com`. Owner decides: archive or keep. |
| T2 | `88c04cf5-9e32-455c-91e5-298a9b331b10` | Juan USMCA-Battery | **Inactive** | (null) | 4 | YES | YES | **INACTIVE test driver** — `archived_at=2026-08-17`, `deactivated_at=2026-08-17`. Already has both accounts with $250.00 escrow balance. Owner decides what to do. |

---

## 3. Existing account balances (live Neon, 2026-09-01)

### 3a. USMCA escrow balances (`driver_finance.escrow_balances`)

Only 3 of the 16 cohort drivers have a row in `driver_finance.escrow_balances`:

| Driver | Name | total_held_cents | total_released_cents | current_balance_cents | status |
|--------|------|------------------|----------------------|-----------------------|--------|
| `ac9ea24d...` | Leonel Antonio Morales Noguez | 1 | 0 | 1 | active |
| `c864a4bb...` | Rafael Rogelio Rivero Reynoso | 25000 | 0 | 25000 | active |
| `88c04cf5...` | Juan USMCA-Battery (INACTIVE) | 25000 | 0 | 25000 | active |

**Note:** `accounting.escrow_accounts.balance_cents` shows 0 for all other drivers with escrow accounts. The `escrow_balances` sub-ledger is the authoritative per-driver balance; `escrow_accounts` is the GL control account.

### 3b. USMCA cash advance outstanding balances (`driver_finance.driver_advances.outstanding_balance`)

| Driver | Name | Advance count | Total outstanding |
|--------|------|---------------|-------------------|
| `a785bea7...` | PEDRO ABRAHAM LOPEZ COLLADO | 1 | $1.20 |
| `40823a77...` | ALFONSO HIDALGO CHAVEZ | 1 | $250.00 |
| All others | — | 0 | $0.00 |

### 3c. TRANSP context (CONTEXT ONLY — do NOT migrate, do NOT use to satisfy USMCA provisioning)

Only 1 cohort driver has TRANSP accounts:

| Driver | Name | TRANSP Cash Advance? | TRANSP Escrow? | TRANSP Escrow balance |
|--------|------|----------------------|----------------|-----------------------|
| `49427973...` | Jorge Pablo Guadalupe Muñoz Gonzalez | YES | YES | $0.00 |

**ENTITY SEPARATION LAW:** USMCA accounts are separate from TRANSP. A TRANSP account CANNOT satisfy USMCA provisioning. Do NOT propose migrating TRANSP balances. This is context only.

---

## 4. Identity ambiguity flags (FAIL LOUDLY — do NOT provision until resolved)

**DISCREPANCY FROM OWNER'S STATED COUNT:** The owner stated "three split-name variants" exist. Live Neon evidence shows **FOUR** cohort drivers have a duplicate Inactive row with the same name (deactivated 2026-07-30). This is flagged as a discrepancy for the owner to rule on.

| Driver (Active, in cohort) | Name | Inactive duplicate ID | Inactive duplicate deactivated_at | In cohort? | Notes |
|----------------------------|------|-----------------------|------------------------------------|------------|-------|
| `fba21d80...` | ANGEL ALFONSO SOSA | `2ee70f40-baf2-462a-9766-3583043a2ad9` | 2026-07-30 | NO (inactive) | Split-name variant #1 |
| `6e908ee1...` | GENARO GUERRERO CHAVEZ | `6edcb351-e81b-4bf2-adf7-5eca9eff9137` | 2026-07-30 | NO (inactive) | Split-name variant #2 |
| `5f9f4932...` | Antonio Navarrete Leon | `b8af72b9-ad68-4c64-987b-322c6b21aec6` | 2026-07-30 | NO (inactive) | Split-name variant #3 |
| `1e9384e4...` | Javier Vargas Solis | `ca5fc146-f7ff-4c1b-9cf5-61105b99b486` | 2026-07-30 | NO (inactive) | Split-name variant #4 (NOT in owner's stated count of 3) |

**All 4 Inactive duplicates have `samsara_driver_id = NULL`** while the Active cohort rows have real Samsara IDs. This suggests the Inactive rows are stale duplicates from a prior onboarding cycle, NOT separate humans. But per the owner's law: **do not merge drivers by name.** This must be resolved by Codex's `DRIVER-PERSON-IDENTITY-01` work before provisioning.

**Impact on provisioning:** 4 of the 6 drivers missing both accounts are identity-ambiguous. Only 2 of the 6 are identity-clean and can be provisioned immediately:
- `45fac397...` JOSE ANTONIO VICENTE MARTINEZ — **identity clean, PROVISION NOW**
- `3e138476...` Jorge Luis Infante Corona — **identity clean, PROVISION NOW**

The other 4 must **HOLD** until Codex resolves `DRIVER-PERSON-IDENTITY-01`:
- ANGEL ALFONSO SOSA — HOLD
- GENARO GUERRERO CHAVEZ — HOLD
- Antonio Navarrete Leon — HOLD
- Javier Vargas Solis — HOLD

---

## 5. Opening balance sourcing — UNRESOLVED

**STATUS: BLOCKED — no driver-level opening balance spreadsheet found in the repo.**

The following spreadsheets were searched and do NOT contain driver-level escrow/advance opening balances:
- `docs/fixtures/ob01/Cursor-Balances-Reference.xlsx` — entity-level balance sheet only (TRANSP/TRK), no driver accounts.
- `docs/lockdown/USMCA-LIVE-CHROME-CERTIFY-INVENTORY-2026-08-26.xlsx` — certify inventory, no balances.
- `docs/lockdown/Coders-Faro/CC-1/CC-1-DRIVER-DEDUCTIONS.csv` — contains per-settlement escrow deductions ($25/load) and admin fees, but NOT opening balances.
- `docs/lockdown/Coders-Faro/CC-1/CC-1-DRIVER-SETTLEMENTS.csv` — settlement summaries, not account balances.
- `db/seeds/transp_drivers.csv` / `db/seeds/trk_drivers.csv` — placeholder seed data, not real balances.

**The owner's Transportation and USMCA spreadsheets (referenced in the task requirements) were NOT found in the repository.** They may be local files on the owner's machine, or in a location not synced to the repo.

**CC-1 ACTION REQUIRED:** Before provisioning any driver with a nonzero opening balance, CC-1 must obtain the owner's cited spreadsheet with exact row citations. Do NOT ship a balance with no citation. Do NOT infer or fabricate spreadsheet rows.

**What we DO know from live Neon:**
- All 8 drivers with existing USMCA accounts have $0.00 escrow balance in `accounting.escrow_accounts` (except Leonel=$0.01, Rafael=$250.00, Juan=$250.00).
- The 6 drivers missing accounts have no balance data at all (no account = no balance).
- The `CC-1-DRIVER-DEDUCTIONS.csv` shows $25/load escrow deductions for multiple cohort drivers, suggesting escrow is being withheld from settlements but may not be landing in the escrow sub-ledger correctly. This is a separate finding for CC-1.

---

## 6. Spreadsheet / database disagreement flags

| Discrepancy | Details | Owner ruling needed? |
|-------------|---------|----------------------|
| Owner stated 3 split-name variants; live evidence shows 4 | See §4 — Javier Vargas Solis also has an Inactive duplicate | YES |
| Owner stated 14 drivers; live evidence shows 16 | 2 test drivers (TEST CODEX ONBOARD, Juan USMCA-Battery) are in the load-assignment cohort | YES — owner already flagged Juan USMCA-Battery; TEST CODEX ONBOARD is newly discovered |
| `CC-1-DRIVER-DEDUCTIONS.csv` shows escrow deductions for drivers who have NO escrow account | e.g., GENARO GUERRERO CHAVEZ has $25 escrow deductions in the CSV but no USMCA escrow account in the DB | YES — where did the deducted money go? |
| `CC-1-DRIVER-DEDUCTIONS.csv` name "Angel Alfonso Sosa Perez" vs DB name "ANGEL ALFONSO SOSA" | CSV adds "Perez" — possible name variant or different person | YES — coordinate with Codex |

---

## 7. CC-1 workorder

### 7a. What CC-1 owns (migration + provisioning job)

1. **Author the schema migration** to provision USMCA cash advance + escrow accounts for the 6 missing drivers (under CC-1's authorized migration lane).
2. **Author the provisioning job** that creates the accounts with opening balances.
3. **Obtain owner-cited opening balance spreadsheets** before shipping any nonzero balance. Do NOT fabricate citations.
4. **Reuse the existing provisioning path** — `drivers.routes.ts` hire path already provisions both accounts together. The backfill endpoint (`driver-subaccount-backfill`) exists with a dry-run + apply path.

### 7b. Provisioning sequence

1. **PROVISION NOW (identity clean):**
   - `45fac397-860e-4fe8-ae18-67e12e1959c1` — JOSE ANTONIO VICENTE MARTINEZ
   - `3e138476-06db-4b08-9ebe-527a5d8c591d` — Jorge Luis Infante Corona

2. **HOLD (identity ambiguity — BLOCKED on Codex DRIVER-PERSON-IDENTITY-01):**
   - `fba21d80-628b-4228-ae54-336f9cbb73b6` — ANGEL ALFONSO SOSA
   - `6e908ee1-c626-4aae-83c0-4b1e4e0f683b` — GENARO GUERRERO CHAVEZ
   - `5f9f4932-e745-4d2b-a04e-82d2e18a690c` — Antonio Navarrete Leon
   - `1e9384e4-8eef-416b-9632-b9a3cd1b008f` — Javier Vargas Solis

3. **OWNER DECISION (test drivers):**
   - `e901be6e-cee7-41cd-8827-8b5c320c9a20` — TEST CODEX ONBOARD 20260824 (already has both accounts)
   - `88c04cf5-9e32-455c-91e5-298a9b331b10` — Juan USMCA-Battery (Inactive, already has both accounts, $250 escrow)

### 7c. Entity rules (non-negotiable)

- USMCA accounts ONLY. Do NOT use TRANSP accounts to satisfy USMCA provisioning.
- Do NOT migrate TRANSP balances.
- TRANSP accounts are reported in §3c as CONTEXT ONLY.

### 7d. Identity rules (non-negotiable)

- Do NOT merge drivers by name.
- Do NOT provision ambiguous identities until Codex resolves `DRIVER-PERSON-IDENTITY-01`.
- Provisioning before identity resolution could create duplicate accounts for one human.

### 7e. Financial safety (non-negotiable)

- Do NOT enter owner-controlled opening-balance figures without cited owner data.
- Do NOT infer or fabricate spreadsheet rows.
- Do NOT reconcile owner-disputed discrepancies yourself.
- Do NOT move money or submit to external financial systems.

---

## 8. Live proof (Neon queries, 2026-09-01)

All data in this workorder is backed by live Neon queries run with `SET LOCAL app.bypass_rls = 'lucia'` on project `tiny-field-89581227` (USMCA production). Query outputs are preserved in the DEVIN-A session transcript.

Key queries:
1. Population query: 16 rows returned (14 production + 2 test).
2. Account existence query: 8 production drivers have both accounts, 6 have neither.
3. Escrow balances query: 3 rows in `driver_finance.escrow_balances` (Leonel=$0.01, Rafael=$250.00, Juan=$250.00).
4. Cash advance outstanding query: 2 drivers with outstanding advances (Pedro=$1.20, Alfonso=$250.00).
5. Identity duplicate query: 4 cohort drivers have Inactive duplicate rows (deactivated 2026-07-30).
6. TRANSP context query: 1 driver (Jorge Pablo Muñoz Gonzalez) has TRANSP accounts.

---

## 9. Remaining items

- [ ] Owner rules on the 4th split-name variant (Javier Vargas Solis).
- [ ] Owner rules on TEST CODEX ONBOARD 20260824 (test driver in production roster).
- [ ] Owner provides cited opening-balance spreadsheet for driver-level escrow/advance balances.
- [ ] Owner rules on the `CC-1-DRIVER-DEDUCTIONS.csv` name variant "Angel Alfonso Sosa Perez" vs DB "ANGEL ALFONSO SOSA".
- [ ] Owner rules on escrow deductions in CSV for drivers with no escrow account (where did the money go?).
- [ ] Codex resolves `DRIVER-PERSON-IDENTITY-01` for the 4 identity-ambiguous drivers.
- [ ] CC-1 authors migration + provisioning job under authorized lane.
