# FH-5 — Bankruptcy Calculator / Modeler — Design Spec (gated build)

**Status:** Design / Docs only (no code, no DDL, no posting). **FINANCE block — the most complex and most sensitive.** Designed live with Jorge **and likely his bankruptcy counsel**; built gated; GUARD verifies; never auto-fired; never self-merged. Real legal/financial data — handle with care.
**Audience:** Jorge + bankruptcy counsel + GUARD + accountant.
**Date:** 2026-06-14
**Part of:** the **Finance Hub** (FH-1…FH-7), Bankruptcy tab. Reuses **FH-3** (amortization) for the reorganized schedules and **FH-1/loans** for the asset/debt list. **Build last.**
**Context (locked):** **TRANSP's Chapter 11 plan IS CONFIRMED** — the reorganized terms are **real, not hypothetical**.
**Grounds:** locked accounting principles (double-entry balances or fails; VOID ≠ DELETE; audit everything; money-adjacent gated). All amounts integer cents; rates exact decimals.

---

## 0. Executive summary

A tool to model the **confirmed Chapter 11 reorganization** and **track the plan vs actuals** going forward. Jorge selects all **loans + assets + debts**, enters the **reorganized** terms (new balances, new rates, new amortization schedules) per obligation, and gets two outputs:
1. **Ongoing TRACKER** — plan vs actuals as payments are made.
2. **BENEFIT ANALYSIS** — before-vs-after: old total obligation vs new, **interest saved**, **monthly-payment delta**.

**Posting decision — LOCKED (Jorge, 2026-06-14): POST TO BOOKS.** The confirmed Chapter 11 reorganized balances/rates **become the actual GL** — adjusted liability balances, new rates, new amortization schedules booked as real entries (not modeling-only). **Build BOTH:** (1) the **posting path** that books the confirmed-plan adjustments to the GL, AND (2) the **plan-vs-actual tracker + benefit-analysis** view on top. The posting is **deliberate, gated, GUARD-verified, preview-first, balance-or-fail, never auto-fired**, and the exact entries / effective date / fresh-start treatment are determined **WITH Jorge's accountant** — the software executes what the accountant specifies; it does not invent the bankruptcy accounting. See §2.

---

## 1. Inputs — the reorganization

