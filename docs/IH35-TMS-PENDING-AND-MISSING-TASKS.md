# IH35-TMS — Pending & Missing Tasks (true, live audit)

> **Verified 2026-06-27** against `origin/main`, Render live `/healthz`, `gh` PR data, and an
> owner-authorized **read-only** introspection of production Neon (`br-fancy-credit-akjnd07a`).
> Companion to `docs/IH35-TMS-ARCHITECTURE-AND-BLUEPRINT.md`.

## TL;DR — the real state of "what's left"

The platform is **built broadly and deeply** (619 live tables · 1,850 endpoints · 920 pages · all 23 modules
present). What remains is **not mostly new features** — it is:

1. **Activate + verify the financial flows on real data.** Live prod has **0 bills, 0 settlements, 0 fuel
   transactions, 1 invoice, 10 loads** — the money spine exists in code but is barely exercised, and the
   **GL posting feature-flags are OFF**. This is the dominant remaining work.
2. **The Tier-1 financial frontier (45 non-DONE "blocks")** — almost all financial, behind the owner+GUARD
   gate, led by the **AF-1 entity-COA** keystone.
3. **A few genuine UI stubs** (6 accounting QBO-parity shells + 3 ComingSoon routes).
4. **Doc/constitution drifts** to reconcile.

---

## 1. Financial GL posting — built but FLAGGED OFF (activate + verify)

These are coded and gated behind env flags that default **OFF**; turning them on is an owner decision and
each needs verification on real data. **None should be self-flipped.**

| Flag (default OFF) | What it gates | To go live |
|--------------------|---------------|-----------|
| `BILL_GL_POSTING_ENABLED` | Bill → GL auto-post | AF-1 first, then verify balanced JE on a real bill |
| `EXPENSE_GL_POSTING_ENABLED` | Expense → GL post | same gate chain |
| `VOID_ENFORCEMENT_ENABLED` | Void-everywhere enforcement | VOID-VERIFY block |
| `LUMPER_LIFECYCLE_ENABLED` | Lumper cash-advance → invoice/JE | lumper STEP-7 chain verify |
| `LEGAL_CONTRACTS_ENABLED` | Lease-to-own contract creator (`/legal/contracts`) | owner flips DB flag + Render env |
| `FINANCE_HUB_*_ENABLED` / `_POST_ENABLED` | Finance Hub amortization/loan/calculator + posting | FH-VERIFY block |
| `PERIODS_INIT_ENABLED` | Accounting-period initialization | owner gate |

> Operational (non-posting) flags mostly default **ON** and are live (QBO push handlers, fuel/Love's import,
> Plaid sync, geofence, etc.).

---

## 2. The 45 non-DONE blocks (from `reconcile:blocks`, 2026-06-27)

Counts: **DONE 422 · NEEDS-VERIFY 19 · PENDING 2 · PENDING (GATED) 24 → TOTAL non-DONE 45.**
💰 = financial (Tier-1, owner+GUARD gate, never self-merged).

