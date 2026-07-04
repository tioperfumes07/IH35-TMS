# Opening-Balance Tie-Out Ceremony — TRANSP (prep 2026-07-04)

**Status: PREP / HOLD-FOR-JORGE.** This is the reviewable runbook that converts the ~37 GL/posting
gated blocks into one ceremony. **Nothing here is executed** — the opening JE is owner-entered and
the flag flips are owner-approved (CLAUDE.md §1.4). This doc = the diff + the sequence, staged for
Jorge's go.

## 1. The anchor — live QBO Balance Sheet, IH35 Transportation, as of 12/31/2024 (accrual, signed-actual)

| Section | QBO amount (signed-actual) |
|---|---|
| **Total Assets** | **−$8,295,183.95** |
| — Bank Accounts | $911,923.22 (17 accounts; incl. PNC-2954 $1,629,264.65, IBC-5231 $347,613.28, IBC-AHORROS −$438,691.43, Faro Reserves −$129,846.74, RTS Reserves −$449,259.01) |
| — Accounts Receivable | −$538,278.66 (native A/R −$961,983.52 **+ 2 misclassified "Unauthorized Expenses"**: Anarely Alcazar $73,253.48 + Ignacio Muñoz $350,451.38 = **$423,704.86**) |
| — Other Current Assets | −$8,668,828.51 (dominated by **RTS FINANCIAL-VIRTUAL ACCT −$8,528,357.32**; Loans to IH35 Trucking −$135,242.27) |
| **Total Liabilities** | **−$332,957.80** (A/P −$290,120.05; Amex CC $5,000; owner/RTS loans −$41,261.66; IB Credit Line −$6,576.09) |
| **Total Equity** | **−$7,962,226.15** (Retained Earnings −$8,384,939.37; Net Income $422,713.22; OBE $0) |

Accounting equation holds: Assets −8,295,183.95 = Liabilities −332,957.80 + Equity −7,962,226.15. ✓

## 2. The other side — TMS TRANSP current state (prod, read-only 2026-07-04)

- **Chart of accounts: 208 active accounts, 198 QBO-linked (95%).** All key opening accounts exist
  in TMS (RTS-Virtual, RTS/Faro Reserves, both Unauthorized-Expenses, Retained Earnings, OBE, A/R, A/P, Amex).
- **The 10 non-QBO-linked accounts are intentional** — TMS-native parallel-books accounts with no QBO
  counterpart (Factoring Advance/Reserves/Recoursed Invoices/Default Interest/Fees, A/R-Assigned-to-Faro,
  Cash-Operating, Fuel Expense, Freight Revenue, Interest & Financing Expense). These are *targets* for
  factoring reclass, not coverage gaps.
- **Opening balances loaded: ZERO.** `accounting.journal_entries` has only 2 stray test JEs (2026-05-19);
  no opening JE. `catalogs.accounts.opening_balance_cents` is null/0 on every account (sum = $0.00).
- **All 11 posting flags OFF** (default_enabled=false, rollout_pct=0): `*_GL_POSTING_ENABLED` ×9
  (GL/AMORTIZATION/BANK_FEED/BILL/BILL_PAYMENT/EXPENSE/FACTORING/INVOICE_AR/LEASE/SETTLEMENT),
  `QBO_JE_PUSH_ENABLED`, `QBO_ENTITY_PUSH_ENABLED`.

**⇒ The gap is total.** This is a *load-then-verify*, not a reconcile of two populated sides.

## 3. The ceremony sequence (each step owner-gated)

1. **Link the last QBO-native accounts** if any BS line lacks a `qbo_account_id` target (spot-check: all
   §1 accounts are present + linked; no action expected).
2. **Owner posts the opening JE** (IMPORT-2/3/4, Tier-1 — *owner-entered, agent never posts*):
   - One JE dated **2025-01-01**, **signed-actual** (not natural-side), one line per QBO BS leaf account → its
     `catalogs.accounts` mirror by `qbo_account_id`.
   - Balance the entry through **OBE → Retained Earnings** temp-clearing (BS-only opening; OBE nets to 0).
   - **Keep the 2 "Unauthorized Expenses" as-is under A/R** (provisional — embezzlement reclass pending CPA;
     opening must be re-runnable/adjustable, void-not-delete).
   - Multicurrency: home-ccy + FX accounts where QBO carries foreign balances.
3. **Tie out** — assert TMS trial balance as of 2025-01-01 == QBO 12/31/2024, **leaf-level, signed,
   void-excluded, UNION of native + mirror**. RECON-00/01 flags any divergence (no threshold).
4. **Flip the 11 posting flags** per-entity for TRANSP only (admin-UI DEFAULT + Render env, double-gated
   per finance-screen-flag-enablement) — enabling live GL posting going forward. QBO push stays OFF
   (parallel books; IMPORT-P0b kill-switch).

## 4. Staged flag-flip (DRAFT — do NOT apply until §3 tie-out is green)

Per-entity override is the ONLY enable path (per-entity-only infra). For TRANSP
(`91e0bf0a-133f-4ce8-a734-2586cfa66d96`), after tie-out:

```sql
-- DRAFT / HELD. Flip GL posting flags for TRANSP only. QBO_*_PUSH stay OFF (parallel books).
-- Owner runs this ONLY after the opening JE ties out to QBO 12/31/2024 (§3).
-- (illustrative — real flip is per-entity override rows, not default_enabled, via the admin surface.)
-- GL_POSTING flags to enable: GL, AMORTIZATION, BANK_FEED, BILL, BILL_PAYMENT, EXPENSE,
--   FACTORING, INVOICE_AR, LEASE, SETTLEMENT  (10 posting flags)
-- LEAVE OFF: QBO_JE_PUSH_ENABLED, QBO_ENTITY_PUSH_ENABLED.
```

## 5. Open questions for Jorge (block the ceremony until answered)

1. **Opening mechanism** — post as an **opening JE** in `accounting.journal_entries` (per IMPORT design),
   or set **`catalogs.accounts.opening_balance_cents`** per account (the column exists)? These are two
   different mechanisms; pick one canonical. *(Recommend: opening JE — auditable, void-not-delete, matches
   IMPORT-2/3/4.)*
2. **Unauthorized Expenses** — load at QBO's misclassified position (under A/R) and reclass later, or
   reclass at load? *(Recommend: load as-is; reclass is a separate CPA-signed JE — keeps opening = QBO SoR.)*
3. **RTS-Virtual −$8.53M** — confirm it loads as a single opening line (it's the factoring virtual account,
   the bulk of assets).
4. **Flip scope** — all 10 GL posting flags at once after tie-out, or staged (e.g. INVOICE_AR + BILL first)?

**Next:** on your answers to §5, I build the draft opening JE (every line, signed-actual, balancing) as a
reviewable SQL artifact + the exact per-entity flip rows — still owner-executed. I do not post or flip.
