# GO — DRIVER INACTIVE RECONCILE (Jul/Aug 2026 workbook = truth)

**Owner order (2026-09-01):** Every driver **not** on July+August loads/settlements is **Inactive** in TMS. Map Samsara profile ↔ vendor driver ↔ payee as **one person**. Source = owner Downloads workbook — not guess, not 45-day heuristic alone.

**Source file:** `/Users/jorgemunoz/Downloads/IH35-AUGUST-DATA-ENTRY-WORKBOOK_1 both companies.xlsx`  
**Sheet:** `02 DRIVERS` — **19 active** (132 July+Aug loads; 58 Aug + 74 Jul)

**Artifacts (repo):**
- `docs/reconcile/DRIVER-ACTIVE-MANIFEST-2026-09-01.csv` — canonical 19 ↔ USMCA driver UUID + Samsara id
- `docs/reconcile/DRIVER-INACTIVE-RECONCILE-2026-09-01.csv` — every TRANSP+USMCA row + action

**Desktop copy:** `~/Desktop/IH35-CURSOR-AUDIT/reconcile-2026-09-01/DRIVER-*.csv`

---

## Canonical 19 active (workbook)

| # | Driver | Truck(s) in workbook | USMCA action |
|---|--------|---------------------|--------------|
| 1 | Jorge Luis Infante Corona | T175,T176,T177 | KEEP |
| 2 | Neftali Coronado Urbano | T175,T176 | REACTIVATE duplicate row |
| 3 | HUGO GAYTAN SARABIA | T173 | KEEP |
| 4 | JOSE ANTONIO VICENTE MARTINEZ | T168,T171 | KEEP |
| 5 | Leonel Antonio Morales | T147,T152,T171,T175 | KEEP |
| 6 | Concepcion Cordova Dominguez | T163 | KEEP |
| 7 | LUIS ARMANDO SOSA PEREZ | T170,T173 | KEEP |
| 8 | Ruben Pedro Perez Garcia | T174 | REACTIVATE |
| 9 | JORGE FLORES VALADEZ | T144 (2EMS — TRANSP/excluded truck) | KEEP |
| 10 | Angel Alfonso Sosa Perez | T156 | KEEP |
| 11 | ALFONSO HIDALGO CHAVEZ | T164 | KEEP |
| 12 | Vicente Santos Contreras | T174,T175 | REACTIVATE |
| 13 | Fernando Mecor Hernandez | T169 (excluded unit) | REACTIVATE |
| 14 | JOSE MANUEL MEJIA OLMOS | T147 | KEEP |
| 15 | Genaro Guerrero Chavez | T152 | KEEP |
| 16 | PEDRO ABRAHAM LOPEZ COLLADO | T152 | KEEP |
| 17 | JOSE MIGUEL DE SANTIAGO PALACIOS | T164 | KEEP |
| 18 | Jose Gerardo Ruiz Flores | T164 | REACTIVATE |
| 19 | Rafael Rogelio Rivero Reynoso | T148 | KEEP |

**All others** (not in table) → `Inactive` + `deactivated_at = now()` on **both** USMCA and TRANSP where a row exists.

---

## Live counts (Neon prod, USMCA, before apply)

| Metric | Count |
|--------|------:|
| Active now | 86 |
| Inactive now | 81 |
| **Deactivate** (workbook miss, currently Active) | **78** |
| **Reactivate** (workbook hit, currently Inactive) | **8** |
| **Target Active USMCA** | **19** |

TRANSP: deactivate 4 TEST-DRIVER seeds + 3 non-workbook actives (Antonio Noguez, Gerardo Urbina, Luis Corona) — mirror rule; TRANSP is not launch entity but keep roster honest.

---

## Seat split