- **Select obligations:** all loans (FH-3/loans), assets (FH-1), and other debts/claims (a debt list FH-5 introduces for non-loan claims).
- Per obligation, the **reorganized terms:** new principal/balance, new interest rate, new term, new payment, new first-payment date, new amortization schedule (built via **FH-3**'s engine from the new terms).
- Capture the **"before"** snapshot (current/pre-petition terms) alongside the **"after"** (plan terms) for the benefit analysis.
- Plan metadata: confirmation date, plan classes/tranches, treatment per class (sensitive — minimal, with counsel).

---

## 2. Posting model — LOCKED: POST TO BOOKS (build the posting path + the tracker on top)

**Decision (Jorge, 2026-06-14):** the confirmed reorganized balances/rates **POST TO THE BOOKS** — the reorganized numbers become the **actual GL**. Build **both**: the **posting path** AND the **tracker/benefit** view on top.

**The posting (per reorganized debt):**
- **Book the balance adjustment** old balance → new balance, and **re-rate / re-amortize** via FH-3 — **retain the pre-reorg schedule** (audited), the new schedule supersedes.
- The restatement JEs (e.g. Dr old liability / Cr new liability / Dr-or-Cr gain-or-loss on restructuring) and the **effective date** (plan confirmation / effective date) and any **fresh-start accounting** treatment are **determined WITH Jorge's accountant** in the design session. **The software executes what the accountant specifies — it does NOT invent the bankruptcy accounting.**
- Runs **once per confirmed adjustment**, with **preview**; **balance-or-fail**.

**Locked guardrails:** every GL posting here is **gated** (flag default OFF), **preview-first**, **balance-or-fail**, **GUARD-verified vs QuickBooks before it posts**, **audited**, and **never auto-fired**. VOID ≠ DELETE.

---

## 3. Output 1 — ongoing TRACKER (plan vs actuals)

- For each reorganized obligation: **planned** schedule (FH-3) vs **actual** payments posted → on-track / ahead / behind, remaining plan balance, next plan payment.
- Portfolio rollup: total planned vs total paid, % of plan complete, any missed plan payments (compliance signal — important in an active Ch. 11).
- Reads actual payments from the GL/amortization postings (FH-3); compares to the stored plan schedule.

---

## 4. Output 2 — BENEFIT ANALYSIS (before vs after)

- **Old total obligation** (Σ pre-petition balances + remaining interest) **vs new total obligation** (Σ plan balances + plan interest).
- **Interest saved** = old total interest − new total interest.
- **Monthly-payment delta** = old Σ monthly − new Σ monthly.
- Per-obligation and portfolio-level; payoff-date shift; a clear "the reorganization saved $X over the plan term" summary.
- Pure calculation from the before/after snapshots — no posting.

---

## 5. Data model (additions — each `is_active` + soft-delete + audit cols; sensitive — restrict access)

- **`bankruptcy.plans`** — case/plan header (entity = TRANSP, confirmation date, status), access-restricted.
- **`bankruptcy.obligations`** — one row per loan/asset-debt/claim in the plan: link to source (FH-3 loan / FH-1 asset / debt), **before** snapshot, **after** (plan) terms, plan class.
- **`bankruptcy.plan_schedules`** — the reorganized amortization (via FH-3 engine) per obligation.
- Link to the **posted restatement JE(s)** (posting is locked — §2) + the superseded pre-reorg amortization schedule.
- Flag `BANKRUPTCY_MODELER_ENABLED` default OFF; any posting behind a separate `BANKRUPTCY_POST_ADJUSTMENTS_ENABLED` default OFF. **Access-restricted** (sensitive legal data) — tie to the Roles & Permissions block. Tenant-scoped, RLS; new schema → grants per CLAUDE.md §15.

---

## 6. Sensitivity & access (important)

- Bankruptcy data is **legally sensitive** — restrict the whole tab to **Owner/Accountant** (per the Permissions block); audit every view/edit.
- Design **with Jorge + bankruptcy counsel**; counsel's plan numbers are the source of truth. The app **mirrors** the confirmed plan — it does not compute the legal terms.
- No external sharing/export without explicit action; treat exports as sensitive.

---

## 7. Open questions for Jorge (+ counsel)

- **(a)** ~~Posting model A/B/A+B?~~ **ANSWERED + LOCKED (2026-06-14): POST TO BOOKS** — build the posting path + the tracker on top (§2).
- **(b)** The exact restructuring JE treatment (gain/loss on debt restructuring), **effective date** (plan confirmation/effective date), and any **fresh-start accounting** — **accountant + counsel define**; the software executes their spec.
- **(c)** Which obligations are in scope — all loans/assets/debts, or a defined set of plan claims?
- **(d)** Who may see the Bankruptcy tab (Owner only? + Accountant?) — sensitivity level.
- **(e)** Source of "actuals" for the tracker — GL postings, or a separate plan-payment log?

---

## 8. Gated build sequence (build last; migrations need accept-edits + show-the-migration-first)

1. `bankruptcy.plans` + `obligations` + `plan_schedules` (access-restricted) — model the confirmed plan (before/after).
2. Reorganized **schedules via FH-3** engine.
3. **Benefit analysis** (pure calc — before vs after).
4. **Tracker** (plan vs actuals from GL/FH-3 postings).
5. **Posting path (LOCKED — post to books)** for confirmed adjustments behind `BANKRUPTCY_POST_ADJUSTMENTS_ENABLED` (default OFF): per-debt balance restatement (old→new) + re-rate/re-amortize via FH-3 (retain pre-reorg schedule) + preview + accountant-specified entries/effective-date/fresh-start + GUARD-verify-vs-QBO + balance-or-fail.

All money-path/sensitive; GUARD verifies; design session with Jorge **and counsel** before code.
