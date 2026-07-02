# TMS ↔ QBO Reconciliation Module — Architecture Spec (RECON-00)

**Status:** DESIGN LOCK (docs-only). No application code, no migration, no flag change ships in RECON-00.
**Block family:** RECON-00 (this doc, done) → RECON-01 (schema + jobs + engine, Tier-2 gated) → RECON-02 (UI, Tier-3).
**Book of record:** QuickBooks Online (QBO) for **TRANSP** (`operating_company_id 91e0bf0a-133f-4ce8-a734-2586cfa66d96`).
**Author's intent:** McLeod / NetSuite / QBO / Alvys-grade. Nothing vague, nothing deferred — RECON-01/02 dispatch the moment Jorge approves.

---

## Architecture (LOCKED — do not re-litigate)

TMS and QuickBooks Online are **DOUBLE BOOKS with NO SYNC.** There is no write path from TMS into QBO
and none from QBO into TMS. A **twice-daily RECONCILIATION MODULE** reads both sides and **flags every
transaction whose categorization / COA mapping differs** between them. The module:

- **NEVER auto-fixes.** It surfaces exceptions; a human resolves them through the normal gated
  transaction / journal-entry paths. It does not mutate a single financial row outside its own `recon_*` tables.
- **Is read-only against QBO forever.** It has no QBO write client and never will (§5).
- **QBO is TRANSP's book of record.** When TMS and QBO disagree, QBO wins as the reference; the exception
  documents the divergence for a human to correct in TMS (or to accept with a logged note).

