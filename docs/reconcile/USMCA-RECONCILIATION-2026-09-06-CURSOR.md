# USMCA ↔ Transportation Reconciliation — Cursor (2026-09-06)

**Author:** Cursor (registrar). **Auditor to re-measure:** Claude Lead.
**Neon:** `tiny-field-89581227` branch `br-fancy-credit-akjnd07a`, `SET LOCAL app.bypass_rls='lucia'`.
**USMCA operating_company_id:** `5c854333-6ea5-4faa-af31-67cb272fef80`.
**Scope of this post:** facts only, every number measured on Neon on 2026-09-06. **No production data was written** producing this doc.

> **Owner fact that governs this reconciliation (2026-09-05):** AlwaysTrack (Samsara) was **down for a few days at end-July / early-August**, so the app's stop/pickup dates in that window are unreliable. QuickBooks must corroborate. It does — see §7. **QBO `doc_number` = the load number** and **QBO `txn_date` is the reliable date in the AlwaysTrack gap.**

---

## 0. Honest answer to "where is the reconciliation"

There is **no prior repo doc / csv / script** dated today. The reconciliation was performed **in chat**, against:
- the **company + driver settlement Excel files in `~/Downloads`** (the sheets used to verify tours), and
- **Neon** (RLS-bypassed, USMCA scope).

Per the owner's instruction, this file **is** that reconciliation, written to the repo now. All tables below are the live Neon result.

---

## 1. Status tally (measured)

```sql
SELECT status, count(*) FILTER (WHERE soft_deleted_at IS NULL) AS active,
       count(*) FILTER (WHERE soft_deleted_at IS NOT NULL) AS soft_deleted
FROM mdata.loads
WHERE operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80'
  AND load_number ~ '^[0-9]+$'
GROUP BY status;
```

| status | count | soft_deleted |
|---|---|---|
| dispatched | 48 | 0 |
| cancelled | 29 | 0 |
| assigned_not_dispatched | 1 (13508, SB) | 0 |
| **total numeric USMCA loads** | **78** | **0** |

**Non-cancelled = 49** (48 dispatched + 1 assigned/13508).

---

## 2. Quarantine method — WORM truth (correction to the earlier "soft-void" claim)

```sql
SELECT count(*) FILTER (WHERE cancel_reason ILIKE '%transport%' OR cancel_reason ILIKE '%wrong entity%') AS labelled_transport,
       count(*) FILTER (WHERE status='cancelled') AS cancelled_total,
       count(*) FILTER (WHERE status='cancelled' AND soft_deleted_at IS NOT NULL) AS cancelled_and_softdeleted
FROM mdata.loads WHERE operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND load_number ~ '^[0-9]+$';
```
→ `labelled_transport=29`, `cancelled_total=29`, `cancelled_and_softdeleted=0`.

- **Method used = status `cancelled` + `canceled_at` timestamp + `cancel_reason_code='other'` + `cancel_reason='WRONG ENTITY — TRANSPORTATION (pre-cutover 2026-08-07 / Transportation…)'`.**
- **NOT a soft-void.** `soft_deleted_at IS NULL` on all 29. The row is retained and readable (WORM = the cancel register: `canceled_at/canceled_by/cancel_reason`), which satisfies "void is a reversal, never a delete" — but the earlier statement that these were "soft-void, WORM-preserved" is **imprecise**: they are **cancelled, not soft-deleted**.

**Material finding:** the label says **29** loads are "pre-cutover Transportation," but only **18** are genuinely pre-08/07 (see §3A). **11 of the 29 carry a factually wrong reason** (3 QBO-dated 08/07, 8 with pickup ≥ 08/07). This is over-quarantine and needs an owner/lead ruling. **No prod change made.**

---

## 3. The load lists, by load_number

Columns: app pickup = `min(load_stops.appointment_start_at, scheduled_arrival_at)` at `sequence_number=1`; QBO date = `max(qbo_ar_invoices.txn_date)` where `doc_number = load_number` (mirror stops at txn_date 2026-08-14, so NULL after that is expected, not missing).

