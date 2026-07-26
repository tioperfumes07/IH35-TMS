# SWEEP-C6 — guard-first (2026-07-25)

**BLOCK:** SWEEP-C6 · **LANE:** Cursor / HELD · **GATE:** guard PR may self-merge (no schema/money wire); fix wave = HELD

## Owner rulings locked
1. #3551 fine-GL → fold into C6 (+ SAF-B18). **Do NOT merge standalone.**
2. Ship C6 guard FIRST → then C2 → then C11.
3. #3526 ACCT-R-03 keep HELD (owner review).
4. Every block uses BLOCK-TEMPLATE-8-LAYER. No solo money-poster PRs until this guard is on main.

## What shipped (this PR)
| Artifact | Role |
|---|---|
| `scripts/verify-sweep-c6-money-insert-requires-je-poster.mjs` | Layer A money-table INSERT + Layer B planted anchors; poster accept-list; `C6-MONEY-JE-EXEMPT:` |
| `scripts/verify-sweep-c6-money-insert-requires-je-poster.baseline.json` | Shrink-only ratchet — **46** known gaps at first inventory |
| `scripts/verify-steps/1503-…` | Rule 17 wire |

Selftest: planted no-poster INSERT / parts-purchase / fine link-payment → FAIL; poster + exempt → PASS.

## Confirmed seeds in baseline
- `maintenance/parts-inventory.routes.ts::ANCHOR parts-purchase`
- `maintenance/warranty.routes.ts::ANCHOR warranty-reimburse`
- `safety/fines.routes.ts::ANCHOR fine-link-payment` (+ driver_liabilities INSERT)
- `maintenance/two-section-service.ts::INSERT` bills/expenses

## 8-layer acceptance (this guard-only block)
| Layer | Verdict |
|---|---|
| L1 | N/A — no schema |
| L2 | N/A — no poster wire yet (inventory only) |
| L3 | N/A — guard infra |
| L4 | N/A |
| L5 | N/A |
| L6 | N/A — alerting lands with fix wave |
| L7 | **PASS** — verify-step 1503 + selftest teeth |
| L8 | N/A — class OPEN until baseline → 0 |

## Next
1. Merge this guard to main.
2. C6 fix wave (HELD): wire seeds through existing poster; shrink baseline; fold #3551.
3. SWEEP-C2 guard-first, then C11.
4. No solo money-poster PRs meanwhile.
