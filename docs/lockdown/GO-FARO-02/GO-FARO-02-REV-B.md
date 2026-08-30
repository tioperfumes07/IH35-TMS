# GO-FARO-02 REV B — SUPERSEDES REV A and GO-FARO-ASSIGNMENT-RATE-ENGINE-2026-08-30 § rate-engine-as-P0

**Canonical author note:** Claude REV B 2026-08-30 (read-only Neon). Cursor verified FAC-2026-00001 live + routes.ts:400.

## Corrections (do not re-ask)
- ASC 860 / secured borrowing: **LOCKED** (§8.6 + migration + poster + verify-factoring-treatment). A/R stays.
- Batch `0.95/0.025` defaults are submission-queue noise, **not** the GL P0. Withdrawn: "$6,426 unrecorded assets."
- Leave `factor.advance_rate` **0.9700**. Do not set 0.985.

## P0 — balanced-but-wrong reserve/fee
`factoring-advances.routes.ts:400`: `reserveAmount = invoiceTotal − advanceAmount` (= 3%) while `reserve_pct=1.5`; `factor_fee_cents` never written (INSERT omits it → 0).
Live FAC-2026-00001: reserve_amount_cents=5550, factor_fee_cents=0; cash still 179450 either way.
Poster live: USMCA FACTORING_GL_POSTING_ENABLED override TRUE.

Fix: reserve = round(total×reserve_pct/100); fee = round(total×factor_fee_pct/100); proceed per agreement; reverse FAC-2026-00001 under WORM; guard seeds writing factoring_eligible=false.

## Owner rule
Every USMCA customer → Faro by default; owner carves exceptions. Schema DEFAULT true; 22/31 false = test seeds. Guard seeds.

## Sequence
1 CC-1 reserve/fee fix + reverse FAC-2026-00001
2 CC-1 getFactorForCustomer void/active predicates
3 CC-1 create 26 from FARO-26-CUSTOMERS-TO-CREATE.csv (S E Mares fresh)
4 CC-1 assign every USMCA customer to 40b3690b… effective_from 2026-08-10
5 CC-2 proof 007: $350 → rsv $5.25 fee $5.25 cash $339.50
6 CC-2 FLS 008 cash $509.24 not $509.25
7 CC-2 full schedule rsv/fee 142613 cash 9210274
8 Owner: Trucking lease + CCG $45,512.57

Load files: docs/lockdown/GO-FARO-02/ + ~/Downloads/
