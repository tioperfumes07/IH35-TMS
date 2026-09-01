# GO — FLEET RECONCILE · TMS = SYSTEM OF RECORD (retire Always Track)

**Date:** 2026-09-01 · **Entity:** USMCA operating · **Owner:** stop using Always Track; IH35-TMS owns trucks/trailers/VINs/assignable fleet.

**One-time import source:** `/Users/jorgemunoz/Downloads/Report (18).xlsx` (33 trucks) · `Report (17).xlsx` (58 trailers)  
**Reconcile CSVs:** `docs/reconcile/AT-TMS-TRUCKS-2026-09-01.csv` · `docs/reconcile/AT-TMS-TRAILERS-2026-09-01.csv`

**Companion rulings:**  
`docs/lockdown/OWNER-RULING-USMCA-ASSIGNABLE-FLEET-16-2026-09-01.md`  
`docs/lockdown/OWNER-RULING-INSURANCE-EXCLUDED-UNITS-2026-09-01.md`  
`docs/lockdown/OWNER-RULING-SAM-EQUIPMENT-POLLUTION-2026-09-01.md`

---

## OWNER LAW

- **TMS is the system of record going forward.** Always Track is read-once for reconcile, then retired.
- **Assignable USMCA fleet = 16 tractors** (includes T156). See assignable ruling.
- **Purge Samsara pollution:** deactivate all `U-*` unit clones, `SAMVIN-*` units, and stop using `SAM-*` equipment rows; real trailers = `USMCA-APD-*` + numbered equipment from AT import.
- **No deletes** on financial history — WORM/deactivate only on master data rows.

---

## PHASE A — CC-1 · TRUCKS (P0)

For each row in `AT-TMS-TRUCKS-2026-09-01.csv`:

### A1 · Assignable 16 (must be InService · TRK owner · USMCA lease · correct unit #)

| AT | VIN | TMS fix |
|----|-----|---------|
| T122 | 1XPBD49X9FD280862 | Rename `T122 (R)` → **T122** · InService · reactivate · USMCA lease |
| T124 | 1XPBD49X1FD280905 | Rename `124` → **T124** · InService · reactivate · USMCA lease |
| T156 | 4V4NC9EH3NN605709 | Rename `156-provisional` → **T156** · InService · reactivate · USMCA lease |
| T147–T177 (rest) | per CSV | Confirm unit # + VIN + InService + USMCA lease; plate from AT where blank |

### A2 · Deactivate Samsara clones (same VIN, `U-*` unit or `-U` VIN suffix)

~**40+ rows** — set `deactivated_at`, `status=OutOfService`. **Never** delete. One canonical row per VIN remains.

Also deactivate **`SAM-*` unit rows** with fake `SAMVIN-*` (3 InService today).

### A3 · Excluded / not assignable (per insurance exclusion ruling)

T144, T162, T167, T169, T159, T160, T161, 2EMS exhibit trucks, T120, etc. — **OutOfService** or leased TRANSP only; **not** in dispatch assignable pool; **not** on USMCA insurance.

**Note:** AT still shows T160/T161 Active (recent loads) — owner ruled **repo/exclude**; TMS status wins after reconcile.

### A4 · Legal

Ensure **TRK→USMCA truck_lease** schedule rows exist for all assignable 16.

**Proof:** dispatch `units-without-load` count = **16** (minus trucks on active load); Neon query paste.

---

## PHASE B — CC-1 · TRAILERS + INSURANCE ASSETS (P0)

58 AT trailers; **20 APD** on insurance binder (`USMCA-APD-16…35`).

1. For each APD VIN: confirm `mdata.equipment` + create **`mdata.assets`** (`asset_type=trailer`) if missing.
2. For AT trailers **not** in APD set: import as `mdata.equipment` with **equipment_number = AT trailer #**, real VIN, correct type Reefer — **34 rows missing today**.
3. **Exclude** repo trailers 10873, 10876, 10456 from insurance attach (owner ruling) even if AT shows activity.
4. Attach insured trailers to policy **437539**; ACV tie-out per `GO-INSURANCE-FULL-WIRING-FIX-2026-09-01.md`.

**Proof:** `mdata.assets` trailer count ≥ 20; `policy_unit` on 437539; CSV row status updated.

---

## PHASE C — CC-3 · SAM-85 + EQUIPMENT CLEANUP (P1)

1. Export **`SAM-*` equipment CSV** (85 rows) — VIN, duplicate-of-unit?, proposed **deactivate**.
2. Do **not** bulk-delete. Deactivate after owner skim (or auto-deactivate all SAM-* where VIN duplicates `mdata.units` — **79 rows**).

---

## PHASE D — CURSOR · SURFACE (P1)

1. Dispatch/fleet pickers: exclude `deactivated_at` + `U-*` + `SAMVIN` + test units (verify guards).
2. Insurance wizard smoke after CC-1 assets (existing GO defect 1).

---

## DONE WHEN

- [ ] 16 assignable trucks live in dispatch  
- [ ] Zero InService `U-*` / `SAMVIN` clone units  
- [ ] SAM-* equipment deactivated (or filtered out of all pickers)  
- [ ] 20 APD trailer assets + insurance attach path clean  
- [ ] Always Track not required for daily ops  

---

## SEAT ROUTING

| Seat | Work |
|------|------|
| **CC-1** | Phase A + B (migrations/data on Neon) |
| **CC-3** | Phase C SAM CSV + deactivate script |
| **CURSOR** | Phase D guards/UI |
| **CC-2** | Live verify assignable=16 + insurance counts |
