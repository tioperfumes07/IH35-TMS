# GO-FARO-02 — Assignment empty + rate engine defaults (2026-08-30)

**Lane:** CC-1 (money) · **Entity:** USMCA only · **Skip:** #15546 / #16895 · Never recertify U14

## Owner rulings (ANSWERED = CLOSED)

1. **Every customer factors by default.** Carve-outs are owner-updated one-offs later — do not invent a non-factor path.
2. **Factoring = secured borrowing (recourse), not a sale** — `docs/lockdown/00_LOCKED_DECISIONS.md` §8.6. Full-recourse Faro (95 days) → **AR stays on USMCA books**; liability to Faro ≈ NFE. Coders must **not** derecognize AR on factor. Do **not** re-ask Jorge for ASC 860 treatment.
3. **Create Faro debtors fresh** from the Faro CSV (exact legal names). **Never merge** `Semares Forwarding Services` (TMS test) with Faro `S E Mares Forwarding Service LLC`.

## Why assign-tonight is impossible (verified live)

| Fact | Live |
|------|------|
| `factoring.customer_factor_assignment` | **0** rows (all companies) |
| USMCA `mdata.customers` | **31** — all coder TEST / SAMPLE artifacts (CC2-BATTERY, CC3 TEST, CODEX-AUDIT, P23-SMOKE, ZZ-SAMPLE, TIO PERFUMES, Semares…) |
| Real Faro debtors in TMS | **0** — nothing to assign yet |
| JE control (existence) | ~2218 (not a false empty) |

`getFactorForCustomer()` only resolves via `customer_factor_assignment` → empty ⇒ every batch `factor_id = NULL`, reserve preview null, mixed-factor guard vacuous.

## SUPERSEDES prior rate narrative (GO-FARO-01 §1)

**Wrong (prior):** `advance_rate 0.9700` vs statement 98.50% is the defect.  
**Right:** `0.9700` is correct (Faro net = 97.000000%). Statement "Advance %" 98.50 is purchase/escrow presentation, not the TMS net field.

**Real P0 — hardcoded defaults never overridden:**

```ts
// apps/backend/src/factoring/batch.service.ts createDraftBatch
const advanceRate = deps.advanceRate ?? 0.95;
const feeRate     = deps.feeRate     ?? 0.025;
```

Live callers (`batch.routes.ts`, `submission-queue.routes.ts`) pass **only `{ client }`**. Faro's stored 97% / 1.5% is never read.

| On $95,075 face | Code (95/2.5) | Faro actual | Error |
|-----------------|---------------|-------------|-------|
| Advance | $90,321.25 | $92,222.75 | under $1,901.50 |
| Fee | $2,376.88 | $1,426.13 | over $950.75 |

`reserve_rate` not in batch math → escrow $1,426.13 + cash reserve $5,000 invisible as assets. Wire fees ($120) not modeled. FLS $0.01 rounding class: Faro rounds escrow/discount per line; code does one 97% multiply.

Statement closes: Payments to You **$87,102.74** EXACT; NFE **$88,648.87** EXACT.

## Sequenced NOW (CC-1)

1. **FIX rate engine** — `createDraftBatch` / submit path MUST load active `factoring.factor` rates for the resolved factor (or fail closed if `factor_id` null). Guard: fail if defaults 0.95/0.025 used when factor row has 0.97/0.015. Selftest + LIVE PROOF on face $350 → net advance $339.50.
2. **CREATE 26 Faro customers** from certify CSV (exact names) · G1 `is_sample_data` false for real debtors · USMCA only · no Semares merge.
3. **ASSIGN all USMCA Faro debtors** (and thereafter every new customer defaults to Faro) → `customer_factor_assignment` non-zero.
4. **Faro digital bank account** + own GL (GO-FARO-01 §2) — reconcile to NFE $88,648.87.
5. **CREATE 33 invoices** from Faro CSV through app (audit trail) · each must post JE · prove secured-borrowing treatment (AR remains).
6. DEFECT-A cash debit remains in parallel — do not drop it.

## Cursor / other seats

- Cursor: bus + Faro digital account chrome if CC-1 owns GL; never invent sale/derecognition.
- CC-2/CC-3: do not create lookalike Semares; do not assign TEST customers as if they were Faro debtors.
- Writes: app path with audit — not ad-hoc Neon INSERTs for money objects.

## ACK

`CC-1 | ACK | GO-FARO-02 | SHA=<live> | NOW=rate-engine then create-26 then assign | GO`
