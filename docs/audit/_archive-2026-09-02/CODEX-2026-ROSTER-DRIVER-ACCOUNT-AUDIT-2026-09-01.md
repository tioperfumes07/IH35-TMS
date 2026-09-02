# CODEX — driver-account audit (corrected entity mapping)

**Date:** 2026-09-01

**Scope:** production Neon, read-only. No account, driver, or money writes.

**Finding:** `DRIVER-ACCOUNT-ROSTER-2026` (full register item 35)

**Correction:** supersedes the entity-inverted conclusions merged in PR #18987.

## Correction notice

PR #18987 inverted the two operating-company UUIDs. Its claims that USMCA had 17 Active non-sample driver rows and no accounts, and that accounts existed only on TRANSP counterparts, are **withdrawn**.

The verified UUID mapping and production census are:

| `operating_company_id` | Entity | Active non-sample drivers | Active advance bindings | Active escrow-account bindings | Paired | Neither |
|---|---|---:|---:|---:|---:|---:|
| `5c854333-6ea5-4faa-af31-67cb272fef80` | **USMCA** | 84 | 12 | 12 | 12 | **72** |
| `91e0bf0a-133f-4ce8-a734-2586cfa66d96` | **TRANSP** | 17 | 0 | 0 | 0 | 17 |

USMCA therefore has **72 of 84 Active non-sample drivers without either required account**. All 12 provisioned USMCA drivers have the complete pair; there are zero partial pairs.

TRANSP's 17-with-zero population is expected under the owner's TRANSP freeze and is **not an account-provisioning defect**.

## Canonical account sources

- Advance binding: `driver_finance.driver_advance_accounts`, active when `is_active`.
- Escrow account binding: `accounting.escrow_accounts`, active when `holder_type='driver' AND status='active'`.
- `driver_finance.escrow_balances` is a balance/subledger table, not the canonical account-binding census. It currently covers only 2 of the 12 provisioned USMCA drivers and must not be substituted for `accounting.escrow_accounts` when asking whether an escrow account exists.

## TRANSP 17-row identity audit

The prior report's 17-row list belongs to **TRANSP**, not USMCA. It remains useful only for the separate person-identity finding. The database has 17 Active non-sample TRANSP driver rows. Reducing them to the owner-asserted 15 people requires grouping these two pairs:

- Hugo Gaytan: driver rows `6be5233e-3dd8-450e-b1a5-8e255be35960` and `6c43e5d3-9a7e-4c10-b64b-2e65105cff34`, Samsara `58031381` and `60526640`.
- Neftali Coronado Urbano / Neftali Urbano Coronado: driver rows `204b1a10-6084-44c4-82b8-2277a184f2ab` and `3c1bdb13-a6c2-4d0e-a7c4-8ce9873f7106`, Samsara `50550933` and `56237562`, with differing CDL values.

Neither pair has a shared immutable person key. Exact or token-reordered names are not identity proof. The database therefore proves 17 driver records, not 15 people; the two person merges remain intentionally unresolved pending source-document adjudication. TRANSP is frozen, so no accounts are proposed for these rows.

## Read-only proof

The corrected census keys only on UUID and uses each account table's own company predicate:

```sql
WITH active_driver AS (
  SELECT id, operating_company_id
  FROM mdata.drivers
  WHERE status::text = 'Active'
    AND NOT is_sample_data
    AND operating_company_id IN (:USMCA_ID, :TRANSP_ID)
), classified AS (
  SELECT d.*,
         EXISTS (
           SELECT 1
           FROM driver_finance.driver_advance_accounts a
           WHERE a.driver_id = d.id
             AND a.operating_company_id = d.operating_company_id
             AND a.is_active
         ) AS has_advance,
         EXISTS (
           SELECT 1
           FROM accounting.escrow_accounts e
           WHERE e.holder_id = d.id
             AND e.holder_type = 'driver'
             AND e.operating_company_id = d.operating_company_id
             AND e.status = 'active'
         ) AS has_escrow
  FROM active_driver d
)
SELECT operating_company_id,
       count(*) AS active,
       count(*) FILTER (WHERE has_advance) AS advance,
       count(*) FILTER (WHERE has_escrow) AS escrow,
       count(*) FILTER (WHERE has_advance AND has_escrow) AS paired,
       count(*) FILTER (WHERE NOT has_advance AND NOT has_escrow) AS neither,
       count(*) FILTER (WHERE has_advance <> has_escrow) AS partial
FROM classified
GROUP BY operating_company_id
ORDER BY operating_company_id;
```

Observed output:

```text
5c854333-6ea5-4faa-af31-67cb272fef80 | 84 | 12 | 12 | 12 | 72 | 0
91e0bf0a-133f-4ce8-a734-2586cfa66d96 | 17 |  0 |  0 |  0 | 17 | 0
```

## Blocks

`DRIVER-ACCOUNT-PAIR-BACKLOG-72 — USMCA ENTITY-SCOPED PAIR PROVISIONING`

Provision the canonical advance-asset and escrow-liability pair for the 72 unprovisioned Active USMCA drivers through the authorized path. Key every selection and write by the USMCA `operating_company_id`; do not touch TRANSP. Guard complete-pair creation and fail on cross-entity account reuse or a one-sided pair.

`DRIVER-PERSON-IDENTITY-01 — CANONICAL-PERSON-KEY`

This finding stands. Add a canonical person identity capable of linking multiple employment/driver/Samsara records, and adjudicate the Hugo and Neftali pairs from source documents. Never merge people by normalized name alone.
