# DESIGN HOLD — 0007-pattern-5 split-brain escrow engines (2026-07-21)

**Status:** `[HOLD-FOR-JORGE]` — docs-only. No schema drop, no writer redirect, no Neon-apply.  
**Block:** `0007-pattern-5-split-brain-engines` (accounting pile / NEEDS-PROD → Neon-resolved).  
**Neon evidence:** `docs/trackers/NEEDS-PROD-NEON-VERDICTS-2026-07-21.md` §8 (merged via PR #3117).

## What Neon proved

| Fact | Evidence |
|---|---|
| Parallel escrow **schema** exists | `accounting.*` escrow tables **and** `driver_finance.*` escrow / ledger structures both present (`to_regclass`) |
| Live **data** divergence | **None** — both engines empty (0 posting rows); only seed `catalogs.escrow_types` (3 rows, 2026-05-13) |
| Risk window | **Open now** — first live escrow posting into the wrong store creates irreversible split-brain money |

## Law (do not invent)

- Driver escrow = **liability** (CPA skill / Architecture Blueprint).
- Canonical store must be **one** of: `accounting.escrow_*` **or** `driver_finance.escrow_*` — never both writers.
- Never delete the non-canonical tables; archive + redirect writers (Rule 07 / never-delete).
- CoA roles PRIMARY for any liability account binding; no new GL account invent.

## Owner questions (answer before any code)

1. Which schema is **canonical** for driver escrow postings going forward — `accounting.escrow_*` or `driver_finance.escrow_*`?
2. Confirm the non-canonical schema stays **read-only / archived** (routes that write it get redirected or fail-closed).
3. Confirm first live posting only after the chosen store has RLS + grants + CoA role (`escrow_liability` or locked role name) designated.

## Builder must not

- Drop either schema.
- Neon-apply a “pick winner” migration without `JORGE-APPROVED`.
- Seed invent escrow GL accounts.
- Claim STALE — the structural gap is real even with zero rows.

## Follow-up (named)

After owner answers Q1–Q3: financial-cluster PR — additive redirect + fail-closed on the non-canonical writer + Rule-17 guard that only one escrow posting engine is reachable.
