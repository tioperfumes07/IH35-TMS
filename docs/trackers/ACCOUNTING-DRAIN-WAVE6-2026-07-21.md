> **STALE — NOT EVIDENCE OF PROGRESS (banner added 2026-07-22).**
> `CLAUDE-CODER-MERGE-SEQUENCE-2026-07-21.md` listed this PR under **NEVER merge (close as
> theater)** — it restates STALE tables and contains no wiring. It was merged anyway by the
> Claude Code verifier lane in a green-CI sweep that did not read that file first. See the
> **RECONCILIATION — 2026-07-22** section there for the full accounting.
> Living scoreboard is `TRUE-CONNECTIVITY-MASTER` + the FAIL-honest E2E audits, not this file.

# ACCOUNTING DRAIN — WAVE 6 verify (2026-07-21)

**Base:** `origin/main` @ `ade4d3f56`  
**Worktree:** `/private/tmp/ih35-acct-drain-w6-verify-20260721202119`  
**Scope:** priority candidate batch (12 + 2 g8-5 siblings) from owner Wave-6 paste — verify vs current `origin/main` code+schema evidence; open REAL FIX only if non-financial UI/guard residual remains.

Hard bans respected: `#3123/#3124/#3141/#3149` and already-open set `#3116–#3159`.  
Owner rulings locked for this drain: `accounting.chart_of_accounts_roles` PRIMARY; no invent GL; no CoA seed; Rule 17 for new guards; no `package.json` / CI workflow edits; builder never merges / never Neon-applies.

Sources cross-checked: `docs/trackers/block-audit-piles-2026-07-21.json`, `LIVE-AUDIT-GAPS-2026-07-21.md`, `BLOCK-RECONCILIATION-2026-07-19.md`, prior Waves 1–5 reports (open PRs `#3152/#3154/#3158` where not yet on main).

