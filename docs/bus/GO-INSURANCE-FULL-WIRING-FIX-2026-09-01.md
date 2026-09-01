# GO — INSURANCE FULL WIRING FIX (USMCA)

**Date:** 2026-09-01 · **Entity:** USMCA `5c854333-6ea5-4faa-af31-67cb272fef80`  
**Evidence:** live Neon prod `tiny-field-89581227` / `br-fancy-credit-akjnd07a`, and the owner's signed PDFs. Every count below is a live query result, not a report from a seat.

**Canonical fan-out:** this file is the single GO — every seat reads INBOX TOP + this doc. Do not invent parallel queues.

---

## OWNER LAW — reproduce at the top of every PR / OUTBOX

You do what the owner says, the first time, in the live app. You may question **ONCE**, then execute.  
You are not his attorney — on insurance, legal, hiring and ethics you build what he says and stop.  
Financial and accounting is the exception: verify against live data, never guess, cite the source.  
You do not invent rules or rulings. Empty is a question, not an answer. No "done" without proof.

---

## WHAT IS ALREADY DONE — do not redo

Three real policies exist in USMCA, created live 2026-09-01, verified by query:

| Policy # | Carrier | Coverage | Term | Premium | Units linked |
|---|---|---|---|---|---|
| CIMD-2026-0720 | Cimarron Insurance Company | auto_liability | 2026-08-25 → 2027-08-25 | $206,372.39 | 11 |
| 437539 | Lloyds Of London | physical_damage | 2026-08-25 → 2027-08-25 | $43,590.18 | 11 |
| 437540 | Lloyds Of London | cargo | 2026-08-25 → 2027-08-25 | $21,317.84 | 11 |

AL policy id `7041aaaf-dbc3-41bc-8425-9a679f3dbb57`. All three: down_payment 0 (unpaid), installment_count 9, due_day 19, pay_day 19, late_fee_pct 5.00.  
Vendor **Lloyds Of London** was created live. **Do not create duplicate carriers or policies.**

---

## CORRECTION (2026-09-01 evening)

**T163 / VIN 1M1AN4GY0PM030370** — exists as unit T163, InService, with a USMCA asset. Prior "missing unit" diagnosis was wrong (checked against 14 AL VINs only, not 15 APD). **12 of 15 APD tractors attach today**, not 11.

---

## DEFECT 1 — with-bills wizard bill INSERT type mismatch · **CC-1 verify after deploy**

**Symptom:** `POST /api/v1/insurance/policies/with-bills` → `inconsistent types deduced for parameter $2`.

**Root cause:** `policy-create-atomic.service.ts` bill INSERT binds `$2` into `vendor_id` (text), `vendor_uuid` (text), `mdata_vendor_id` (uuid).

**Fix:** `VALUES ($1,$2,$2,$2::uuid,...)` — **shipped PR #19063** (`be6b02b`).

**Proof required (CC-1 or CC-3 after deploy):** create a policy through the wizard in live Chrome; paste 201 response + resulting `accounting.bills` rows. Unit test alone is NOT proof.

**Do not** report as `asset_not_found` — crash is after unit resolution on bill write.

---

## DEFECT 2 — trailers cannot be insured · **CC-1 migration + data**

`insurance.policy_unit.asset_id` → FK `mdata.assets(id)`. Live: 90 tractor assets, **0 trailer assets**, **0** `insured_value_cents` populated.

The **20 APD trailers exist** in `mdata.equipment` as `USMCA-APD-16 … USMCA-APD-35` (real VINs, `is_sample_data = false`). They need `mdata.assets` rows.

**Build (CC-1):**

1. Insert one `mdata.assets` per trailer: `asset_type = 'trailer'`, `equipment_id` → equipment row, ACV from schedule below.
2. Backfill `insured_value_cents` on 15 APD tractor assets.
3. Write `insurance.policy_unit.insured_value_cents` for policy `437539`.
4. Attach all 35 units to policy `437539` in live Chrome.

**Tie-out:** 15 tractors + 20 trailers on `437539` must sum **$1,077,940.00** exactly.

See APD schedule table in owner Desktop doc / Claude paste (35 rows, tractors $734,445 + trailers $343,495).

