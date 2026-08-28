> **SUPERSEDED-BY (withholding / 1099 / 1042-S — 2026-07-26):** `docs/lockdown/OWNER-DECISIONS-FINAL-2026-07-26.md` **E1** — no withholding from anyone; **No 1042-S/1099.** This design remains a historical engine spec for a **PENDING/GATED** BLOCK-24. Do not treat dollars on that report as a filing obligation. Do not ask a CPA (`OPERATING-FACT-no-CPA-owner-decides`). The 07-05 ENTERPRISE “drivers = 1099-NEC” premise this doc cites is struck.

# 1099-NEC / 1042-S Annual Tax-Document Generation + General Tax-Document PDF Engine

> **HOLD LANGUAGE SUPERSEDED — OWNER LAW 2026-08-03 / owner directive 2026-08-06.** There are NO holds and no approval gate. All owner questions are asked-and-answered. Coders build, apply on Neon, and MERGE ON GREEN with proof. Any "build-and-hold", "Jorge merges", "never self-merge" or "wait for approval" wording below is HISTORICAL RECORD ONLY and must not be followed.

**Block:** BLOCK-24-of-29 (TIER3.5-1099-ANNUAL) — annual generation engine.
Distinct from **BLOCK-17-of-29 (TIER2.5-W2-1099)**, already DONE on `main`, which built the
per-driver **worker-classification** field (`driver_finance.driver_pay_settings.worker_class`,
`mdata.drivers.employment_status`) that this block *consumes* — it does not redo it.

**Status: DESIGN-ONLY / BUILD-AND-SHIP.** No migration in this PR. No posting logic. No
transmission logic. This document is the spec a future BUILD PR implements against, and the
`docs.tax_document.status` chosen output MUST be treated as advisory/reference until the CPA
signs off and `TAX_DOC_1099_ENABLED` is flipped ON by the owner. **Financial-cluster — the
migration derived from this doc is never self-merged (constitution §1.4); this PR is docs-only
and pushed for review, not merged.**

Owner decision reference: the dispatch prompt for this block cites
`docs/LOCKED-DECISIONS-2026-07-05-ENTERPRISE.md`; **that path does not exist in this repo** as of
this PR (verified — only `docs/lockdown/00_LOCKED_DECISIONS.md` and the Desktop
`LOCKED-DECISIONS-2026-07-05.md` archive referenced by auto-memory
`model-a-and-two-coder-clash-protocol` exist). Flagging per the drift-prevention rule rather than
silently picking one — Jorge/next-agent should confirm which is canonical and this doc's
reference should be corrected accordingly. The substantive content this design relies on (drivers
are 1099 contractors; software generates/archives/mails/emails but never transmits) is confirmed
directly in the task instructions and cross-checked against auto-memory
`finance-build-directive-and-driver-model` (drivers = hired Mexican-B1 1099 contractors, pay is a
wage/fee not a % of linehaul) and `faro-factoring-contract-terms`/`driver-hazmat-endorsement-column`
for the W-8BEN/foreign-status precedent already built.

---

## 0. Executive summary

1. Drivers are 1099 contractors. Each January, IH35 must furnish a federal information return
   for every driver paid **nonemployee compensation** in the prior calendar year — **Form
   1099-NEC** for a US-status payee, **Form 1042-S** for a foreign-status payee whose comp is
   US-source (the common case for our Mexican B-1 drivers physically dispatched inside the US).
2. IH35 already captures the two payee-status documents needed to decide which form applies:
   `safety.driver_w8ben` (foreign certification, built 2026-07-01) and the not-yet-built W-9
   counterpart for any US-status driver/vendor. This block adds the **decision layer**
   (`payee_tax_profile`), the **annual aggregation** of box-1-equivalent comp from
   `driver_finance.settlement_lines`, and a **general-purpose tax-document PDF engine**
   (`tax_document` + a reusable renderer) that every future tax form (1042-S, 2290 — already
   built separately, 425-c DIP, state new-hire reports, etc.) can share.
3. **The software generates, computes, archives (R2), and offers mail/email delivery of the
   PDF. It does NOT e-file or transmit anything to the IRS.** Jorge (or whoever he designates)
   takes the generated PDF/data file and transmits it through the IRS FIRE/IRIS system or a
   third-party e-file service, by hand, every year. This is a hard product boundary (§7 below),
   not a phase-1 simplification — see open question in §9.
4. Everything ships behind a default-OFF flag (`TAX_DOC_1099_ENABLED`) and is read-only /
   advisory until the CPA reviews a full dry run against a closed tax year.

---

## 1. Research grounding (IRS / Treasury, verified live — not from stale memory)

Verified via IRS.gov live search 2026-07 (not recalled from model memory, per the
online-research-live-data-mandate rule):

