# Codex P0 Faro orphan→replacement assist — 2026-08-31

**Status:** read-only evidence assist for CC-3/CC-2. This is not authorization to Send, Void, or Factor. The freeze in `INVOICE-DUPLICATE-COHORT-FREEZE-2026-08-31.md` remains in force.

## Evidence rule

These links do not use customer+amount inference. An orphan invoice identifies its Faro source row and PO in `accounting.invoices.internal_notes`; the replacement load independently carries the same document reference in `mdata.loads.customer_wo_number`. The replacement invoice is the invoice whose `source_load_id` is that load.

## Document-proven links

| Orphan invoice | Orphan UUID | Source PO | Replacement invoice | Replacement UUID | Proof |
|---|---|---:|---|---|---|
| INV-2026-00049 | `5afc59ed-98c2-4efc-a297-817fb4087d62` | 001523174 | L-20260830-0011 | `dacc1a92-708b-4c6b-9491-a6daabf309e8` | exact PO = load `customer_wo_number` |
| INV-2026-00050 | `de7889cc-a6d2-4ec6-9056-a40e51903098` | 4483 | L-20260830-0010 | `6f188597-03d0-4aea-b3d1-78c39f404700` | exact |
| INV-2026-00053 | `8bfb33b5-412d-4410-a397-59cb51a4bf13` | 130823895 | L-20260830-0013 | `4e8895c0-6bef-4441-b067-8c86519fad92` | exact |
| INV-2026-00054 | `7415b602-880f-451f-bddd-3bb382f6c975` | 20495 | L-20260830-0019 | `10d06a11-cfef-45a7-aeff-a6d206070706` | exact |
| INV-2026-00056 | `6d82c37d-9e74-4fcc-82f3-2f2e4ec5da2b` | 005772267 | L-20260830-0012 | `d6e48f8a-6eed-4052-a420-6ad23aafa259` | exact |
| INV-2026-00057 | `0ed4f014-cbb3-4adf-bba3-c59b3b30978e` | 477079 | L-20260830-0015 | `cbd1a01b-4f9d-4044-9134-defbdf86eb3f` | exact |
| INV-2026-00058 | `23fb3a6d-d025-496d-b7b1-485096812f8c` | 0015418 | L-20260830-0017 | `ecf235d4-bb77-40ab-a4b0-7b384e52d486` | exact |
| INV-2026-00059 | `bda284a1-e652-4147-a326-e036699a058f` | SEM66465 | L-20260830-0018 | `60d18638-bb97-460a-9a7d-43a2e172900b` | exact; does not collapse the separate SMX14603 row |
| INV-2026-00071 | `c60a3f2d-4f04-4e3f-843f-5d562dbaf70e` | 21148 | L-20260830-0007 | `b497b3ba-f48f-46f6-8b26-44925f3b3569` | exact |
| INV-2026-00072 | `9c995b78-af88-4e7d-a0b6-8c23d657c7ee` | LD88719 | L-20260830-0020 | `35ce61d1-d87a-404f-9ac8-095228b5abbc` | exact |
| INV-2026-00074 | `e4ff8faf-2cb6-4f3c-be76-6e22bcb85079` | 196203 | L-20260830-0021 | `fd97888c-af09-478f-bc59-68eb372fd377` | exact |
| INV-2026-00075 | `0b4e0fc4-a467-4a75-bbfe-2a86accae93b` | 20348212 | L-20260830-0023 | `3b18c16e-af86-4b94-bfb0-521e256da5e7` | exact; does not collapse the separate 20348480 row |
| INV-2026-00076 | `1e70cf49-00f3-4279-a5d8-9f08dea0831d` | 20348564 | L-20260830-0024 | `1aaab4ce-7eac-42fe-a7b5-8a63ca7e8dc2` | exact |
| INV-2026-00077 | `fa00b7d9-e736-4e6f-a948-ec1f86157bd1` | 20348480 | L-20260830-0025 | `55d62b64-d309-48c1-b912-1b6519342aed` | exact; proves the two $4,800 loads are distinct documents |
| INV-2026-00078 | `27835073-6dc3-42db-96a0-9958a15c257b` | 1000052 | L-20260830-0026 | `3d84a1bc-286d-4b0a-97bb-7a66046e2aa4` | exact |
| INV-2026-00079 | `9ba86a8f-5c19-4edd-9b81-e6fe8031a19f` | 0314828 | L-20260830-0027 | `a7a6a9ab-f756-4016-92a9-7d8da07ed6bf` | exact |
| INV-2026-00080 | `c809fa4c-64a7-4ed6-8aa1-5e54853db904` | SMX14603 | L-20260830-0028 | `9af66179-caf0-4a96-ad99-edcd18443a25` | exact; does not match L-0018/SEM66465 |
| INV-2026-00081 | `f5b7b109-af4c-43e4-804c-3792ee1662aa` | 0488 | L-20260830-0029 | `6b1a34e9-3690-4341-a843-3b7eee70781b` | canonical crosswalk row 036 explicitly maps Faro PO `0488` to AT work order `488`; live load stores `488` |

## Unresolved — do not infer or void

| Orphan invoice | Source PO | Honest result |
|---|---:|---|
| INV-2026-00051 | 138458 | **AMBIGUOUS:** both L-20260830-0006 and L-20260830-0008 independently store 138458. No unique replacement. |
| INV-2026-00061 | 154100 | **NO LIVE LOAD DOCUMENT MATCH:** no USMCA load stores 154100. |
| INV-2026-00069 | SEM66495 | **NO LIVE LOAD DOCUMENT MATCH:** L-0018 is SEM66465 and L-0028 is SMX14603; neither is this PO. |
| INV-2026-00073 | 66006 | **INSUFFICIENT:** candidate L-0022 has blank `customer_wo_number` and blank `live_load_number`; amount/customer is forbidden as proof. |

The two paid invoices INV-2026-00035 and INV-2026-00036 are distinct load-linked records and are excluded from orphan cleanup.

INV-2026-00052 is already `void`; its PO 2239480 exactly identifies L-20260830-0003, but it requires no second WORM action and is excluded from the active-orphan list above.

## Reproducible query shape

```sql
SELECT i.display_id, i.id, i.internal_notes,
       li.display_id AS replacement_display_id, li.id AS replacement_invoice_id,
       l.load_number, l.customer_wo_number
FROM accounting.invoices i
LEFT JOIN mdata.loads l
  ON l.operating_company_id = i.operating_company_id
 AND l.customer_wo_number = substring(i.internal_notes FROM 'PO ([^)]+)')
LEFT JOIN accounting.invoices li
  ON li.operating_company_id = i.operating_company_id
 AND li.source_load_id = l.id
WHERE i.operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80'
  AND i.source_load_id IS NULL
  AND i.internal_notes LIKE 'TASK6-FARO-33-INVOICES-TO-CREATE.csv%';
```

Review any result with zero or more than one replacement row manually. Never resolve it by amount+customer.
