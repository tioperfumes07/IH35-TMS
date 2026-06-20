# HOLD-05 · CHAIN-07 — Settlements path 500 + GL tie-out

**Queue:** QUEUE 2 (HOLD / accumulate) · **Tier 1 (posting) + Tier 2 (the 500)**
**Tracker:** CHAIN-07 (row 1115)
**Status:** `[HOLD-FOR-JORGE — TIER 1]` — ONE PR for the whole thing (the 500-fix rides with the posting
tie-out so Jorge merges together with ceremony). **Do not merge. No flag flip. No live post.**
**Date:** 2026-06-18

> Design doc + draft proof (§1.4 / §1.7). The 500 part is non-financial but is *not* speculatively
> patched here — per §8, an unreproducible 500 is diagnosed, not guessed.

## Part A — the settlements 500 (diagnosis, not a guessed patch)
- The failing surface returns a **generic catch-all**: `settlement-payment.routes.ts:45` →
  `reply.code(500).send({ error: "settlement_payment_operation_failed", message })`. This wraps *any*
  underlying error, so the real cause is masked by the generic envelope.
- `settlement-engine.ts` is already **hardened against schema drift**: it `to_regclass`-checks
  `driver_finance.settlement_lines` and probes `information_schema` for columns before inserting — so the
  classic "table/column missing" 500 is already guarded there. The 500 is therefore likely **outside**
  those guards (the payment route), not in the line-builder.
- **Known landmines to check first** (from §4): `driver_finance.settlement_lines` has **no `load_id`**
  (a join on it 500s); the **RLS `UPDATE … RETURNING` soft-delete landmine** (a `RETURNING` on a row the
  SELECT policy then filters throws `42501`). Either fits a generic 500.
- **Safe, verifiable fix (non-financial):** make the route **surface the underlying error class** (it
  already passes `message`; also log/return the error `code`/`constraint` so the real cause is visible)
  — observability, not behavior change. Then reproduce against the failing request to confirm the exact
  cause before any real fix. **Do not** ship a behavior change to a 500 that can't be reproduced on the
  branch.

## Part B — settlement → GL tie-out (draft only)
Reuse: `driver_finance.settlement_lines` → `driver_finance.driver_settlements` (note: **no `load_id`**
on lines); escrow via `accounting.escrow_accounts` / `escrow_postings`; cash advances via
`driver-finance/cash-advance-requests`; poster = `posting-engine.service.ts`. Flag **OFF**.

Example weekly settlement: gross driver earnings **$2,000.00**, less escrow **$100.00**, less advance
recovery **$300.00** → net pay **$1,600.00**.
```
DRAFT JE — source: driver_finance.driver_settlements / <settlement_id>
  Dr  6xxx Driver Pay / Settlement expense       $2,000.00
  Cr  2xxx Driver Escrow liability (escrow line)   $100.00
  Cr  1xxx Advance receivable (recovery)           $300.00
  Cr  1010 Operating Bank (net pay)              $1,600.00
                                                 ----------
       Σ Dr = $2,000.00   Σ Cr = $2,000.00  → BALANCED ✔
```
**Tie-out assertions (dry-run, no live post):** net pay (Cr bank) == settlement net; escrow Cr ==
escrow deductions on the settlement; advance Cr reduces the driver's advance receivable by exactly the
recovered amount; Σ Dr = Σ Cr to the cent.

## Gated for Jorge
The exact GL accounts (driver-pay expense, escrow liability, advance receivable) per the CoA · the
settlement-posting flag (OFF) · authorize wiring → staging dry-run → flag ON · the 500 fix only after the
real error is reproduced and identified.

## Guardrails
Reuse engine + settlement infra · no new GL math · flag OFF · no live post · no migration · the 500 fix
is observability-only until reproduced · `[HOLD-FOR-JORGE — TIER 1]`, one PR, never merged.
