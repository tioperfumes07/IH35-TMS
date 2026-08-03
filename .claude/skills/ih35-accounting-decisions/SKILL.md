---
name: ih35-accounting-decisions
description: >-
  The OWNER-LOCKED accounting decisions for IH35-TMS — the parallel double-books architecture, the
  opening-balance basis and cutover, factoring-as-secured-borrowing, driver escrow = liability, cash-basis
  mirroring, revenue recognition, the A/R and A/P account mapping, and the twice-daily reconciliation. Load
  this before building, reviewing, or reasoning about ANYTHING in accounting/finance (opening balances, GL
  posting, factoring, driver settlements, reconciliation, QBO import) so these settled decisions are treated
  as non-negotiable context, never re-derived or re-litigated. These are OWNER rulings — THERE IS NO CPA; the
  owner is the sole financial-DECISION authority (treatment, mapping, when to turn a flag on). OWNER LAW
  (2026-08-03, FINAL): coders have FULL Neon access and merge on green, financial cluster included — the
  owner does not gate merges or flip flags by hand. Retained controls: an agent NEVER writes new GL-posting
  math solo (reuse the existing poster), NEVER enters the opening-balance figures (owner-entered), and NEVER
  moves money / submits to an EXTERNAL financial or factoring system.
---

# IH35-TMS — Locked accounting decisions (owner authority)

> **READ FIRST — two standing corrections that keep resurfacing. Verify live; do NOT re-ask the owner.**
> 1. **There is NO CPA.** The owner (Jorge) is the sole financial authority. Retire every `owner + CPA`,
>    `CPA sign-off`, `CPA tie-out`, `pending CPA`, `with your accountant` gate in this skill and every other
>    doc — the approval authority is the **owner, alone**.
> 2. **Revenue-recognition posting is already LIVE — it is NOT off, and the account already EXISTS.**
>    `REVENUE_RECOGNITION_POST_ENABLED` is **ON for TRANSP + USMCA** (per-entity overrides in
>    `lib.feature_flag_overrides`, set 2026-07-26; TRK OFF). The **Unbilled Revenue account EXISTS**
>    (TRANSP `1240`, USMCA `1150`) and the CoA roles are bound. The old "flag OFF / seed the account first /
>    flipping = runtime 500" wording is **FALSE against prod** — do not repeat it and do not create the
>    account (duplicate defect). Reading the global `default_enabled=false` and concluding "OFF" is a
>    masked-scope error — read `lib.feature_flag_overrides` PER ENTITY. Canonical live state:
>    `docs/trackers/VERIFIED-FINANCIAL-STATE-OF-RECORD-2026-08-01.md`.

These are **settled** by the **owner** (there is **NO CPA**). Do not re-derive or re-open them; build to them. When code disagrees
with a locked decision, the decision wins — fix the code. Bundled: `resources/locked-decisions-reference.md`
(a scannable decision card). Deeper: `docs/lockdown/00_LOCKED_DECISIONS.md`, `docs/specs/ACCOUNTING-ARCHITECTURE.md`,
`docs/specs/TMS-QBO-PARALLEL-BOOKS.md`, and the CPA Answers Integration
Phase 1 section in `docs/specs/IH35_UNIFIED_BLUEPRINT_ADDITIONS.md` (that doc's section name is literal —
the "no CPA" fact above still governs; the section is just where those answers were recorded).

