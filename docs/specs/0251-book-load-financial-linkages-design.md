# Design — Book-Load Financial Linkages (factoring FK, driver-bill GL/escrow, lumper expense)

**Blocks covered:** 0251-gap1 (factoring vendor FK on the load), 0251-gap3 (invoice surfaces factoring
vendor — depends on gap1), 0251-gap18 (driver bill posts Bill + BillPayment to GL), 0251-gap19 (driver
bill escrow deduction at book-load), 0251-gap22 (lumper charge → expense record).
**Status:** DESIGN ONLY. **Classification: FINANCIAL** (mdata schema change + GL posting + accounting.*
writes → §1.4). Agent never self-merges, never builds the posting/escrow math solo.
**Related already-satisfied blocks (see verification report):** gap2 (vendor GL FK ✅
`mdata.vendors.default_expense_account_id`), gap20 (driver-bill → settlement FK ✅
`driver_finance.driver_bills.settled_in_settlement_id`), gap4 (driver→vendor map ✅
`mdata.drivers.qbo_vendor_id`).

## 1. Verified current state (repo, 2026-07-11 — prod UNVERIFIED, needs live check)
- **gap1 — factoring vendor is NOT stored as a FK.** `BookLoadModalV4.tsx:1200-1213` binds the "Factoring
  company" `SelectCombobox` to form field **`factoring_company_summary` (free TEXT)**; the persisted
  book-load payload (`book-load.service.ts` INSERT, ~L924) carries no `factoring_vendor_id`. `grep
  factoring_vendor_id db/migrations/ apps/backend/src` → only a route-level 404 check, no `mdata.loads`
  column. So the selected vendor's identity is not FK-linked to the load.
- **gap18/gap19 — `createDriverBillArtifacts` (`book-load.service.ts:248`) is calc-only.** It sums
  `basePayCents + extraStopBonusCents + tarpPayCents + driverLumperCents` (L262-267) and INSERTs a driver
  bill, but there is **no GL-posting call** (no `postSourceTransaction`/journal call in the vicinity — the
  only "GL" mention is an unrelated escrow-recovery comment) and **no `escrow` handling** (`grep escrow`
  in that file → 0 matches).
- **gap22 — lumper is calc-only.** `driverLumperCents` / `customerLumperCents` / `companyLumperCents`
  are aggregated (L262-289, persisted as `lumper_*_cents` display columns) but **no `accounting.expenses`
  row** is created for the carrier-paid lumper. (`accounting.expenses` must FK to a load — critical §4.)

## 2. Proposed approach (owner applies; agent builds no GL math)
- **gap1:** additive `ALTER TABLE mdata.loads ADD COLUMN IF NOT EXISTS factoring_vendor_id uuid
  REFERENCES mdata.vendors(id) ON DELETE SET NULL;` populate at book-load from the modal (change the
  field from free-text summary to the vendor id). Additive, idempotent, RLS already on `mdata.loads`.
- **gap3:** once gap1 lands, `invoice-render.routes.ts` / `from-load.ts` read `loads.factoring_vendor_id`
  → surface the factoring vendor on the invoice (read-only). Non-financial *once the FK exists*, but
  blocked on gap1's schema change.
- **gap18/gap19/gap22:** these post to the GL / write `accounting.*` / compute escrow — **§1.4 forbids
  building this solo.** The design position: driver-bill GL posting + escrow deduction + lumper-expense
  creation should be a single **flag-gated** posting step (default OFF) that REUSES the existing posting
  engine — write NO new GL math. Escrow = LIABILITY (per `driver-escrow-is-liability` locked decision).

## 3. Linkage matrix (§10-d)
- loads → mdata.vendors (factoring_vendor_id), → accounting.invoices (gap3 reverse surface).
- driver_finance.driver_bills → accounting.journal_entries (gap18), → escrow liability account (gap19),
  → driver_finance.driver_settlements (gap20 ✅ `settled_in_settlement_id`).
- accounting.expenses → mdata.loads (gap22, load-FK mandatory).

## 4. acceptance[] (at build time)
- gap1: `column` mdata.loads.factoring_vendor_id; `fk` → mdata.vendors; `data` populated at book-load;
  `guard` verify-*.mjs asserts the column + that the modal submits the id (not free text).
- gap18: `data` a balanced JE per driver bill **behind a default-OFF flag** (effective() via isEnabled).
- gap19: `data` escrow deduction line present when applicable; escrow posts to a LIABILITY account.
- gap22: `data` an accounting.expenses row per carrier-paid lumper, FK'd to the load.

## 5. Why HOLD
gap1 = `mdata` schema change (§1.3). gap18/19/22 = GL posting + `accounting.*` writes + escrow math
(§1.4, forbidden solo). Build requires owner ceremony: branch → local fresh-DB migrate → full SQL +
`git diff --staged --stat` → explicit "OK to merge". Flags default OFF.