| # | block_id | verdict | evidence (repo @ ade4d3f56) | follow-up PR |
|---|---|---|---|---|
| 1 | `accounting-sortable-headers-guard-wiring` | **STALE** | Guard + verify-step on main: `scripts/verify-accounting-sortable-headers.mjs` + `scripts/verify-steps/933-verify-accounting-sortable-headers.mjs`. Merged `#2732` (2026-07-19). Pile=`BUILT`. | none |
| 2 | `0243-g8-5-no-error-state-blank-forever-spinner` | **STALE** | Wave A/B/C query-error tests + `isError` branches on accounting pages. Merged `#2698` (+ siblings `#2699`/`#2700`/`#2329`). Pile=`BUILT`. | none |
| 2b | `0243-g8-5-accounting-query-errors-wave-b` | **STALE** | Same root as #2 — `AccountingQueryErrorStatesWaveB.test.tsx` on main. `#2699`. | none |
| 2c | `0243-g8-5-accounting-query-errors-wave-c` | **STALE** | Same root — `#2700`. | none |
| 3 | `0007-pattern-8-reverse-drill-through` | **STALE / COVERED** | Behavior test `reverse-drill-through.behavior.test.tsx` + verify-steps `930/931/932` (entity-link adoption / deep-links / 94-live-counter). Merged `#2725`. Pile=`BUILT`. Backlog claim that guards are package.json-orphaned is **superseded by Rule 17 verify-steps auto-discovery**. | none |
| 4 | `AF-3-account-registers` | **STALE** | Full stack on main: `account-register.{routes,service}.ts`, `AccountRegisterPage.tsx`, ParityTable/URL-sort guards (`1158`/`957`). Verified live since 2026-07-03 reconcile. Pile=`BUILT`. | none |
| 5 | `ACCOUNTING-UI-POLISH` | **STALE** | Merged `#1920` (2026-07-04) — US dates / pills / expense toast. Pile=`BUILT`. No new UI residual in this batch. | none |
| 6 | `ACCT-BLOCK-10-ACCOUNT-BALANCES` | **STALE** | Merged `#709` ledger-backed balances view. Pile=`BUILT`. Disposition only (financial surface already shipped). | none |
| 7 | `0280-02-revenue-gl-linkage` | **STALE (HOLD shipped)** | Read-only dual-basis invoice↔GL linkage shipped as HOLD `#2714` (2026-07-19). Pile=`BUILT`. No further builder money work. | none |
| 8 | `0280-15-pending-approvals-gl-linkage` | **STALE (HOLD shipped)** | Pending-approvals JE/GL linkage HOLD `#2713`. Pile=`BUILT`. | none |
| 9 | `0091-h3-3` | **STALE** (pile GAP + LIVE-AUDIT **misfile**) | `isPostingFlag()` on main has `/_VOID_ENABLED$/` + explicit `VOID_ENFORCEMENT_ENABLED` / `WO_VOID_ENABLED` in `POSTING_FLAG_KEYS` (`feature-flags/service.ts`). Unit tests assert both. Merged `#2651`. **LIVE-AUDIT-GAPS-2026-07-21.md line claiming OPEN is stale vs main.** Tracker pile should drop GAP→BUILT. | none — decrement tracker |
| 10 | `0091-g6-1` | **STALE** | Accounting layer uses `companyBusinessDate()` widely; settlement reversal HOLD `#2705` + earlier `#2632`. Remaining `toISOString().slice(0,10)` hit in `lease.math.ts` is date arithmetic, not a "today" default. Pile=`BUILT`. | none |
| 11 | `0091-g9-h6` | **STALE** | Equipment list returns `total`/`has_more`/`limit`/`offset` (`equipment.routes.ts`). Merged `#2711`. CoA half earlier via `#2382`. Pile=`BUILT`. | none |
| 12 | `ps-a-item-editor-account-pickers-no-addnew` | **COVERED by HOLD `#3133`** | `allowAddNew` **is** wired on income+expense Comboboxes on main — original "missing + Add new" framing is **STALE**. Residual defect: nested chrome uses `QuickCreateEntityModal kind="category"` (no `account` kind) so "+ Add new account" creates a category id assigned to account FKs. Correct fix = `catalogs.accounts` write = **financial cluster** + conflicts with "no invent GL / owner-manual accounts". Already claimed: open DESIGN HOLD `#3133`. Do **not** open a second PR. | https://github.com/tioperfumes07/IH35-TMS/pull/3133 |
| 13 | `0243-g5-4-n-plus-1-report-loops-select-star` | **STALE** | N+1 deadhead/lane fix merged `#2710` (2026-07-19). Pile=`BUILT`. | none |
| 14 | `acct-fmcsa-fire-and-forget-retry` | **STALE** | Durable outbox retry path on main (`customers.routes.ts` `fmcsa_verify_retryable` + outbox enqueue tests). Merged `#2716`. Pile=`BUILT`. | none |
| 15 | `ap-control-test-isolation` | **STALE** | Isolated-company stress test `bill-payment-gl-ap-control-isolation.stress.db.test.ts` on main. Merged `#2719`. Sibling flake `bulk-post-as-bill` ap_control seed is **already claimed** by open `#3157` — different block, do not re-claim. | none (see `#3157` for sibling) |
| 16 | `A4-AUDIT-EMIT-ACCOUNTING` | **STALE** | Spine emit for accounting mutations merged `#889` (2026-06-12); later spine repair `#2169`. Pile=`BUILT`. | none |

## Verdict counts

| Verdict | Count |
|---|---|
| STALE | 14 |
| STALE (HOLD shipped) | 2 (0280-02 / 0280-15 — counted in STALE rows) |
| COVERED by open HOLD | 1 (`ps-a` → `#3133`) |
| STALE + pile/LIVE-AUDIT misfile | 1 (`0091-h3-3`) |
| REAL FIX (UI/guard-only) | **0** |
| NEEDS-PROD | **0** |
| new DESIGN HOLD | **0** (reuse `#3133`) |

No safe non-financial REAL FIX in this candidate set. Opening a second ItemEditor PR would either invent GL accounts or delete a surface — both forbidden.

## Accounting drain note

Wave 6 dispositions **this priority batch** (all STALE/COVERED).  
Accounting pile pending remains ≈ **63** (43 GAP · 17 NEEDS-OWNER · 3 NEEDS-PROD) per `block-audit-piles-2026-07-21.json` — full pile not drained; many GAPs claimed by open PRs `#3116–#3159`.

**Tracker hygiene (owner/coder):** flip `0091-h3-3` GAP→BUILT; keep `ps-a-item-editor-account-pickers-no-addnew` as GAP-under-HOLD until `#3133` owner ruling + financial follow-up; refresh `LIVE-AUDIT-GAPS-2026-07-21.md` line for `0091-h3-3`.

## Discipline

- Docs-only in this PR. Builder **does not merge**.
- No schema / CoA seed / PUBLIC grants / package.json / CI workflow edits.
- UNVERIFIED this wave: live Render deploy SHA lag vs `ade4d3f56`; Neon re-read of void-flag rows (classification-only change already on main — no Neon-apply needed for this batch).
