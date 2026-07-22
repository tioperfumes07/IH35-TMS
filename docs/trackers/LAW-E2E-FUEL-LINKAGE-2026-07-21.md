# LAW-E2E — Fuel txn → expense/GL → unit/driver → JE linkage (2026-07-21)

**BLOCK:** `LAW-E2E-FUEL-LINKAGE-2026-07-21`  
**MODULE:** fuel / accounting  
**PATH ID:** `P-FUEL`  
**WORKTREE:** `/private/tmp/ih35-law-e2e-batch2-audit` · branch `audit/law-e2e-batch2-2026-07-21`  
**BASE:** `origin/main` @ `e64fc4c6b`  
**DEPLOY:** `GET https://api.ih35dispatch.com/api/v1/healthz/shallow` → `version=e64fc4c` (matches)  
**Neon:** project `tiny-field-89581227` · branch `br-fancy-credit-akjnd07a` · **READ ONLY**  
**Discipline:** NEVER merge · NEVER Neon-apply · no STALE theater  
**Master:** `docs/trackers/LAW-FULL-LINKAGE-AUDIT-MASTER-2026-07-21.md`

Law §9: fuel money must land in Fuel module **and** expense/GL/JE **and** unit/driver/load (where applicable) with forward+reverse drill.

---

## Verdict (one line)

**FAIL overall.** Canonical `fuel.fuel_transactions` has **1,499** live rows (1,367 with `unit_id`) and `EXPENSE_GL_POSTING_ENABLED` is **ON** for all three entities with fuel category maps present — but **`integrations.relay_fuel_transactions.posted_to_gl = 0`**, **`posting_batches` with `source_transaction_type='fuel_event' = 0`**, **zero fuel/expense JE legs**, **`driver_id=0` / `vendor_id=0` / `load_id=0`**. Ops data without GL or driver/load linkage is Law FAIL.

---

## Spec / standards anchors

| Source | Relevance |
|---|---|
| Architecture Blueprint §9 | Money → vendor/GL/JE + unit/driver/load + reverse |
| IFTA / FMCSA | Gallons + jurisdiction; unit attribution |
| QuickBooks expense | Fuel card → expense → register |
| Alvys / McLeod | Fuel → settlement / unit CPM |

---

## Live flag state (Neon, RLS bypass `lucia`)

| Flag | `default_enabled` | Overrides |
|---|---|---|
| `EXPENSE_GL_POSTING_ENABLED` (fuel poster gate) | **false** | TRANSP · TRK · USMCA **ON** |
| `RELAY_FUEL_INGEST_ENABLED` | **false** | TRANSP **ON**; TRK/USMCA false |

> Fuel poster deliberately reuses **`EXPENSE_GL_POSTING_ENABLED`** (`maybe-post-from-fuel-transaction.service.ts`) — there is **no** `FUEL_GL_POSTING_ENABLED` flag.

---

## Neon row evidence (same txn, `app.bypass_rls='lucia'`)

| Relation / metric | Count | Implication |
|---|---:|---|
| `fuel.fuel_transactions` | **1,499** | Canonical fuel history present |
| with `unit_id` | **1,367** | Unit linkage mostly present |
| with `driver_id` | **0** | **No driver linkage live** |
| with `vendor_id` | **0** | **No vendor linkage live** |
| with `load_id` | **0** | **No load linkage live** |
| `integrations.relay_fuel_transactions` | **1,499** | Matches fuel volume |
| Relay `posted_to_gl = true` | **0** | GL post never stamped |
| `posting_batches` `fuel_event` | **0** | Poster never succeeded live |
| JE legs expense/fuel | **0** | No GL truth |
| `expense_category_account_map` `category_kind='fuel'` | **3** | Maps exist — not the blocker |

---

## Hop matrix (PASS / FAIL / UNVERIFIED)

