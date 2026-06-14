# FH-4 — Finance Calculator — Design Spec

**Status:** Design / Docs only (no code). **Pure calculation — NO posting, no GL, no money path.** Lighter governance than the posting blocks, but still part of the gated Finance Hub and GUARD-reviewed for math correctness.
**Audience:** Jorge + GUARD.
**Date:** 2026-06-14
**Part of:** the **Finance Hub** (FH-1…FH-7), Calculator tab. **Feeds FH-2** — "use these numbers to create the loan."
**Grounds:** the same amortization math as FH-3 (shared formula) + scenario modeling. All amounts integer cents; rates exact decimals.

---

## 0. Executive summary

A **model-before-you-commit** calculator inside the hub. Enter **price / down / rate / term** → get **monthly payment, total interest, payoff date, and an amortization preview**. **No posting whatsoever** — it never touches the GL. When Jorge likes a scenario, a **"Use these numbers in the Loan Wizard"** action pre-fills **FH-2**. Supports **scenario comparison** (two rate/term options side by side).

This is the safe, read-only front door to the financing flow: play with numbers freely, then commit deliberately through the gated FH-2.

---

## 1. Inputs & outputs

**Inputs:** purchase price · down payment · annual interest rate · term (months) · (optional) first-payment date · (optional) extra monthly principal.

**Outputs:**
- **Monthly payment** `A = P·i/(1−(1+i)^−n)` (P = price − down; i = rate/12; n = term); `i=0 → A = P/n`. Same formula as FH-3 (§1) — **one shared calculation module**, so the calculator and the real schedule never disagree.
- **Total interest** = `A·n − P` (or summed from the schedule when extra-principal shortens it).
- **Payoff date** = first-payment date + n months (earlier if extra principal).
- **Amortization preview** — the full per-period table (period #, payment, principal, interest, remaining balance) with the **final-payment residual** closing to zero (same as FH-3).

---

## 2. Scenario modeling

- Enter **two (or more) scenarios** — e.g. 6.9% / 60mo vs 5.9% / 72mo — and compare side by side: monthly payment, total interest, payoff date, total cost.
- Highlight the **delta** (Δ monthly, Δ total interest, Δ payoff). Pure display; nothing saved to the GL.
- Optional: save a scenario as a named draft (a lightweight, non-GL record) to revisit — `is_active` + audit cols if persisted; or keep it purely in-session (decide in session — §4 (a)).

---

## 3. Hand-off to FH-2

- A **"Create loan from this"** button passes the scenario's price / down / rate / term / first-payment to the **FH-2 Loan Wizard** preview. The wizard then does the real (gated, preview-first) creation.
- The calculator itself **creates nothing** — the boundary is explicit: calculator = math; FH-2 = the only thing that posts.

---

## 4. Open questions for Jorge

- **(a)** Persist named scenarios (so you can revisit/compare later), or purely in-session/ephemeral?
- **(b)** Beyond loans — also a **lease vs buy** comparator, or loans only for v1?
- **(c)** Show **APR** (incl. fees) in addition to the nominal rate?

---

## 5. Build sequence (low-risk — no posting)

1. Shared **amortization calculation module** (extract FH-3's math so calculator + schedule share it).
2. Calculator **UI** (inputs → outputs + amortization preview) — GUARD reviews the math.
3. **Scenario comparison** (N-up, deltas).
4. **"Create loan from this"** hand-off to FH-2.
5. (If chosen) persist named scenarios.

No GL, no money path. GUARD reviews the math against the FH-3 engine so the two never diverge.
