# Accounting drain — verify-then-build verdicts (2026-07-21)

Builder pass on the 8 verify-then-build accounting items. Rule 16: real fix where
buildable, else STALE-with-evidence or explicit DESIGN HOLD (never a silent defer).
**Builder does not merge and does not Neon-apply.** Cross-refs: skipped-because-already-open
set (#3129, #3127, #3128, #3132, #3133, #3116, #3120) untouched; #3123/#3124 untouched.

| # | Block | Verdict | Evidence / next |
|---|-------|---------|-----------------|
| 1 | a-05 / expenses / finance hub / cashflow | SKIP (STALE in #3132) | already adjudicated STALE in open PR #3132; no action |
| 2 | `0519-ri1-689-orphan-fk-columns` | **STALE (guard wired)** | see below |
| 3 | `0519-es1-58-unscoped-tables` | **FIXED → PR #3146** | new scope-inheritance CI guard (Rule-17) |
| 4 | `ledger-write-proof-operational-not-found` | **DESIGN HOLD** | Neon tie-out = owner/GUARD, not builder |
| 5 | `fh-unit-allocation-ui-view-missing` | **DESIGN HOLD** | needs aggregate read endpoint first |
| 6 | `global-column-resize-sort-parity-table-phase-a` | **FIXED → PR #3145** | Period Comparison list → ParityTable |
| 7 | `audit4-tax-return-automation` | **DESIGN HOLD** | routes are financial writes, owner-gated |
| 8 | `db249-index-optimization-3` | **SKIP (needs owner)** | index spec not in repo — do not guess |

---

## #2 — `0519-ri1-689-orphan-fk-columns` → STALE (the "wire the guard" ask is already done)

The audit note says the orphan-FK inventory guard is "built but not wired into any executed CI path."
**That is stale.** The guard is wired and executed:

- `scripts/verify-steps/126-verify-orphan-fk-inventory.mjs` runs `scripts/verify-orphan-fk-inventory.mjs`
  (self-test + inventory) and **throws on non-zero** (fail-closed via `_context.run`).
- Committed in `78f80c5b2 chore(ci): wire orphan guards via verify-steps (0519-ri1) (#2729)`.
- `scripts/verify-pre-commit.mjs` auto-discovers every `verify-steps/*.mjs` (line 32:
  `readdirSync(stepsDir).filter(f => f.endsWith(".mjs") && !f.startsWith("_")).sort()`), so
  step 126 executes on the same CI path as all other guards.

**Residual (owner-gated, NOT the guard-wiring ask):** the *real* FK additions
`accounting.bill_lines.bill_id → accounting.bills` and `accounting.bills.vendor_id → mdata.vendors`
remain deferred financial-cluster schema work (`db-integrity-hardening-0519`). The `bill_lines`
FK is now regression-tracked by the new guard in PR #3146; `bills.vendor_id`/`mdata_vendor_id` is
already staged in held migration `202607220000_bills_mdata_vendor_fk.sql`.

## #4 — `ledger-write-proof-operational-not-found` → DESIGN HOLD

The gap requires a **Neon-branch TB / BS / P&L tie-out proof** for the 5 operational posters (plus
`apps/backend/src/accounting/__proofs__/core-ledger-write-proof.spec.ts` and
`docs/proofs/CORE-LEDGER-WRITE-PROOF-operational.md`). A meaningful proof requires posting on a real
Neon branch and reading back balanced ledger totals with the RLS bypass — an **owner/GUARD**
deliverable per Rule 10/11. A builder cannot Neon-apply or read prod, so a proof file written now
would be an unverified scaffold (a "fake green" — forbidden by Rule 16). **Held for the GUARD lane:**
poster tie-out on a Neon branch → write the spec + proof doc from live evidence.

## #5 — `fh-unit-allocation-ui-view-missing` → DESIGN HOLD (needs backend aggregate first)

The data primitive **exists**: `accounting.bill_unit_allocation` is written by the bill poster
(`accounting/bills.routes.ts`), insurance dispersal, and WO AP posting, and read per-bill in
`bills.routes.ts`. But there is **no aggregate-by-unit read endpoint / api-client** anywhere. Building
the FH-7 read-only page now would either dead-end (no data source) or require inventing a query —
both forbidden. **Follow-up block (name it before dispatch):** add a read-only
`GET /api/v1/accounting/unit-allocations` aggregate (entity-scoped, RLS-verified) over
`accounting.bill_unit_allocation`, then the FH-7 page consumes it. Frontend-only work is not
independently shippable here.

## #7 — `audit4-tax-return-automation` → DESIGN HOLD (financial writes, owner-gated)

`apps/backend/src/accounting/sales-tax/sales-tax.routes.ts` (prepare / file / mark-paid) is built but
not imported in `apps/backend/src/index.ts`. The dispatch note said "mount routes **if non-financial
read path**." These are **financial write** endpoints (sales-tax return preparation, filing, and
mark-paid touch tax periods and posting) — **not** a read-only path. Mounting them is financial-cluster,
owner-gated (Rule 13): needs the CPA/financial-agent pass + posting-flag discipline + entity-scope
proof before it may be wired. **Held:** owner-gated mount PR with CPA review; builder does not mount
financial write routes.

## #8 — `db249-index-optimization-3` → SKIP (needs owner spec)

The audit note says "3 composite indexes as specified do not exist on any of the 3 tables … touches
`accounting.invoices` DDL." The **authoritative spec** (which 3 tables, and the exact composite
index column-sets) is **not present in the repo** — only the audit note references it. Authoring the
migration from the note alone would require guessing index columns (forbidden — Rule 0/16, and a wrong
index on `accounting.invoices` is financial-cluster DDL). **Needs owner/design to name the exact
indexes.** Once specified, it ships as an **additive, `DO NOT RUN ON PROD` held migration** registered
in `db/migrations/.held-migrations.json` (perf-only, no GL math), applied by the owner on Neon.

---

### Shipped this pass (real, unmerged)
- PR #3145 — `global-column-resize-sort-parity-table-phase-a`: Period Comparison → ParityTable.
- PR #3146 — `0519-es1-58-unscoped-tables`: child-line scope-inheritance CI guard.
