# Property-Tax Poster — DESIGN (Business-Property Allocation)

**Status: DESIGN + BUILD-AND-HOLD.** The poster code (`apps/backend/src/accounting/property-tax-posting/poster.service.ts`)
is committed but **INERT** — it early-returns `{posted:false, reason:"flag_off"}` for every entity until
`PROPERTY_TAX_GL_POSTING_ENABLED` is flipped per entity. **Tier: §1.4 financial cluster → NEVER self-merge
the migration or flip the flag. Requires CPA sign-off + Neon verification. The flag stays OFF until Jorge
flips it per entity.** No posting is authorized by this doc.

## 1. What & why

Texas levies an ad-valorem **business personal-property tax** on the tangible property a business owns as of
Jan 1 (fleet tractors/trailers + equipment). The carrier must **render** (report) that property to the county
appraisal district (CAD) by **April 15** (Tax Code §22.23), extendable in writing to **May 15**. The CAD then
sends an assessment; the tax is billed by the county (typically Oct, due Jan 31 of the next year).

Two sides, built together:
- **Filing (Compliance module, money-free):** `compliance.property_tax_renditions` + `_rendition_lines` +
  `appraisal_districts`. Source of record for the rendition workflow. Migration `202607080100`.
- **Accounting (this poster, gated OFF):** accrue the assessed tax to a liability, then relieve it on payment.
  Migration `202607080110` adds the COA roles + `accounting.property_tax_accruals` ledger + the flag.

## 2. Accounting treatment (CPA to confirm)

Accrual basis (default):

| Step | Entry | Amount |
|---|---|---|
| **Accrual** (CAD assessment received / period-end) | **Dr** Property Taxes (`property_tax_expense`, Expense) / **Cr** Property Tax Payable (`property_tax_payable`, Liability) | `rendition.assessed_tax_cents` |
| **Payment** (paid to county) | **Dr** Property Tax Payable (`property_tax_payable`) / **Cr** Cash (`cash_clearing`) | accrued amount |

Cash basis (entity option — `direct_from_expense`): skip the accrual; on payment **Dr** Property Taxes /
**Cr** Cash. Either way the expense hits the same GL account and cash is credited once.

- **No new GL math.** Both entries route through `accounting.createJournalEntry` (the DB double-entry trigger
  tables — asserts debits===credits>0, writes the `transaction_source_links` spine + audit + QBO-sync).
- **Accounts resolve via the entity-pinned role resolver** (`resolveRoleAccount`, fail-closed). A TRANSP post
  can never resolve a TRK/USMCA account.
- **Idempotency:** deterministic memo per (rendition, step) — `Property tax accrual — <CAD> <year>` /
  `Property tax payment — <CAD> <year>`. A re-run finds the existing JE and no-ops. The `property_tax_accruals`
  ledger has a unique (`operating_company_id`, `rendition_id`) index (one active row per rendition).

## 3. Entities

- **TRK (asset holder)** owns the fleet it renders → its renditions cover the tractors/trailers. Accounts +
  roles seeded for TRK.
- **TRANSP (operating carrier)** renders the business property it owns (office equipment, etc.). Accounts +
  roles seeded for TRANSP.
- **USMCA** is pre-launch (no COA) — deliberately untouched.

Property tax is filed by the **owner** of the property; the candidate-asset picker filters by
`mdata.units.owner_company_id` / `mdata.equipment.owner_company_id` = the rendering entity.

## 4. Connectivity (Law of the Land §10a)

`rendition` → **entity** (`operating_company_id`) → **county / appraisal district** (`appraisal_district_id`) →
**taxable assets** (`rendition_lines.unit_id` → `mdata.units`, `.equipment_id` → `mdata.equipment`) →
**accrual** (`accounting.property_tax_accruals.rendition_id`) → **accrual JE** (`accrual_je_id`) → **payment JE**
(`payment_je_id`) → **cash**, plus the JE `transaction_source_links` + audit spine. Forward + reverse drill:
a rendition drills to its assets and its JEs; a unit reverse-drills to the renditions that taxed it (via the
`property_tax_rendition_lines.unit_id` index).

The rendition also surfaces in the cross-module **Compliance & Filings** aggregate
(`filings-aggregate.service.ts` → Home widget + Compliance Dashboard) as category `business_property_tax`
with drill-through to `/compliance/property-tax/:id`, and, when the current tax year has no rendition yet, a
statutory April-15 reminder.

## 5. Enablement (owner only, after CPA sign-off)

1. Apply `202607080100` then `202607080110` on a **Neon branch** (never prod db:migrate — both are HELD /
   DO-NOT-RUN and registered in `.held-migrations.json`).
2. Verify the 2 role rows per entity + the flag row (queries at the bottom of `202607080110`).
3. Seed a per-entity override row (`lib.feature_flag_overrides`, `enabled=true`) for the entity going live —
   exactly like the factoring go-live migration `202607052300`. Until then every call is a no-op.
