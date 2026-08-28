# IH35-TMS — ENTERPRISE + ACCOUNTING DECISIONS — LOCKED 2026-07-05 (committed)

> **SUPERSEDED-BY (tax / 1099 / withholding — 2026-07-26):** `docs/lockdown/OWNER-DECISIONS-FINAL-2026-07-26.md` **E1**.
> Canonical: no withholding from anyone (Mexico B1/B2 drivers, Mexican mechanics, all). W-8BEN on driver file AND in Legal. **No 1042-S/1099.** There is **no CPA** (`OPERATING-FACT-no-CPA-owner-decides`). Do not re-open BLOCK-24 filing, 30% NRA withholding, or “drivers = 1099-NEC” from this file.
>
> **SUPERSEDED-BY (opening / cutover dates in § OPENING BALANCES below):** `docs/lockdown/00_LOCKED_DECISIONS.md` **§8.9** (OB 03/31/2026 · live parallel 04/01/2026). The 01-01-2025 / 12/31/2024 lines in this file are historical.
>
> This file remains a **historical enterprise packet**. Any decision later reversed has a SUPERSEDED-BY line. Unmarked bullets may still be current — confirm against `00_LOCKED_DECISIONS.md` and OWNER-DECISIONS-FINAL before treating as NOW.

**Durable record so nothing is re-asked.** Mirrors auto-memory `enterprise-feature-decisions-2026-07-05`, `banking-split-and-linkage-design`. Companion: `docs/lockdown/00_LOCKED_DECISIONS.md`.

---

## OPENING BALANCES / OPEN DATE
> **SUPERSEDED-BY** `docs/lockdown/00_LOCKED_DECISIONS.md` **§8.9** (owner-final 2026-07-16): opening balances = QBO BS as of **03/31/2026**; TMS posts live in parallel from **04/01/2026**. Do not use the 01-01-2025 / 12/31/2024 lines below as NOW.

- System opens **01-01-2025**. Opening = **QuickBooks Balance Sheet 12/31/2024** (signed). *(historical — see SUPERSEDED-BY)*
- **TRANSP + TRK: IMPORT opening balances FROM QuickBooks** (agent pulls the BS via QBO — no owner hand-entry; still a financial ceremony: build importer, show Jorge, run on OK/Neon, never self-post prod).
- **USMCA = 0 on everything** at 01-01-2025 (no opening JE). *(historical open-date; USMCA still starts empty — confirm against §8.9 / current entity law)*

## A/P MIGRATION (AF-4)
- **YES** — import ~$1.18M A/P from QuickBooks (BS/AP as of cutover), AFTER opening balances land.

## BANK FEED (Plaid / CONN-1)
- **TRANSP already on Plaid — ~8 months of bank txns already imported.** Turn that data into **bills / expenses / bill-payments / loans** via the categorization + split module below.
- **TRK: one bank connection, needs Plaid connect** (Jorge supplies creds; agent never enters them).

## BANKING CATEGORIZATION + SPLIT (Jorge's design — build behind flag, HELD)
- **Linkage on every txn/line:** Vendor, **Driver** (mdata.drivers), **Unit** (mdata.units), **Trailer** (mdata.equipment), **Load/Trip** typeahead (mdata.loads). Dropdowns pull from real catalogs + inline "+ Add new ___".
- **QBO-style SPLIT popup:** default = 1 vendor / multi-category; a BUTTON switches to multi-vendor; each line = amount + category + vendor + optional driver/unit/trailer/load; lines must sum to total. Example: $1000 check → NAPA $200 + AutoZone $300 + Driver-1 advance $500.
- **AUTO-LINEAGE (not just tags):** a **driver cash-advance** line auto-creates (a) the advance **ASSET** (receivable, `driver_finance.driver_advance_accounts`) AND (b) the recovery **DEDUCTION** (`driver_finance.driver_settlement_deductions`, PAY-FIRST, editable 5% net-pay floor, load_id-direct if load-tied); full forward+reverse drill to the settlement that clears it. Unit/trailer→asset expense; load→expense FK'd to load; vendor→bill/expense. Reuse existing posters, no new GL math.