This is the CPA-locked topology (memory: *CPA Locked Decisions 2026-07-01* — "NO TMS↔QBO sync → build a
twice-daily RECONCILIATION MODULE (flag every txn whose categorization differs)").

---

## 1. PURPOSE + STANDARDS — benchmark, ADOPT / SURPASS

**Purpose.** Give TRANSP a continuously-verified statement that its two books agree — and, where they do
not, a single ranked worklist of every divergence with one-click drill-down to the source record on the
TMS side and the QBO reference on the other. The module is the carrier's early-warning system for
mis-categorization, missed syncs (there is no sync, so this is *the* detector), post-close tampering, and
count/balance drift — before month-end MOR, not after.

The bar is set by the systems below. Each row is a researched, real-world benchmark, what we **ADOPT**, and
where we **SURPASS**.

| Benchmark system | What it does (verified behavior) | WE ADOPT | WE SURPASS |
|---|---|---|---|
| **QBO (Intuit) — bank reconcile** | Reconcile anchors on the **BEGINNING BALANCE**; a previously-reconciled txn that is later **modified / voided / deleted** is flagged in the **Reconciliation Discrepancy Report**, which shows **who changed it** (pulled from the QBO **Audit Log**); editing inside a **closed period** raises a warning. | (a) **Anchor to prior run** — each run anchors to the *prior verified run's* balance; **anchor drift** (that balance later moved) is its own exception class. (b) **Modification detection** — any previously-verified txn that later changes **on either side** resurfaces as a **new** exception with **actor attribution** from our `events.log_event` audit spine. (c) **Period-close interlock** — a closed-period exception gets **elevated severity**. | Discrepancy detection runs **twice daily on a schedule**, not only when a human opens the reconcile screen; attribution spans **both books**, not just QBO's own edits. |
| **NetSuite NSAR (Oracle) — Account Reconciliation** | Named **preparer / reviewer** with **sign-off dates**; dashboards show **complete / open / late** with **owner + variance commentary**; **tolerance thresholds** let near-matches auto-match but still require confirmation; **audit trail** on every match / unmatch. | **Preparer / reviewer + sign-off dates** on every run; a **run dashboard** (complete / open / late) with owner; **tolerance config** where any tolerance-accepted match is **logged as a low-severity exception**; **full user + timestamp trail** on every exception state change. | **Cadence: twice-daily** vs NSAR's daily norm. Maker≠checker is enforced *structurally* (§4) — the resolver can never be the run's preparer, and the system identity can never resolve. |
| **McLeod LoadMaster — integrated GL** | GL with **drill-down from every ledger entry to its SOURCE DOCUMENT**; the **25.1** release shipped a **QBO Accounting Interface** (confirming the industry topology is *TMS feeds QBO*, exactly our direction). | **ADOPTED AS LAW:** every recon exception links in **one click** to its source record on the **TMS side** (load, bill, driver settlement, bank txn, journal entry) **AND** carries the **QBO-side reference** for the matching entry. No exception is a dead end. | Drill-down is bi-directional at the *exception* grain (both books from one row), not just single-ledger drill-down. |
| **Alvys — QBO sync** | QBO sync with **COA mapping**, ~**5-min payment sync**, **reference-number prefixing**, **clearing-account discipline**. **Documented gap in their own docs:** *"Missed payment synchronizations are not automatically retried, so support intervention is required."* | **Reference-integrity checks** (our txn refs vs QBO refs) as an exception class; **clearing-account discipline** carried into the categorization-diff pass. | **We ARE the automatic missed-sync detector.** Because we reconcile rather than sync, a divergence (incl. a payment that never landed on the other side) **surfaces on the next scheduled pass — no support ticket, no manual retry.** Alvys' documented failure mode is our designed-for happy path. |
| **Numeric / BlackLine class — continuous close** | **Real-time detection** when a new txn hits an **already-reconciled** account; **prior-period monitoring** after close. | **BOTH:** modification-detection (new activity on a verified account resurfaces as an exception) **and** period-interlock (post-close touches elevated). | Delivered inside the TMS at no added license cost, entity-partitioned from day one for the USMCA launch (§8). |

---

## 2. THE TWO SCHEDULED PASSES (Jorge-locked)

Two server-scheduled passes plus on-demand runs. All runs are **server-stamped and append-only** — no run
is ever edited or deleted; a re-run is a **new** run row.

### AM pass — BANK-COUNT
- **Grain:** per entity, per bank account.
- **Compares:** transaction **COUNT** and **SUM (integer cents)**, TMS vs QBO, over a **rolling window**.
- **Rolling window:** default trailing N days (config), so recently-cleared items are always in scope; the
  window's opening balance is the **prior verified run's** closing balance (the anchor — see §3 ANCHOR DRIFT).
- **Emits:** count-mismatch and/or sum-mismatch exceptions when the two sides disagree.
- **Source (TMS):** `banking.bank_transactions` (`is_credit` bool per constitution §4). **Source (QBO):**
  the read captures already built (`listQboReconAlerts`, `listQboSyncConflicts`).

### PM pass — CATEGORIZATION-DIFF
- **Grain:** per transaction posted that day.
- **Compares:** the **TMS COA mapping** (the `catalogs.accounts` account a txn is categorized to) vs the
  **QBO account the entry actually landed in**, **side-by-side** with both values.
- **Emits:** categorization-divergence exceptions (and tolerance-accepted low-severity rows where a
  configured tolerance let a near-match pass — §3).

### On-demand runs
- A privileged user can trigger either pass ad hoc (e.g., before MOR). On-demand runs are ordinary
  `recon_runs` rows with `run_type` recording their trigger; they participate in anchoring exactly like
  scheduled runs.

**Scheduling substrate:** the existing `background_jobs` pattern (same pattern as the compliance reminder
job and QBO sync-health checks). Two cron entries (AM / PM) per the `render.yaml` cron service. Each run
writes `started_at` / `finished_at`, the preparer (the scheduled-job identity for scheduled runs), and
totals.

---

## 3. EXCEPTION CLASSES

Every divergence is one of these classes. Class drives default severity and the resolution workflow.

| Class | Fires when | Default severity | Notes |
|---|---|---|---|
| **COUNT_MISMATCH** | AM pass: txn count differs TMS vs QBO for a bank account/window | medium | count on each side captured in `tms_value` / `qbo_value` |
| **SUM_MISMATCH** | AM pass: summed cents differ TMS vs QBO for a bank account/window | medium | integer-cents only; never float |
| **CATEGORIZATION_DIVERGENCE** | PM pass: TMS COA mapping ≠ QBO account landed | medium | side-by-side account refs in `tms_value` / `qbo_value` |
| **ANCHOR_DRIFT** | The prior verified run's balance later moved (the anchor no longer holds) | high | the "beginning balance" integrity check; QBO-parity behavior |
| **MODIFIED_AFTER_VERIFIED** | A previously-verified txn later changed **on either side** | high | carries **actor attribution** from `events.log_event`; resurfaces as a **new** exception |
| **REFERENCE_INTEGRITY** | Our txn reference ≠ the QBO reference for the matched entry (broken/duplicated/missing ref) | medium | the Alvys "missed-sync" detector lives here |
| **CLOSED_PERIOD_TOUCH** | Any exception whose txn falls in a **closed accounting period** | **elevated** (bumped from base) | period-interlock; forces reviewer sign-off |
| **TOLERANCE_ACCEPTED** | A near-match passed under a configured tolerance threshold | **low** (logged, not blocking) | NSAR-style; logged so tolerance use is auditable |

Severity is **elevated one step** whenever the underlying txn is in a closed period, regardless of base class
(so e.g. a categorization divergence inside a closed period is logged as a closed-period-elevated exception).

---

## 4. DATA MODEL (design only — built in RECON-01)

Two tables under `accounting.*`. **Design only here.** The `CREATE TABLE` + grants + RLS policies land in
RECON-01 (gated migration). Column names below are the design contract RECON-01 implements.

### `accounting.recon_runs`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid | **UUIDv7, server-generated** PK |
| `operating_company_id` | uuid | entity scope (RLS); TRANSP today, USMCA slots in unchanged (§8) |
| `run_type` | text | `am_bank_count` \| `pm_categorization_diff` \| `on_demand_bank_count` \| `on_demand_categorization_diff` |
| `window_start` / `window_end` | timestamptz | rolling window bounds for the pass |
| `started_at` / `finished_at` | timestamptz | server-stamped; append-only |
| `preparer` | uuid | user or scheduled-job identity that ran it |
| `reviewer` | uuid \| null | named reviewer (NSAR) |
| `signed_off_at` | timestamptz \| null | set when reviewer signs off |
| `totals` | jsonb | counts/sums per side + exception tally (run dashboard reads this) |
| `status` | text | `running` \| `complete` \| `open` \| `late` (dashboard states) |
| `voided_at` | timestamptz \| null | **void-not-delete** (a mistaken run is voided, never deleted) |
| audit cols | — | `is_active`, created/updated stamps per constitution §2 |

### `accounting.recon_exceptions`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid | **UUIDv7, server-generated** PK |
| `run_id` | uuid | **FK → `accounting.recon_runs.id`** |
| `operating_company_id` | uuid | entity scope (RLS); denormalized from the run for direct scoping |
| `exception_class` | text | one of §3 |
| `source_ref` | jsonb | **TMS-side source** — `{ kind: load\|bill\|settlement\|bank_txn\|journal_entry, id, display }` (McLeod drill-down) |
| `qbo_ref` | jsonb \| null | **QBO-side reference** for the matched entry |
| `field` | text | which field diverged (e.g. `account_mapping`, `count`, `sum_cents`, `reference`) |
| `tms_value` | text | TMS value (cents as integer-string where numeric) |
| `qbo_value` | text | QBO value |
| `severity` | text | `low` \| `medium` \| `high` \| `elevated` |
| `status` | text | `open` \| `explained` \| `resolved` |
| `resolved_by` | uuid \| null | who resolved (maker≠checker enforced — see invariants) |
| `resolution_note` | text | **NOT NULL when `status = resolved`** (no silent resolves) |
| `resolved_at` | timestamptz \| null | server-stamped |
| `voided_at` | timestamptz \| null | **void-not-delete** |
| audit cols | — | `is_active`, created/updated stamps |

### Invariants (carried into RECON-01)
- **void-not-delete** on both tables — `voided_at`, never `DELETE`.
- **RLS `ENABLE` + `FORCE`** with the **canonical entity policy** (`operating_company_id`-scoped), matching the
  cross-entity remediation pattern. `SET app.operating_company_id` before any read or counts lie (constitution §2).
- **timestamptz only** — never a bare `timestamp`.
- **Every state change emits `events.log_event`** — run created/completed/signed-off, exception opened /
  explained / resolved / voided. This is the actor-attribution source for `MODIFIED_AFTER_VERIFIED`.
- **UUIDv7 server-generated PKs**; **`security_invoker = true`** on any view over these tables.
- **Maker ≠ checker:** the `resolved_by` of an exception **must differ from the `preparer` of its run**; the
  **system / scheduled-job identity can NEVER resolve** an exception. Enforced in the service and asserted by
  a CI guard (§5).
- **`resolution_note` NOT NULL on resolve** — a resolve without a written reason is rejected.
- **Runtime role `ih35_app`** needs GRANTs on `accounting.recon_runs` / `accounting.recon_exceptions` (add to
  the grant migration + DEFAULT PRIVILEGES) or it 500s at runtime (constitution §2 landmine).

---

## 5. HARD CONTROL — the module NEVER auto-fixes

**Named invariant: `RECON_READ_ONLY_NO_AUTOFIX`.**

1. **The module never auto-fixes.** It only writes to `accounting.recon_*`. It performs **no `INSERT` /
   `UPDATE` / `DELETE` on any other financial table** — not `accounting.invoices`, `accounting.bills`,
   `banking.bank_transactions`, `catalogs.accounts`, nor any GL/ledger table.
2. **Read-only against QBO forever.** No QBO write client is ever imported. The reconcile read service
   (`apps/backend/src/integrations/qbo/qbo-reconcile-read.service.ts`) issues only reads — `listQboModifyCaptures`
   (line 142), `listQboSyncConflicts` (line 189), `listQboReconAlerts` (line 220) — and RECON-01/02 extend
   only that read surface.
3. **Corrections flow through the normal gated paths.** When an exception needs fixing, a human corrects TMS
   via the ordinary transaction / journal-entry screens (each already gated per constitution §1.4). The recon
   module's only write is flipping the exception to `resolved` with a `resolution_note`.

### Required CI guard (name it, RECON-01 wires it)
**`verify:recon-read-only`** — **extend the existing FIN-23 static read-only test**
`apps/backend/src/integrations/qbo/__tests__/qbo-reconcile-read.read-only.test.ts` to additionally assert, for
the RECON-01 engine/service files:

- the QBO read service + reconcile routes still contain **no mutating SQL** (`INSERT INTO` / `UPDATE` /
  `DELETE FROM` / `MERGE` / `RETURNING` / DDL) — the FIN-23 `WRITE_SQL` regex already encodes this;
- the recon engine's **write statements target only `accounting.recon_runs` / `accounting.recon_exceptions`**
  (a static grep asserting every `INSERT`/`UPDATE` in the engine names a `recon_*` table);
- **no QBO write client import** appears anywhere in the recon module;
- the **maker≠checker** rule and **`resolution_note` NOT NULL on resolve** are covered by a unit assertion.

This guard is **REQUIRED in `ci.yml`** so the read-only / no-autofix property can never silently regress.

---

## 6. UI (RECON-02)

**Additive extension of the existing FIN-23 surface.** Route `/accounting/qbo-reconcile`
(`apps/frontend/src/pages/accounting/QboReconcileCapturesPage.tsx`, registered in
`apps/frontend/src/routes/manifest.tsx:3341`). **Additive only** — never delete, reorder, or rename existing
modules / columns / tabs (constitution §7).

- **Runs tab** — list of `recon_runs`: run_type, window, started/finished, preparer, reviewer, sign-off,
  totals, and **dashboard state (complete / open / late) with owner** (NSAR). Late = a scheduled run that
  did not complete on cadence.
- **Exceptions tab** — `recon_exceptions` in the **ParityTable grammar** (shared QBO-parity table with
  resize / sticky / export / filters): class, severity, field, **TMS value | QBO value side-by-side**,
  status, resolver, note. Ranked with **elevated / high first**.
- **One-click source drill-down (McLeod rule):** each exception row links to its TMS source record (load /
  bill / settlement / bank txn / journal entry) from `source_ref`, and shows the `qbo_ref` for the QBO side.
- **Resolve action:** flips an exception to `explained` / `resolved`; **`resolution_note` required on
  resolve**; maker≠checker enforced in the API. No auto-fix control exists anywhere in the UI.
- **i18n:** ES / EN keys for every label (`apps/frontend/src/i18n` + driver-pwa parity where surfaced).
- **§7 palette:** `--navy #1f2a44`, `--navy-dk #0f1729`, `--slate`, `--slate-lt`, `--bg #f8fafc`. Severity
  uses the locked `--red #dc2626` for elevated/high only. **No purple / blue / pink. No emojis** in
  headers / tables / sidebar. Module header carries the ← back-arrow + breadcrumb.
- **Flag-gated:** the tabs render only when the recon flag is ON (below); OFF today, app unchanged
  (mirrors the current `QBO_RECONCILE_UI_ENABLED` 404 behavior at
  `apps/backend/src/accounting/qbo-reconcile-captures.routes.ts:29/38`).

---

## 7. ROLLOUT + TIERING

### RECON-01 — schema + scheduled jobs + exception engine (**Tier 2**)
Additive `CREATE TABLE accounting.recon_runs` + `accounting.recon_exceptions` (idempotent `IF NOT EXISTS`,
migration number strictly above main's max at push time), grants for `ih35_app`, RLS ENABLE+FORCE canonical
entity policy, the two cron passes on the `background_jobs` pattern, and the exception engine (read-only, no
autofix). **Behind flag `TMS_QBO_RECON_ENABLED` (default OFF).**

**Tier-2 justification.** The block adds only new `accounting.*` tables and read/compute jobs — it moves **no
money**, posts **no GL**, and is **read-only against QBO and against every existing financial table**. It is
*not* the §1.4 "posting / GL / balances" cluster. But it **does** carry a `db/migrations/*.sql` and touches
`accounting.*` schema, which the constitution treats as financial-cluster for **merge** purposes. Therefore:
**Tier 2 = gated migration.** Build locally, run the migration on a Neon **test branch** only, show Jorge
`git diff --staged --stat` + the **full SQL**, and **WAIT for explicit "OK to merge."** Never self-merge
(constitution §1.3 / §1.4). Flag stays OFF at merge; flipping it ON is a separate Jorge decision.

### RECON-02 — UI tabs (**Tier 3**)
Additive frontend + read-only GET endpoints extending the FIN-23 surface. **Tier 3** = non-financial
frontend behind an OFF flag: buildable and (per the standing auto-merge rule) self-mergeable on green **only
because it ships no migration and touches no `accounting.*` schema or money path** — it renders data RECON-01
already produces. If any RECON-02 change ends up touching a migration or `accounting.*` schema, it becomes
financial and re-gates to Jorge.

---

### Appendix A — RECON-01 full block spec (dispatch-ready)

- **block_id:** `RECON-01` · **classification:** FINANCIAL (Tier-2 gated migration) · **flag:**
  `TMS_QBO_RECON_ENABLED` (default OFF).
- **Migration** `db/migrations/<TS>_recon_runs_exceptions.sql` (TS strictly above main max at push; idempotent
  `DO $$ ... IF NOT EXISTS`):
  - `CREATE TABLE accounting.recon_runs` (columns per §4), UUIDv7 default, RLS ENABLE + FORCE, canonical
    `operating_company_id` policy, `security_invoker` on any companion view.
  - `CREATE TABLE accounting.recon_exceptions` (columns per §4), FK `run_id → accounting.recon_runs(id)`,
    RLS ENABLE + FORCE, canonical entity policy, CHECK `status='resolved' ⇒ resolution_note IS NOT NULL`.
  - **Grants:** `GRANT USAGE ON SCHEMA accounting TO ih35_app`; `GRANT SELECT, INSERT, UPDATE ON
    accounting.recon_runs, accounting.recon_exceptions TO ih35_app`; DEFAULT PRIVILEGES. (No DELETE — void-not-delete.)
- **Engine service** `apps/backend/src/accounting/recon/recon-engine.service.ts` — the two passes (§2), writing
  ONLY `recon_*`; reuses `qbo-reconcile-read.service.ts` for the QBO side and `banking.bank_transactions` for TMS.
  Every write emits `events.log_event`. Maker≠checker + resolution-note enforced here.
- **Cron** `render.yaml` two entries (AM bank-count, PM categorization-diff) on the `background_jobs` pattern.
- **Read routes** GET-only, extend the reconcile route surface behind `TMS_QBO_RECON_ENABLED` (404 when OFF,
  role-gated 403), mirroring `qbo-reconcile-captures.routes.ts`.
- **CI guard** `scripts/verify-recon-read-only.mjs` (+ extend the FIN-23 test) wired REQUIRED in `ci.yml` (§5).
- **Tests:** migration test (tables/RLS/grants/CHECK), engine unit tests (each exception class fires; maker≠checker
  rejects; resolve without note rejected), read-only assertions.
- **Acceptance:** local typecheck green; migration runs on a **Neon test branch** only; `verify:recon-read-only`
  green; **show Jorge full SQL + `--staged --stat`; WAIT for "OK to merge"; flag OFF at merge.**
- **Reuse:** reconciled-status on Bills/Bill-Payments (#1755), bank-rec exact-match Confirm (#1754), Match Drawer
  (#1737/#1747), `qbo.sync_alerts` healthz check, `events.log_event` audit spine, `background_jobs` pattern.

### Appendix B — RECON-02 full block spec (dispatch-ready)

- **block_id:** `RECON-02` · **classification:** UI (Tier-3, non-financial) · **flag:** `TMS_QBO_RECON_ENABLED`.
- **Frontend** extend `apps/frontend/src/pages/accounting/QboReconcileCapturesPage.tsx` with **Runs** and
  **Exceptions** tabs (ParityTable grammar), the run dashboard (complete/open/late + owner), side-by-side
  TMS|QBO value cells, and one-click `source_ref` drill-down + `qbo_ref` display.
- **API client** additive read methods in `apps/frontend/src/api/accounting.ts` calling the RECON-01 GET routes.
- **Resolve UI** — resolve/explain actions; note required on resolve; no auto-fix control anywhere.
- **i18n** ES/EN keys added; **§7 palette** (no purple/blue/pink, no emojis); ← back-arrow + breadcrumb;
  **additive only** — no existing column/module/tab removed or reordered.
- **Guards:** `verify:arch-design` green (locked-UI surface untouched), `verify:nav-integrity`,
  `verify:no-internal-language-in-prod-ui`, responsive audit `new_vs_baseline=0`.
- **Acceptance:** frontend typecheck + vitest green; renders only when flag ON (OFF today → app unchanged);
  self-mergeable on green **only** because it ships no migration / no `accounting.*` schema (else re-gate).

---

## 8. FUTURE HOOKS (named, not built)

- **My-Accountant escalation.** An exception (esp. `high` / `elevated` / closed-period) can escalate to the
  external accountant — a notification hook off the exception state machine. Named only; not built in RECON-01/02.
- **USMCA activation.** The data model is **entity-partitioned from day one** (`operating_company_id` on both
  tables, canonical RLS). When USMCA launches (July 2026), it slots in with **zero refactor** — its runs and
  exceptions are simply scoped to its `operating_company_id`. USMCA books start at zero-balances, TMS-only,
  isolated (memory: *CPA Locked Decisions*), so recon is a no-op until it has activity — but the plumbing is ready.
- **Plaid / CSV dual-ingestion cross-check.** When bank data arrives via both Plaid and CSV, a future pass can
  cross-check the two ingestion sources against each other (a third leg of the reconciliation) before comparing
  to QBO. Named hook; the AM bank-count pass is the natural home.

---

## Verified repo anchors (all confirmed present on `main`, 2026-07-02)

- `apps/backend/src/integrations/qbo/qbo-reconcile-read.service.ts` — `listQboModifyCaptures` (line 142),
  `listQboSyncConflicts` (line 189), `listQboReconAlerts` (line 220); read-only, no QBO write client.
- `apps/backend/src/accounting/qbo-reconcile-captures.routes.ts` — behind `QBO_RECONCILE_UI_ENABLED`
  (line 29, default OFF); 404s when off (line 38); role-gated 403.
- `apps/frontend/src/pages/accounting/QboReconcileCapturesPage.tsx` at route `/accounting/qbo-reconcile`
  (`apps/frontend/src/routes/manifest.tsx:3341`).
- Read-only test guard: `apps/backend/src/integrations/qbo/__tests__/qbo-reconcile-read.read-only.test.ts`
  (under `__tests__/`, not the flat path older docs state) — FIN-23; RECON-01 extends this.
- Reuse: reconciled-status on Bills/Bill-Payments (#1755), bank-rec exact-match Confirm (#1754), Match Drawer
  (#1737/#1747), `qbo.sync_alerts` healthz check, `events.log_event` audit spine, `background_jobs` pattern.
- TRANSP `operating_company_id = 91e0bf0a-133f-4ce8-a734-2586cfa66d96`.