- **Form 1099-NEC, Box 1 (Nonemployee compensation):** reports payments of **$600 or more**
  during the calendar year to a person, for services performed in the course of the payer's
  trade or business, by someone who is not the payer's employee. This threshold is **changing**:
  Congress raised it to **$2,000** for payments made **on or after January 1, 2026** (with
  annual inflation adjustment starting 2027). **Do not hardcode $600.** The engine must key the
  threshold off the tax year being generated (`catalogs.tax_thresholds` or an inline
  year→amount table — §4.2).
- **Backup withholding:** a payer must backup-withhold (currently 24%) on payments to a US
  payee who fails to furnish a valid TIN on a W-9, or on IRS B-notice. Design accommodates a
  `backup_withholding_cents` column on the annual aggregate and Box 4 of 1099-NEC even though
  IH35 does not currently withhold (flag-gated, default $0).
- **Form 1042-S (Foreign Person's U.S. Source Income Subject to Withholding):** required
  instead of 1099-NEC when the payee is a **foreign person** (has certified foreign status via
  Form W-8BEN, per the "strong indicator" rule — a valid W-8BEN on file is the trigger to file
  1042-S, not 1099) **and** the income is **U.S.-source**. Independent-contractor personal
  services income is sourced to **where the services are physically performed**. Services
  performed in the U.S. by a nonresident alien contractor are US-source and, absent a treaty
  benefit properly claimed (Form 8233 / treaty article on the W-8BEN), are subject to **30%
  NRA (Chapter 3) withholding** under IRC §1441/1442, reported on Form 1042-S (income code for
  independent personal services) and summarized on Form 1042 / 1042-T. There is **no $600
  floor** on 1042-S — any reportable US-source payment to a foreign person must be reported.
  IH35 does not currently withhold this 30% (§9 open question — this is the single biggest
  compliance exposure this design surfaces and is NOT something an agent should silently decide;
  see §9).
- **E-filing:** Treasury final regs (T.D. 9972, 2023) lowered the aggregate e-file threshold to
  **10 information returns of any type combined** (1099 series + 1042-S + W-2 + others),
  effective for returns required to be filed on/after 2024-01-01. IH35, with dozens of drivers,
  is already over this threshold — but **this is Jorge's transmission-channel decision, not a
  system behavior**: the engine's job is to produce correct data + a faithful paper-form PDF;
  whether Jorge feeds that data into IRS FIRE/IRIS or a paid e-file bureau is out of scope here.
- **Recipient copies:** payee must receive **Copy B** (and any required state copy) by
  **January 31** following the tax year; the payer's file/IRS copy (Copy A / electronic
  equivalent) has a similarly-early IRS deadline (Jan 31 for NEC, since it moved off the general
  1099 March deadline in 2020). 1042-S recipient/IRS deadline is **March 15**. The engine must
  track and expose both deadlines per tax year, per form type.
- **W-9 vs W-8BEN drives the whole decision:** a **W-9** (Request for Taxpayer Identification
  Number) on file with a US TIN → US-status payee → 1099-NEC path. A **W-8BEN** on file
  (already built: `safety.driver_w8ben`) → foreign-status payee → 1042-S path. Absence of
  either is a hard-stop data-quality error the engine must surface, never silently default.

Sources consulted: IRS.gov "Instructions for Forms 1099-MISC and 1099-NEC", "About Form
1099-NEC", "Instructions for Form 1042-S", "NRA withholding" and "Withholding on specific
income" (irs.gov/individuals/international-taxpayers), "Topic no. 801 — Who must file
information returns electronically", Treasury Decision 9972 summaries (payroll.org, ADP,
Thomson Reuters practitioner explainers cross-checked against the IRS primary pages).

---

## 2. What already exists in this repo (verified against `db/migrations/`, not assumed)

