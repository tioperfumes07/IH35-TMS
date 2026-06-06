# IH35-TMS — GAP BLOCKS: TIER 1 TRUST FOUNDATION

**Created:** 2026-06-06
**Wave:** 1 (parallel to Settlement Wave 1)
**Total blocks:** 13
**Estimated duration:** ~18.5 days of Cursor work
**Approved by:** Jorge (Option B selection 2026-06-06)

---

## 📋 PRECONDITIONS

Before dispatching ANY block in this file:

1. PR #602 merged (✅ done as of 114bda50)
2. Cursor reads from main at session start (web_fetch raw URLs):
   - `docs/trackers/QBO-FEATURE-PARITY-REQUIREMENTS.md`
   - `docs/trackers/SAFETY-TRUST-RECOMMENDATIONS.md`
3. Manifest-first protocol (update `.block-ready.agent1.json` before code)
4. Standing orders apply: foreground only, no subagents, no retries STOP paste error, live updates every 5 min CST
5. Phantom-read self-guard pattern on any DB writes (single transaction + verify+abort)
6. No `--no-verify` pushes
7. 4-gate done criteria (squash-merge SHA + branch deleted + Render deploy + healthz 200)

---

## 🚦 DISPATCH SEQUENCE — 5 PARALLEL WAVES

```
WAVE A (sequential foundation, 1 lane):
  Block 1 → Block 4 → Block 3 → Block 9

WAVE B (parallel quality/security, can start any time):
  Block 10, Block 11, Block 7, Block 13

WAVE C (financial safety, after Wave A complete):
  Block 6 → Block 5

WAVE D (financial verification, after Wave C):
  Block 8 → Block 12

WAVE E (cleanup, after Block 13):
  Block 2 (Test Data Cleanup, depends on cron audit findings)
```

**Recommended cadence:** 2-3 blocks in flight at any time using disjoint allowed_files manifests.

---

## 📊 SUMMARY TABLE

| #  | Block                                | Model     | Days  | Wave | Depends     | Preview? |
|----|--------------------------------------|-----------|-------|------|-------------|----------|
| 1  | GAP-OBSERV-FOUNDATION                | Opus 4.8  | 2.0   | A    | none        | No       |
| 2  | GAP-TEST-DATA-CLEANUP                | Opus 4.8  | 1.0   | E    | #13         | No       |
| 3  | GAP-IDEMP-KEYS                       | Opus 4.8  | 2.0   | A    | #1          | No       |
| 4  | GAP-MIGRATION-RENAME-CI-GUARD        | Sonnet 4.6| 1.0   | A    | none        | No       |
| 5  | GAP-DOUBLE-ENTRY-DB-ENFORCEMENT      | Opus 4.8  | 1.0   | C    | #6          | No       |
| 6  | GAP-PERIOD-LOCK-DB-LEVEL             | Opus 4.8  | 2.0   | C    | #3, #4      | No       |
| 7  | GAP-RLS-STANDARDIZE-128              | Sonnet 4.6| 1.0   | B    | #1          | No       |
| 8  | GAP-FINANCIAL-RECONCILIATION         | Opus 4.8  | 3.0   | D    | #5, #6      | No       |
| 9  | GAP-ACTIVE-INACTIVE-STANDARDIZE      | Opus 4.8  | 2.0   | A    | #4          | ⚠️ YES   |
| 10 | GAP-SECURITY-HEADERS                 | Sonnet 4.6| 1.0   | B    | none        | No       |
| 11 | GAP-DEPENDABOT-VERIFY                | Sonnet 4.6| 0.5   | B    | none        | No       |
| 12 | GAP-DAILY-FINANCIAL-PROBE            | Sonnet 4.6| 1.0   | D    | #8          | No       |
| 13 | GAP-CRON-AUDIT-AND-RETUNE            | Sonnet 4.6| 1.0   | B    | #1          | No       |
|    | **TOTAL**                            |           |**18.5**|     |             |          |

---

