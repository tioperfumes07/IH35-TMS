> **STALE — NOT EVIDENCE OF PROGRESS (banner added 2026-07-22).**
> `CLAUDE-CODER-MERGE-SEQUENCE-2026-07-21.md` listed this PR under **NEVER merge (close as
> theater)** — it restates STALE tables and contains no wiring. It was merged anyway by the
> Claude Code verifier lane in a green-CI sweep that did not read that file first. See the
> **RECONCILIATION — 2026-07-22** section there for the full accounting.
> Living scoreboard is `TRUE-CONNECTIVITY-MASTER` + the FAIL-honest E2E audits, not this file.

# ACCOUNTING DRAIN — WAVE 5 verify (2026-07-21)

**Base:** `origin/main` @ `a33c49b4e`  
**Worktrees:** `/private/tmp/ih35-acct-drain-w5-verify` · `/private/tmp/ih35-acct-drain-w5-holds`  
**Scope:** final **8** residual ACCOUNTING `NEEDS-OWNER` items left unclaimed after Wave 4 handoff  
(`0242`, `0251-gap3`, `0473-1-8`, `dip-mor-*`, `factoring-asc860-cpa-*`, `flow2-*`, `ifta-sales-tax-*`, `usmca-unhide-*`).

Hard bans respected: `#3123/#3124/#3141/#3149` and already-open accounting PRs `#3116–#3156`.  
Owner rulings locked for this drain: TONU/cancel fee **NOT automatic**; Lending/risk **IN**; OSHA/HTS **OUT**;  
`accounting.chart_of_accounts_roles` PRIMARY; no invent GL; no CoA seed; Rule 17 for new guards;  
no `package.json` / CI workflow edits; builder never merges / never Neon-applies.

| # | block_id | verdict | evidence (repo @ a33c49b4e + owner docs) | follow-up PR |
|---|---|---|---|---|
| 1 | `0242-no-auto-customer-charge-on-cancellation` | **STALE (intentional)** | `cancellation.service.ts` writes `billable_to_customer` / `cancellation_charge_cents` only — **zero** invoice/AR/poster calls. Owner evening ruling + `#3129`: **TONU fee NOT automatic** (manual / case-by-case). Auto-AR framing is superseded; intentional non-auto is correct. | none (manual TONU→AR stays under `#3129` / `#3103` design — do not auto-wire) |
| 2 | `0251-gap3-vendor-invoice-linkage` | **HOLD** | Owner evening ruling: Faro = **both** `factoring.factor` **and** `mdata.vendors`. Held mig `202607220000_bills_mdata_vendor_fk.sql` still in `.held-migrations.json` (reason: real AP FK + backfill/writer deferred). Financial-cluster Neon-unhold + dual-write — not UI/guard-only. | companion DESIGN HOLD (this wave) |
| 3 | `0473-1-8-tk-transp-lease-asc842` | **COVERED + HOLD (CPA memo)** | Code: FIN-22 `lease-asc842/*` on main; operating-lease lock in design; §9.9 `LEASE` ON (Neon 2026-07-20). Adjudication `#3115`: **none to decide** for classification. Residual = CPA/counsel ASC 842 common-control / useful-life **memo** (ACTION-ONLY hand). | owner/CPA memo — no code PR |
| 4 | `dip-mor-pre-post-petition-ap-split` | **HOLD** | Zero `pre_petition` / `post_petition` / `petition_status` on `accounting.bills*` (only Form 425C `petition_date`). Still unanswered NEEDS-OWNER — needs CPA + bankruptcy counsel before any migration. | companion DESIGN HOLD (this wave) |
| 5 | `factoring-asc860-cpa-control-test-open` | **HOLD (ACTION-ONLY)** | Secured-borrowing conclusion locked (`docs/accounting/FACTORING-POSTER-DESIGN.md`). **`docs/accounting/FACTORING-ASC860-DETERMINATION.md` absent.** CPA must write ASC 860-10-40-5 (a–c) control-surrender test vs executed FARO agreement — owner/CPA hand, not builder invent. | none (CPA deliverable) |
| 6 | `flow2-customer-chargeback-driver-expense` | **HOLD** | Settlement passthrough SQL exists (`customer_chargeback_driver_fault` → `late_delivery_passthrough` in `settlement-contract-terms.service.ts`), but **GL treatment policy** (expense reduction vs other income vs AR) + approval matrix still unanswered NEEDS-OWNER. No invent GL. | companion DESIGN HOLD (this wave) |
| 7 | `ifta-sales-tax-booking-location-confirm` | **COVERED / STALE** | Adjudication `#3115` + CPA skill: **no sales tax on line-haul** (interstate/cross-border freight not TX-sales-taxable). TRANSP seed comment `sales_tax_payable: intentionally NOT seeded` is correct — do **not** invent/seed the role for freight. Ancillary tax (if any) uses existing `accounting.sales_tax_returns.paid_bill_id`. | none — tracker decrement |
| 8 | `usmca-unhide-entity-switcher` | **HOLD (ACTION-ONLY)** | Picker still gated by `USMCA_ACTIVE==="1"` (`filterPreLaunchEntities` in `companies.routes.ts` + company-context). Neon `#3117`: `org.companies.is_active=true` for USMCA (prod wins vs old `is_active=false` claim) + banking ingestion **BUILT-LIVE**. Unhide = owner env flip `USMCA_ACTIVE=1` after launch/OB ceremony — not a code delete of the gate. | owner Render/env flip at USMCA launch |

## Verdict counts

| Verdict | Count |
|---|---|
| STALE (intentional) | 1 |
| COVERED / STALE | 1 |
| COVERED + HOLD (CPA memo) | 1 |
| HOLD (design / financial) | 3 |
| HOLD (ACTION-ONLY) | 2 |
| REAL FIX (UI/guard-only) | **0** |

No safe non-financial REAL FIX in this residual set. Auto-TONU would **violate** owner ruling.

## Accounting drain completeness

**Wave 5 closes the Wave-4 handoff residual list (8/8 dispositioned).**  

Accounting pile pending snapshot (`block-audit-piles-2026-07-21.json`): **63** (43 GAP · 17 NEEDS-OWNER · 3 NEEDS-PROD).  
Waves 1–5 + open accounting PRs (`#3116–#3156`) disposition or claim most NEEDS-OWNER/PROD rows; **GAP rows remain** (UI chrome, audits, linkage, etc.) — many already have open companion PRs (`#3127/#3128/#3133/#3140/#3143/#3144/#3145/#3146/…`).  

**Accounting drain = NOT COMPLETE for the full 63-pending pile.**  
**Accounting NEEDS-OWNER residual handoff from Wave 4 = COMPLETE (8/8).**

## Discipline

- Docs-only in this PR. Builder **does not merge**.
- No schema / CoA seed / PUBLIC grants / package.json / CI workflow edits.
- UNVERIFIED this wave: live Render `USMCA_ACTIVE` value; live Neon re-read of `mdata_vendor_id` column presence (held mig — builder does not Neon-apply).