| Concern | Table / file | Notes |
|---|---|---|
| Foreign-status certification | `safety.driver_w8ben` (`202607012100_safety_driver_w8ben.sql`) | Part I/II/III W-8BEN fields, `irs_expiration_date`, `voided_at`. **No US-status W-9 table exists yet** — this block must add one (or a unified `payee_tax_profile` that subsumes both — recommended, §4.1). |
| Worker classification | `driver_finance.driver_pay_settings.worker_class` (`202606290011_driver_deduction_buckets.sql`), `mdata.drivers.employment_status` (comment: "w2/1099/probationary/terminated", `0343_drivers_reference_fk_wire.sql`) | BLOCK-17 output. This is **pay-type** classification (W2 vs 1099), a different axis than **tax-residency status** (US vs foreign) that drives 1099-NEC vs 1042-S. Both axes are needed; do not conflate them. |
| Driver pay data (source for aggregation) | `driver_finance.settlement_lines` → `driver_finance.driver_settlements` (`0191_driver_finance_settlement_lines.sql`, `0124_p6_active_drift_reconciliation.sql`) | `settlement_lines.line_type IN ('earnings','extra_pay','reimbursement','deduction','abandonment_chargeback','team_split_primary','team_split_secondary')`. This is the **only** source for the annual box-1 number — see §4.3 for exact inclusion/exclusion rules. **No `load_id` on settlement_lines** (per memory `load-advance-loadid-direct-build` — deduction lines carry `load_id` directly where relevant; comp lines do not need it). |
| Document storage (R2 evidence) | `docs.files` + `docs.file_links` (`0028_docs_schema.sql`) | Canonical polymorphic file-to-entity pattern: `r2_bucket`/`r2_key`, soft-delete, `catalogs.file_categories` (already has a `'tax_form'` category code: *"W-9, 1099, IFTA filings, etc."*). **The tax-document engine should link its generated PDFs into this exact table**, not invent a parallel store — reuse, per the migration-authoring standard ("write NO new [redundant] infra"). |
| PDF rendering precedent | `apps/backend/src/compliance/form-2290-generator.ts` | Established in-repo pattern for an IRS-form-faithful PDF: build semantic HTML → `puppeteer` (`page.pdf({format:"Letter", printBackground:true})`) → return `Buffer`. Same library (`puppeteer@^24`) already a backend dependency — **reuse it**, do not add a second PDF stack (no `pdfkit`/`jsPDF` needed). Other renderers already following this shape: `driver-finance/settlement-pdf-renderer.service.ts`, `mdata/driver-profile-pdf-renderer.service.ts`, `legal/pdf-renderer.service.ts`, `border-crossing/emanifest-pdf-renderer.service.ts`. |
| Email delivery | `apps/backend/src/notifications/email.service.ts` (`sendEmail(params)`), `apps/backend/src/admin/email-queue-admin.routes.ts` | Existing outbound-email queue/service — reuse for the "email a copy to the driver" delivery path. No new provider integration needed. |
| Required-document tracking | `compliance.required_document_types` (`202607021400_required_document_types.sql`) | Already seeds a `driver` / `w9` required-doc row ("Form W-9 (or W-8BEN if foreign)") — this block's payee-status table is what that catalog row should eventually gate against (future follow-up, not this PR). |
| Company payer info | `org.companies` (`0013_org_companies.sql`) | Has `legal_name`, `tax_id` (EIN), full address — this is the **Payer** block on every generated 1099-NEC/1042-S. No changes needed. |
| GL tie-in | `accounting.settlement_posting_config` (`202606290010_settlement_gl_posting_foundation.sql`) | Where `default_worker_classification` and driver-pay GL account mapping already live — annual aggregation reconciles against this, never re-derives its own GL math (no new GL math is written by this block — pure read + report). |

**No existing `tax_document`, `payee_tax_profile`, or `form_1099_nec` table.** This is a clean
build. No conflicting/duplicate engine found elsewhere in the repo.

---

## 3. Product shape (screens, non-binding — build follows `docs/specs/qbo-parity/` grammar)

- **Driver profile → new "Tax Profile" tab** (additive, next to existing W-8BEN capture UI):
  shows current payee status (US / Foreign / Incomplete), TIN-on-file indicator (masked), W-9 or
  W-8BEN expiration, and a "Generate 1099-NEC preview" / "Generate 1042-S preview" action once a
  tax year is closed.
- **New Accounting/Tax module screen: "Annual Tax Documents"** — one row per
  `(operating_company_id, tax_year, form_type)` batch: driver count, total comp, status
  (`draft → reviewed → issued → archived`), and per-driver drill-down. Reverse-drill from a
  driver's `form_1099_nec` row back to every `settlement_lines` row that fed the total (Law of
  Total Connectivity, §10a of the constitution — no black-box totals).
- **+ Create** vocabulary applies: **"+ Create Annual Batch"** to kick off a tax-year run (never
  "+ New").
- Palette/vocab/back-arrow/breadcrumb locks apply as usual; no new colors, no emojis.

---

## 4. Schema proposal

All tables: UUIDv7 (`gen_random_uuid()` matches existing convention — repo uses `gen_random_uuid()`
throughout despite "UUIDv7" language in the constitution; follow the **existing** convention
already used by every table shown in §2 rather than introducing a new PK generation scheme),
`operating_company_id uuid NOT NULL REFERENCES org.companies(id)`, `ENABLE`+`FORCE ROW LEVEL
SECURITY`, the canonical entity predicate, `is_active`/`voided_at` (void-not-delete), append-only
audit via the existing `audit.row_changes` trigger convention, and self-contained grants (no
`DELETE` grant on the issued/immutable tables — see §4.5).

### 4.1 `catalogs.payee_tax_profile` (one row per taxable payee: driver today, vendor later)

Deliberately schema-scoped as a `catalogs.*`/reference-adjacent table (not `mdata.drivers.*`
inline columns) because a payee can be a driver *or* a vendor *or* (future) an owner-operator —
polymorphic, mirroring the `docs.file_links` pattern rather than duplicating W-9/W-8BEN columns
per entity type.

