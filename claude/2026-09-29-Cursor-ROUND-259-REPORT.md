# ROUND 259 — CURSOR REPORT

**Seat:** Cursor · **Date:** 2026-09-29 · **Branch:** `cursor/r259-dependabot-close-migration-fk-c89b`

## ITEM 1 — Dependabot PRs closed (NOT merged)

| PR | Title | Action |
|----|-------|--------|
| #22980 | chore(ci): bump github/codeql-action | **CLOSED** |
| #22981 | chore(deps): bump development-dependencies group | **CLOSED** |
| #22982 | chore(deps): bump production-dependencies group | **CLOSED** |
| #22983 | chore(deps): bump @sentry/react | **CLOSED** |
| #22984 | chore(deps): bump dotenv | **CLOSED** |
| #22985 | chore(deps): bump @sentry/profiling-node | **CLOSED** |
| #22986 | chore(deps): bump @sentry/node | **CLOSED** |

### Render preview services

Named service ids (owner packet) looked up via Render API workspace `tea-d7cg3g99rddc739n3obg`:

| Service id | Result |
|------------|--------|
| `srv-dat5hh2vcj2c73bfecjg` | **404 not found** (already gone) |
| `srv-dat5i4c9v7es73fkkdfg` | **404 not found** |
| `srv-dat5jnbncjis73f4jqo0` | **404 not found** |
| `srv-dat5jrbncjis73f4k0tg` | **404 not found** |
| `srv-dat5jvbl550s739tdu9g` | **404 not found** |
| `srv-dat5k2bl550s739tdvt0` | **404 not found** |
| `srv-dat5k5bncjis73f4kmc0` | **404 not found** |

All seven preview services were already absent (likely auto-cleaned when PRs closed or never persisted under this workspace). Parent `ih35-tms-web` (`srv-d7s46dbrjlhs7383i150`) still has `previews.generation=automatic` / `pullRequestPreviewsEnabled=yes` — Render MCP exposes no delete-service tool in this session; report for owner/Render seat if previews re-spawn on future Dependabot PRs.

## ITEM 2 — Main CI migration FK (root cause + fix)

**Exact error (CI run `36629570491`, job build-typecheck-heavy, 2026-09-29T20:57:33Z):**

```
APPLY 202614530000_qbo_flags_permanent_block.sql
Migration failed: insert or update on table "blocked_feature_flags"
  violates foreign key constraint "blocked_feature_flags_blocked_by_user_id_fkey"
```

**Migration:** `db/migrations/202614530000_qbo_flags_permanent_block.sql` (ROUND 195 QBO permanent block).

**Mechanism:** Table creates `blocked_by_user_id uuid REFERENCES identity.users(id)` (nullable). Seed INSERT wrote bare UUID `e4117991-d2c0-406d-8cda-74e98d95bccd` for all 17 rows. Fresh CI DB has `identity.users` (migrations 0004/0005) but **no row** for that owner uuid → FK fail → whole transaction rolls back → main CI red. Neon live already has the user, so prod migrate was green while CI was red.

**Fix (kept the FK — did not drop it):** every seed `blocked_by_user_id` is now

```sql
(SELECT id FROM identity.users WHERE id = 'e4117991-d2c0-406d-8cda-74e98d95bccd'::uuid)
```

Missing user → NULL (allowed). Present user → FK satisfied.

## ITEM 3 — 11 vs 14 vs 16 (measured live, Neon `br-fancy-credit-akjnd07a`, bypass_rls=lucia)

| Signal | Count | Source |
|--------|-------|--------|
| Owner screen | **11** | AUTH-061 CURRENT hide (pre-fix deploy) |
| Devin-B board query | **14** | `status='dispatched'` without CURRENT/canonical money filter |
| DB dispatched | **14** | `mdata.loads` status |
| Canonical active | **12** | status IN canonical AND not-finished-by-money |
| InService units | **16** | lease-scoped Rule 49 |

### a. Why owner sees 11 when a raw board/status query returns 14

Three loads out of the 14:

1. **13633** (T152) — finished-by-money (settled driver bill); excluded from `views.live_loads` / canonical
2. **13634** (T152) — same
3. **13627** (T170) — was in live_loads but **AUTH-061** CURRENT 48h stamp-less hide dropped it from Truck Line

`14 − 2 − 1 = 11`. Not pagination. Grouping kept T176 return trip as two legs under one unit (second row blank unit# — Item 4).

### b. Owner's 2 extras (16 − 14)

InService with **live ping today** and **zero** dispatched load:

- **T124**
- **T163**

(T122 / T147 InService but stale telematics — not "running today.")

### c. Private status list → canonical

Devin-B's "private status list" was `current-truck-line-load.ts` AUTH-061 / 4-status CURRENT. **Fixed (ROUND 255, cherry-picked here):** `currentTruckLineLoadSql` **aliases** `canonicalActiveLoadWhereClause` — same definition trip-pairing's `assertCanonicalSubset` sits under. Live after fix: **board === canonical = 12**.

**Reported, not fixed this round (private filters outside truck line):**

- Cash flow: `cash-flow.service.ts` uses private settlement status lists (`locked|final|approved|posted|closed`) and invoice `sent|partial` — not the load active-set (different question: GL cash timing).
- Pre-settlement: no separate status IN fork found under `driver-finance/pre-settlement*`; load linkage goes through settlement documents.

## ITEM 4 — Board UI (cherry-picked from ROUND 255)

Return-trip double rows with unit# kept · columns UNIT · TOUR · LOAD · PU DATE · DEL · transit under LOAD · green animated/draggable truck · CURRENT LOCATION · status dropdown · universal filter · Dispatch `overflow-x-hidden`. Guard `verify-truck-line-board-shows-canonical-active-set.mjs` REQUIRES_LIVE_DB **LIVE PASS**.

## Files this round

- `db/migrations/202614530000_qbo_flags_permanent_block.sql` (FK seed fix)
- cherry-pick ROUND 255 truck-line board + guards + MEMORY_BANK + R255 report
- this report

## SHIP

- PR **#23137** squash-merged → `08eee92f525b02d2998be435a642effed0d9186a`
- CI run `36631055479` build-typecheck-heavy: **APPLY 202614530000_qbo_flags_permanent_block.sql** then later migrations → **Migrations applied successfully** (1213). FK blocker CLEARED.
- Same run then failed later on unrelated `verify-bank-match-candidate-sources` (157-C dropped `FROM accounting.expenses` + explicit `if (!isCredit)`). Follow-up PR restores expenses + `if (!isCredit)` branch.