---

## DEFECT 3 — three units cannot attach · **CC-1 + OWNER ruling once**

| Unit | VIN | USMCA asset | Issue |
|---|---|---|---|
| T144 | 1M1AN4GYXNM023603 | 0 | TRANSP asset only; leased to TRANSP; on USMCA policy |
| T174 | 4V4WC9EH1PN631152 | 0 | TRANSP asset only; unit leased to USMCA |
| T156 | 4V4NC9EH3NN605709 | 0 | `156-provisional`, status **Sold**; on AL + APD at $38,250 |

**Build:** create USMCA `mdata.assets` for three VINs (`unit_id` = existing units — **never** `+ Add new unit` duplicate).

**Owner ruling (ask once, then act):** T156 Sold-but-scheduled · T144 TRANSP lease on USMCA policy · down payment second date · SAM-* rows (Defect 4).

After assets: attach **14** to `CIMD-2026-0720`, **15** to `437539`; paste `insurance.policy_unit` counts.

---

## DEFECT 4 — SAM-* equipment pollution · **CC-3 report only**

85 `SAM-*` rows in `mdata.equipment` typed `DryVan` — tractors duplicated from units + passenger vehicles (Honda Element, Nissan Versas, etc.).

**Do not delete.** Produce **one CSV** for owner: VIN, make, model, year, actual type, proposed action.

Purge candidates (seat test): `CC3TEST-TRAILER-*`, `CODEX-*-TRAILER-*`, `TEST-*`, `USMCA-T01`, etc.

---

## DEFECT 5 — driver schedule empty · **CC-1**

Insert 13 drivers on `CIMD-2026-0720` (names in binder). Wire dispatch gate: load assignment requires driver **and** unit on active policy schedule on pickup date.

---

## DEFECT 6 — UI blockers · **CURSOR**

1. `DateTimePicker.tsx` — typed MM/DD/YYYY + month/year jump (not 12× `›` clicks).
2. Escape in date picker must not close whole wizard.
3. No red "Couldn't load unit list" on empty search when selections valid.
4. Block `+ Add new unit "<VIN>"` when VIN exists in any entity — offer scope, never duplicate.

**Also shipped PR #19063:** dispatch load board column drag-reorder + sort + resize.

---

## DEFECT 7 — policy numbers 437539/437540 · **OWNER**

AnchorLine submission refs; replace with carrier-issued numbers when they arrive. Nobody invents policy numbers.

---

## PURGE / BOOKS CLEAN · **CC-1 execute · CC-2 grade**

USMCA seat-junk purge: phases 1–3b **committed** (fake bank 0, settlements 0, sample expenses voided, 23 driver bills voided). Phase 4+ (485 sample JEs, loads, test policies) **in flight**. Script: `scripts/run-usmca-seat-junk-purge-once.mts` — financial voids **`is_sample_data = true` only**; REAL GL fingerprint gate.

**Owner creates loads only after:** purge complete + insurance wiring DoD below + books inventory pasted.

---

## DEFINITION OF DONE

- [ ] Wizard creates policy + bills in live Chrome (response pasted).
- [ ] Policy `437539`: 35 units, `insured_value_cents` sum = **1,077,940.00**.
- [ ] Policy `CIMD-2026-0720`: 14 units + 13 scheduled drivers.
- [ ] No duplicate unit, trailer, carrier, or policy created.
- [ ] Every claim re-run as live query output pasted.

---

## SEAT ROUTING (no overlap)

| Seat | Owns |
|---|---|
| **CC-1** | Defects 1 proof post-deploy, 2, 3, 5, purge finish, void-tree API (Cascade Void) |
| **CC-3** | Defect 4 CSV, COI/ID attach after assets, wizard smoke, date/unit picker if Cursor blocked |
| **CURSOR** | Defect 6 UI, dispatch columns app-wide sweep, load board |
| **CC-2** | TB purge guard, NO-SEAT guard, grade CC-1 money proofs |
| **CODEX** | Connectivity/reverse guards, SAM CSV review assist if asked |
| **CASCADE** | Void design consumer only — no second graph |