```sql
CREATE TABLE IF NOT EXISTS catalogs.payee_tax_profile (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  payee_type text NOT NULL CHECK (payee_type IN ('driver', 'vendor')),
  payee_id uuid NOT NULL,                          -- mdata.drivers.id or mdata.vendors.id; polymorphic like docs.file_links
  tax_status text NOT NULL CHECK (tax_status IN ('us_person', 'foreign_person', 'incomplete')),
  -- US-person path
  w9_on_file boolean NOT NULL DEFAULT false,
  w9_us_tin text NULL,                             -- SSN/ITIN/EIN, encrypted-at-rest per PII policy (BLOCK-18)
  w9_tin_type text NULL CHECK (w9_tin_type IN ('ssn', 'ein', 'itin')),
  w9_captured_at timestamptz NULL,
  w9_file_id uuid NULL REFERENCES docs.files(id),  -- signed W-9 PDF, reuse docs.files not a new blob store
  -- Foreign-person path — mirrors safety.driver_w8ben; FK's it directly rather than re-capturing
  w8ben_id uuid NULL REFERENCES safety.driver_w8ben(id),
  income_source_determination text NULL CHECK (income_source_determination IN ('us_source', 'foreign_source', 'mixed_unresolved')),
  treaty_benefit_claimed boolean NOT NULL DEFAULT false,
  backup_withholding_required boolean NOT NULL DEFAULT false,  -- true if US person + no valid TIN
  effective_tax_year int NOT NULL,                 -- profile is versioned per tax year (a driver's status CAN change year to year)
  voided_at timestamptz NULL,
  voided_reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid NULL REFERENCES identity.users(id),
  updated_by_user_id uuid NULL REFERENCES identity.users(id),
  CONSTRAINT payee_tax_profile_us_or_foreign_chk CHECK (
    (tax_status = 'us_person' AND w8ben_id IS NULL)
    OR (tax_status = 'foreign_person' AND w8ben_id IS NOT NULL)
    OR (tax_status = 'incomplete')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_payee_tax_profile_year
  ON catalogs.payee_tax_profile (operating_company_id, payee_type, payee_id, effective_tax_year)
  WHERE voided_at IS NULL;
```

**Why `income_source_determination` is its own field and not auto-derived:** per §1, personal-services
sourcing depends on *where the work was physically performed* during the year — a driver who
crosses Laredo↔Mexico may have a genuinely mixed picture. The engine must never silently assume
100% US-source for a border-crossing driver; this field is **owner/CPA-confirmed per driver per
year**, not computed from GPS/dispatch data in v1 (a future block could propose a
mileage-in-US-vs-Mexico apportionment, but that is out of scope and NOT decided here — flagging,
not building).

### 4.2 `catalogs.tax_form_thresholds` (year-keyed, not hardcoded)

```sql
CREATE TABLE IF NOT EXISTS catalogs.tax_form_thresholds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tax_year int NOT NULL,
  form_type text NOT NULL CHECK (form_type IN ('1099_nec', '1042_s')),
  reporting_threshold_cents bigint NOT NULL,        -- 1099-NEC: 60000 for TY<=2025, 200000 for TY>=2026; 1042-S: 0 (no floor)
  recipient_copy_due_date date NOT NULL,            -- Jan 31 following tax_year for 1099-NEC; Mar 15 following for 1042-S
  irs_copy_due_date date NOT NULL,
  backup_withholding_rate_bps int NOT NULL DEFAULT 2400,   -- 24.00%
  nra_withholding_rate_bps int NOT NULL DEFAULT 3000,      -- 30.00% (pre-treaty)
  notes text NULL,
  UNIQUE (tax_year, form_type)
);
-- Global reference data — not operating_company_id-scoped (same IRS rule for every entity);
-- SELECT-only to ih35_app, seeded/maintained by migration, never by runtime writes.
GRANT SELECT ON catalogs.tax_form_thresholds TO ih35_app;
```

This is the load-bearing fix for the just-verified 2026 threshold change ($600 → $2,000): the
aggregation query (§4.3) joins this table on `tax_year`, so a payment made in TY2025 is judged
against $600 and the same driver's TY2026 payments are judged against $2,000, automatically,
with zero code change when the year rolls — and any *future* IRS threshold change is a one-row
`INSERT`, never a code deploy.

### 4.3 Annual aggregation — exact box-1 inclusion/exclusion rule

Source: `driver_finance.settlement_lines` joined through `driver_finance.driver_settlements`
filtered to `driver_settlements.period_end` within the calendar tax year (cash basis — comp is
reportable in the year **paid**, i.e. `driver_settlements.paid_at`/`payment_cleared_at`, not the
year the work was performed, per IRS cash-method rule for information returns).