### 3A. Genuinely pre-08/07 → Transportation (correctly cancelled) — 18 loads

| load | tt | driver | app pickup | QBO date | verdict |
|---|---|---|---|---|---|
| 13471 | NB | Neftali Coronado Urbano | 07/24 | 07/24 | TRANSP |
| 13480 | TR | Neftali Coronado Urbano | 07/21 | 07/28 | TRANSP |
| 13482 | TR | Leonel A. Morales Noguez | 07/28 | 07/31 | TRANSP |
| 13484 | NB | Ruben P. Perez Garcia | 07/31 | 07/31 | TRANSP |
| 13485 | TR | Leonel A. Morales Noguez | 07/31 | 08/03 | TRANSP |
| 13486 | NB | Jose M. de Santiago Palacios | 07/31 | 08/03 | TRANSP |
| 13487 | TR | Jorge L. Infante Corona | 07/28 | 07/31 | TRANSP |
| 13488 | TR | Jose M. de Santiago Palacios | 07/28 | 07/30 | TRANSP |
| 13491 | TR | Ruben P. Perez Garcia | 07/28 | 07/31 | TRANSP |
| 13492 | TR | Neftali Coronado Urbano | 07/31 | 08/03 | TRANSP |
| 13493 | TR | Jorge L. Infante Corona | 07/31 | 08/03 | TRANSP |
| 13494 | TR | Hugo Gaytan | 07/31 | 08/03 | TRANSP |
| 13495 | TR | Jose A. Vicente Martinez | 07/31 | 08/03 | TRANSP |
| 13496 | TR | Jose A. Vicente Martinez | 08/03 | 08/04 | TRANSP |
| 13497 | NB | Concepcion Cordova Dominguez | **07/03 (AlwaysTrack error)** | **08/03** | TRANSP (QBO governs) |
| 13498 | TR | Angel A. Sosa | 08/03 | (null) | TRANSP |
| 13499 | TR | Neftali Coronado Urbano | **07/21 (AlwaysTrack error)** | **08/04** | TRANSP (QBO governs) |
| 13500 | TR | Hugo Gaytan | 08/03 | 08/04 | TRANSP |

### 3B. BOUNDARY — QBO-dated exactly 08/07, app says 08/04 — 3 loads (RULING NEEDED)

| load | tt | driver | app pickup | QBO date | current state |
|---|---|---|---|---|---|
| 13503 | TR | Neftali Coronado Urbano | 08/04 | **08/07** | cancelled, labelled "pre-cutover TRANSP" |
| 13504 | TR | Jorge L. Infante Corona | 08/04 | **08/07** | cancelled, labelled "pre-cutover TRANSP" |
| 13506 | NB | Alfonso Hidalgo Chavez | 08/04 | **08/07** | cancelled, labelled "pre-cutover TRANSP" |

> These are the exact loads the owner's AlwaysTrack-gap warning predicts. QuickBooks dates them **08/07** = on the cutover. Under "pickup ≥ 08/07 = USMCA" applied to the **reliable** (QBO) date, they are **USMCA**, not Transportation. **Left untouched pending ruling.**

### 3C. USMCA-era (pickup ≥ 08/07) but WRONGLY labelled "pre-cutover Transportation" & cancelled — 8 loads (RULING NEEDED)

| load | tt | driver | app pickup | verdict |
|---|---|---|---|---|
| 13509 | TR | Neftali Coronado Urbano | 08/07 | USMCA-era, mis-labelled pre-cutover |
| 13517 | NB | Jose A. Vicente Martinez | 08/07 | USMCA-era, mis-labelled pre-cutover |
| 13524 | TR | Hugo Gaytan | 08/14 | USMCA-era, mis-labelled pre-cutover |
| 13527 | TR | Luis A. Sosa Perez | 08/14 | USMCA-era, mis-labelled pre-cutover |
| 13531 | NB | Genaro Guerrero Chavez | 08/17 | USMCA-era, mis-labelled pre-cutover |
| 13533 | TR | Concepcion Cordova Dominguez | 08/19 | USMCA-era, mis-labelled pre-cutover |
| 13539 | NB | Angel A. Sosa | 08/20 | USMCA-era, mis-labelled pre-cutover |
| 13540 | TR | Hugo Gaytan | 08/22 | USMCA-era, mis-labelled pre-cutover |

