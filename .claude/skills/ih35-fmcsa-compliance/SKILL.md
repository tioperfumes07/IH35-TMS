---
name: ih35-fmcsa-compliance
description: >-
  The FMCSA / IRS / IFTA regulatory reference the IH35-TMS compliance module depends on — driver
  qualification file contents and renewal cadences (CDL, DOT medical, MVR, Clearinghouse), vehicle
  requirements (annual DOT inspection, registration, IFTA, Form 2290 HVUT, insurance), and the exact
  filing calendars (IFTA quarters, 2290 tax period). Load this when building or reviewing anything in
  the compliance / required-documents / driver-qualification / IFTA / 2290 area, or when a due-date or
  renewal-cadence question arises. Prevents the class of defect where a regulatory calendar lived in
  nobody's head (e.g. the IFTA wrong-quarter bug). Bundles the carrier's required-documents matrix.
---

# IH35-TMS — FMCSA / IRS / IFTA compliance reference

Trucking compliance is calendar-driven and citation-backed. Getting a cadence or due-date wrong is a
real regulatory exposure, not a cosmetic bug. This is the reference the compliance module encodes; when
code and this disagree, verify against the cited regulation before shipping.

Bundled resource: `resources/required-documents-matrix.md` — the exact per-entity required-document
catalog seeded into `compliance.required_document_types` (what the "Missing required documents" resolver
and profile chip check).

---

## 1. Driver Qualification File (DQF) — 49 CFR §391
A qualified driver's file must contain, and the carrier must keep current:

| Item | Citation | Cadence / rule |
|---|---|---|
| Employment application | §391.21 | Once, at hire (retain for duration + 3 yrs). |
| Motor Vehicle Record (MVR) — inquiry to each state | §391.23 | At hire. |
| Annual MVR review | §391.25 | **Every 12 months** — review the driving record + note the review. |
| Road test / CDL equivalent | §391.31 / §391.33 | Once (CDL accepted in lieu of road test). |
| Medical Examiner's Certificate (DOT physical) | §391.43 / §391.41 | Physical valid **max 24 months** (often shorter per examiner). Must be from a National Registry examiner. |
| Medical + CDL merge (self-certification / CDLIS) | §383.71 / §391.51 | Med cert status flows to the state CDL record. |
| Drug & Alcohol Clearinghouse — full query | §382.701(b) | **Annual** limited query at minimum (full query on hire). Pre-employment full query before first driving. |
| Drug/alcohol testing program membership | §382 subpart | Random pool participation; pre-employment test before first dispatch. |

Notes specific to this carrier: drivers are Mexican B1 (not W-2 / not owner-op) → tax form is **W-8BEN**,
renewed **yearly** (not W-9). The resolver treats `w9` as satisfied by a W-8BEN record OR a `tax_form`
document (the foreign-vs-domestic switch has no schema field yet).

## 2. Vehicle / unit requirements
| Item | Citation | Cadence / rule |
|---|---|---|
| Registration (cab card) / apportioned plate | State DMV / IRP | Annual; IRP apportioned for interstate. |
| **Annual DOT inspection** | §396.17 | **Every 12 months** — periodic inspection by a qualified inspector; keep the report/decal. |
| Systematic inspection/maintenance program | §396.3 | Ongoing; records retained. |
| Driver Vehicle Inspection Report (DVIR) | §396.11 / §396.13 | Per-trip when a defect is found; retained 3 months. |
| IFTA license + decals | IFTA Articles of Agreement | Annual license; decals per qualified vehicle. |
| Form 2290 HVUT Schedule 1 | IRS Form 2290 | See filing calendar below. |
| Insurance proof (financial responsibility) | §387 | Continuous; MCS-90 for for-hire interstate. |

## 3. Filing calendars — get these EXACTLY right
**IFTA quarterly fuel-tax returns** (file even for a zero/no-travel quarter):

| Quarter | Period | Return due |
|---|---|---|
| Q1 | Jan – Mar | **Apr 30** |
| Q2 | Apr – Jun | **Jul 31** |
| Q3 | Jul – Sep | **Oct 31** |
| Q4 | Oct – Dec | **Jan 31** (following year) |

The IFTA reporting **quarter is the quarter of travel**, not the filing month — a return filed in April is
the **Q1** return. (This is the exact distinction the RPT-1 wrong-quarter defect got wrong.)

**Form 2290 — Heavy Vehicle Use Tax (HVUT):**
- Tax period runs **July 1 → June 30**.
- For a vehicle in use at the start of the period (July), the return is due **August 31**.
- For a vehicle **first used later** in the period, it is due the **last day of the month following the
  month of first use** (e.g. first used in November → due December 31).
- Proof of payment = a **stamped Schedule 1**; required to register the vehicle.

## 4. How this maps to the code
- Catalog + seed: `db/migrations/202607021400_required_document_types.sql` seeds
  `compliance.required_document_types` per entity kind (see the bundled matrix). `enforcement` is
  `warn` by default, per-carrier promote-to `hard_block`; `has_expiry` drives the renewal clock.
- Resolver: `apps/backend/src/compliance/missing-required.service.ts` crosses the catalog with actual
  presence (structured stores: `mdata.drivers` CDL cols, `safety.medical_cards`, `safety.clearinghouse_query`,
  `safety.driver_documents`, `maintenance.inspections`, `safety.permits`, `compliance.form_2290_*`,
  `insurance.policy_unit`, and `docs.files` categories). It **never false-greens** — items it cannot
  auto-verify (customer MSA/NOA/credit-app, vendor agreement — they share the coarse `legal_doc` category)
  surface as `needs_manual`, shown as missing until a human confirms.
- Chip: `apps/frontend/src/components/compliance/MissingRequiredChip.tsx` on the driver/unit/customer/vendor
  profiles.

## 5. Rules of engagement
- **Never invent a cadence or due-date from memory in code** — cite the section (the table above) and let the
  data drive it. A regulatory calendar that lives only in recollection is exactly how RPT-1 shipped wrong.
- Compliance dates use the entity's own store; treat a missing structured record as **missing**, never as
  satisfied. A false GREEN on a compliance chip is worse than a false red.
- Additive only: extend the required-docs catalog via seed, never remove a seeded requirement.