| `settlement_lines.line_type` | Included in Box-1 comp? | Reasoning |
|---|---|---|
| `earnings` | **YES** | Pay for services performed — this is exactly what Box 1 reports. |
| `extra_pay` | **YES** | Also pay for services (bonuses, detention, etc. paid through the settlement) — IRS Box-1 instructions include all compensation for services, not just base pay. |
| `team_split_primary` / `team_split_secondary` | **YES** (each side, to its own driver) | Comp for services; team split just determines whose 1099 it lands on. |
| `reimbursement` | **NO** | Reimbursement of the contractor's own out-of-pocket business expense, not comp for services. Standard practice for 1099 contractors (mirrors the employee "accountable plan" logic even though technically an accountable-plan election is an employee construct) — excluded as long as it is separately itemized as `reimbursement` in the ledger, which it already is. |
| `deduction` | **YES, already included via `earnings`/`extra_pay` — do NOT subtract again** | **This is the single most important and most commonly gotten-wrong rule.** A `deduction` line (advance recoupment, damage-claim recovery, lease payment) reduces the driver's **net cash disbursed**, not the amount **earned**. The driver received full economic benefit of the earned comp — the company just recouped a separate debt out of it. IRS reports gross comp for services, unreduced by the payer's own debt recoupment. **Net pay ≠ Box 1.** Do not build the aggregation off `driver_settlements.net_pay` — it will systematically understate Box 1 and is an audit finding waiting to happen. |
| `abandonment_chargeback` | **CASE-BY-CASE, same-year vs prior-year** | If the chargeback nets against comp *earned in the same tax year*, it nets down that year's Box-1 total (economically the comp was never truly received). If it claws back comp reported in a **prior** filed 1099, the correction is a **corrected 1099-NEC** for the prior year, never a silent reduction of the current year's total — flag for manual CPA review, do not auto-net across year boundaries. |
| Driver-escrow **return** (the 60–90-day damage-escrow release, per `driver-escrow-is-liability` memory) | **NO, in the return year** | The escrow liability being returned was already earned/reported (via `earnings`/`extra_pay`) in the year it was originally withheld into escrow; returning it is not new comp. (If escrow *funding* itself is modeled as a `deduction` line at withholding time — consistent with the table above — this falls out for free: it was never subtracted from Box 1 to begin with.) |

```
box1_comp_cents(driver, tax_year) =
  SUM(settlement_lines.amount) FILTER (
    WHERE line_type IN ('earnings','extra_pay','team_split_primary','team_split_secondary')
  )
  − SUM(settlement_lines.amount) FILTER (
    WHERE line_type = 'abandonment_chargeback' AND <same tax_year as the comp it offsets>
  )
  -- reimbursement and deduction lines are NEVER part of this formula, in either direction.
```

### 4.4 `accounting.form_1099_nec` / `accounting.form_1042_s` (issued documents, one row per payee per year)

Two narrow, near-identical tables rather than one polymorphic table — the IRS box layouts
genuinely diverge (1042-S has ~15 boxes with no 1099 equivalent: income code, chapter 3/4
status codes, country code, exemption code, tax rate, LOB code) and forcing them into one
generic `payload jsonb` blob would make the "immutable once issued" guarantee (§4.5) much
harder to reason about and query. A shared parent row (`tax_document`, §4.6) carries the
common PDF/delivery/archive concerns; these two carry only the box data.

```sql
CREATE TABLE IF NOT EXISTS accounting.form_1099_nec (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  tax_document_id uuid NOT NULL REFERENCES accounting.tax_document(id),
  tax_year int NOT NULL,
  payee_tax_profile_id uuid NOT NULL REFERENCES catalogs.payee_tax_profile(id),
  payer_legal_name text NOT NULL,          -- snapshotted from org.companies at generation time — immutable even if the company later renames
  payer_tin text NOT NULL,
  payer_address_snapshot jsonb NOT NULL,
  recipient_name text NOT NULL,            -- snapshotted from mdata.drivers at generation time
  recipient_tin_masked text NOT NULL,       -- last 4 only in any UI/PDF preview pre-issue; full TIN only in the issued PDF stored in R2
  recipient_address_snapshot jsonb NOT NULL,
  box1_nonemployee_comp_cents bigint NOT NULL CHECK (box1_nonemployee_comp_cents >= 0),
  box4_federal_income_tax_withheld_cents bigint NOT NULL DEFAULT 0,
  box5_state_tax_withheld_cents bigint NOT NULL DEFAULT 0,
  box6_state_payer_number text NULL,
  box7_state_income_cents bigint NOT NULL DEFAULT 0,
  is_corrected boolean NOT NULL DEFAULT false,
  corrects_form_id uuid NULL REFERENCES accounting.form_1099_nec(id),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'reviewed', 'issued', 'voided')),
  issued_at timestamptz NULL,
  voided_at timestamptz NULL,
  voided_reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operating_company_id, payee_tax_profile_id, tax_year) -- one non-corrected original per payee per year (corrections use corrects_form_id chain)
);

CREATE TABLE IF NOT EXISTS accounting.form_1042_s (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  tax_document_id uuid NOT NULL REFERENCES accounting.tax_document(id),
  tax_year int NOT NULL,
  payee_tax_profile_id uuid NOT NULL REFERENCES catalogs.payee_tax_profile(id),
  withholding_agent_legal_name text NOT NULL,
  withholding_agent_ein text NOT NULL,
  recipient_name text NOT NULL,
  recipient_country_code text NOT NULL,       -- ISO-3166 alpha-2, from safety.driver_w8ben.permanent_residence_country
  recipient_foreign_tin text NULL,             -- Mexican RFC/CURP, from safety.driver_w8ben.foreign_tin
  recipient_us_tin text NULL,
  income_code text NOT NULL DEFAULT '17',      -- IRS income code for "compensation for independent personal services"; verify current-year code at build time
  gross_income_cents bigint NOT NULL CHECK (gross_income_cents >= 0),
  chapter3_exemption_code text NULL,
  tax_rate_bps int NOT NULL,                   -- 3000 (30%) unless a specific treaty article reduces it
  federal_tax_withheld_cents bigint NOT NULL DEFAULT 0,
  treaty_country_code text NULL,
  treaty_article text NULL,
  is_corrected boolean NOT NULL DEFAULT false,
  corrects_form_id uuid NULL REFERENCES accounting.form_1042_s(id),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'reviewed', 'issued', 'voided')),
  issued_at timestamptz NULL,
  voided_at timestamptz NULL,
  voided_reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operating_company_id, payee_tax_profile_id, tax_year)
);
```

