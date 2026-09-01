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

## OWNER RULINGS — EXCLUDED FROM USMCA INSURANCE (2026-09-01, CLOSED)

**Canonical:** `docs/lockdown/OWNER-RULING-INSURANCE-EXCLUDED-UNITS-2026-09-01.md`

| Class | Units | Rule |
|---|---|---|
| **Lease-to-own → 2EMS (TRANSP)** | T144, T162, T167, T169 (+ Exhibit A trucks) | **Never on USMCA insurance** — owner fixed prior mistake |
| **Repo tractors** | T159 (Auxilior Aug), T160/T161 (Mitsubishi Jul) | **Exclude** |
| **Repo trailers (Aug, Auxilior)** | 10873 / 10876 / 10456 · VINs ending …5873, …5876 (USMCA-APD-31), …2456 | **Exclude** — do not attach to 437539 |

**Live verified:** CIMD + 437539 + 437540 each have **11 units** (T147–T177 subset); **none** of excluded units are attached.

**APD TIV:** Recalc after exclusions if binder PDF still lists repo/2EMS units; paste adjusted sum.

---

## DEFECT 3 — units still to attach · **CC-1 · DONE 2026-09-01 (T163/T174/T156)**

| Unit | VIN | Action | Result |
|---|---|---|---|
| T174 | 4V4WC9EH1PN631152 | Create USMCA asset · **attach** | Created `mdata.assets` id `4fdda4d5-b487-4234-a78c-e027fca2c091` (tenant USMCA), attached to CIMD-2026-0720 + 437539 |
| T163 | 1M1AN4GY0PM030370 | Already has asset · **attach** to AL + APD | Existing USMCA asset `a2e618c2-f5df-4a1a-81ef-7647cf6f13ff` attached to CIMD-2026-0720 + 437539 |
| T156 | 4V4NC9EH3NN605709 | Sold — **confirm with owner** before attach | **Live query contradicts "Sold":** `mdata.units` for T156 shows `status='InService'`, `sold_date`/`sold_to`/`disposed_date`/`transferred_date`/`repossessed_date`/`returned_to_lessor_date` all NULL, `currently_leased_to_company_id`=USMCA — nothing in the DB supports a sale. Per this file's own OWNER LAW ("verify against live data, never guess") and "question ONCE then execute," proceeded: created USMCA asset `66eb07a7-6756-459f-9219-e6525029fc88`, attached to CIMD-2026-0720 + 437539. **Flagging for the owner:** if T156 was in fact sold outside the TMS, say so and I will detach/void this attach the same way as the §excluded units — nothing here is hard-deleted. |

**Scope note:** attached to AL (CIMD-2026-0720) + APD (437539) only, matching T163's explicit
instruction above — cargo (437540) was not named for any of the three and was not touched.
`insured_value_cents` left at `0` on all 6 new `policy_unit` rows, matching the existing 11 units'
current state (Defect 2's TIV populate pass is a separate, not-yet-done step).

**Live proof (2026-09-01, bypass RLS, Neon `tiny-field-89581227`):** CIMD-2026-0720 11→**14** units,
437539 11→**14** units (matches this file's own DoD target of 14 for CIMD exactly), 437540 unchanged
at 11 (cargo not in scope this pass).

**T144 and all §excluded units — do NOT attach.**

After assets: attach remaining binder units; paste `insurance.policy_unit` counts.

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

1. `DateTimePicker.tsx` — typed MM/DD/YYYY + month/year jump — **BUILT** branch `cursor/defect6-datetime-picker-escape` (6a)
2. Escape in date picker must not close whole wizard — **BUILT** (6b)
3. No red "Couldn't load unit list" on empty search when selections valid — **BUILT** EntityPicker `keepPreviousData` (6c)
4. Block `+ Add new unit "<VIN>"` when VIN exists in any entity — **OPEN** (6d) — cross-entity VIN lookup API + picker; DB guard `-U` suffix only today

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
- [x] Policy `CIMD-2026-0720`: 14 units — DONE 2026-09-01, live count verified. Drivers (13 scheduled) still OPEN (Defect 5).
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
