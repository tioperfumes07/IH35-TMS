# CODEX — 2026 roster driver-account audit

**Date:** 2026-09-01  
**Scope:** production Neon, read-only; USMCA TMS-native only. No account, driver, or money writes.  
**Finding:** `DRIVER-ACCOUNT-ROSTER-2026` (full register item 35)

## Result

The database contains **17 Active, non-sample USMCA driver rows**. The owner-supplied roster denominator is **15 people**, based on two alleged duplicate-person pairs. The database does not contain a canonical `person_id`, and those two pairs have distinct `driver_id` and distinct `samsara_driver_id`; therefore the 15-person identity reduction is **not independently provable from immutable database keys**.

Entity-scoped result is unambiguous:

- **USMCA advance accounts: 0 of 17 driver rows / 0 of the asserted 15 people.**
- **USMCA escrow balances: 0 of 17 driver rows / 0 of the asserted 15 people.**
- Eight roster people have an Active advance account only on a same-Samsara TRANSP counterpart row; two of those eight also have a TRANSP escrow balance. Those are cross-entity counterparts, **not USMCA accounts**, and must not be used to post USMCA money.

## Person-level classification

The table separates the legally usable USMCA result from the informational TRANSP counterpart result.

| Person | USMCA roster row(s) | Identity proof | USMCA advance | USMCA escrow | TRANSP counterpart only |
|---|---|---|---:|---:|---|
| Pedro Abraham Lopez Collado | `f73693c4-8c10-4b84-b4ff-c26738c9835d` | Samsara `60195185` | No | No | Advance |
| Leonel Antonio Morales Noguez | `258589ba-0225-424c-a45f-363910998511` | Samsara `13680780` + CDL | No | No | Advance + escrow |
| Jose Antonio Vicente Martinez | `c1003abf-9cf7-43e7-b1c2-89571d3e7a2b` | Samsara `58302928` | No | No | Neither |
| Concepcion Cordova Dominguez | `d1c73a3c-9a80-4afa-ab37-7fa5f8d90929` | Samsara `1589367` | No | No | Advance |
| Luis Corona | `75508b56-6de4-49fd-8542-5479b574d3bc` | Samsara `57401966` | No | No | Neither |
| Neftali Coronado Urbano / Neftali Urbano Coronado | `204b1a10-6084-44c4-82b8-2277a184f2ab`, `3c1bdb13-a6c2-4d0e-a7c4-8ce9873f7106` | **AMBIGUOUS:** Samsara `50550933` vs `56237562`; CDL `DF00145373` vs `DF00145337`; token-reordered name is not an identity key | No | No | Advance on the `50550933` counterpart only |
| Jorge Flores Valadez | `2b7c5286-608a-4c89-ad82-4eaa06fd73f0` | Samsara `59829032` | No | No | Advance |
| Hugo Gaytan | `6be5233e-3dd8-450e-b1a5-8e255be35960`, `6c43e5d3-9a7e-4c10-b64b-2e65105cff34` | **AMBIGUOUS:** Samsara `58031381` vs `60526640`; only one row has a CDL; exact name alone is not an identity key | No | No | Neither on both counterparts |
| Alfonso Hidalgo Chavez | `dcd683f5-b8a1-46a8-aa6b-093732e70b92` | Samsara `60309682` | No | No | Advance |
| Jorge Luis Infante Corona | `ef80a5df-8035-405a-af73-15e369b3c8aa` | Samsara `35268314` | No | No | Neither |
| Jose Miguel de Santiago Palacios | `f48f3505-0f96-4627-8feb-dd1990f06e59` | Samsara `60117962` | No | No | Advance |
| Antonio Noguez | `9b1ff146-6c45-4382-b571-804f7e1f82f6` | Samsara `55182511` | No | No | Neither |
| Ruben Pedro Perez Garcia | `ba5ce08e-07b9-4596-8d57-8990a5f4abda` | Samsara `55391871` | No | No | Neither |
| Rafael Rogelio Rivero Reynoso | `6eeacd9b-dd26-43d0-baaf-0495720ff725` | Samsara `41389643` + CDL | No | No | Advance + escrow |
| Gerardo Urbina | `e3cf9598-783e-43c0-b361-b229537daedc` | Samsara `54919903` | No | No | Neither |

Under the owner's asserted duplicate grouping, the informational TRANSP counterpart split is:

- **Advance:** 8 people — Pedro, Leonel, Concepcion, Neftali, Jorge Flores, Alfonso, Jose Miguel, Rafael.
- **Escrow:** 2 people — Leonel and Rafael (both also in Advance).
- **Neither:** 7 people — Jose Antonio, Luis Corona, Hugo, Jorge Luis, Antonio Noguez, Ruben, Gerardo.

This split must not be mislabeled as USMCA provisioning. For USMCA, all 15 asserted people are currently **neither**.

## Read-only proof

Roster query contract:

```sql
SELECT id, first_name, last_name, samsara_driver_id
FROM mdata.drivers
WHERE operating_company_id = :USMCA_ID
  AND status::text = 'Active'
  AND NOT is_sample_data;
-- 17 rows
```

Account query contract:

```sql
SELECT d.id,
       EXISTS (SELECT 1 FROM driver_finance.driver_advance_accounts a
               WHERE a.driver_id = d.id
                 AND a.operating_company_id = d.operating_company_id
                 AND a.is_active) AS has_advance,
       EXISTS (SELECT 1 FROM driver_finance.escrow_balances e
               WHERE e.driver_id = d.id
                 AND e.operating_company_id = d.operating_company_id) AS has_escrow
FROM mdata.drivers d
WHERE d.operating_company_id = :USMCA_ID
  AND d.status::text = 'Active'
  AND NOT d.is_sample_data;
-- 17 rows; has_advance=false and has_escrow=false on all 17
```

Counterpart matching used exact `samsara_driver_id`, then checked the account row's `operating_company_id`. It did not normalize or fuzzy-match names. The two multi-Samsara duplicate claims are explicitly unresolved rather than guessed.

## Block

`DRIVER-PERSON-IDENTITY-01 — CANONICAL-PERSON-KEY-AND-ENTITY-SCOPED-ACCOUNT-PROVISIONING`

The roster cannot honestly be reduced from 17 driver rows to 15 people using immutable keys today. Add a canonical person identity that may own multiple employment/driver/Samsara records, adjudicate the Hugo and Neftali pairs with source documents, and provision advance/escrow accounts per operating company. A TRANSP account must never satisfy an USMCA account prerequisite. Guard duplicate Active driver rows with different Samsara IDs and cross-company account leakage.