### 4.5 `accounting.tax_document` — the general-purpose engine table (reusable for ALL tax docs)

This is the piece that generalizes beyond 1099/1042-S: **every** tax-related PDF (1099-NEC,
1042-S, and later 2290 — already built standalone and a good candidate to migrate onto this
spine, 425-c DIP filings, any future state new-hire report) gets one row here. It owns the
PDF/R2/delivery lifecycle; the form-specific tables (§4.4) own only the box data and FK to it.

```sql
CREATE TABLE IF NOT EXISTS accounting.tax_document (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  document_kind text NOT NULL CHECK (document_kind IN ('form_1099_nec', 'form_1042_s', 'form_2290', 'other')),
  tax_year int NOT NULL,
  batch_id uuid NULL REFERENCES accounting.tax_document_batch(id),  -- groups an annual "+ Create Annual Batch" run
  subject_payee_id uuid NULL,           -- payee_tax_profile.id when applicable; NULL for company-level filings (e.g. 2290)
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'reviewed', 'issued', 'archived', 'voided')),
  -- Rendered artifact — reuses the docs.files / docs.file_links spine, does NOT duplicate storage
  file_id uuid NULL REFERENCES docs.files(id),
  rendered_at timestamptz NULL,
  render_template_version text NULL,     -- e.g. "1099-nec-2025v1" — pins which IRS-year layout produced this PDF
  -- Delivery (mail/email) — advisory tracking only, no carrier/ESP integration required in v1
  mailed_at timestamptz NULL,
  mailed_to_address_snapshot jsonb NULL,
  emailed_at timestamptz NULL,
  emailed_to_address text NULL,
  email_message_id text NULL,            -- from notifications.email.service sendEmail() return
  -- Immutability once issued (§ below)
  issued_at timestamptz NULL,
  issued_by_user_id uuid NULL REFERENCES identity.users(id),
  voided_at timestamptz NULL,
  voided_reason text NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid NULL REFERENCES identity.users(id)
);

CREATE TABLE IF NOT EXISTS accounting.tax_document_batch (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  tax_year int NOT NULL,
  form_type text NOT NULL CHECK (form_type IN ('1099_nec', '1042_s')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'in_review', 'issued', 'archived')),
  payee_count int NOT NULL DEFAULT 0,
  total_comp_cents bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid NULL REFERENCES identity.users(id),
  reviewed_at timestamptz NULL,
  reviewed_by_user_id uuid NULL REFERENCES identity.users(id),
  issued_at timestamptz NULL,
  issued_by_user_id uuid NULL REFERENCES identity.users(id),
  UNIQUE (operating_company_id, tax_year, form_type)
);
```