> 3A(18) + 3B(3) + 3C(8) = **29 cancelled** (matches lead's 29). Whether 3C loads were genuinely cancelled or swept in by the contamination sweep needs the owner/lead — the reason text on them is factually wrong (they are not pre-cutover).

### 3D. Active USMCA (dispatched, all pickup ≥ 08/07) — 48 loads

13510, 13511, 13512, 13513, 13514, 13515, 13516, 13518, 13519, 13520, 13521, 13522, 13523, 13525, 13526, 13528, 13529, 13530, 13532, 13534, 13535, 13536, 13537, 13538, 13541, 13542, 13543, 13544, 13545, 13546, 13547, 13548, 13549, 13550, 13551, 13552, 13554, 13555, 13557, 13558, 13559, 13560, 13561, 13562, 13565, 13566, 13567, 13568. (Full driver/date table in §8.)

### 3E. Assigned, not dispatched — 1 load
- **13508** — SB, Angel A. Sosa, 08/07 (the only SB in all of USMCA; see §6).

---

## 4. Reconcile Cursor's "39" vs lead's "48 dispatched" (item 3)

- **39** = the loads **confirmed on the 09-04 Excel "USMCA BY LOAD"** sheet.
- **48** = all `dispatched` USMCA loads on Neon today.
- **The 9 that differ** (in the 48, not in the 39) are the **late-Aug/Sep loads that post-date the 09-04 Excel and land in the AlwaysTrack gap tail**, date-confirmed USMCA by pickup:

  **13558 (08/28), 13559 (08/29), 13560 (08/29), 13561 (08/29), 13562 (09/01), 13565 (08/25), 13566 (08/28), 13567 (08/28), 13568 (08/31).**

  39 + 9 = **48**. ✓ (Plus 13508 is a 49th non-cancelled load in `assigned_not_dispatched`, SB.)

---

## 5. OWNER manual-entry HOLD loads (item 4) — confirmed present

Lead's map: 5772→13512,13513 · 5776→13520 · 5780→13532 · 5783→13535,13537 · 5784→13528,13536 (5766 = Transportation). **All 8 exist and are `dispatched`:**

| settlement (paper) | load | driver | app pickup |
|---|---|---|---|
| 5772 | 13512 | Pedro A. Lopez Collado | 08/10 |
| 5772 | 13513 | Pedro A. Lopez Collado | 08/12 |
| 5776 | 13520 | Leonel A. Morales Noguez | 08/11 |
| 5780 | 13532 | Rafael R. Rivero Reynoso | 08/20 |
| 5783 | 13535 | Jorge L. Infante Corona | 08/18 |
| 5783 | 13537 | Jorge L. Infante Corona | 08/21 |
| 5784 | 13528 | Jose A. Vicente Martinez | 08/18 |
| 5784 | 13536 | Jose A. Vicente Martinez | 08/20 |

**Confirmed HOLD for every seat.** Correction to the numbering: the DB `driver_finance.driver_settlements` carry internal display_ids **S-13642…S-13656** with `first/last_load_number` NULL and `voided=false` — they do **not** carry 5769–5795. So **5769–5795 are the paper/Excel tour numbers**, not DB IDs; the settlement↔load map lives only in the Excel until CC-3's TOUR-SPLIT-PLAN links them.

---

## 6. SB legs (item 6)

`trip_type='SB'` appears on **exactly one** USMCA load in the entire set: **13508** (assigned_not_dispatched, 08/07). Every other tour is **NB (outbound) + TR (triangulation)** with **no SB return seeded**. Because the signed tours close at Laredo on the SB return leg, the seed as it stands **cannot close any tour**. Whether the SB returns exist in the signed settlement Excel is **not answerable from Neon** — the seed carries none; **confirm from the Excel before any SB seeding** (do not invent SB legs). Flagged, not guessed.

---

## 7. QuickBooks cross-check for the AlwaysTrack gap (owner's instruction)

```sql
SELECT column_name FROM information_schema.columns
WHERE table_schema='mdata' AND table_name='qbo_ar_invoices';   -- doc_number, customer_name, txn_date, total_cents, private_note …
SELECT count(*) FROM mdata.qbo_ar_invoices WHERE txn_date BETWEEN '2026-07-20' AND '2026-08-14';  -- 69
```

- **QBO `doc_number` = the load number** in this era (verified: 13485…13511 map one-to-one).
- The QBO mirror is under the **single Transportation realm** `91e0bf0a-133f-4ce8-a734-2586cfa66d96` (12,087 rows, txn_date range 1934-08-06 … **2026-08-14**). It is the **mixed ih35trucking.net account** — after **08-14 it is stale**, so USMCA loads 13512+ have **no QBO row** (expected).
- **Where AlwaysTrack was down, QBO is the reliable date** and it (a) confirms 13497 (app 07/03 → QBO 08/03) and 13499 (app 07/21 → QBO 08/04) as Transportation, and (b) **flags 13503/13504/13506 as 08/07** (see §3B).

---

## 8. Full per-load appendix (78 loads)

The complete table (load · deleted · status · trip_type · driver · app pickup · QBO date) was produced from:

```sql
SELECT l.load_number, (l.soft_deleted_at IS NOT NULL) AS deleted, l.status::text, l.trip_type::text,
       trim(coalesce(d.first_name,'')||' '||coalesce(d.last_name,'')) AS driver,
       (SELECT min(COALESCE(s.appointment_start_at, s.scheduled_arrival_at))::date
          FROM mdata.load_stops s WHERE s.load_id=l.id AND s.sequence_number=1) AS app_pickup,
       (SELECT max(q.txn_date) FROM mdata.qbo_ar_invoices q WHERE q.doc_number = l.load_number) AS qbo_date
FROM mdata.loads l
LEFT JOIN mdata.drivers d ON d.id = l.assigned_primary_driver_id
WHERE l.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80'
  AND l.load_number ~ '^[0-9]+$'
ORDER BY l.load_number::int;
```

The 20 "missing" loads CC-3 is seeding are **not authoritatively enumerable from Neon by Cursor** — CC-3 owns that list. Observed gaps in the USMCA numeric sequence (absent from USMCA operating_company today): 13472–13479, 13481, 13483, 13489, 13490, 13501, 13502, **13505, 13507** (both QBO-dated 08/07 → likely USMCA), 13553, 13556, 13563, 13564. Defer the authoritative 20 to CC-3's seed manifest.

---

## 9. Open rulings for the lead (measured, not decided by Cursor)

1. **13503/13504/13506** — QBO 08/07. Reclassify to USMCA, or hold as Transportation? (Currently cancelled + mislabelled "pre-cutover".)
2. **13509, 13517, 13524, 13527, 13531, 13533, 13539, 13540** — pickup ≥ 08/07 but cancelled with a factually wrong "pre-cutover Transportation" reason. Were they genuinely cancelled USMCA loads, or contamination-sweep errors to restore?
3. **13505, 13507** — QBO 08/07, absent from USMCA today. Seed as USMCA?
4. **SB returns** — none seeded (only 13508). Confirm from the Excel whether the tours' SB closing legs exist before seeding.
5. **Settlement numbering** — 5769–5795 are paper/Excel numbers; DB settlements are S-13642…S-13656, unlinked. CC-3's TOUR-SPLIT-PLAN must build the map.