## ACCOUNTING FEATURE ANSWERS
- **Depreciation (BLOCK-01):** 5-yr straight-line, revenue equipment, GAAP books. (Engine already exists: `accounting.fixed_assets` + FIN-21 poster; only autopost cron + CCG loan-link remain — PR #2179. Open micro-q: trailer useful life, default 60mo.)
- **Driver escrow (BLOCK-02):** liability returned **≥90 days AFTER resign/fire/termination date**, net of deductions.
- **IFTA (BLOCK-03):** in-house; model AllwaysTrack/McLeod/Alvys; base on **TRIP = practical miles**, discount **personal-conveyance**; Mexico is NOT an IFTA jurisdiction (tracked for visibility only); quarterly; Jorge files. (v1 already ships: `ifta.quarterly_preparations` + wizard — extend additively, PR #2177.)
- **1099 + ALL tax docs (BLOCK-17/24):** ~~drivers = 1099-NEC~~ / ~~1042-S + 30% NRA withholding~~ / ~~OPEN COMPLIANCE QUESTION for Jorge/CPA~~ — **SUPERSEDED 2026-07-26 by OWNER-DECISIONS-FINAL E1.** No withholding from anyone. W-8BEN on file + Legal. **No 1042-S/1099.** BLOCK-24 annual vendor 1099 remains **PENDING/GATED** (tracker row 600) — nobody files from it; a dollar on that report is not a finding. Software still never e-files. There is no CPA to ask.
- **Factoring (CONN-2):** build **Faro** poster now (secured borrowing, ASC 860); Faro→RTS = later config swap. **CHAIN-06 (PR #2188) confirmed** CODER-34 (#1770, flag OFF) already implements the directive: **A/R closes only when the customer pays Faro**, never at funding.
- **1099/425c consolidation (STMT-3), Consolidation (BLOCK-25):** defer to the very end (BLOCK-25 needs all 3 entities live).
- **AF-8 payroll-bridge:** stays DEFERRED (1099, no QBO write-back). **AF-2 qbo-drift:** detect only, write stays OFF. **AF-7 money-controls:** OFF until owner tie-out.

## ⚠️ LATENT BUG TO FIX BEFORE FLIPPING FACTORING FLAG (CHAIN-06, PR #2188)
`postFactoringCustomerPaymentEvent`/`postFactoringChargebackEvent` relieve GL `ar_control` but do **NOT** update `accounting.invoices.amount_paid_cents`/`status`. When `FACTORING_GL_POSTING_ENABLED` flips ON, **AR-Aging (invoice subledger) will diverge from the GL.** Fix belongs in the flag-on block, before enabling.

> **STATUS 2026-07-21 — CODE FIXED + GUARDS WIRED (verify-steps 920–922); live money path still requires owner flag/ops proof.**
> Historical claim above described the pre-CONN-2 latent gap (PR #2188). Code now updates the invoice
> subledger via `applyCustomerPaymentSubledgerRelief` / `applyChargebackSubledgerRelief` in
> `apps/backend/src/accounting/factoring-posting/poster.service.ts`. Regression guards:
> `scripts/verify-chain-06-invoice-ar-chain-proof.mjs` (step 920),
> `scripts/verify-chain-06-ar-subledger-fix.mjs` (step 921),
> `scripts/verify-chain-06-factoring-ar-tieout.mjs` (step 922).
> **Not LIVE-VERIFIED with money** — `FACTORING_GL_POSTING_ENABLED` remains owner-gated; no claim of
> live customer-payment → AR-aging tie-out without owner flag/ops proof.
> Evidence map: PR #3121 (`docs/trackers/TOP10-BUILDER-EVIDENCE-2026-07-21.md`); design history:
> `docs/specs/qbo-parity/CHAIN-06-FACTORING-AR-TIEOUT-PROOF.md` §5.

## CONNECTORS / DEFER
- **Relay fuel (CONN-3):** real; API key SECRET → env `RELAY_API_KEY`, never committed; ingest built (PR #2181) with **24-month backfill** (`RELAY_FUEL_INGEST_BACKFILL_MONTHS`, monthly-chunked, idempotent). Fuel→expense posting is the held follow-up.
- **EDI (CONN-4):** defer to the very end (only if a customer requires it).
- **CHAIN-08 demo purge:** archive-not-delete, show Jorge the list first.

## OPERATIONAL (2nd batch)
- **DISP-WIZARD (edit-load):** quantity change ADDS an expense/deduction → **touches billing** (Tier-1).
- **DISP-WO (work-order modal):** financial when it creates a bill; WO bill uses the same expense format.
- **CHAIN-04 (bill-payment tie-out):** build (PR #2188 supplies the proof + Part-2b accept-bill design).
- **HOS:** fan out to dispatch/maintenance/wherever; show certified-ELD remaining-drive-time wherever connected; **certified ELD = single source of truth**.
- **VOID-VERIFY:** shared void/cancel/reverse layer everywhere (PR #2186 — Owner/Admin, reason-required, audited; `load` keeps its own dispatch maker/checker).
- **VENDOR-CUSTOMER-QBO-PARITY:** build (Option-B categorization = recommend + human-confirm). **FH-VERIFY / ENT-AUDIT:** verify + fold into DB-audit.

## USMCA LAUNCH
- Gated on **entity-independence completion** (142-table wall + P0-a + P2/P4 + guards). Then turn **EVERY function ON** (full carrier). Not a fixed calendar date.

## ENTITY INDEPENDENCE (the wall)
- One shared Neon DB, per-entity RLS walls. Every business table: opco/tenant_id uuid + FK org.companies + FORCE RLS + policy. Permanent guard `verify-entity-isolation` (live, #2173) — **142-table remediation backlog** burns down under it. `tenant_id` is valid entity-scoping (insurance/factoring already walled).
