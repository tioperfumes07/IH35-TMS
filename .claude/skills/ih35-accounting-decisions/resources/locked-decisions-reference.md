# IH35-TMS locked accounting decisions — quick reference card

Settled by owner. Build to these; do not re-derive. `✗ agent` = a permanently-retained never (opening-balance
figures, new GL math, moving money externally) — NOT a merge/flip approval gate. **OWNER LAW (2026-08-03,
FINAL): coders have FULL Neon access and merge authority; a coder flips a posting flag themselves after the
owner's chat DECISION to turn it on, and proves it live — this is no longer "owner/CPA hand alone."**
Sanitized card only — no names, signatures, addresses, emails, personal-guaranty text, or executed-agreement text.

| # | Decision | Locked value | Notes |
|---|----------|--------------|-------|
| Architecture | Layer 1 — Historical SoR | **QBO through 12/31/2025**; **TMS ledger authority from 2026-01-01** | Not retired by Layer 3 or QBO-PUSH ceremony |
| Architecture | Layer 2 — Ch.11 cutover | **ASC 470-60 debt restructuring — NOT ASC 852 fresh-start accounting**; OB **03/31/2026**; live **04/01/2026** | Operating/GL line — does not erase Layer 1 |
| Architecture | Layer 3 — Dual-run validation | QBO **actively maintained** as comparison/filing book; TMS independent; **reconcile-only**; never TMS→QBO write-back | See `TMS-QBO-PARALLEL-BOOKS.md` three-layer model |
| Architecture | Books model | **Parallel double-books**, clone-once + reconcile-only, **no write-back** | Layers 1–3 concurrent |
| Architecture | Kill-switches | **IMPORT-P0** / **IMPORT-P0b** → `QBO_JE_PUSH_ENABLED` / `QBO_ENTITY_PUSH_ENABLED` **default OFF** | Per-entity; coder flips after owner's chat decision + proves live (OWNER LAW 2026-08-03) |
| Opening | Cutover | TMS opens **01-01-2025**; opening = QBO **BS 12/31/2024**, **signed-actual** | BS-only; TRK full equity |
| Opening | OBE | OBE → **Retained Earnings** temp clearing; permanent OBE = **defect** (≈0) | |
| Opening | Timing | **DEFERRED until Martin finalizes 2024 close** (moving target) | clone-as-is-then-adjust; ✗ agent posts |
| Opening | Currency | **USD home**; MXN via FX gain/loss (ASC 830) | |
| Factoring | Treatment | **Secured borrowing / recourse** (NOT a sale); Substance-over-form | A/R remains pledged collateral; funding credits Factoring Advance; **no A/R derecognition** |
| Factoring | Faro terms | **$1,000,000** revolving; fees **1.5% / 2% of Net at funding**; reserve **1.5%**; Purchase Price = Net − Fee − Reserve; proceeds = Purchase Price − transaction/wire fees; **30d+5d**; repurchase **95d**; default **0.067%/day compounded beginning after day 35** | Factor statements authoritative |
| Drivers | Class | Mexican **B1** (not W-2/owner-op); **W-8BEN yearly** | **E1 (2026-07-26):** no withholding; **No 1042-S/1099.** W-8BEN is on file + Legal. Do not treat 07-05 “1099-NEC” as current. |
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
| Gating | Money flags | **All OFF** until the owner's chat DECISION to turn one on + Neon tie-out proof | Coder flips + proves live |

**The hard line (OWNER LAW 2026-08-03 supersedes the old "owner's hand alone" wording):** a coder builds the
engines, applies migrations, and flips a flag itself once the owner has decided (in chat) to turn it on —
merging on green, with the 18-key evidence block as the safeguard, not an approval click. What stays a
permanent `✗ agent` never: entering the **opening-balance** figures (owner-entered), writing new GL-posting
math solo (reuse the poster), and moving money or submitting to an EXTERNAL financial/factoring system —
there is NO CPA; the owner is the sole authority on treatment and timing, not on who clicks merge.
