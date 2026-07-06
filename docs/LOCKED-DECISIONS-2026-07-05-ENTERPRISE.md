# IH35-TMS — ENTERPRISE + ACCOUNTING DECISIONS — LOCKED 2026-07-05 (committed)

**Durable record so nothing is re-asked.** Mirrors auto-memory `enterprise-feature-decisions-2026-07-05`, `banking-split-and-linkage-design`. Companion: `docs/lockdown/00_LOCKED_DECISIONS.md`, `LOCKED-DECISIONS-2026-07-05-EVENING.md`.

---

## OPENING BALANCES / OPEN DATE
- System opens **01-01-2025**. Opening = **QuickBooks Balance Sheet 12/31/2024** (signed).
- **TRANSP + TRK: IMPORT opening balances FROM QuickBooks** (agent pulls the BS via QBO — no owner hand-entry; still a financial ceremony: build importer, show Jorge, run on OK/Neon, never self-post prod).
- **USMCA = 0 on everything** at 01-01-2025 (no opening JE).

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
- **1099 + ALL tax docs (BLOCK-17/24):** drivers = 1099-NEC; build in-house per **IRS + US Treasury**; **Jorge/company transmits** (software never e-files); **every tax doc = PDF** for archive + mail + email. **Foreign-status caveat (from PR #2178):** a Mexican-B1 W-8BEN driver performing services in the US generally needs **1042-S + 30% NRA withholding**, not 1099-NEC — OPEN COMPLIANCE QUESTION for Jorge/CPA: is 30% withholding currently being done?
- **Factoring (CONN-2):** build **Faro** poster now (secured borrowing, ASC 860); Faro→RTS = later config swap. **CHAIN-06 (PR #2188) confirmed** CODER-34 (#1770, flag OFF) already implements the directive: **A/R closes only when the customer pays Faro**, never at funding.
- **1099/425c consolidation (STMT-3), Consolidation (BLOCK-25):** defer to the very end (BLOCK-25 needs all 3 entities live).
- **AF-8 payroll-bridge:** stays DEFERRED (1099, no QBO write-back). **AF-2 qbo-drift:** detect only, write stays OFF. **AF-7 money-controls:** OFF until CPA tie-out.

## ⚠️ LATENT BUG TO FIX BEFORE FLIPPING FACTORING FLAG (CHAIN-06, PR #2188)
`postFactoringCustomerPaymentEvent`/`postFactoringChargebackEvent` relieve GL `ar_control` but do **NOT** update `accounting.invoices.amount_paid_cents`/`status`. When `FACTORING_GL_POSTING_ENABLED` flips ON, **AR-Aging (invoice subledger) will diverge from the GL.** Fix belongs in the flag-on block, before enabling.

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
