# HOLD · Fuel GL flush dead — expense map codes not designated

**BLOCK:** `LAW-§9-FUEL-GL-FLUSH` · from audit PR #3177 / `LAW-E2E-FUEL-LINKAGE-2026-07-21`  
**MODULE:** fuel / accounting  
**Status:** `[HOLD-FOR-JORGE — TIER 1]` — **do not merge money code. no Neon-apply. no fake-post.**  
**BASE:** `origin/main` @ `e64fc4c` (deploy health `version=e64fc4c`)  
**Date:** 2026-07-21  
**Worktree:** `/private/tmp/ih35-law-fix-fuel-gl-*`

> Owner Law §9 + Rule 16: diagnose root cause; if blocked on owner CoA designate, ship a fail-honest HOLD — never invent GL accounts, never silently alias, never Neon-apply from Cursor.

---

## Verdict

**HOLD (option B)** — not a missing caller / ignored flag / wrong table. Repo wiring is live; Neon data vocabulary does not match the poster. Fix requires **owner designate** of expense-category map rows (or an explicit owner decision to alias), then a gated re-flush. Cursor will not invent accounts or fake-post.

---

## ROOT CAUSE (one sentence)

`postFuelExpenseFromEvent` resolves debit via `resolveAccountForCategory(opco, "fuel", fuelKind)` where `fuelKind ∈ {diesel,def,reefer,oil,misc}`, but prod `accounting.expense_category_account_map` only has `category_kind='fuel'` + **`category_code='fuel'`** (TRANSP 6100 Fuel Expense; TRK similar) — so every after-commit flush throws `EXPENSE_CATEGORY_MAP_NOT_FOUND`, `flushFuelGlPostsAfterCommit` logs and continues, and `posted_to_gl` / `fuel_event` batches stay at **0**.

---

## What is NOT the cause

| Hypothesis | Evidence against |
|---|---|
| Flag ignored / OFF | `EXPENSE_GL_POSTING_ENABLED` per-entity overrides **ON** for TRANSP/TRK/USMCA (set_at Jul 4–11). Fuel gate reuses this key. |
| Zero callers / unwired poster | Cron/CSV/import call `flushFuelGlPostsAfterCommit` → `maybePostFuelExpenseFromCanonicalTxn` → `postFuelExpenseFromEvent` (guard `verify-fuel-gl-poster-callers`). |
| Wrong / empty CoA cash credit | TRANSP has UndepositedFunds=1 + cash_like=23; credit path can resolve without inventing accounts. |
| Amounts zero | Relay ingest converts dollars→cents; candidates require `amount_cents > 0`. |
| Ingest never ran after flag ON | TRANSP relay rows through **2026-07-20**; daily cron only for RELAY_FUEL_INGEST ON (TRANSP). New upserts still queue GL candidates. |

---

## Live evidence (Neon `br-fancy-credit-akjnd07a`, same txn `app.bypass_rls='lucia'`)

| Metric | Value |
|---|---:|
| `integrations.relay_fuel_transactions` (TRANSP) | **1499** |
| `posted_to_gl = true` | **0** |
| `posting_batches` `source_transaction_type='fuel_event'` | **0** |
| Active fuel maps | TRANSP: `code=fuel` → **6100 Fuel Expense**; TRK: `code=fuel` → TRK-6100; **USMCA: none** |
| Maps for `diesel` / `def` / `reefer` / `oil` / `misc` | **0** |
| `RELAY_FUEL_INGEST_ENABLED` | TRANSP ON; TRK/USMCA OFF |

Repo vocabulary (must stay locked — do not silently widen):

- Poster: `FUEL_CATEGORY_CODES = diesel|def|reefer|oil|misc` — `apps/backend/src/accounting/fuel-posting/poster.service.ts`
- Coverage UI: same list — `apps/frontend/src/pages/fuel/components/FuelGlMappingCoverage.tsx`
- Free-text Expense Category Map UI allowed operators to save `category_code='fuel'`, which **does not** satisfy the poster.

---

## Fail-closed contract (no fake-post)

1. **Reuse** existing `resolveAccountForCategory` + `postFuelExpenseFromEvent` + CoA role/cash credit resolver. **Write no new GL math.**
2. **Do not** invent accounts, seed 6100 under diesel without owner OK, or alias `diesel`→`fuel` in code without an explicit Jorge decision in writing.
3. When a required code is missing → **FAIL CLOSED** with `EXPENSE_CATEGORY_MAP_NOT_FOUND` (already thrown). After-commit flush must keep surfacing `[FUEL_GL_POST] post failed` — never stamp `posted_to_gl` on error.
4. **No Neon-apply** from this PR. Owner designates maps (SQL or Expense Category Map UI), then authorizes a separate re-flush / backfill block.

---

## What Jorge designates (gated — NOT done here)

For each entity that will post fuel (start **TRANSP**; TRK/USMCA only when ingest ON):

| `category_kind` | `category_code` (exact) | Suggested reuse (owner choice) |
|---|---|---|
| `fuel` | `diesel` | May point at existing **6100 Fuel Expense** if CPA agrees one account for all fuel kinds |
| `fuel` | `def` | Same or separate DEF expense account |
| `fuel` | `reefer` | Same or reefer-specific |
| `fuel` | `oil` | Same or oil/lube |
| `fuel` | `misc` | Catch-all for gas/other (`mapFuelTypeToPostingKind`) |

Optional: deactivate orphan free-text `category_code='fuel'` rows **after** the five codes exist (never delete financial history; void/deactivate only).

Optional product decision (separate, owner-gated): allow an explicit documented alias `fuel`→all kinds in the resolver — **forbidden until Jorge writes OK**; today the coverage UI treats that as **0 of 5 mapped**.

After designate: owner-gated **idempotent re-flush** of unposted Relay rows (stamp `posted_to_gl` only on successful `fuel_event` batch). Do not invent amounts.

---

## Acceptance when unblocked (future money PR — not this HOLD)

```
ROOT CAUSE: poster looks up diesel|def|reefer|oil|misc; prod maps only category_code=fuel → every flush fails closed.
FIX: owner-designated maps for the five codes (reuse existing 6100 if CPA OK) + gated re-flush.
GUARD: scripts/verify-fuel-gl-map-codes-no-silent-alias.mjs (this HOLD) + planted post after designate.
LIVE PROOF: fuel_event batch >0, posted_to_gl>0 for a planted txn, health sha matches merge — OR UNVERIFIED.
REMAINING: none after live proof / OR tracker id for backfill of 1499 historical rows.
```

---

## Guardrails honored

No new GL math · no account invention · no silent alias · no Neon-apply · no flag flip · `[HOLD-FOR-JORGE — TIER 1]` · Rule 17 (verify-step only; no package.json / locked-guards / ci.yml).
