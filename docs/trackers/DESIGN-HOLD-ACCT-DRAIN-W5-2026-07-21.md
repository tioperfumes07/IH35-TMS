# DESIGN HOLD — ACCOUNTING DRAIN WAVE 5 (3 residuals)

> **STATUS: DESIGN ONLY · HOLD-FOR-JORGE · DO NOT MERGE as product.**  
> Docs-only. No migration, no money code, no flag flip, no CoA invent/seed.  
> Base: `origin/main` @ `a33c49b4e`. Companion verify: `docs/trackers/ACCOUNTING-DRAIN-WAVE5-2026-07-21.md`.

Owner rulings already locked for adjacent items: TONU fee **NOT automatic** (`#3129`); Faro dual cards;  
Lending/risk **IN**; OSHA/HTS **OUT**; `chart_of_accounts_roles` PRIMARY.

---

## 1. `0251-gap3-vendor-invoice-linkage`

### Problem
`accounting.bills.vendor_id` remains soft TEXT. Held migration `202607220000_bills_mdata_vendor_fk.sql`
adds nullable `mdata_vendor_id uuid REFERENCES mdata.vendors(id)` but is listed in
`db/migrations/.held-migrations.json` — not applied. Writers do not dual-write the FK.

### Owner ruling (evening 2026-07-21)
Faro must exist as **both** a `factoring.factor` profile **and** an `mdata.vendors` vendor card.
That answers the factor-as-vendor sub-question; it does **not** auto-unhold the bills FK migration.

### Future build (financial ceremony — separate PR)
1. Owner `JORGE-APPROVED` + Neon-apply held `202607220000_bills_mdata_vendor_fk.sql` + ledger-backfill.
2. Backfill script: resolve soft `vendor_id` text → `mdata.vendors.id` (entity-scoped, fail-closed).
3. Dual-write `mdata_vendor_id` on bill create/update (reuse existing bills service — no new GL math).
4. Rule-17 guard: new bills with soft vendor text require non-null `mdata_vendor_id` after cutover
   (`scripts/verify-bills-vendor-fk-populated.mjs` + verify-step only — no `package.json` edit).

### Non-goals
- Do not invent GL accounts. Do not treat `mdata.qbo_vendors` as canonical vendor.
- Do not merge this HOLD as if the FK were live.

---

## 2. `dip-mor-pre-post-petition-ap-split`

### Problem
Ch.11 DIP Monthly Operating Report needs pre-petition vs post-petition A/P split. Repo has
**zero** `pre_petition` / `post_petition` / `petition_status` on `accounting.bills*`. Only Form 425C
carries `petition_date` (profiles / report case SoR). Petition dates known operationally
(TRK 2025-06-05, TRANSP 2025-10-03) but must not be hard-coded in migrations.

### Blockers (owner + counsel — no builder invent)
1. CPA + bankruptcy-counsel ruling: classification basis (ASC 470-60 / pre-petition liabilities
   subject to compromise vs post-petition administrative A/P).
2. Tagging model: column on `accounting.bills` vs derived view keyed off entity petition_date + bill date.
3. UI/report columns on MOR / 425C exhibit — additive only (Rule 07).

### Future build (after written ruling)
- Additive nullable classification + FORCE RLS + audit; reuse existing AP aging/MOR readers.
- Flags default OFF until owner Neon proof.
- No new GL math — classification/tagging only.

### Non-goals
- Do not invent petition dates in code. Do not Neon-apply from this HOLD.

---

## 3. `flow2-customer-chargeback-driver-expense`

### Problem
Owner must define customer-chargeback → driver-billback policy: which driver-caused expenses are
billable back, who approves, and **GL treatment** (expense reduction vs other income vs AR).

### Verified partial coverage (not sufficient)
`settlement-contract-terms.service.ts` already selects loads with
`customer_chargeback_requested` + `customer_chargeback_driver_fault` and can propose
`late_delivery_passthrough` settlement deductions. That is **settlement recovery**, not a locked
accounting GL policy for the expense/AR side.

### Blockers
1. Which expense classes are billable back to driver (freight damage, detention fault, …).
2. Approval matrix (dispatcher vs Owner/Admin).
3. GL treatment via `chart_of_accounts_roles` (PRIMARY) — **no invent accounts**.
4. Linkage: expense ↔ load ↔ driver ↔ settlement deduction ↔ JE (forward + reverse).

### Future build (after written policy)
- Reuse existing expense + settlement posters; flag-gated; Rule-17 regression guard.
- Never auto-create AR/expense without the policy matrix.

### Non-goals
- Do not conflate factoring chargebacks with this customer→driver billback flow.
- Do not expand escrow draw types here (`expand-escrow-non-bond-deductions` is separate).

---

## Companion WAVE 5 items intentionally NOT in this HOLD pack

| block_id | why not a new DESIGN HOLD |
|---|---|
| `0242-no-auto-customer-charge-on-cancellation` | Owner ruled NOT automatic — covered by `#3129` |
| `0473-1-8-tk-transp-lease-asc842` | Code COVERED; residual is CPA memo only |
| `factoring-asc860-cpa-control-test-open` | ACTION-ONLY CPA control test (no design invent) |
| `ifta-sales-tax-booking-location-confirm` | COVERED — freight sales tax N/A |
| `usmca-unhide-entity-switcher` | ACTION-ONLY env flip `USMCA_ACTIVE=1` |