### 2a. PENDING — non-financial (2) — the only non-financial builds left
| Block | State |
|-------|-------|
| `TBL-STANDARD-universal-table-sweep` | migrate remaining bespoke lists to the shared DataTable (surface 1, Insurance Policies, done) |
| `CASH-FLOW-MODULE` | the locked cash-flow **module** (sidebar #10) — verify/finish vs the locked spec |

### 2b. NEEDS-VERIFY — financial (19) — code exists, posting NEVER verified on prod
Each has a merged PR (low PR #s = built long ago) but only a weak title-match signal; they need **live
verification on real data**, not new building.
`AF-0-rebaseline` · `AF-1-entity-coa-fix` · `AF-2-qbo-drift` · `AF-3-account-registers` ·
`AF-4-ap-bills-migration` · `AF-5-stub-catalogs` · `AF-6-finance-hub` · `AF-7-money-controls` ·
`AF-8-payroll-bridge` · `block-37-qbo-sync-repair-pipeline` · `block-40-accounting-audit-trail` ·
`CHAIN-01-vendor-picker-fix` · `CHAIN-02-account-register-params` · `CHAIN-03-create-bill-gl-autopost` ·
`CHAIN-04-bill-payment-tieout` · `CHAIN-05-bank-feed-live-proof` · `CHAIN-06-invoice-ar-chain-proof` ·
`CHAIN-07-settlements-500-fix` · `STMT-1-balance-sheet-cash-flow`

### 2c. PENDING (GATED) — financial / locked (24)
**Enterprise/hardening 29-series (deep-verified, gated):** `BLOCK-01 DEPRECIATION` · `BLOCK-02 DRIVER-ESCROW`
· `BLOCK-03 IFTA` · `BLOCK-17 W2-1099` · `BLOCK-19 AUDIT-HASH` (tamper-evident hash chain — top trust gap)
· `BLOCK-24 1099-ANNUAL` · `BLOCK-25 CONSOLIDATION`.
**Forward financial specs (0 artifacts yet):** `CHAIN-08-transp-demo-data-purge` · `CONN-1-plaid-reconcile-commit`
· `CONN-2-factoring-faro` · `CONN-3-relay-internal-bank` · `CONN-4-edi-foundation` ·
`FH-VERIFY-finance-hub-modules` · `STMT-2-opening-balances` · `STMT-3-1099-425c-consolidation` ·
`VOID-VERIFY-void-everywhere`.
**Gated operational:** `DISP-WIZARD-edit-load-patch` · `DISP-WO-work-order-modal` · `ENT-AUDIT` ·
`HOS-FANOUT-03-08` · `HOS-MAP-driver-samsara-id` · `HOS-PRC-DATA-verbatim-clocks` · `HOS-PRC2-reader-swap` ·
`USMCA-LAUNCH-carrier` (July 2026).

> "Blocks" are **planned units of work**, not a code metric. 467 total is the project plan; the code itself
> is the §9 scale in the architecture doc.

---

## 3. The keystone gate sequence (do these in order)

1. **AF-1 — `catalogs.accounts` per-entity** (PR **#1528**, built + Neon-branch-tested, **HOLD**). This is
   the keystone: today `catalogs.accounts` is **global** (operating_company_id nullable, 2 global uniques),
   which violates entity independence. Every posting flag depends on AF-1 landing. → owner+GUARD ceremony →
   merge → prod-verify.
2. Then **AF-0/AF-2…AF-8** verify, **CHAIN-01…07** verify, **STMT-1/2/3**, then flip posting flags
   (`BILL_GL`, `EXPENSE_GL`) and verify on a real bill/invoice.
3. Then the 29-series financial hardening (depreciation, escrow, IFTA, 1099, **audit-hash chain**).

---

## 4. Genuine UI stubs (placeholder pages on main)

| Surface | Route | Status |
|---------|-------|--------|
| Integration transactions | `/accounting/integration-transactions` | QBO-parity shell |
| Receipts | `/accounting/receipts` | shell |
| Revenue recognition | `/accounting/revenue-recognition` | shell |
| Fixed assets | `/accounting/fixed-assets` | shell (Finance Hub overlaps) |
| Prepaid expenses | `/accounting/prepaid-expenses` | shell |
| My accountant | `/accounting/my-accountant` | shell |
| Recurring transactions | `/accounting/recurring-transactions` | ComingSoon |
| (legacy redirect) | `/safety/accidents-incidents` | → `/safety/accidents` |

Code debt markers (origin/main, excl tests): **58 TODO · 3 HACK · 10 @deprecated · 0 FIXME/NotImplemented.**

---

## 5. Open PRs (7)

| PR | Title | Disposition |
|----|-------|-------------|
| #1538 | docs: live Architecture & Blueprint (this audit) | merge on green |
| #1528 | **[HOLD — TIER 1] AF-1 entity-COA migration** | owner+GUARD ceremony; never auto-merge |
| #1500 | **[HOLD] factoring-packet ops surface** | financial; owner gate |
| #1438 | **[HOLD — TIER 1] Load-create persistence gap (design)** | design; owner gate |
| #1508 | [DRAFT] BLOCK-RELIABILITY-03 reconciliation drift report | draft |
| #1505 | [DRAFT] BLOCK-RELIABILITY-01 balanced-ledger guard | draft |
| #1503 | [DRAFT] BLOCK-RELIABILITY-05 event-spine | draft |

---

## 6. Doc / constitution drifts to reconcile (housekeeping)

1. **Sidebar count:** RESOLVED in #1544 — `00_LOCKED_DECISIONS.md §6.4` corrected to 28; `SIDEBAR_ITEM_IDS` (28) is the truth. `CLAUDE.md §7` is gitignored/local — corrected locally.
2. `CLAUDE.md §4` "no hazmat fields" vs `mdata.loads.hazmat_*` columns — owner to declare canonical.
3. `catalogs.accounts` global → per-entity is **AF-1** (gated).
4. `finance.*` stray objects vs canonical `accounting.*` — cleanup.
5. Prod migration ledger = **512** vs **508** files on `origin/main` — 4-migration delta to reconcile
   (baseline/system rows vs repo files).

---

## 7. Recommended next actions (priority order)

1. **Activate + verify the money spine on real data** — this is the true remaining work: run AF-1 ceremony,
   then flip `BILL_GL`/`EXPENSE_GL` posting and prove a real bill/invoice posts a balanced JE and reconciles
   to QBO. (Live prod has 0 bills / 0 settlements today.)
2. **Finish the 2 non-financial PENDING** (TBL-STANDARD sweep, CASH-FLOW-MODULE verify).
3. **Build the audit-hash chain** (BLOCK-19) — the top Chapter-11 trust gap.
4. **Reconcile the doc drifts** in §6 so the constitution matches reality.
5. **Decide the 6 accounting shells** — build or formally defer.

_Regenerate this list anytime with `npm run reconcile:blocks` + the live introspection in the architecture
doc's §12._