| Seat | Phase | Work |
|------|-------|------|
| **CC-1** | **D1** | Idempotent migration: bulk `status='Inactive'`, set `deactivated_at` for all UUIDs in `DRIVER-INACTIVE-RECONCILE` where `action=DEACTIVATE`; REACTIVATE rows → `Active`, clear `deactivated_at` |
| **CC-1** | **D2** | Dedupe: where two USMCA rows match one workbook name (e.g. Neftali ×2, Hugo ×2, Jose Manuel ×2), **keep manifest UUID**, deactivate duplicate twin |
| **CC-1** | **D3** | Wire `driver_schedule` on CIMD for the 19 (insurance GO defect 5) |
| **CC-3** | **D4** | Vendor link: ensure each active driver has exactly one `mdata.vendors` row (`driver_id` FK, `vendor_name` = legal name); fix orphans in manifest |
| **CC-3** | **D5** | Samsara: verify `samsara_driver_id` on manifest row matches Samsara API name; no second person on inactive duplicate |
| **CURSOR** | **D6** | Driver pickers / dispatch: inactive drivers not assignable; guard ratchet |
| **CC-2** | **D7** | Live proof: USMCA active count = 19; assignable driver dropdown = 19; Samsara↔vendor spot-check 3 |

---

## Migration sketch (CC-1 — idempotent)

```sql
-- REHEARSED: dry-run counts matched CSV 2026-09-01
-- DEACTIVATE list: DRIVER-INACTIVE-RECONCILE action=DEACTIVATE (USMCA+TRANSP)
UPDATE mdata.drivers
SET status = 'Inactive',
    deactivated_at = COALESCE(deactivated_at, now()),
    updated_at = now()
WHERE id = ANY(:deactivate_ids::uuid[])
  AND (status <> 'Inactive' OR deactivated_at IS NULL);

-- REACTIVATE list: action=REACTIVATE
UPDATE mdata.drivers
SET status = 'Active',
    deactivated_at = NULL,
    updated_at = now()
WHERE id = ANY(:reactivate_ids::uuid[]);
```

**WORM:** no DELETE. Inactive only.

**Dedupe rule:** after bulk update, for each workbook name with >1 Active USMCA row, deactivate all except `DRIVER-ACTIVE-MANIFEST.usmca_driver_id`.

---

## Samsara ↔ vendor ↔ payee (same person)

For each manifest row:

1. `mdata.drivers.samsara_driver_id` = Samsara driver id (payroll/HOS source)
2. `mdata.vendors.driver_id` → that driver UUID; `vendor_name` matches legal name on settlement
3. Settlement payee / 1099 vendor = that vendor row — never a second vendor for same Samsara id

**Known gaps (fix in D4):** several KEEP rows have `vendor_id IS NULL` on TRANSP (Alfonso, Hugo, Jorge Flores, Jose Antonio, Jorge Infante, Leonel, Rafael). USMCA copies mostly wired.

---

## Proof (CC-2)

```sql
SET app.bypass_rls = 'lucia';
SELECT count(*) FROM mdata.drivers
 WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80'
   AND status = 'Active' AND deactivated_at IS NULL;
-- expect 19

SELECT full_name, samsara_driver_id FROM mdata.drivers d
 JOIN (values ...) v(id) ON d.id = v.id;
-- manifest spot-check
```

App: Drivers module USMCA → filter Active → 19 names match manifest.

---

## Owner notes

- **Jorge Flores / T144:** active per workbook on excluded 2EMS truck — KEEP roster active; do **not** attach T144 to USMCA insurance (see excluded-units ruling).
- **Fernando / T169:** same — active driver, excluded unit.
- **45–60 day rule:** satisfied implicitly — anyone off Jul/Aug loads is not in the 19.

**ORDER:** Run **D1** same session as fleet Phase A (assignable 16 trucks) — dispatch must show 19 drivers + 16 units.

---

## LIVE PROOF (2026-09-01 — applied on Neon prod)

```text
USMCA active drivers: 19 (was 86)
USMCA inactive drivers: 156 (was 81)
```

All 19 names match workbook tab `02 DRIVERS` with Samsara ids populated. Method: whitelist manifest UUIDs; all other USMCA rows set Inactive.

**REMAINING:** D2 dedupe audit (twins now inactive) · D3 driver_schedule · D4–D5 vendor/Samsara · migration PR for WORM audit trail · CC-2 app click-through.
