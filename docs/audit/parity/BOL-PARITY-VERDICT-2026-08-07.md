# BOL generation — PARITY LAYER verdict (layer 2 of the two-layer audit)

**Module:** dispatch → BOL generation (`bol-generator.service.ts`, `pdf-template/bol.hbs`,
`POST /api/v1/dispatch/loads/:loadId/bol/generate`, `GET .../bol.pdf`)
**Date:** 2026-08-07 · **Auditor:** CC-2 · **Layer 1 (live defect audit):** done and ACCEPTED — 7 phantom
columns + the inline-address defect, allowlist 45 → 38.
**Sampling disclosure:** this audits the BOL document only. The rest of the dispatch module is not in scope
here and is not claimed as audited.

## VERDICT: **GAP → BLOCK** — and one of the gaps is a legal-floor omission, not a parity nicety.

---

## Reference standard (researched fresh, 2026-08-07 — not from memory)

**49 CFR 373.101** (verbatim, for-hire non-exempt motor carrier), the LEGAL FLOOR:
> (a) Names of consignor and consignee. (b) Origin and destination points. (c) Number of packages.
> (d) Description of freight. (e) Weight, volume, or measurement of freight (if applicable to the rating
> of the freight).

**NMFTA Uniform Straight Bill of Lading / VICS BOL** (the commercial standard McLeod and Alvys both emit):
shipper block · consignee block · third-party bill-to · carrier name + USDOT/MC · BOL number · ship date ·
commodity table with NMFC item, freight class, package type, piece count, weight per line · freight charge
terms (prepaid / collect / third party) · declared value + excess-valuation · special instructions ·
trailer + seal numbers · hazmat block · signature lines (shipper, driver/carrier, consignee).

**49 CFR 172.202 / 172.203 / 172.604** (hazmat shipping paper, applies when the load is hazmat):
identification number · proper shipping name · hazard class or division · packing group · number and type
of packages in plain terms · technical name in parentheses for "G" entries · `RQ` when reportable ·
24-hour emergency response telephone number.

---

## What the BOL emits today (complete inventory of `BolTemplatePayload` + `bol.hbs`)

`loadNumber` · `generatedAt` · `templateVersion` · `carrierName` · `carrierAddress` · `customerName` ·
`customerAddress` · `commodity` · `weight` · `pieces` · `referenceNumber` · `driverName` · `unitDisplay` ·
`stops[]` (`stopType`, `sequence`, `locationName`, `address`, `cityState`, `scheduledWindow`).

Thirteen scalars and a stop list. That is the whole document.

---

## Gap A — LEGAL FLOOR: the consignor is not on the document, and the carrier is mislabelled as the shipper

`bol.hbs` labels the carrier box **"Shipper / Carrier"** and prints `carrierName`. The carrier is not the
consignor. §373.101(a) requires the **names of consignor AND consignee**; the document carries the
consignee (customer) and the carrier, and **no consignor at all**. There is also no
shipper/consignor field anywhere in `mdata.loads` — prod-verified: the table has 98 columns and none
matching `shipper|consign|bill_to`. So this is a data-model absence, not a rendering miss.

This is the one gap that is a compliance defect rather than a parity gap, and it should be ranked first.
**Never fix it by relabelling the carrier box** — that would make the document assert that the carrier
tendered the freight.

## Gap B — data EXISTS on prod and the BOL simply does not print it (additive wire-ups, cheap)

Proven against USMCA (`org.companies`) and the real load `LUSMCAFREIGHT-20260806-0001`:

| Field | Where it already lives | Live value for USMCA | On the BOL? |
|---|---|---|---|
| Carrier city / state / ZIP | `org.companies.city/state/postal_code` | Laredo · TX · 78045 | **no** |
| Carrier phone | `org.companies.phone` | +1-956-000-0000 | **no** |
| Carrier USDOT | `org.companies.usdot_number` | PENDING-USMCA-DOT | **no** |
| Carrier MC | `org.companies.mc_number` | PENDING-USMCA-MC | **no** |
| Consignee city/state/ZIP/country | `mdata.customers.billing_*` / `shipping_*` | (columns exist; NULL on this customer) | **no** |
| Special instructions | `mdata.loads.driver_instructions_text` | (column exists; 0 of 10 loads populated) | **no** |
| Stop contact + phone | `mdata.load_stops.site_contact_name/_phone` | (columns exist) | **no** |
| Trailer type | `mdata.loads.trailer_type` | (column exists; 0 of 10 populated) | **no** |
| BOL number | `dispatch.bol_documents.id` | generated at store time | **no** — the page shows the LOAD number only |
| Hazmat flag | `mdata.unit_border_crossings.hazmat_declared`, `loads.quicksave_pending_fields.hazmat` | — | **no** |

The carrier block is the sharpest case: the BOL prints `COALESCE(comp.address_line1,'')` and stops. A
carrier's USDOT and MC on the face of the BOL is table stakes in McLeod and Alvys output, and both numbers
are sitting in `org.companies` already.

## Gap C — no data model at all (each becomes its own class, none inventable)

Consignor/shipper party (Gap A) · freight charge terms prepaid/collect/third-party · declared value and
excess valuation · NMFC item + freight class · package TYPE and per-line commodity rows (only a single
aggregate `piece_count` exists) · seal numbers · ship date distinct from render time (`generatedAt` is
`new Date()` at render, not the pickup date) · signature lines for shipper, driver and consignee · the
hazmat block required by 172.202/172.203/172.604.

The hazmat one is worth calling out: the system already KNOWS a load is hazmat
(`unit_border_crossings.hazmat_declared`, `loads.quicksave_pending_fields.hazmat`, driver
`mdata.drivers.endorsement_h`) and the BOL prints nothing — so a hazmat load produces a shipping paper
with no hazmat description, which is the failure mode with the highest consequence on this list.

## SURPASSES — worth protecting

Generated BOLs are content-addressed and stored WORM-ish: `dispatch.bol_documents` carries `sha256`,
`template_version`, `generated_by_user_id`, `generated_at` and `archived_at` (void-not-delete), and the PDF
goes to R2 under a per-entity key. Neither McLeod nor Alvys ties a generated BOL to a content hash by
default. Entity scoping is enforced on every join in the payload query, so a BOL cannot mix entities.

---

## Ratchet

`scripts/verify-bol-field-completeness.mjs` — asserts `BolTemplatePayload` carries the §373.101 floor plus
the standard blocks, with the currently-missing fields pinned in a baseline so the set can only SHRINK and
no field can be dropped later to make it pass. ADDITIVE ONLY: the guard fails on removal, never on
presence.