**Immutable once issued:** once `status = 'issued'` (the PDF has actually been generated,
archived to R2, and — per Jorge's decision — Jorge has transmitted it / mailed it), the row
becomes append-only from the application's point of view: no UPDATE to any box-value/PDF
field, only `voided_at` + a **new** `is_corrected = true` row chained via `corrects_form_id` if
a correction is needed later (mirrors the `audit.row_changes` void-not-delete law and IRS's own
corrected-1099 mechanism — a correction is a new filing, never an edit to the original). Enforce
with a trigger (`RAISE EXCEPTION` on UPDATE of box/PDF columns when `status='issued'`), not just
application-layer discipline — a DB-level guard so it can't regress (constitution §2, "every
bug fix gets a static CI guard" extends here to "every immutability rule gets a DB trigger").

### 4.6 RLS / grants (all four new tables)

Canonical FORCED-RLS predicate on every table above (`identity.is_lucia_bypass() OR
operating_company_id::text = current_setting('app.operating_company_id', true)`), write gated
to `Owner`/`Administrator`/`Accountant` roles only (this is tax-filing data — narrower than the
general accounting-read role set). Grants: `SELECT, INSERT, UPDATE` — **no DELETE** anywhere in
this cluster (void-not-delete, and these are the literal evidence trail an IRS/DOL/court review
would pull). `catalogs.tax_form_thresholds` is the one exception — global reference data,
`SELECT`-only to `ih35_app`, written only by migration.

`GRANT USAGE ON SCHEMA accounting TO ih35_app` already exists (accounting schema predates this
block); no new schema needed for `tax_document`/`form_1099_nec`/`form_1042_s`. `catalogs` schema
usage grant likewise already exists.

---

## 5. The general tax-document PDF engine (reusable, not 1099-specific)

### 5.1 Render pipeline (reuse, don't rebuild)

```
tax_document row (draft)
  → assemble form-specific data object (box values, payer/recipient snapshots)
  → renderTaxDocumentPdf(documentKind, data) — one function per document_kind,
    same shape as apps/backend/src/compliance/form-2290-generator.ts:
      1. build semantic HTML from a per-form, per-tax-year template (versioned string,
         e.g. templates/1099-nec/2025.ts, so a future-year box layout change never mutates
         an already-issued document's render logic — pin render_template_version on the row)
      2. puppeteer.launch({headless:true, args:[...same sandbox flags already in use]})
      3. page.setContent(html) → page.pdf({format:"Letter", printBackground:true})
      4. return Buffer
  → upload Buffer to R2 via the existing apps/backend/src/storage/r2-client.ts helper,
    key convention org/<operating_company_id>/tax-documents/<tax_year>/<document_kind>/<id>.pdf
    (mirrors docs.files.r2_key convention: org/<operating_company_id>/files/<file_uuid>/<version>/<name>)
  → INSERT docs.files (category_id = catalogs.file_categories WHERE code='tax_form' — already seeded)
  → INSERT docs.file_links (entity_type — needs an additive enum value, see §5.3)
  → UPDATE tax_document SET file_id, rendered_at, render_template_version
```

No new PDF library. No new object-storage integration. This is the same shape as five other
renderers already in the codebase — the "engine" is the **pattern + the `tax_document` spine
table**, not a new runtime dependency.

### 5.2 Layout fidelity

Each `document_kind` gets its own HTML template that mirrors the **current-year official IRS PDF
box layout and box numbers** as closely as an HTML/CSS "Letter"-format print can (this is a
*computer-generated substitute*, which the IRS permits for recipient copies and for the payer's
own file copy — payers do not have to use the IRS's own red-ink Copy A scannable form unless
they are paper-filing the payer copy directly to the IRS, which is out of scope here since
transmission is Jorge's action, likely via IRS FIRE/IRIS which accepts the underlying data, not
a scanned form). Template versioning (`render_template_version`) exists specifically because the
box layout **will** change (as verified in §1 — the 2026 threshold change is a preview of this
kind of annual drift) and an issued document's PDF must never silently re-render differently
later.

### 5.3 Additive schema touch needed elsewhere

`docs.file_links.entity_type` currently has a fixed CHECK list (`'driver', 'customer', 'vendor',
'unit', 'equipment', 'load', 'settlement', 'invoice'`) with no `'tax_document'` member. Per the
additive-only product lock (§7 of the constitution), the BUILD migration for this block must
**append** `'tax_document'` to that CHECK constraint (a `DROP CONSTRAINT` + re-`ADD CONSTRAINT`
with the widened list — the only kind of "destructive" DDL this design calls for, and it is
purely additive in effect). No other existing table needs a shape change.

### 5.4 Archive / mail / email delivery (all three required per Jorge's decision)

- **Archive:** automatic — every rendered PDF lands in `docs.files`/R2 the moment it's rendered,
  regardless of `issued` status. This is the ADDITIVE-ONLY "never delete" evidence copy.
- **Mail:** v1 scope = generate a **mail-merge-ready** artifact (the same PDF, since Copy B is
  designed to be printed and mailed) + a checklist/tracking field
  (`tax_document.mailed_at`/`mailed_to_address_snapshot`) that Jorge/office staff mark manually
  after physically mailing. **No USPS/print-vendor API integration in v1** — that is a
  reasonable future increment, not a blocker for this design.
- **Email:** reuses `apps/backend/src/notifications/email.service.ts::sendEmail()` to send the
  driver (or vendor) their copy as a PDF attachment, IF the driver has consented to electronic
  delivery. **IRS requires affirmative e-consent** for electronic-only delivery of these
  statements — the engine must gate the email-delivery button on a `driver_pwa` or
  paper-consent field before offering "email only" as sufficient (do not silently skip mailing
  a paper copy without a recorded consent — flag as a build-time requirement, not resolved by
  this design doc; a consent-capture flow is a small additive scope item for the BUILD PR).

---

## 6. What this block explicitly does NOT do

- **Does not e-file or transmit to the IRS.** No IRS FIRE/IRIS API integration, no MeF, no
  transmission credentials, no submission tracking against an IRS transmitter control code
  (TCC). Jorge transmits by hand, every year, using the data/PDFs this engine produces. This is
  the single most important boundary in this design and is called out three times in this
  document on purpose.
- **Does not compute or withhold NRA (Chapter 3) 30% withholding automatically.** The schema
  carries the fields to *report* withholding if any occurred, but does not trigger an
  automatic withholding **deduction** in `driver_finance.settlement_lines` at pay time. See §9 —
  this is a live open compliance question, not a silent design decision.
  answer needed before BUILD.
- **Does not apportion mixed US/Mexico-source income automatically** from GPS/dispatch data.
  `income_source_determination` is an owner/CPA-set field per driver per year in v1.
- **Does not post anything to the GL.** Box-1 comp is a **read** off `settlement_lines`, never a
  new journal entry. No `accounting.journal_entries` row is created by this block.
- **Does not touch BLOCK-17's classification work** — it consumes `worker_class`/
  `employment_status`, never redefines them.

---

## 7. Feature flag

```sql
INSERT INTO lib.feature_flags (flag_key, description, default_enabled, rollout_pct)
VALUES ('TAX_DOC_1099_ENABLED',
  'Annual 1099-NEC/1042-S generation + general tax-document PDF engine. DEFAULT OFF — owner/CPA-gated. When OFF, /api/v1/tax-documents/* returns 409.',
  false, 0)
ON CONFLICT (flag_key) DO NOTHING;
```

Per-entity override via `lib.feature_flag_overrides` (TRANSP first; TRK/USMCA follow once each
entity has its own driver population requiring a filing).

---

## 8. Verification the eventual BUILD PR must include

- `scripts/verify-tax-document-immutability.mjs` — proves the `issued` trigger rejects an
  UPDATE to a box/PDF column on an issued row.
- `scripts/verify-box1-excludes-net-pay.mjs` — a static/DB guard asserting the aggregation query
  text sums `earnings/extra_pay/team_split_*` and never references `driver_settlements.net_pay`
  or subtracts `deduction` lines (codifies §4.3's most error-prone rule so it can't regress).
- `scripts/verify-tax-form-threshold-year-keyed.mjs` — asserts no literal `600` or `2000` dollar
  constant exists in the aggregation/filing code path outside `catalogs.tax_form_thresholds`
  seed data.
- Standard FORCE-RLS + grant + schema-parity guards per the migration-authoring standard.

---

## 9. Open questions for Jorge / CPA — do not silently resolve these

1. **Is IH35 currently performing 30% NRA (Chapter 3) withholding on any driver comp, given that
   drivers are certified-foreign-status (W-8BEN) contractors performing US-source personal
   services?** If not, and no treaty benefit properly reduces/eliminates it, this is a
   pre-existing compliance exposure this design surfaces — independent of whether/when BLOCK-24
   is built. This needs a CPA read, not an agent decision, and is flagged here per §1.7 (surface
   the decision, don't self-authorize).
2. **Income sourcing for border-crossing drivers:** confirm with the CPA whether IH35's Mexican
   B-1 drivers' comp should be treated as 100% US-source (dispatched from/paid by a US operating
   carrier, primary duty station in the US) or requires a documented apportionment. This design
   defaults to "owner/CPA sets it per driver per year" rather than guessing.
3. **1099-NEC vs 1042-S per driver, concretely:** confirm the intended read of the current
   `safety.driver_w8ben` population — is a W-8BEN on file today intended to mean "this driver
   gets a 1042-S," or is there an expectation some drivers hold both a W-8BEN (identity/treaty
   cert) and a US TIN and should still get a 1099-NEC? (Generally these are mutually exclusive
   per IRS rules — a person is either a US person for tax purposes or files as foreign, not
   both — but confirm no driver was set up with a W-8BEN as a formality while still being a US
   citizen/resident, which would be a data-entry error worth catching before the first batch
   runs.)
4. **Delivery consent:** confirm whether IH35 wants driver e-consent to electronic delivery
   captured now (a small additive scope item) or whether the v1 default is "always mail a paper
   Copy B, email is a courtesy copy only" (simpler, avoids the e-consent requirement entirely).

---

## 10. Summary of the cross-module links this satisfies (Law of Total Connectivity)

`catalogs.payee_tax_profile` → `mdata.drivers` / `mdata.vendors` (forward) and reverse-drillable
from the driver profile; → `safety.driver_w8ben` (foreign path) and → a to-be-added W-9 capture
(US path, itself linking to `docs.files`); `accounting.form_1099_nec`/`form_1042_s` →
`driver_finance.settlement_lines` (every dollar in Box 1 must reverse-drill to the settlement
lines that produced it — no black-box totals); `accounting.tax_document` → `docs.files` →
`docs.file_links` (archive); → `notifications.email.service` (email delivery); →
`org.companies` (payer snapshot); and the whole cluster is gated by
`compliance.required_document_types` (the existing `w9` seed row) for pre-filing data-quality
checks. No island.