| # | Hop | Verdict | Evidence |
|---|---|---|---|
| 1 | **Fuel ingest (Relay / CSV / import)** | **PASS** (repo + live rows) | Relay staging + canonical bridge; `fuel-transaction-import` also queues `gl_post_candidates`. Neon 1,499 rows. |
| 2 | **Canonical `fuel.fuel_transactions`** | **PASS** | Table populated; Fuel FE tabs exist (`FuelTransactionsTable`, planner, fraud). |
| 3 | **Unit linkage** | **PASS** (mostly) | 1,367/1,499 have `unit_id`. |
| 4 | **Driver / vendor / load linkage** | **FAIL** | All three counts = **0** on Neon. Schema supports FKs (`0300_create_fuel_transactions.sql`). |
| 5 | **After-commit GL flush (`maybePostFuelExpenseFromCanonicalTxn`)** | **FAIL** (live) · **PASS** (repo wiring) | Cron/CSV/import call `flushFuelGlPostsAfterCommit`. Live `posted_to_gl=0`, `fuel_event` batches=0 despite EXPENSE_GL ON. |
| 6 | **Fuel expense poster (`postFuelExpenseFromEvent`)** | **PASS** (repo) · **UNVERIFIED** (live success) | Writes `posting_batches` type `fuel_event` + JE. Never observed live. |
| 7 | **Expense category map (`fuel` kinds)** | **PASS** (Neon maps=3) · **UNVERIFIED** (runtime resolve) | Maps exist; live post still 0 → other failure (period, actor, path not invoked, swallowed error). |
| 8 | **Accounting Fuel bill tab** | **PASS** (nav exists) · **UNVERIFIED** (create→lines) | `/accounting/bills/fuel` in subnav. Shares vendor-bill line risk from P-BILL audit if it uses same create. |
| 9 | **Reverse: Unit → fuel history** | **PASS** (repo) | `unit-financial` / driver ops fuel-history services read `fuel.fuel_transactions`. |
| 10 | **Reverse: Fuel row → JE / expense** | **FAIL** | No JE; Fuel UI does not EntityLink to journal_entry. Account register `sourceRoute` has **no `fuel_event` branch** (falls through to JE list). |
| 11 | **Settlement / CPM / IFTA consumers** | **PASS** (read path) · **FAIL** (money completeness) | Reports read fuel costs by unit; without driver/load/GL the economic picture is incomplete. |
| 12 | **Audit** | **UNVERIFIED** | Ingest audits exist in cron; GL success audits not proven live. |

---

## Surfaces that must show this money

| Surface | Should show | Current |
|---|---|---|
| Fuel Transactions | Card txns + unit/driver | Units often set; driver/vendor/load empty |
| Fuel bill (Accounting) | AP/expense for fuel | Tab exists; not proven as GL path |
| Expense / JE / Account register | Fuel expense JE | **0 fuel_event posts** |
| Unit financial / CPM / IFTA | Fuel cost | Reads fuel table; no GL tie-out |
| Driver settlement (fuel advance) | Driver advance path | Poster supports `driver_advance`; needs `driver_id` |
| Relay health | `posted_to_gl` | All false |

---

## Ranked FAIL list (code fixes — Fuel)

1. **P0 — Diagnose + fix live GL flush failure (flag ON, posts=0)**  
   Render logs for `flushFuelGlPostsAfterCommit` / `maybePostFuelExpenseFromCanonicalTxn` errors; fix root cause (silent skip, period, actor, map resolve). Guard: planted fuel txn with flag ON → `fuel_event` batch + JE + `posted_to_gl=true`.

2. **P0 — Backfill GL for existing 1,499 Relay rows (owner-gated)**  
   Idempotent re-flush after P0 fix; stamp `posted_to_gl`. Do not invent amounts.

3. **P0 — Populate `driver_id` / `vendor_id` on ingest**  
   Relay/card import must resolve driver + merchant vendor. Law requires vendor OR customer + driver/unit where applicable.

4. **P1 — Account register + Fuel UI reverse to JE**  
   `sourceRoute('fuel_event')` → fuel detail or JE; Fuel row EntityLink to JE when posted.

5. **P1 — Optional load linkage when trip-known**  
   When Relay/GPS can attribute trip, set `load_id` (already in schema).

6. **P2 — Consider dedicated `FUEL_GL_POSTING_ENABLED`**  
   Today fuel shares EXPENSE_GL — document clearly in UI/ops to avoid accidental dual-post with manual expenses.

---

## Acceptance (this audit PR)

```
ROOT CAUSE: Fuel rows and unit links landed, and EXPENSE_GL is ON, but the after-commit fuel→JE poster never produced fuel_event batches or posted_to_gl stamps; driver/vendor/load FKs are empty.
FIX: docs-only evidence audit. Code fixes ranked above — not in this PR.
GUARD: n/a (audit). Future: verify-fuel-txn-posts-gl-when-expense-flag-on.mjs (Rule 17 step only).
LIVE PROOF: fuel_transactions=1499 (unit=1367, driver=0, vendor=0, load=0); relay posted_to_gl=0; fuel_event batches=0; fuel maps=3; EXPENSE_GL ON ×3; health e64fc4c.
REMAINING: P0–P2; owner Neon-apply only after code lands; Cursor never merges.
```

---

## Explicit non-claims

- Did **not** claim fuel “works” because the Fuel module has rows.  
- Did **not** Neon-apply or merge.  
- Bank categorization of fuel-card bank lines is P-BANK (separate), not a substitute for `fuel_event` GL.
