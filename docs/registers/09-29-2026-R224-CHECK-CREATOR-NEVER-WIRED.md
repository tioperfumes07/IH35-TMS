# ROUND 224 — CHECK CREATOR WAS NEVER WIRED (Cursor)

Measured 2026-09-29T16:18Z · Neon `br-fancy-credit-akjnd07a` · USMCA · bypass_rls=lucia.

## Defect (Lead measured on main `2589200664`, restated)

`registerCheckRoutes` had **ZERO** named callers outside `accounting/checks/`.
`index.ts` only registered `registerSafetyBackgroundChecksRoutes` (a different module).
A defined-but-never-called registrar is invisible to tsc / most tests / CI greps.

FE `CheckDetailPage` / `CheckPrintPage` **were** already in `manifest.tsx` on tip —
the HTTP path was the hole. Autoload `default fp` was not an acceptable substitute for
an explicit `await registerCheckRoutes(app)` that audits can grep.

## Fix (this PR)

1. `accounting/index.ts` — ignore `checks.routes` from `@fastify/autoload` (cash-flow pattern).
2. `apps/backend/src/index.ts` — `import { registerCheckRoutes }` + `await registerCheckRoutes(app)`.
3. Guard `scripts/verify-check-routes-mounted.mjs` — asserts import+call in index.ts, autoload
   ignore, and both FE pages mounted at `/accounting/checks/:id` and `/accounting/checks/print`.

## BEFORE (live, pre AUTH-126 chain walk)

```
registry_count          = 4   (1001, 1002, 1003, 1004 — all status=voided)
check_expenses payment_type=check  = 5 (all status=void)
check_expenses LIVE     = 0
```

## THE THREE ALLOCATED NUMBERS (plus 1004 from AUTH-125)

| # | Registry | Expense | Purpose | Fate |
|---|---|---|---|---|
| **1001** | voided | `9b5fcc6c…` $1.00 | AUTH-117 R-191 G-16 live proof | Void same session — **seat TEST** |
| **1002** | voided | `a7671a67…` $1.00 | AUTH-120 R-197 allocator proof | Void same session — **seat TEST** |
| **1003** | voided | `7728cf89…` $1.00 | AUTH-122 R-206 print-path | Void same session — **seat TEST**; print_complete |
| **1004** | voided | `00e50ba8…` $1.00 | AUTH-125 R-222 full chain | Void same session — **seat TEST**; print_complete |

Never deleted. Numbers retained WORM.

## THE FOUR JUNK ROWS (+ AUTH-125 fifth)

| id | Amount | Plain speech |
|---|---|---|
| `9b5fcc6c…` | $1.00 #1001 | **Yes — seat test.** Voided AUTH-117/118. |
| `a7671a67…` | $1.00 #1002 | **Yes — seat test.** Voided AUTH-120. |
| `7728cf89…` | $1.00 #1003 | **Yes — seat test.** Voided AUTH-122. |
| `f9c5b0e4…` | $25.00 Smithfield | **Yes — seat/purge-era test.** Voided AUTH-124. Never numbered. |
| `00e50ba8…` | $1.00 #1004 | **Yes — seat test.** Voided AUTH-125. |

All violate standing "no seat fixtures in USMCA" law by having been written; all are voided
with reversing JEs. Void-not-delete. No live junk remains (`check_expenses_live = 0`).

## AFTER mount (code)

Guard PASS. HTTP registrar reachable from index.ts. FE routes stay mounted.

## AFTER chain (AUTH-126 — separate consume stamp after this PR merges)

Walk one real check: creator → registry → expense(payment_type=check, number set) → GL JE →
print_status → printed → void same session. Paste BEFORE/MID/AFTER in AUTH-126 CONSUMED.
