# Faro factoring — day-by-day reconciliation & re-date (Cursor, 2026-09-13)

Owner: *"close it identical. simple … i want the cash flow to render the same data day by day."*
USMCA only (`5c854333-6ea5-4faa-af31-67cb272fef80`), Neon `br-fancy-credit-akjnd07a`.

## What was wrong
All 63 USMCA factoring advances were batch-minted on the internal job dates (09/06 = 19, 09/07 = 32,
09/11 = 12) instead of Faro's real purchase dates, so nothing lined up day-by-day. Cash Flow buckets
factoring by `fa.advanced_at::date`; the Purchase Report buckets by `fa.submitted_at`.

## Source of truth
`docs/reconcile/faro_canonical_purchases.csv` — Faro's own exports, canonicalized. The `src` column
separates entities: `FARO-IH-35-Transportation-export-17.csv` (62 rows) is the **frozen Transportation
entity — out of USMCA scope**; the `export (NN).csv` rows (66) are the USMCA-era Faro purchases.
Matching a USMCA advance to a Transportation row via `inv==load` is a cross-entity trap (load-number
collision, different debtors) and is explicitly excluded.

## Matching (1:1 assignment — `scripts/ops/faro_reconcile_full.py`)
Each Faro USMCA row is consumed **at most once**. Exact `PO==load W.O.#` / `inv==Faro-seq` edges lock
first; the remaining same-debtor/same-amount advances then fill the *other* Faro rows of that group,
spreading them across their true distinct dates. Because every advance lands on a distinct Faro row,
the multiset of assigned (date, purchase) equals Faro's own → **daily totals identical by construction**.
(The earlier per-advance greedy let 6 Semares $4,900 loads all grab one 08/21 row — fixed.)

Result: **61 of 63 advances matched** to a Faro USMCA row; 66 Faro rows, 61 consumed.

## The re-date (owner-authorised: void → re-advance, clean GL, reversible)
`scripts/ops/cursor-2026-09-13-faro-daybyday-rebuild.mts` (through the REAL routes only):
- `status='advanced'` → `POST …/:id/void` (reverses funding JE, frees invoice) → `POST …/factoring-advances`
  (recreate, reserve 1.5 / fee 1.5, new FAC #) → `POST …/:new/advance {advanced_at: <Faro date>}` (re-posts JE)
  → `submitted_at := Faro date` (source-timestamp correction only; `submitted_at` has no JE).
- `status='submitted'` → `POST …/:id/advance {advanced_at: <Faro date>}` → `submitted_at := Faro date`.

**APPLIED 2026-09-13: re-dated = 59, fail = 0.** Live-verified — `advanced_at::date` now buckets
exactly as projected across 18 days (08/10 → 09/11), e.g. 08/28 = 8 / $26,900, 09/11 = 4 / $22,350,
total 59 / $187,890 purchase / $182,253.28 net.

## Residuals — OWNER / DATA decisions (NOT silently mis-dated)

### Amount gaps → invoice disputes (already opened, A/R kept open)
- **13581** Triple T — invoiced $4,900, Faro purchased $3,300 (inv 063, 09/11) → **$1,600 dispute**.
- **13586** Mode Transportation — invoiced $3,600, Faro purchased $3,300 (inv 066, 09/11) → **$300 dispute**.
Both advances left `submitted` (Faro purchased *less* than face; the advance base ≠ face until the
dispute resolves). Their 09/11 cash-flow contribution is therefore held out — 09/11 shows $6,600 less
than Faro until the owner resolves the disputes (edit the invoice down to $3,300, or a credit memo).

### Under-billings → owner edit-up (Faro purchased MORE than we invoiced)
- **13578** Refrigerx — invoiced $4,650, Faro purchased **$5,210** (inv 059 / WO 1013272-2, 09/08). +$560.
- **13589** Kirsch — invoiced $4,120, Faro purchased **$4,150** (inv 069, 09/11). +$30.
The invoice PATCH route is **draft-only** and does not accept `total_cents` (it is derived from line
items); these invoices are `sent`+factored, so raising them is an owner-level money workflow
(supplemental invoice or reverse-and-reissue), NOT a silent field edit. **Flagged for the owner.**
Once raised to the Faro amount they match inv 059 / 069 and can be advanced at 09/08 / 09/11.

### Faro purchased, no advance in our system ($8,000) — MISSING LOADS/INVOICES
- inv **013** Sethmar Transportation $4,900 (08/14)
- inv **061** Direct Connect Logistix $2,100 (09/10)
- inv **062** Tennessee Steel Haulers $1,000 (09/10)
Faro factored these but there is no matching USMCA load/invoice/advance. Cannot be fabricated —
**flagged for the owner** (either the loads were never entered, or exist under different numbers).
Until entered, our 08/14 is short $4,900 and 09/10 shows nothing vs Faro's $3,100.

## Files
- `scripts/ops/faro_reconcile_full.py` — 1:1 assignment reconciler (USMCA-scoped).
- `scripts/ops/cursor-2026-09-13-faro-daybyday-rebuild.mts` — void→re-advance re-date (dry-run default).
- `docs/reconcile/faro_reconcile_full.json` — per-advance match output (source of the rebuild).
