# BLOCK-01 — Fixed-Asset Depreciation — Design Doc (reconciliation + residual-gap build)

> **HOLD LANGUAGE SUPERSEDED — OWNER LAW 2026-08-03 / owner directive 2026-08-06.** There are NO holds and no approval gate. All owner questions are asked-and-answered. Coders build, apply on Neon, and MERGE ON GREEN with proof. Any "build-and-hold", "Jorge merges", "never self-merge" or "wait for approval" wording below is HISTORICAL RECORD ONLY and must not be followed.

**Status:** DESIGN-ONLY / BUILD-AND-SHIP. No posting code in this PR. One optional HELD, idempotent,
additive migration (asset-linkage + cron-run-log only — **no new posting math**). Financial cluster
per constitution §1.4 — **never self-merge**; migration (if used) runs on a Neon branch by Jorge's hand,
never on prod, until Jorge says "OK to merge."
**Date:** 2026-07-05. **Author:** Claude (design pass). **Tracker id:** `BLOCK-01-of-29-TIER1.5-DEPRECIATION`
(currently logged `PENDING (GATED)` in `docs/trackers/block-reconciliation-data.json` /
`docs/trackers/BLOCK-RECONCILIATION-2026-07-04.md`).
**Locked decisions this doc builds to:** Jorge 2026-07-05 (5-year straight-line, revenue equipment, GAAP
books — `docs/LOCKED-DECISIONS-2026-07-05-ENTERPRISE.md`) + the earlier FH-1 ruling 2026-06-14
(`docs/specs/FH-1-FIXED-ASSETS-DEPRECIATION-DESIGN.md`: **book-only straight-line**, MACRS/§179 are
CPA-external, NOT built into the app).

---

## 0. Reconciliation finding — READ THIS FIRST (repo-reconnaissance per the block's own dispatch protocol)

The block's own dispatch header (`docs/dispatch/BLOCK-01-of-29-TIER1.5-DEPRECIATION.txt`) mandates:
*"MANDATORY BEFORE CODE: REPO RECONNAISSANCE... If MISMATCH found: STOP, surface 3 options to Jorge."*
That reconnaissance was done for this design pass. Result: **the core depreciation engine described by
this block is already built and merged to `main`** — under a different (correct, current) schema shape
than the original 2026-06-06 block spec assumed. The tracker (`PENDING (GATED)`, last evidence
"deep-verified 2026-06-24 (feature grep)") has not caught up to this. This doc is written as
**option (A) re-scope to the actual gaps** — it documents what exists, corrects the stale spec, and
designs only the genuinely missing pieces.

### 0.1 What the original spec got wrong (do not build this)
`docs/dispatch/BLOCK-01-of-29-TIER1.5-DEPRECIATION.txt` (2026-06-06) proposed: `ALTER TABLE mdata.assets`
+ a new `finance.depreciation_schedule` table + `lib/services/depreciation.mjs` + hardcoded MACRS-3/5/7/15
tables + Section 179 + a `finance.journal_entries` FK. None of that matches the live system:
- `mdata.assets` (migration `0262_asset_registry.sql`) **exists but is a read-projection mirror of
  `mdata.units`** for fleet/insurance reporting (`asset_type`, `insured_value_cents`, `owning_entity`) —
  it has **zero** depreciation columns and was never meant to carry them. Bolting depreciation fields onto
  it would create a second, disconnected asset register.
- There is **no `finance.depreciation_schedule` or `finance.journal_entries`** table, and none should be
  created — GL entries are `accounting.journal_entries` / `accounting.journal_entry_postings` (see §2).
- **MACRS / Section 179 / bonus depreciation are explicitly OUT OF SCOPE**, per Jorge's locked 2026-06-14
  ruling: *"BASIS — BOOK ONLY (locked)... The CPA handles tax-basis depreciation... externally at filing —
  these are NOT built into the app's book schedule."* The 2026-07-05 5-year-straight-line/GAAP-books
  instruction reaffirms this. Do not build the MACRS tables or the `applySection179` endpoint from the
  stale spec.