## The one rule that governs all of this
**OWNER LAW (2026-08-03, FINAL — supersedes the old "owner's hand alone" wording): coders have FULL Neon
access and merge authority. A coder builds the poster, applies the migration, flips a money-posting flag
(after the owner's DECISION in chat to turn it on), and merges on green — themselves, with proof.** What
stays an agent-never, permanently: never write new GL-posting math solo (**reuse the existing poster**),
never enter the **opening-balance** figures (those stay owner-entered — a data-accuracy control, not a
merge gate), and never move money or submit to an EXTERNAL financial/factoring system (there is NO CPA —
the owner is the sole authority on *treatment* and *when*, not on *who clicks merge or flip*).

## 1. Architecture — PARALLEL double-books (not a sync)
Canonical **three-layer model** (must stay aligned with `TMS-QBO-PARALLEL-BOOKS.md`,
`ACCOUNTING-ARCHITECTURE.md`, and the reference card — do not collapse layers):

- **Layer 1 — Historical transaction authority (locked):** **QBO is system-of-record through 12/31/2025.**
  **TMS ledger authority from 2026-01-01.** These dates are the primary agent-loaded SoR control; they are
  **not** retired by Layer 3 dual-run wording or by QBO-PUSH ceremony language.
- **Layer 2 — Ch.11 operating / GL cutover:** opening balances as-of **03/31/2026**; live operating line from
  **04/01/2026** under **ASC 470-60 debt restructuring — NOT ASC 852 fresh-start accounting** (detail in §2).
- **Layer 3 — Ongoing validation mode:** QBO remains **actively maintained** as the parallel comparison /
  filing book; TMS runs **independently**; the connection is **clone-once + reconcile-only**. This mode does
  **not** authorize TMS→QBO write-back and does **not** retire Layer 1.
- **CLONE-ONCE + RECONCILE-ONLY. NO write-back to QBO.** JE/entity push sit behind **default-OFF** kill-switches
  (**IMPORT-P0** / **IMPORT-P0b** → `QBO_JE_PUSH_ENABLED` / `QBO_ENTITY_PUSH_ENABLED`, default OFF, per-entity).
  The blueprint's old "QBO AUTO-SYNC" is retired (auto-sync only — not Layer 1 SoR dates).
- Reconciliation is the daily correctness test (see §8), not a data pipeline.
- Canonical parallel-books entry: `docs/specs/TMS-QBO-PARALLEL-BOOKS.md`.

## 2. Opening balance + date layers (no contradiction with parallel-books)
Distinguish the same three locked layers — do not collapse them into one “cutover”:

1. **Layer 1 — Historical authority dates:** QBO SoR through **12/31/2025**; TMS ledger authority from
   **2026-01-01** (§1).
2. **Layer 2 — Ch.11 operating cutover line (ASC 470-60 debt restructuring — NOT ASC 852 fresh-start
   accounting)** (owner-final 2026-07-16): opening balances as-of **03/31/2026**; TMS live parallel posting
   from **04/01/2026** per entity after opening tie-out — see `docs/lockdown/00_LOCKED_DECISIONS.md` §8.9.
   This is the **internal GL-posting / operating** line — it does **not** erase Layer 1’s historical SoR
   dates and does **not** authorize TMS→QBO write-back.
3. **Layer 3 — Ongoing dual-run validation:** per `TMS-QBO-PARALLEL-BOOKS.md`, both books continue
   independently with twice-daily reconciliation; QBO stays **actively maintained** as the comparison/filing
   book (reconcile-only / no write-back).

Opening-balance mechanics:
- TMS parallel books **open 01-01-2025** → opening balance = QBO **Balance Sheet as of 12/31/2024**, **signed-actual**
  (not natural-side). TMS clones 2025-01-01 forward and runs in parallel while the §1 historical SoR boundary
  (QBO through 12/31/2025) remains the agent-loaded authority control.
- **BS-only opening.** TRK gets **full equity**. **OBE → Retained Earnings** as a temporary clearing account —
  a permanent Opening Balance Equity balance is a **defect** (must net ≈ 0).
- **The QBO source is a MOVING TARGET:** the internal accountant (Martin) is still cleaning/reconciling. The
  opening JE is **DEFERRED until Martin finalizes the 2024 close** — never snapshot an opening off unstable data.
  Approach = **clone-as-is-then-adjust**: clone the 12/31/2024 balances faithfully (so TMS ties to QBO), then
  book reclasses as **post-opening adjusting entries** (or let Martin fix them at source) so tie-out never breaks.
- Multicurrency: **USD home currency**; MXN via FX gain/loss + home-currency adjustment (ASC 830).

## 3. Factoring = secured borrowing / recourse (NOT a sale)
Faro (current) → RTS (planned). Book as: **Factoring Advance** (liability) / **Factoring Reserves** (short-term
asset) / **Factoring Recoursed Invoices**. ASC 860 control-test nuance applies; it is financing, not revenue.

**Sanitized Faro commercial terms (owner-verified; actual factor statements remain authoritative):**
- Revolving limit **$1,000,000**
- Tier 1 fee **1.5% of Net at funding**; Tier 2 fee **2% of Net at funding**
- Reserve **1.5%**
- **Purchase Price = Net − Fee − Reserve**
- **Proceeds = Purchase Price − transaction/wire fees**
- Term **30 days** + grace **5 days**
- Repurchase deadline **95 days**
- Default interest **0.067% per day, compounded daily, beginning after day 35**
- **A/R remains on IH35 books as pledged collateral**; funding credits **Factoring Advance** — **no A/R derecognition**
- Substance-over-form: even when a factoring contract is styled as a “sale,” GAAP treatment is secured borrowing
  with A/R retained and financing recognized as a liability — never as a sale of receivables.
- Do **not** store or echo names, signatures, addresses, emails, personal-guaranty text, or executed-agreement text
  in decision docs. Statement figures win when they differ from summary terms.

## 4. Drivers (Mexican B1 — not W-2, not owner-op)
- Tax form **W-8BEN**, renewed **yearly** (not W-9). "Cost of Labor–Mexico Drivers".
- **5% net-pay floor** (driver keeps ≥5% of gross) + per-event override. Deductions bucketed + per-event, no auto-cap.
- **Driver Cash Advance = asset**; **Driver Escrow = LIABILITY** (held-in-trust, returned 60–90d post-separation
  net of damage/late-fee/fine deductions). Additive CoA account **Driver Damage Loss** for write-offs (do not
  rename/delete any existing damage-loss account). Net-pay clearing account.

## 5. Revenue & basis (dual-basis crosswalk)
- **Cash-basis** mirrored from QBO for TRANSP (books + MOR by the 20th, excl. own-transfers). AP is the rare
  accrual exception.
- **TMS ACCRUAL recognition event** = **canonical load delivery**.
  - Operational definition (no guessing): **final active delivery stop completion / actual departure** is the
    source evidence.
  - A load-level `delivered_at` may be used **only** when the implementation proves it is derived from that
    same final-active-delivery-stop event.
- **Dual-basis crosswalk:** QBO **cash-basis** reporting/mirroring remains unchanged during the QBO-SoR window;
  delivery recognition does **not** redefine cash recognition.
- POD approval and invoice creation are **billing/factoring readiness** only — they do **not** move the
  accrual recognition event (stale “invoice-create recognition” wording is a defect).
- **Two-event latch (LOCKED — OWNER, 2026-07-19):** point-in-time at delivery is a **defensible practical simplification** of ASC 606 over-transit (`606-10-25-27`), **not the only correct method**. Event 1 earn at `delivered`/`delivered_pending_docs` → **DR Unbilled Revenue / CR Line-Haul Income**; Event 2 bill at `completed_docs_received` (POD) → **DR A/R / CR Unbilled Revenue** — never one combined POD+delivered gate; reversible if status reverts. **LIVE STATE (verified prod `br-fancy-credit-akjnd07a` 2026-08-01 — this SUPERSEDES the old "seed the account first / flag OFF / flipping = 500" wording, which is stale):** the Unbilled Revenue account EXISTS and is postable (TRANSP `1240`, USMCA `1150`; **TRK EXCLUDED**, `42000-LEASE`); the CoA roles (`unbilled_revenue`, `revenue_default`, `ar_control`) are bound + active for TRANSP + USMCA; and `REVENUE_RECOGNITION_POST_ENABLED` is **ON for TRANSP + USMCA** via `lib.feature_flag_overrides` (set 2026-07-26; TRK OFF) — the global `default_enabled=false` is irrelevant because the poster passes `operating_company_id` and `resolveFlagEnabled()` returns the per-entity override first. Do NOT re-create/seed the account (duplicate defect); do NOT call the flag OFF (read `lib.feature_flag_overrides` per entity). The latch is built + smoke-tested live (2026-07-30, load L-20260624-0083, $15,000, both JEs balanced). **OPEN DEFECT:** the latch fires on load STATUS and its only caller is the office endpoint (`dispatch/loads.routes.ts:1330`) which reads no `load_stops`; the driver capture path never calls it, so it can post an earn with no delivery evidence — fix in progress (poster fail-closed on missing final-active-delivery-stop `actual_departure_at` + wire the capture path). Entity scope: TRANSP live; USMCA live (Unbilled 1150 present); **TRK: EXCLUDED** (`42000-LEASE`). Materiality per-entity/configurable/**no permissive default** (single-correction AND cumulative-for-period). Maker/checker: automated = system/SOD-A-exempt; closed-period corrections = Owner/Admin/Accountant second-user, reject→void. Reconciliation: TMS delivery vs QBO invoice gap is a **KNOWN reconciling item** ("TMS unbilled revenue not yet in QBO"), never an error. Reporting: Unbilled Revenue report (earned-not-billed by load, aged, clearing to A/R) linked to `mdata.loads`. Boundary: multi-obligation/bundled → NetSuite-grade + SSP allocation; long lanes / material cutoff → revisit over-transit. Flag is per-entity (ON for TRANSP + USMCA, OFF for TRK — see LIVE STATE above); no QBO write-back. Full detail: `docs/specs/IH35_UNIFIED_BLUEPRINT_ADDITIONS.md` §18 "Revenue Recognition — Delivery Two-Event Latch (LOCKED — OWNER, 2026-07-19)".
- Uncategorized + daily cleanup remains the hygiene rule.

## 6. Chart of Accounts (additive structure — never delete/rename existing)
**Sales of Service** parent separates these children (additive):
- Line Haul
- Fuel Surcharge
- Accessorial Revenue → Detention, Layover, Lumper, TONU, Other

**Interest & Financing Expense** children (additive):
- Factoring Fees
- Factoring Default Interest
- Factoring Transaction/Wire Fees

**Also additive:** Driver Damage Loss.

**Verified CoA export facts (owner-local verification; snapshot for governance — not a live Neon claim):**
- **1,368** rows total · TRANSP **387** · TRK **947** · USMCA **34**
- **1,294** QBO-connected · **1,198** active
- **No** duplicate entity/account-number pairs
- **Zero** opening balances in the export

## 7. Account mapping
- **A/R = QBO-45, A/P = QBO-47** (the QBO-native A/R and A/P are turned off; TMS drives these).
- Receivables kept even when uncollectible-looking: e.g. the "Unauthorized Expenses" receivables (Ignacio,
  Anarely) are **receivables pursued in bankruptcy court — NOT written off, NOT reclassed to expense.**

## 8. Reconciliation (RECON-01) — the correctness spine
- Twice daily **Central**: AM bank count/sum **06:00 CT**, PM categorization diff **19:00 CT**.
- **Flag EVERY account-categorization divergence — no dollar threshold** (it's a correctness test, not
  materiality). Bank-txn match key = date + amount + normalized reference; each unmatched row = its own exception.
- **Read-only, NEVER auto-fixes.** Maker≠checker + written resolution note on every resolve. Runs behind
  `TMS_QBO_RECON_ENABLED` (default OFF), tables `accounting.recon_runs` / `recon_exceptions`.

## 9. Entities & tax
- `TRANSP` (operating carrier, QBO realm = "IH 35 Transportation LLC"), `TRK` (asset holder, owns/depreciates
  units — 5yr straight-line), `USMCA` (future; launches with **0 balances, TMS-only, isolated** July 2026).
- Entities maintain **separate entity books** with **reciprocal intercompany monitoring**.
- Retain existing **read-only consolidated reporting** additively for future reporting needs — never delete
  the consolidated surface; do not treat it as the books of record for a legal entity.
- **No sales tax on line-haul** — interstate/cross-border freight transportation is not TX-sales-taxable.
- Laredo tax entities; Ch.11 confirmed. Money posting flags flip after the **owner's DECISION in chat**
  ("turn it on") + Neon tie-out proof — the coder executes and proves it live (there is **NO CPA** — the
  owner is the sole authority on the accounting *treatment* and *timing decision*, not a merge/flip gate).

---
Cross-refs: [[accounting-architecture-parallel-clone-reconcile]], [[cpa-locked-decisions-2026-07-01]],
[[opening-balance-and-recon-decisions-2026-07-02]], [[driver-escrow-is-liability]],
[[finance-engine-decisions-locked]], [[expense-gl-cash-basis-decision]]. Build engines/design docs; reuse the
poster for any actual posting — never invent new GL math solo. Coders merge and apply on green (OWNER LAW 2026-08-03).
