# IH35-TMS locked accounting decisions — quick reference card

Settled by owner + CPA. Build to these; do not re-derive. `✗ agent` = an agent must never do this (owner/CPA hand).
Sanitized card only — no names, signatures, addresses, emails, personal-guaranty text, or executed-agreement text.

| # | Decision | Locked value | Notes |
|---|----------|--------------|-------|
| Architecture | Books model | **Parallel double-books**, clone-once + reconcile-only, **no write-back** | See `TMS-QBO-PARALLEL-BOOKS.md` |
| Opening | Cutover | TMS opens **01-01-2025**; opening = QBO **BS 12/31/2024**, **signed-actual** | BS-only; TRK full equity |
| Opening | OBE | OBE → **Retained Earnings** temp clearing; permanent OBE = **defect** (≈0) | |
| Opening | Timing | **DEFERRED until Martin finalizes 2024 close** (moving target) | clone-as-is-then-adjust; ✗ agent posts |
| Opening | Ch.11 line | OB as-of **03/31/2026**; live parallel from **04/01/2026** | §8.9 owner-final |
| Opening | Currency | **USD home**; MXN via FX gain/loss (ASC 830) | |
| Factoring | Treatment | **Secured borrowing / recourse** (NOT a sale) | Advance=liab, Reserves=asset, Recoursed Invoices; ASC 860 |
| Factoring | Faro terms | **$1,000,000** revolving; fees **1.5% / 2%**; reserve **1.5%**; **30d+5d**; repurchase **95d**; default **0.067%/day compounded** | Factor statements authoritative |
| Drivers | Class | Mexican **B1** (not W-2/owner-op); **W-8BEN yearly** | "Cost of Labor–Mexico Drivers" |
| Drivers | Pay | **5% net floor** + per-event override; deductions bucketed, no auto-cap | net-pay clearing acct |
| Drivers | Balances | Cash Advance = **asset**; **Escrow = liability** (held-in-trust, 60–90d) | Additive **Driver Damage Loss** |
| Basis | Method | **Cash-basis** mirrored from QBO (TRANSP); AP rare accrual exception | MOR by 20th, excl own-transfers |
| Revenue | Recognition | At **canonical load delivery** — **not** invoice creation | POD/invoice = **billing readiness** only |
| CoA | Sales of Service | Children: **Line Haul**, **Fuel Surcharge**, **Accessorial Revenue** (Detention, Layover, Lumper, TONU, Other) | Additive; no deletes/renames |
| CoA | Interest & Financing | Children: **Factoring Fees**, **Factoring Default Interest**, **Factoring Transaction/Wire Fees** | Additive |
| CoA | Export facts | **1,368** rows (TRANSP 387 / TRK 947 / USMCA 34); **1,294** QBO-connected; **1,198** active; no dup entity/acct#; **0** OB in export | Owner-local verification snapshot |
| Mapping | A/R / A/P | **A/R = QBO-45, A/P = QBO-47** (natives off) | |
| Mapping | Receivables | "Unauthorized Expenses" (Ignacio, Anarely) = **receivables, bankruptcy recovery** | NOT written off / reclassed |
| Recon | Cadence | **06:00 CT** (AM count/sum) + **19:00 CT** (PM categorization) | Central; UTC 12:00 / 01:00 |
| Recon | Rule | **Flag EVERY categorization divergence, no threshold**; read-only, no auto-fix | maker≠checker + note |
| Entities | Set | TRANSP (op), TRK (assets, 5yr SL deprec), USMCA (future, 0-bal, isolated) | Separate entity books |
| Entities | Intercompany | **Reciprocal intercompany monitoring** | Retain read-only consolidated reporting additively |
| Tax | Sales tax | **None on line-haul** (interstate freight exempt) | |
| Gating | Money flags | **All OFF** until CPA sign-off + Neon tie-out | ✗ agent flips |

**The hard line:** an agent builds read-only engines, design docs, and flag-OFF scaffolding — it **never** posts
an opening/financial entry to prod, moves money, writes GL-posting math solo, or flips a money flag. Those are
the owner's hand with CPA sign-off (constitution §1.4/§1.6).