- **Recommendation:** update `docs/trackers/block-reconciliation-data.json` /
  `BLOCK-RECONCILIATION-*.md` to reflect the as-built state below once Jorge confirms the re-scope
  (not done in this PR — docs-tracker edits are a separate, low-risk follow-up commit).

### 0.2 What is already built (verified against `db/migrations/` + live-wired backend/frontend code)
| Piece | Where | State |
|---|---|---|
| Asset register (`fixed_assets` fields, class catalog, disposals) | `db/migrations/202606281060_fixed_assets_data_model.sql` → `accounting.fixed_assets`, `accounting.fixed_asset_classes`, `accounting.fixed_asset_disposals` | **Merged, live schema.** FK `unit_uuid → mdata.units(id)` (reuses fleet, doesn't duplicate it). `owner_operating_company_id` = TRK (title-holder, depreciates) vs `operating_company_id` (scope/visibility) — matches the TRK-owns/TRANSP-leases model (`ih35-entity-facts`). |
| Depreciation schedule rows | same migration → `accounting.depreciation_schedule_rows` | **Merged, live schema.** One row per asset per period; `posted_journal_entry_id` hook. |
| Schedule math (straight-line + half-month/mid-month convention, declining-balance kept for future/reference) | `apps/backend/src/accounting/fixed-assets.math.ts` (`computeDepreciationSchedule`) | **Built, pure function, single source of truth** — shared by the read route AND the poster (no diverging copies, per CLAUDE.md §2). |
| Read/compute API (register list, detail, computed schedule, JE **preview**) | `apps/backend/src/accounting/fixed-assets.routes.ts` | **Built, read-only, zero posting.** |
| **GL posting engine** (Dr Depreciation Expense / Cr Accumulated Depreciation, idempotent, reversible) | `apps/backend/src/accounting/amortization-posting/amortization-posting.service.ts` (`postDepreciation`, `reverseDepreciation`) — "FIN-21" | **Built.** Reuses the shared schedule math, the standard `accounting.journal_entries` / `accounting.journal_entry_postings` insert path, the deterministic per-(asset,period) idempotency key, the closed-period guard (`accounting.closed_period_cutoff`), the shared void/reversal path (`postVoidReversal` — never delete), the audit spine (`appendCrudAudit`), and the accounting-spine event emitter for unit-linked assets. **Zero new GL math** was written — see §2. |
| Manual trigger endpoints | `apps/backend/src/accounting/amortization-posting/amortization-posting.routes.ts` (`POST .../depreciation/post`, `.../depreciation/reverse`) | **Built.** Finance-role-gated (Owner/Administrator/Accountant), company-membership-enforced. |
| Frontend register + schedule + JE-preview UI | `apps/frontend/src/pages/accounting/FixedAssetsPage.tsx` (+ `apps/frontend/src/api/fixed-assets.ts`), routed at `/accounting/fixed-assets` | **Built and routed** (see `routes/manifest.tsx` line ~3468). Shows cost/salvage/depreciation-to-date/net-book-value, % depreciated bar, disposal panel, and a "GL Posting Preview (GATED — autopost flag OFF)" banner. |
| GL accounts (QBO-parity detail types) | `db/migrations/202606080010_account_type_detail_type_catalog.sql` (detail types `'Accumulated Depreciation'` under type FA, `'Depreciation'` under type OEXP); USMCA COA seeded account `1600 Accumulated Depreciation` (`202606300060_usmca_coa_seed.sql`) | **Catalog exists.** Per-asset `depr_expense_account_id` / `accum_depr_account_id` resolve from the class defaults (`accounting.fixed_asset_classes.default_*_account_id`) or an override on the asset row — **not hardcoded**, verify the live TRANSP/TRK account rows in `catalogs.accounts` before the first real post (out of scope for this design pass — no prod DB access, see §1.5 of the constitution). |
| Feature flags — per-entity posting state | `db/migrations/202606290060_amortization_gl_posting_flag.sql` (registers `AMORTIZATION_GL_POSTING_ENABLED`, default OFF) + `db/migrations/202607052300_per_entity_posting_flag_golive.sql` (Jorge-approved per-entity overrides) | **`AMORTIZATION_GL_POSTING_ENABLED` is ALREADY ON for TRK and USMCA** (per-entity override rows), **OFF for TRANSP** (deliberately untouched — the migration's own comment says TRANSP's engine flags "flip per-engine in separate, sequenced migrations after each engine deploys + a JE proof"). |
| Auto-post kill-switch (unused today) | `db/migrations/202606281060...sql` registers `FIXED_ASSET_AUTOPOST_ENABLED` (default OFF) | **Registered but not yet consumed by a cron** — only read today by `fixed-assets.routes.ts` to annotate the JE-preview payload (`posting_enabled` flag in the response). This is the correct gate for the cron design in §3 — reuse it, do not invent a new flag key. |

### 0.3 A dead duplicate to flag (not touched in this PR)
An **earlier, orphaned** migration `db/migrations/202606151600_fh1_fixed_assets_data_model.sql` created a
**separate** `fixed_assets.*` schema (`fixed_assets.assets`, `fixed_assets.asset_classes`,
`fixed_assets.depreciation_schedules`, `fixed_assets.disposals`) that **no route or service references**
— `grep` confirms zero consumers; the live code exclusively queries `accounting.fixed_assets` /
`accounting.fixed_asset_classes` / `accounting.depreciation_schedule_rows` /
`accounting.fixed_asset_disposals` from the later, canonical migration `202606281060`. This is the
"split-brain schema" landmine class (`module-catalog-2026-07-05` memory). Per the delete-rule
(`delete-rule-refined-dead-vs-functional`), a verified-dead, zero-consumer duplicate of a live pattern MAY
be archived — **recommend a small follow-up migration** dropping the orphaned `fixed_assets` schema (or
renaming it `fixed_assets_deprecated` first, if Jorge wants a grace window) once Jorge confirms. **Not
done in this PR** (out of scope for a design doc; flagging per the hardline "never guess, always
surface" rule).

---

## 1. Asset register (AS-BUILT — no changes proposed)

`accounting.fixed_assets` (see `db/migrations/202606281060_fixed_assets_data_model.sql` for full DDL):

| Field | Notes |
|---|---|
| `operating_company_id` | RLS scope (visibility) |
| `owner_operating_company_id` | **the lessor/title-holder — TRK** for revenue equipment; depreciation books here (`ih35-entity-facts`: TRK owns + depreciates + earns lease income; TRANSP books the lease expense, not depreciation) |
| `class_id → accounting.fixed_asset_classes` | vehicles: trucks · trailers · cars (per FH-1 lock); class carries the default method/life/GL accounts |
| `unit_uuid → mdata.units(id)` | reuses the fleet register — **does not duplicate it** |
| `purchase_price_cents`, `salvage_value_cents` | cost basis / residual, integer cents |
| `purchase_date`, `in_service_date` | acquisition vs placed-in-service (drives the convention) |
| `method` (`straight_line` built; `declining_balance`/`units_of_production` kept for future/reference, **not built for GAAP books today**) | |
| `useful_life_months` | **default 60 (5yr) at the class level** — see §6 open question for trailers |
| `convention` (`half_month` default, `mid_month`/`half_year`/`full_month` allowed) | |
| `prior_accumulated_depr_cents` | back-dated/take-over assets — **posting currently REFUSES (fails loud) when this is > 0** (§5.4 — a genuine known gap, not silently mis-posted) |
| `asset_account_id`, `accum_depr_account_id`, `depr_expense_account_id` | per-asset override of the class defaults, all FK `catalogs.accounts(id)` |
| `status` (`active`/`fully_depreciated`/`disposed`/`voided`) | |
| `is_active`, `deleted_at`, `voided_at`/`voided_by_user_id`/`void_reason`, audit cols | void-not-delete, per standing rule |

No schema change is proposed for the register itself — it already satisfies cost basis, in-service date,
salvage value, useful life, and straight-line method exactly as this block asks for.

---

## 2. Monthly depreciation JE (AS-BUILT — reused, no new GL math)

`postDepreciation()` in `amortization-posting.service.ts` posts, per due unposted period:

```
Dr  accounting.fixed_assets.depr_expense_account_id    (period depreciation_amount_cents)
Cr  accounting.fixed_assets.accum_depr_account_id       (period depreciation_amount_cents)
```

via the **existing** `accounting.journal_entries` / `accounting.journal_entry_postings` insert path — the
same tables every other TIER-1 poster (bills, prepaid amortization, factoring) writes to. It does **not**
introduce a new posting function, a new balance-check, or a new ledger table. Balance is enforced by
`assertBalanced(lines)` (shared helper, `amortization-posting.math.ts`) before any insert; idempotency is
a deterministic `idempotency_key` per (asset, period) enforced by a DB unique constraint (insert is a safe
no-op on retry); the closed-period guard reuses `accounting.closed_period_cutoff(...)`; reversal reuses
the shared void path (`postVoidReversal` — an equal-and-opposite reversing JE, never a delete).

**Accounts (verify the live per-entity rows before flipping TRANSP):** the QBO-parity detail-type catalog
(`202606080010_account_type_detail_type_catalog.sql`) defines `'Depreciation'` under account type `OEXP`
(Other Expense) and `'Accumulated Depreciation'` under account type `FA` (Fixed Asset — a contra-asset by
convention). USMCA's COA seed shows the pattern concretely: account `1600 Accumulated Depreciation`
(`202606300060_usmca_coa_seed.sql`). TRANSP/TRK's actual `catalogs.accounts` rows should be read (not
guessed) via a local/branch query before TRANSP's `AMORTIZATION_GL_POSTING_ENABLED` is ever flipped — this
design doc does not assert specific account numbers because prod DB access is gated (constitution §1.5).

---

## 3. The one real functional gap: no automatic monthly cron (design, not built)

Today `postDepreciation` is reachable **only** via the manual `POST /api/v1/accounting/amortization-posting/depreciation/post`
endpoint (finance roles only) — there is no scheduled job. `apps/backend/src/cron/` has ~35 registered
crons and none reference `postDepreciation` or `depreciation`. This is the one piece of BLOCK-01's original
intent ("auto-posts monthly depreciation JE") that is genuinely unbuilt. Proposed design (no code in this
PR):

- **New cron** `apps/backend/src/cron/fixed-asset-depreciation-autopost.cron.ts`, scheduled 1st of month
  (matches the FH-1 §5 design and the original block's "First of each month at 5 AM CT" intent).
- Gate: reuse the **already-registered, currently-unused** flag `FIXED_ASSET_AUTOPOST_ENABLED` (registered
  default OFF in `202606281060`). This is a **second, higher gate above** the per-entity
  `AMORTIZATION_GL_POSTING_ENABLED` — even for TRK/USMCA (already ON), the cron stays inert until Jorge
  flips this second flag, matching the FH-1 design's intent ("Jorge flips the flag when ready — Jorge +
  GUARD; never auto-flipped").
- Per entity where the flag is ON: iterate `accounting.fixed_assets` where `status IN ('active')` and
  `is_active = true`, call the existing `postDepreciation({ operatingCompanyId, assetId })` for each —
  **reusing the function verbatim**, no new posting logic. Skip (log, don't fail the run) any asset that
  throws `PRIOR_ACCUM_UNSUPPORTED` or `ACCOUNT_MISSING` (both already-modeled error codes) so one bad asset
  never blocks the batch.
  - Reference: the block spec envisioned a hardcoded `lib/services/depreciation.mjs` batch poster — that
    would have been a **second, diverging** implementation of exactly what `postDepreciation` already does.
    The design here is the CLAUDE.md §2-compliant version: reuse, don't reinvent.
- Write one row per asset attempted to the new append-only `accounting.depreciation_autopost_runs` log
  (§4) so a monthly run is auditable end-to-end (which assets posted / skipped / errored, and why) —
  this is the "depreciation_run" concept requested by the task, sized to what's actually missing (a run
  audit trail — the schedule and posting tables it would have duplicated already exist).

---

## 4. Schema proposal — additive only, sized to the real gap

Given §0.2, the "asset / depreciation_schedule" tables named in the original task framing **already exist**
as `accounting.fixed_assets` / `accounting.depreciation_schedule_rows`. Re-creating them would be exactly
the split-brain-schema mistake flagged in §0.3. The two **genuinely missing, additive** pieces:

### 4.1 `accounting.fixed_assets.financing_loan_id` (nullable FK) — CCG financing linkage
CCG (Commercial Credit Group) equipment financing is modeled today in `finance.loans` /
`finance.loan_amortization_rows` (`202606160100_fh3_amortization_data_model.sql`, `lender text` field —
generic, not CCG-specific) with **no link back to the depreciated asset**. `accounting.fixed_assets` has
`acquisition_je_id` but nothing pointing at the loan that financed the purchase. Per the constitution's
**Law of Total Connectivity** (§10a — every asset must forward/reverse-drill to its financial primitives),
a CCG-financed truck/trailer should drill from the asset to its loan and back. Proposed additive column:

```sql
ALTER TABLE accounting.fixed_assets
  ADD COLUMN IF NOT EXISTS financing_loan_id uuid REFERENCES finance.loans(id);
```

Nullable (most assets are cash-purchased or already owned pre-system), no CHECK, no cascade — pure
drill-through metadata. No posting change: the acquisition JE (Dr Asset / Cr Note Payable) is FH-2 Loan
Wizard's concern (unchanged); this column only lets the UI join asset ↔ loan.

### 4.2 `accounting.depreciation_autopost_runs` — append-only cron audit log
Supports §3's cron design. One row per (run, asset) attempt:

```sql
CREATE TABLE IF NOT EXISTS accounting.depreciation_autopost_runs (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id  uuid        NOT NULL REFERENCES org.companies(id),
  run_date              date        NOT NULL,
  asset_id              uuid        NOT NULL REFERENCES accounting.fixed_assets(id),
  outcome               text        NOT NULL CHECK (outcome IN ('posted','nothing_to_post','skipped_flag_off','error')),
  period_count          int         NOT NULL DEFAULT 0,
  total_posted_cents    bigint      NOT NULL DEFAULT 0,
  error_code            text,
  error_message         text,
  is_active             boolean     NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now()
);
```
Append-only (evidence of what a cron run did) — grants are `SELECT, INSERT` only, **no UPDATE/DELETE**,
per the audit/evidence-table rule. Entity-scoped `operating_company_id` + FORCE RLS + the canonical
company-scope policy (see the migration in this PR). This table posts nothing itself — it is a receipt,
not a ledger.

Both pieces are staged as a **HELD** migration (never self-merged) — see the PR's migration file and
`.held-migrations.json` entry.

---

## 5. Book vs tax — reaffirmed, not re-litigated

- **Books = straight-line, 5-year default, GAAP.** This is what `computeDepreciationSchedule`'s
  `straight_line` branch computes and what `postDepreciation` posts. This is the ONLY method this system
  builds and posts for financial-statement purposes.
- **Tax (MACRS-3/5/7/15, Section 179, bonus depreciation) is a SEPARATE, CPA-external layer.** It is not
  computed, not scheduled, and not posted by this system — the CPA applies it at filing, off a copy of the
  asset register's cost-basis/in-service-date data (which this system already has correct). The stale
  block spec's MACRS tables and `applySection179` endpoint are explicitly **not** to be built (§0.1).
- `method` on the asset row keeps `declining_balance` / `units_of_production` as **reference values for a
  future book-method need** (per FH-1's original design) — they are not tax-basis methods and are not
  MACRS; do not conflate the two. Today's task locks 5-year straight-line as the only method actually used.

---

## 5.4 Known limitation carried forward (not solved here — flagged, not silently patched)
`postDepreciation` **refuses to post** (throws `PRIOR_ACCUM_UNSUPPORTED`) for any asset with
`prior_accumulated_depr_cents > 0`, because the shared schedule math re-depreciates the FULL depreciable
base regardless of prior accumulated depreciation — posting it as-is would double-count history. This is
the correct, fail-loud behavior (per the code's own comment: "Fail loud — never mis-post — until proper
remaining-life continuation is designed (no new GL math)"). **Back-dated/take-over assets (already in
service before this system) cannot auto-post today; they need a remaining-life-continuation design pass
before the autopost cron in §3 is safe to run against them.** Flagging this explicitly rather than working
around it with new math, per CLAUDE.md §2 ("write NO new GL math").

---

## 6. Open micro-question for Jorge — trailer useful life

FH-1's 2026-06-14 lock set a **uniform default of 5 years (60 months)** for the vehicles-only asset class
set (trucks · trailers · cars), editable per asset. `accounting.fixed_asset_classes` already supports a
**different default per class** (`default_useful_life_months` is a per-row column, not a global constant)
— nothing schema-side blocks giving trailers a different book life than tractors; there's simply no seed
data doing so today (all classes seeded/created so far default to 60).

**The question:** trailers physically outlast tractors and many fleets book them on a longer BOOK life
than tractors (commonly 7–10 years) even though MACRS treats both as short-lived tax property (3-year
tractors / 5-year trailers — tax-basis only, irrelevant to book life). Should the `trailer` class's
`default_useful_life_months` be raised above the truck class's 60 (e.g., 84 or 120), or does Jorge want
every vehicle class held at a flat 5-year book life for simplicity/consistency? **No default is changed in
this PR** — this is a locked-decision-adjacent call for Jorge, not an engineering one; the per-class column
is already in place to carry whatever the answer is.

---

## 7. Feature flags — current state (verify before any further flip)

| Flag | TRANSP | TRK | USMCA | Consumed by |
|---|---|---|---|---|
| `AMORTIZATION_GL_POSTING_ENABLED` (posts the manually-triggered depreciation JE) | **OFF** (untouched — no JE proof run yet) | **ON** (`202607052300`) | **ON** (`202607052300`) | `postDepreciation` / `postPrepaidAmortization` |
| `FIXED_ASSET_AUTOPOST_ENABLED` (would gate the §3 cron) | OFF (default) | OFF (default — no override row) | OFF (default — no override row) | today: read-only display flag in the JE-preview response; **no cron consumes it yet** |

Flipping `AMORTIZATION_GL_POSTING_ENABLED` ON for TRANSP, or `FIXED_ASSET_AUTOPOST_ENABLED` for any
entity, is a §1.4 financial-cluster action — **STOP, show the exact JE(s) that would post, get Jorge's
explicit "OK to merge/flip" first.** Neither is touched by this PR.

---

## 8. Gated build sequence (for a future BUILD PR, not this one)

1. (This PR) Design doc + optional HELD additive migration (`financing_loan_id`, `depreciation_autopost_runs`).
2. Verify live TRANSP/TRK `catalogs.accounts` Depreciation-Expense / Accumulated-Depreciation rows on a
   Neon branch (never prod directly) before touching any TRANSP flag.
3. Build `fixed-asset-depreciation-autopost.cron.ts` per §3 (reuses `postDepreciation` verbatim) — behind
   `FIXED_ASSET_AUTOPOST_ENABLED` (already registered, default OFF).
4. Jorge + CPA review a **preview run** (dry-run, no posting) before the flag is ever flipped for any entity.
5. Flip `FIXED_ASSET_AUTOPOST_ENABLED` per-entity only after a manual JE proof, exactly like
   `AMORTIZATION_GL_POSTING_ENABLED`'s TRK/USMCA go-live.
6. Separately: resolve the mid-life/`prior_accumulated_depr_cents` gap (§5.4) before any back-dated asset
   is included in an autopost run.
7. Separately: archive the orphaned `fixed_assets.*` schema (§0.3) once confirmed dead.
8. Separately: correct the tracker (`BLOCK-RECONCILIATION-*`/`block-reconciliation-data.json`) status for
   `BLOCK-01-of-29-TIER1.5-DEPRECIATION` once Jorge accepts this re-scope.

All money-path steps above require Jorge's explicit "OK to merge" per constitution §1.3/§1.4 — this design
doc authorizes none of them; it only lays out what's left and how it plugs into what's already built.