## BLOCK 1 — GAP-OBSERV-FOUNDATION
**Model:** Opus 4.8 | **Days:** 2.0 | **Wave:** A | **Preview:** No

### Goal
Install Sentry + structured logging + 3 baseline alerts. Currently if something breaks in production, we find out from users. After this block, we find out from alerts.

### Scope
- `@sentry/node` SDK in main server (server.js, routes/*.mjs)
- Sentry initialization with environment-aware DSN (prod/staging/dev separate)
- Auto-instrument: HTTP requests, database queries (pg), unhandled exceptions
- request_id middleware: every request gets UUID, attached to logs + Sentry tags
- PII stripped from breadcrumbs (driver SSN, customer email)
- Replace console.log with pino structured logger
- Standard log fields: timestamp, level, request_id, user_id, operating_company_id, route, message
- `@sentry/react` for React fleet-reports-hub app
- 3 Baseline alerts: (1) 5xx error rate >1% over 5min, (2) p95 >2s, (3) DB connection pool exhausted
- `/admin/observability` route (admin-only, links to Sentry dashboard)

### Acceptance criteria
- Sentry receives errors from prod/staging/dev
- Structured logs with request_id correlation
- All 3 alerts configured and tested
- PII not present in breadcrumbs
- 4-gate done

### Open questions for Jorge (before dispatch)
- Sentry account: new project or existing?
- Alert destination: Slack / email / phone push?

---

## BLOCK 2 — GAP-TEST-DATA-CLEANUP
**Model:** Opus 4.8 | **Days:** 1.0 | **Wave:** E | **Depends on:** Block 13 | **Preview:** No

### Goal
Properly remove 4 TEST-TRUCK-* units with full FK chain analysis. Prior attempts halted twice on undiscovered FK dependencies. This block uses the preflight pattern: enumerate everything, plan removal, execute in single transaction with verify-and-abort.

### Test unit UUIDs
```
e6223cbf-2aa4-43b3-9e23-1172eaab40e5
630edccb-7445-4a88-978f-c1848e6c0820
08d86e86-62ba-444b-afce-c369930fb393
af684f0c-43ab-480a-a7d5-6c405cfa15ff
```

### Phases
1. Preflight enumeration (read-only) → committed doc `docs/audits/TEST-DATA-FK-CHAIN.md`
2. Active-write-path audit (confirm crons filter is_active)
3. Removal plan document
4. Single-transaction execution with self-guard (RAISE EXCEPTION on mismatch)
5. Post-verification

### Open questions
- Cleanup window: business hours or after-hours?

---

## BLOCK 3 — GAP-IDEMP-KEYS
**Model:** Opus 4.8 | **Days:** 2.0 | **Wave:** A | **Depends on:** Block 1 | **Preview:** No

### Goal
Every mutating financial endpoint becomes safe to retry. Client sends `Idempotency-Key: <uuid>` header, server stores key+response, replay returns cached response.

### Schema
```sql
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  operating_company_id uuid NOT NULL,
  request_method text NOT NULL,
  request_path text NOT NULL,
  request_hash text NOT NULL,
  response_status int NOT NULL,
  response_body jsonb NOT NULL,
  resource_id uuid,
  resource_type text,
  created_at timestamptz NOT NULL DEFAULT now(),
  ttl_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours')
);
```

### Required-on-list endpoints
driver-settlements, invoices, bills, expenses, payments, journal-entries, banking-transactions, factoring-advances, qbo-sync (all writes)

### Behaviors
1. Missing key on required endpoint → 400
2. Key present, no prior → process + store
3. Key present, prior, body matches → return cached (no side effects)
4. Key present, prior, body different → 409 Conflict
5. TTL'd → treated as no prior

---

## BLOCK 4 — GAP-MIGRATION-RENAME-CI-GUARD
**Model:** Sonnet 4.6 | **Days:** 1.0 | **Wave:** A | **Preview:** No

### Goal
CI rejects PRs that rename or edit content of already-applied migrations. Prevents re-run of applied migrations on next deploy.

### Implementation
- `.github/workflows/migration-guard.yml` — compares applied-migrations.json against PR files
- Pre-commit hook in `.husky/pre-commit`
- `.applied-migrations.json` populated with current state (sha256 per file)

---

## BLOCK 5 — GAP-DOUBLE-ENTRY-DB-ENFORCEMENT
**Model:** Opus 4.8 | **Days:** 1.0 | **Wave:** C | **Depends on:** Block 6 | **Preview:** No

### Goal
At DB level, every journal_entry must have SUM(debits) = SUM(credits). Enforced by trigger + CHECK constraint. Application can't write unbalanced entries.

### Key constraint
```sql
CONSTRAINT je_balanced CHECK (total_debits = total_credits)
```
Trigger updates totals on every line change; constraint fires on commit.

---

## BLOCK 6 — GAP-PERIOD-LOCK-DB-LEVEL
**Model:** Opus 4.8 | **Days:** 2.0 | **Wave:** C | **Depends on:** Blocks 3, 4 | **Preview:** No

### Goal
Closed periods → READ-ONLY at DB level via trigger. 7 financial tables covered: journal_entries, invoices, bills, expenses, banking.transactions, driver_settlements, factoring.advances.

### Open questions
- Initial lock state: lock all months prior to 2026-01-01, or start fresh?

---

## BLOCK 7 — GAP-RLS-STANDARDIZE-128
**Model:** Sonnet 4.6 | **Days:** 1.0 | **Wave:** B | **Depends on:** Block 1 | **Preview:** No

**HOLD: CLOSURE-32 RE-RUN REQUIRED FIRST (per DEDUPE-AUDIT-2026-06-06.md — T7-A)**
The "128 tables" count in this spec may have changed since the initial CLOSURE-32 audit.
This block MUST NOT dispatch until a fresh CLOSURE-32 targeted re-run confirms the
current count of ::text cast tables. Add this to the Wave B dispatch prerequisites:
Dependency: CLOSURE-32 re-run → confirms RLS cast table count → unblocks T7.

### Goal
Migrate 128 RLS policies from `::text` cast to canonical `NULLIF(...)::uuid` pattern.

```sql
-- BEFORE
USING (operating_company_id::text = current_setting('app.operating_company_id', true))
-- AFTER  
USING (operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid)
```

---

## BLOCK 8 — GAP-FINANCIAL-RECONCILIATION
**Model:** Opus 4.8 | **Days:** 3.0 | **Wave:** D | **Depends on:** Blocks 5, 6 | **Preview:** No

### Goal
Daily automated job catching financial drift before users do. 5 checks: AR, AP, Bank, Driver Settlement, Factoring. Drift > $0.01 → alert.

### Open questions
- Alert threshold: $0.01 (strict) or $1.00 (forgiving)?
- Alert destination (same as Block 1)

### Hard stop
Initial run shows existing production drift → STOP, escalate to Jorge for investigation before proceeding.

---

## BLOCK 9 — GAP-ACTIVE-INACTIVE-STANDARDIZE
**Model:** Opus 4.8 | **Days:** 2.0 | **Wave:** A | **Depends on:** Block 4 | **Preview:** ⚠️ YES

### ⚠️ PREVIEW GATE — MANDATORY
Must enumerate affected list pages + generate mockups + await Jorge approval BEFORE any code.

### Goal
Universal soft-delete across every business entity. `is_active` column + `inactivated_at/by/reason` + API `?status=active|inactive|all` + UI filter dropdown + CI guard rejecting new entity tables without `is_active`.

### Open questions
- Preview delivery method: (a) HTML mockup file, (b) annotated screenshots, (c) other?

---

## BLOCK 10 — GAP-SECURITY-HEADERS
**Model:** Sonnet 4.6 | **Days:** 1.0 | **Wave:** B | **Preview:** No

### Goal
Apply OWASP-recommended security headers via `helmet` middleware. HSTS, CSP, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy, COOP, CORP. CSP in report-only mode 48h first, then enforce.

---

## BLOCK 11 — GAP-DEPENDABOT-VERIFY
**Model:** Sonnet 4.6 | **Days:** 0.5 | **Wave:** B | **Preview:** No

### Goal
Confirm Dependabot enabled, configured for npm + GitHub Actions. `.github/dependabot.yml` with weekly schedule, Jorge as reviewer. Runbook at `docs/runbooks/dependabot-workflow.md`.

---

## BLOCK 12 — GAP-DAILY-FINANCIAL-PROBE
**Model:** Sonnet 4.6 | **Days:** 1.0 | **Wave:** D | **Depends on:** Block 8 | **Preview:** No

### Goal
7 daily production probes verifying exact numbers: invoice math, settlement math, bill math, banking running balance, QBO sync amounts, period lock rejection, idempotency replay. Run at 7 AM CST. Catch math bugs within 24 hours of deploy.

---

## BLOCK 13 — GAP-CRON-AUDIT-AND-RETUNE
**Model:** Sonnet 4.6 | **Days:** 1.0 | **Wave:** B | **Depends on:** Block 1 | **Preview:** No

### Goal
Enumerate every cron: schedule, purpose, tables written, is_active filter, idempotency, failure recovery. Phase 1 read-only inventory committed before any changes. Lesson locked: never propose tuning without reading actual code first (PM-auto-WO cron error 2026-06-06).

### Output
- `docs/audits/CRON-INVENTORY-2026-06-XX.md`
- `docs/audits/CRON-RECOMMENDATIONS-2026-06-XX.md`
- Safe Phase 4 tunings (is_active filter additions only, nothing controversial)

---

## DISPATCH DIRECTIVE (paste to Cursor when ready)

```
JORGE DIRECTIVE — TIER 1 TRUST FOUNDATION DISPATCH

Spec file: docs/dispatch/GAP-BLOCKS-TIER1-TRUST-2026-06-06.md

ACTIONS:
1. Commit spec to docs/dispatch/GAP-BLOCKS-TIER1-TRUST-2026-06-06.md
   Branch: docs/tier1-trust-spec, squash-merge, no --no-verify

2. Dispatch in WAVE order:
   Wave A (sequential): Block 1 → Block 4 → Block 3 → Block 9
   Wave B (parallel anytime): Blocks 10, 11, 7, 13
   Wave C (after Wave A): Block 6 → Block 5
   Wave D (after Wave C): Block 8 → Block 12
   Wave E (after Block 13): Block 2

3. PARALLEL LANES: 2-3 blocks in flight using disjoint allowed_files manifests.
   Settlement blocks (separate spec) can run in third lane after Block 1 lands.

4. CHECKPOINT every 2 blocks: 5-line status to Jorge (last 2 PRs+SHAs, main SHA,
   prod state, next 2 blocks, continue/pivot/stop)

5. PREVIEW GATE on Block 9: enumerate affected pages + mockup first.
   Do NOT start code without Jorge-approved preview.

REFERENCES at session start:
  - docs/trackers/QBO-FEATURE-PARITY-REQUIREMENTS.md
  - docs/trackers/SAFETY-TRUST-RECOMMENDATIONS.md

Block 1 (Observability) dispatches first. Safe to start immediately after spec commit.

OPEN QUESTIONS (ask Jorge before relevant blocks):
  Q1: Sentry account — new project or existing?
  Q2: Alert destination — Slack / email / phone push?
  Q3: Period lock initial state — lock pre-2026-01-01 or start fresh?
  Q4: Reconciliation threshold — $0.01 or $1.00?
  Q5: Block 9 preview format — HTML mockup / annotated screenshots / other?
  Q6: Test data cleanup window — business hours or after-hours?
```

---

**END OF SPEC. This file is canonical reference for Tier 1 Trust Foundation.**

**Next dump:** Tier 1.5 financial completeness (Fixed Assets Depreciation, Driver Escrow Ledger, IFTA) + Tier 2 hardening.
