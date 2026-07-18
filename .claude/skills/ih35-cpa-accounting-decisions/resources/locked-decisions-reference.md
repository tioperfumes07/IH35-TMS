# IH35-TMS locked accounting decisions — quick reference card

Settled by owner + CPA. Build to these; do not re-derive. `✗ agent` = an agent must never do this (owner/CPA hand).
Sanitized card only — no names, signatures, addresses, emails, personal-guaranty text, or executed-agreement text.

| # | Decision | Locked value | Notes |
|---|----------|--------------|-------|
| Architecture | Books model | **Parallel double-books**, clone-once + reconcile-only, **no write-back** | Historical SoR: **QBO through 12/31/2025**; **TMS ledger authority from 2026-01-01** |
| Architecture | Operational mode | Dual-run validation: QBO actively maintained as comparison/filing book; TMS independent; reconcile-only | Does **not** authorize TMS→QBO write-back; see `TMS-QBO-PARALLEL-BOOKS.md` |
| Architecture | Kill-switches | **IMPORT-P0** / **IMPORT-P0b** → `QBO_JE_PUSH_ENABLED` / `QBO_ENTITY_PUSH_ENABLED` **default OFF** | Per-entity; ✗ agent flips |
| Opening | Cutover | TMS opens **01-01-2025**; opening = QBO **BS 12/31/2024**, **signed-actual** | BS-only; TRK full equity |
| Opening | OBE | OBE → **Retained Earnings** temp clearing; permanent OBE = **defect** (≈0) | |
| Opening | Timing | **DEFERRED until Martin finalizes 2024 close** (moving target) | clone-as-is-then-adjust; ✗ agent posts |
| Opening | Ch.11 line | **ASC 470-60 debt restructuring — NOT ASC 852 fresh-start accounting**; OB **03/31/2026**; live parallel **04/01/2026** | Operating/GL line — does not erase §1 SoR dates |
| Opening | Currency | **USD home**; MXN via FX gain/loss (ASC 830) | |
| Factoring | Treatment | **Secured borrowing / recourse** (NOT a sale); Substance-over-form | A/R remains pledged collateral; funding credits Factoring Advance; **no A/R derecognition** |
| Factoring | Faro terms | **$1,000,000** revolving; fees **1.5% / 2% of Net at funding**; reserve **1.5%**; Purchase Price = Net − Fee − Reserve; proceeds = Purchase Price − transaction/wire fees; **30d+5d**; repurchase **95d**; default **0.067%/day compounded beginning after day 35** | Factor statements authoritative |
| Drivers | Class | Mexican **B1** (not W-2/owner-op); **W-8BEN yearly** | "Cost of Labor–Mexico Drivers" |
| Drivers | Pay | **5% net floor** + per-event override; deductions bucketed, no auto-cap | net-pay clearing acct |
| Drivers | Balances | Cash Advance = **asset**; **Escrow = liability** (held-in-trust, 60–90d) | Additive **Driver Damage Loss** |
| Basis | Dual-basis | **TMS ACCRUAL** at canonical load delivery; QBO **cash-basis** mirroring unchanged in QBO-SoR window | Delivery does **not** redefine cash recognition |
| Revenue | Recognition | **Canonical load delivery** = final active delivery stop completion/actual departure | `delivered_at` only if proven derived from that event; POD/invoice = **billing/factoring readiness** only |
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
