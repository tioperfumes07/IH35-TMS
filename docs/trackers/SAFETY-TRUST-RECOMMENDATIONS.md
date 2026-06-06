# IH35-TMS — Safety, Trust, Integrity & Scale Recommendations

**Author:** Claude (in conversation with Jorge Pablo Munoz)
**Date locked:** 2026-06-06
**Source conversation:** PASS-8-RUNTIME DEGRADED resolution + Strategic Assessment
**Purpose:** Reference document for making IH35-TMS trust-grade at scale (32 → 300 trucks)

---

## 🎯 THE FRAMING (read this first, every time)

**Jorge does not want to "beat McLeod."**

Jorge wants **TRUST** in IH35-TMS equivalent to the trust he has in QuickBooks for accounting. The bar is:

> *"Software I can stop checking because I know it's right."*

When Jorge looks at a settlement, an invoice, a dispatch, a bill — he wants the same internal confidence he has when QuickBooks shows him a P&L. He doesn't double-check QuickBooks math. He trusts it.

That is the standard.

This document is about closing the gap between **"good architecture"** and **"trust-grade production system."** Architecture is the foundation. Trust is what gets built on top of it through observability, resilience, discipline, and operational maturity.

---

## 🔑 THE EIGHT TRUST CRITERIA

The software reaches "trust-grade" when **all eight** of these are demonstrably true (not just designed-for, but **verified**):

1. **Settlements are deterministic** — same inputs always produce same output. Never duplicate. Never silently lose a line item.
2. **Financial writes are idempotent under retry** — pressing "create invoice" twice produces one invoice, not two. Same for bills, payments, settlements.
3. **RLS prevents 100% of cross-carrier data leaks** — proven by automated tests on every endpoint, not just spot-checked.
4. **Outbox guarantees no lost QBO sync** — even if QBO is down for days, nothing is lost; everything queues and replays.
5. **Backups are tested and restorable** — not just "configured." Tested quarterly with a real restore drill.
6. **Observability surfaces issues before users hit them** — Jorge finds out about problems from a dashboard or alert, not from an angry dispatcher's phone call.
7. **Every external dependency has documented degradation behavior** — for QBO, Samsara, Twilio, R2: if it's down, you know exactly what works and what doesn't.
8. **Audit log is tamper-evident** — even with database access, you cannot silently alter history. Cryptographic chain.

When all eight are green, the software earns the same trust Jorge gives QuickBooks today.

---

## 📊 THE SEVEN CATEGORIES OF WORK

Ranked by what actually causes failure between 32 and 300 trucks.

### CATEGORY 1: OBSERVABILITY (biggest gap, lowest cost to fix)

**Why this is #1:** You currently learn about prod issues from Cursor manually probing healthz. At 300 trucks something will be broken right now and you won't know for hours.

**What you need:**
- **Error tracking (Sentry):** every exception in prod with stack trace, breadcrumbs, user context. Free tier covers your volume. 4 hours to integrate.
- **Structured logging:** JSON logs with `trace_id`, `operating_company_id`, `user_id`, `request_id`. Pino or Winston. NOT `console.log` strings.
- **APM / distributed tracing:** OpenTelemetry to free Honeycomb tier. Lets you see "this request took 8 seconds because N+1 query."
- **Real-time dashboards:** request rate, error rate, p95 latency, DB pool utilization, outbox queue depth. Grafana Cloud free tier.
- **Alerting:** PagerDuty or free OpsGenie. Page on: healthz 5xx >1min, error rate >5%, outbox queue >1000 stuck, DB pool >90%.

**Recommended block:** `GAP-OBSERV-FOUNDATION` — Sentry + structured logs + dashboard + 3 alerts. ~2 days. Massive payoff.

---

### CATEGORY 2: DATA INTEGRITY & RECOVERY

**The 5 questions you must answer YES to:**

1. **"Can I restore the database to 2 hours ago?"** → Verify Neon point-in-time recovery is enabled with adequate retention.
2. **"Have I tested the restore in the last 90 days?"** → If no, an untested backup is not a backup. Schedule it.
3. **"Are backups encrypted with a key I control?"** → Neon encrypts at rest. Do you have a separate logical export off-platform (S3/R2 different account)?
4. **"If two dispatchers create the same invoice simultaneously, do I get one or two?"** → Idempotency keys on POST. Critical for invoices, bills, payments, settlements.
5. **"If QBO outbox has a poison message, does it block everything behind it forever?"** → Need dead letter queue + max attempt count + manual replay UI.

**Recommended blocks:**
- `GAP-IDEMP-KEYS` — idempotency-key middleware on all mutating endpoints
- `GAP-DR-DRILL` — quarterly disaster recovery rehearsal + runbook
- `GAP-OUTBOX-DLQ` — dead letter queue with replay UI for stuck QBO messages

---

### CATEGORY 3: SECURITY HARDENING (RLS is necessary but not sufficient)

**The other security work Cursor missed:**

1. **Secret rotation** — Twilio, QBO OAuth, Samsara, R2, Neon, JWT keys. When was each last rotated?
2. **PII encryption at column level** — driver SSNs, DLs, medical card numbers, passports. pgcrypto with separate KMS key. Regulatory requirement in some states (CCPA, Texas data-breach law).
3. **Audit log tamper-evidence** — cryptographic hash chain. Each row hashes the previous row's hash. Modification breaks the chain. SOX-grade.
4. **Rate limiting per OCI per endpoint** — a buggy driver app retry loop can DoS your own API. express-rate-limit. 100 req/min/user, 1000/min/OCI.
5. **Security headers** — CSP, HSTS, X-Frame-Options, Permissions-Policy. helmet.js gives all of this in 3 lines.
6. **Dependency scanning** — Dependabot (free, GitHub-native). Verify alerts are enabled + flowing somewhere read.
7. **SAST in CI** — Semgrep free tier. Catches SQL injection patterns, hardcoded secrets in PR review.
8. **External penetration test** — before commercializing or before 100 trucks of third-party data. One good consultant, 1 week, $5-15K. Worth it.

**Recommended blocks:**
- `GAP-SECRETS-ROTATION` — rotation playbook + automation
- `GAP-PII-ENCRYPTION` — column-level encryption for driver sensitive data
- `GAP-AUDIT-HASH-CHAIN` — tamper-evident audit log
- `GAP-RATE-LIMIT` — per-OCI per-endpoint rate limiting
- `GAP-SECURITY-HEADERS` — helmet.js + CSP policy

---

### CATEGORY 4: SCALE READINESS (the 300-truck question)

**Beyond indexes + pool sizing:**

1. **Load testing NOW, not later** — k6 or Artillery. Simulate 300 trucks doing realistic operations (10 dispatches/hr, 50 driver pings/min, 5 settlements/day). Find the breaking point in staging.
2. **Database query budget enforcement** — every API endpoint has a p95 latency budget. CI check against seeded DB. Catches N+1 before it ships.
3. **Background job framework** — Bull/BullMQ on Redis. Move all heavy work (PDFs, QBO sync, reports, settlement calc) to async workers. Web tier stays fast.
4. **Pagination on every list endpoint** — any GET returning a list without cursor pagination is a future timeout. At 300 trucks, `loads.list` returning 50K rows times out the dispatcher's browser.
5. **Database partitioning for large tables** — `samsara.location_pings`, `hos.duty_changes`, `audit.event_log` will dominate row count. Partition by month or by OCI. Critical by 150 trucks.
6. **CDN + cache strategy** — static assets through Cloudflare/R2. Frequent reads (driver profile, vehicle list) cached in Redis with sane TTL.

**Recommended blocks:**
- `GAP-LOAD-TEST-BASELINE` — establish capacity numbers with k6
- `GAP-PERF-BUDGETS-CI` — enforce p95 budget per endpoint
- `GAP-PAGINATION-AUDIT` — every list endpoint cursor-paginated
- `GAP-PARTITION-HOT-TABLES` — partition samsara_pings, hos_changes, audit_log

---

### CATEGORY 5: RELIABILITY (graceful failure)

1. **Circuit breakers on every external call** — Samsara down? Don't make every request to your API wait 30 seconds. Open the circuit, return degraded data, log + alert. Library: opossum.
2. **Retry with exponential backoff + jitter** — pure retry storms make outages worse.
3. **Graceful degradation matrix** — for each external dep, document: "If this is down, what works? What doesn't? What does user see?"
4. **Blue-green or canary deploys** — Render supports this. A bad deploy currently = downtime. 30 seconds of downtime during dispatch shift change is painful.
5. **Multi-region readiness** — not yet, but document the plan. Honest answer matters.

**Recommended blocks:**
- `GAP-CIRCUIT-BREAKERS` — opossum on Samsara, QBO, Twilio, R2
- `GAP-DEGRADATION-MATRIX` — document per-dependency degradation behavior
- `GAP-CANARY-DEPLOY` — blue-green or 10% canary on Render

---

### CATEGORY 6: TESTING (where most teams claim coverage they don't have)

**Honest questions:**

1. **Actual unit test coverage %?** — run `vitest --coverage`. Target: 70%+ on services, 90%+ on financial/RLS code.
2. **Does one failing test catch a real bug per PR?** — if not, the suite is decoration.
3. **End-to-end tests for 5 critical workflows?** — Book load. Dispatch. Driver completes load. Settlement. Invoice + send. Playwright. ~2 days.
4. **Multi-tenant 403/200 test pair on every new endpoint?** — non-negotiable CI gate.
5. **Chaos engineering** — have you killed Redis in staging mid-request? Document what breaks.

**Recommended blocks:**
- `GAP-E2E-CRITICAL-PATHS` — Playwright on 5 critical workflows
- `GAP-RLS-TEST-GATE` — CI gate: every carrier-scoped endpoint has 403/200 pair
- `GAP-COVERAGE-BASELINE` — establish + enforce minimum coverage %

---

### CATEGORY 7: BUSINESS CONTINUITY & HONESTY

1. **Key-person risk** — if Jorge is unavailable for 2 weeks, can the business operate? Document how to deploy, restore, debug, where credentials live, who has access.
2. **Vendor lock-in inventory** — what runs you out of business if X happens? Render → Heroku/Fly.io plan. Neon → RDS plan. R2 → S3 plan. GitHub → GitLab mirror. You don't need to USE alternatives; you need to know they exist and have data portability.
3. **Source code escrow** — if you ever sell access to other carriers, they'll want this.
4. **Cyber liability insurance** — at 300 trucks with sensitive PII + financial data, you should have coverage.
5. **Honest documentation of what the system CAN NOT do** — a maintained "Known Limitations" doc. Protects you legally, sets correct expectations, builds trust through honesty.
6. **Data ownership clarity** — whose data is it? Especially matters for USMCA + future customers.

**Recommended blocks:**
- `GAP-OPS-RUNBOOKS` — full operational documentation
- `GAP-VENDOR-LOCKIN-DOC` — migration paths for every critical vendor
- `GAP-KNOWN-LIMITATIONS` — honest public-facing doc of what doesn't work

---

## 💰 THE FINANCIAL TRUST LAYER (added 2026-06-06 from Cursor)

This is what specifically gives you the **QuickBooks feeling** in your own software. Cursor identified five items that bridge "good architecture" to "I trust the numbers without checking."

### 1. Financial Double-Entry Enforcement at the DB Layer

QuickBooks cannot produce an unbalanced journal entry. Period. Your system needs the same:

```
EVERY settlement, invoice, and bill creates a balanced 
accounting.journal_entry → or it fails hard at write time.

This is a DATABASE-LEVEL constraint, not just an app-level check.
Settlement code can have bugs. App checks can be bypassed. 
A DB CHECK constraint cannot.

Recommended: 
  CONSTRAINT balanced_entry CHECK (
    (SELECT SUM(debit) - SUM(credit) 
     FROM accounting.journal_lines 
     WHERE journal_entry_uuid = uuid) = 0
  )
```

**Why this matters:** Bug surfaces at write time, not weeks later in reconciliation. Eliminates an entire class of accounting drift.

**New block: `GAP-DOUBLE-ENTRY-DB-ENFORCEMENT`** — Tier 0 or Tier 1, depending on current state of journal_entry constraints.

### 2. Every Number Must Have an Audit Trail

When you open a settlement in QuickBooks and ask "where does this $1,350 come from?" — you can trace it. Click through to the source documents.

Your software needs the same:

```
EVERY figure on EVERY screen → derivable from source records.

Verification gate:
  - Display layer must include "source" reference for each number
  - CI check: every settlement/invoice/bill page renders source links
  - Manual audit: pick 10 random numbers from production, verify 
    each traces to source rows
```

**Mostly in your design** (outbox + journal_entries pattern). Needs verification gate to ensure new features don't drift from the pattern.

**New block: `GAP-AUDIT-TRAIL-COVERAGE`** — Tier 2.

### 3. Immutable Finalized Records (Period Locking)

QuickBooks locks periods. Once closed, nothing changes silently. Your `accounting.periods` table needs the same:

```
PERIOD STATUS = 'closed' → READ-ONLY at DB level.

Invoices in a closed period:
  ❌ Cannot be silently modified
  ❌ Cannot be silently deleted
  ✅ CAN be corrected via an explicit correction entry 
     (new row, different period, references the original)

Enforcement: trigger or RLS policy on accounting.* tables checking 
period_uuid → period.status = 'closed' → REJECT write.
```

**Why this matters:** The #1 source of "I discovered a $4K error 6 months ago" horror stories. Locked periods prevent retroactive editing that destroys audit trail.

**New block: `GAP-PERIOD-LOCK-DB-LEVEL`** — Tier 1. Critical before 100 trucks if not already enforced.

### 4. Reconciliation Jobs That Catch Drift (the QuickBooks feeling)

This is the **specific thing** that gives you the daily-bank-rec confidence in your own software. Cursor's proposed block name is exactly right:

```
GAP-FINANCIAL-RECONCILIATION

A nightly job (or hourly for hot paths) that:
  1. Settlement totals MATCH journal_entry totals → variance > $0.01 alerts
  2. Invoice amounts MATCH payments received (or invoice.balance_due) 
     → variance alerts
  3. Outbox enqueues MATCH QBO sync confirmations → drift alerts
  4. Bill totals MATCH journal_entry totals → variance alerts
  5. Daily "everything balanced" confirmation email/dashboard

If drift found: ALERT (do not silently continue).
If no drift: confirmation Jorge can look at every morning the way he 
            looks at his bank reconciliation.

This is the trust-layer killer feature.
```

**New block: `GAP-FINANCIAL-RECONCILIATION`** — Tier 1 (this is THE QuickBooks-feeling block).

### 5. Probes, Not Just Tests

Tests verify the system works in isolation. Probes verify the system works in production right now:

```
A daily automated probe that:
  1. Runs ONE real end-to-end financial transaction in a test OCI
     (book load → settle → invoice → bill → close)
  2. Verifies the numbers are EXACT (not "API returned 200")
  3. Checks the journal_entry balance to the penny
  4. Confirms the outbox row enqueued
  5. Posts to dashboard + alerts on any deviation

Test OCI = real production environment, isolated company.
Numbers verified against expected values, not just "did it work."

This gives you overnight confidence. You wake up to either a 
GREEN check (system is healthy) or an alert (something specific 
broke last night, here are the numbers).
```

**New block: `GAP-DAILY-FINANCIAL-PROBE`** — Tier 1 (paired with Observability foundation).

---

## 🤖 MODEL SELECTION RULE (locked 2026-06-06)

For every GAP block dispatch, ask the 5-dimensional question. If ANY dimension hits, use **Opus 4.8 thinking-high**. All NO = **Sonnet 4.6 medium-thinking**.

```
DIMENSION                    OPUS TRIGGER
─────────────────────────────────────────────────────────────────────
1. Cost of failure           Bug = data integrity OR security problem
                             
2. Reversibility             Hard to undo: schema breaks, RLS policies, 
                             deletions, financial state transitions
                             
3. Ambiguity                 Spec has judgment calls vs mechanical exec

4. Cross-cutting reach       Touches 3+ modules OR multiple OCIs OR 
                             multiple schemas

5. First-of-kind             FIRST block establishing a new pattern 
                             (subsequent blocks clone from it)
─────────────────────────────────────────────────────────────────────
ANY YES → Opus    All NO → Sonnet
```

**Across all 113 blocks (91 existing + 22 new):** ~57 Opus, ~56 Sonnet expected. The model fee differential is the cheapest insurance on the critical path.

**Critical: First-of-kind rule means the FIRST observability block, FIRST idempotency block, FIRST circuit breaker block, etc. get Opus to set the template right. Subsequent clones can use Sonnet.**

**First-of-kind blocks that REQUIRE Opus (template establishment):**
- `GAP-OBSERV-FOUNDATION` — Sentry + structured logs + trace pattern cloned by every service
- `GAP-CIRCUIT-BREAKERS` — opossum wrapper + degradation pattern cloned by every external integration
- `GAP-IDEMP-KEYS` — idempotency-key middleware pattern cloned by every mutating endpoint
- `GAP-RLS-TEST-GATE` — 403/200 test scaffold cloned by every carrier-scoped endpoint
- `GAP-FINANCIAL-RECONCILIATION` — drift detection job pattern cloned for each financial domain
- `GAP-DAILY-FINANCIAL-PROBE` — end-to-end prod verification pattern

---

## 🎯 THE 10 MUST-DO BEFORE 300 TRUCKS (updated 2026-06-06)

If you only do seven things, do these. **Note (updated 2026-06-06):** items 8-10 are the financial trust layer Cursor identified — they're equally important for the QuickBooks-trust standard, so this is now a 10-item list.

| # | Item | Cost | Payoff |
|---|------|------|--------|
| 1 | Observability foundation (Sentry + structured logs + dashboard + 3 alerts) | 2 days | See issues before customers do |
| 2 | RLS cast standardization (128 `::text` → canonical `NULLIF(...)::uuid`) | 1 block | Eliminate data isolation drift |
| 3 | Migration rename CI guard | 1 day | Prevents repeating last week's orphan saga |
| 4 | Idempotency keys on all mutating endpoints | 2 days | No duplicate invoices/payments under retry |
| 5 | Load test baseline (k6 at 300-truck scale) | 2 days | Find breaking point in staging, not prod |
| 6 | Disaster recovery drill | 1 day | Actually have backups, not just backup config |
| 7 | Operational runbooks | 3-5 days | Business survives if Jorge is unavailable |
| **8** | **Financial reconciliation jobs (GAP-FINANCIAL-RECONCILIATION)** | **3 days** | **THE QuickBooks feeling — daily drift confirmation** |
| **9** | **Double-entry DB constraint (GAP-DOUBLE-ENTRY-DB-ENFORCEMENT)** | **1 day** | **Unbalanced entries impossible at write time** |
| **10** | **Period-lock DB enforcement (GAP-PERIOD-LOCK-DB-LEVEL)** | **2 days** | **Closed periods immutable, no silent retroactive edits** |

**Total: ~3-4 weeks focused.** Parallelizable across existing GAP queue cadence.

---

## 📋 ALL NEW GAP BLOCKS PROPOSED (in addition to existing 91)

Slot these into the existing wave structure. Tiers represent suggested sequencing, not exclusivity.

### TIER 0 — (REMOVED 2026-06-06 per Cursor's correct pushback)

Original Tier 0 blocks (`GAP-RLS-STANDARDIZE-128`, `GAP-MIGRATION-RENAME-CI-GUARD`) moved to Tier 1.

**Rationale:** The 128 `::text` casts have **functional isolation today** — they work, just non-canonical syntax. The migration rename CI guard prevents FUTURE orphan clusters, not current ones. Blocking 91 blocks of feature work behind syntactic standardization is wrong cost/benefit. Standardize AFTER observability is in place so you can see what you're doing during the change.

### TIER 1 — First wave after GAP unpause (high value, lower risk)
- `GAP-OBSERV-FOUNDATION` — Sentry + structured logs + dashboard + 3 alerts
- `GAP-IDEMP-KEYS` — idempotency keys on mutating endpoints
- `GAP-SECURITY-HEADERS` — helmet.js + CSP
- `GAP-DEPENDABOT-VERIFY` — confirm + tune dependency scanning
- **`GAP-FINANCIAL-RECONCILIATION` — daily drift catch > $0.01, the QuickBooks-feeling block** ⭐
- **`GAP-DOUBLE-ENTRY-DB-ENFORCEMENT` — DB constraint, unbalanced entries fail hard** ⭐
- **`GAP-PERIOD-LOCK-DB-LEVEL` — closed periods immutable at DB layer** ⭐
- **`GAP-DAILY-FINANCIAL-PROBE` — daily prod end-to-end probe verifying exact numbers** ⭐
- **`GAP-RLS-STANDARDIZE-128` — canonical NULLIF(...)::uuid cast pass (moved from Tier 0)** ⭐
- **`GAP-MIGRATION-RENAME-CI-GUARD` — prevent next orphan cluster (moved from Tier 0)** ⭐
- **`GAP-TEST-DATA-CLEANUP` — full FK chain audit + atomic cleanup of TEST-TRUCK-* artifacts (added 2026-06-06 from Pass-2 ingest deferral)** ⭐
- **`GAP-CRON-AUDIT-AND-RETUNE` — audit every scheduled job: verify frequency matches operational reality, document rationale, capacity math at 300 trucks (added 2026-06-06; original 5-min PM cron hypothesis was incorrect — actual cron is hourly per Cursor verification 2026-06-06)** ⭐
- **`GAP-ACTIVE-INACTIVE-STANDARDIZATION` — universal soft-delete pattern: every entity gets is_active flag, filter dropdown, toggle action, cron filter, audit columns. QuickBooks-standard (added 2026-06-06 from Jorge's design directive)** ⭐

### TIER 2 — Parallel with feature GAP blocks (capacity work)
- `GAP-RATE-LIMIT` — per-OCI per-endpoint
- `GAP-CIRCUIT-BREAKERS` — opossum on external calls
- `GAP-OUTBOX-DLQ` — dead letter queue + replay UI
- `GAP-PAGINATION-AUDIT` — cursor-paginate all list endpoints
- `GAP-LOAD-TEST-BASELINE` — k6 capacity baseline
- `GAP-E2E-CRITICAL-PATHS` — Playwright on 5 workflows
- `GAP-RLS-TEST-GATE` — CI: 403/200 pair per carrier-scoped endpoint
- **`GAP-AUDIT-TRAIL-COVERAGE` — every displayed number derivable from source** ⭐
- **`GAP-DESTRUCTIVE-OP-PREFLIGHT` — CI tool that audits FK chains + active write paths before any destructive SQL block dispatch (added 2026-06-06 from Pass-2 ingest lessons)** ⭐
- **`GAP-OPERATIONAL-TUNING-CATALOG` — document every operationally-significant setting (cron intervals, cache TTLs, retry backoffs, pool sizes, log retention) with rationale + review cadence (added 2026-06-06 from PM cron capacity analysis)** ⭐

### TIER 3 — Before 200 trucks (institutional maturity)
- `GAP-PII-ENCRYPTION` — column-level for driver sensitive data
- `GAP-AUDIT-HASH-CHAIN` — tamper-evident audit log
- `GAP-SECRETS-ROTATION` — rotation playbook
- `GAP-DR-DRILL` — quarterly restore rehearsal
- `GAP-OPS-RUNBOOKS` — operational documentation
- `GAP-DEGRADATION-MATRIX` — per-dependency failure behavior

### TIER 4 — Before 300 trucks (pre-scale)
- `GAP-PARTITION-HOT-TABLES` — samsara_pings, hos_changes, audit_log
- `GAP-CANARY-DEPLOY` — blue-green on Render
- `GAP-VENDOR-LOCKIN-DOC` — migration paths documented
- `GAP-KNOWN-LIMITATIONS` — honest public doc

---

## 💼 FINANCIAL COMPLETENESS BLOCKS (added 2026-06-06 from QBO inspection)

These were surfaced by inspecting Jorge's actual QuickBooks for IH 35 Transportation LLC. They are NOT in the existing 91 GAP blocks and represent significant operational gaps:

### TIER 1.5 — Critical financial completeness (slot between Tier 1 and Tier 2)
- **`GAP-FIXED-ASSETS-DEPRECIATION` — full asset register: acquisition cost, useful life, depreciation method (straight-line / MACRS / Section 179), monthly depreciation entries, accumulated depreciation, book value, disposal workflow. Links mdata.units to QBO fixed asset accounts.** ⭐ JORGE-REQUESTED
- **`GAP-DRIVER-ESCROW-LEDGER` — per-driver escrow account: deposits (weekly deduction), withdrawals (claim payouts), balance, statement, year-end rollover, termination payout. Reconciles to QBO escrow GL.** ⭐ JORGE-REQUESTED (mentioned by name in trust goals)
- **`GAP-IFTA-REPORTING` — quarterly IFTA fuel tax filing prep: miles by state by truck (from GPS/driver entries), gallons by state by truck (from fuel transactions), tax calculation, credit reconciliation, audit trail.** ⭐
- **`GAP-PER-LOAD-PROFITABILITY` — real-time P&L per load: line haul + accessorials revenue vs all costs (driver pay, fuel, tolls, bridge, escort, scale, lumper, permits, maintenance allocation). Drives rate decisions.** ⭐

### TIER 2.5 — Cross-border + operational depth (slot in with Tier 2)
- **`GAP-MEXICO-OPERATIONS-MODULE` — full cross-border workflow: Mexico-B1 driver pay structure, Mexico license plates, Mexico permits, Mexico mechanic shop tracking, manifestos cruces docs, Mexico highway/bridge tolls, Nuevo Laredo office tracking. Parallel stack to USA operations.** ⭐ MAJOR FINDING
- **`GAP-INTERNAL-MECHANIC-SHOP` — your own shop (Laredo + Nuevo Laredo): parts inventory (oil, tires, filters), mechanic labor time tracking, internal vs external repair cost comparison, parts cost allocation per work order, shop scheduling.** ⭐
- **`GAP-FUEL-CARD-INTEGRATION` — ComData Express Check + Relay direct integration: real-time fuel transactions, GPS validation for fraud detection (extends GAP-61), driver fuel efficiency scoring, IFTA miles/gallons capture per state.** ⭐
- **`GAP-W2-VS-1099-DISTINCTION` — clear separation: W-2 admin staff via QBO Payroll module integration, 1099 drivers via settlement workflow. Different reporting (W-2/W-3 vs 1099-NEC/1096). 1099 vendor tracking with W-9 collection.** ⭐

### TIER 3.5 — Year-end + multi-entity (slot in with Tier 3)
- **`GAP-1099-ANNUAL-REPORTING` — year-end 1099-NEC generation: payment totals per vendor, TIN verification, IRS e-file, state filings, 1096 transmittal. Critical compliance.** ⭐
- **`GAP-MULTI-COMPANY-CONSOLIDATION` — cross-entity reporting for IH 35 Trucking + IH 35 Transportation + USMCA + SCENTSX. Inter-company transactions tracking. Consolidated P&L and balance sheet. Group-level dashboards.** ⭐

---

## 🖼️ DESIGN PRINCIPLE: NO PAGE CHANGES WITHOUT VISUAL PREVIEW FIRST (locked 2026-06-06)

Existing page designs are **LOCKED**. Any proposed change to an existing page — including QBO parity alignment, trust-layer additions, or feature work — **MUST include a visual preview** (mockup, screenshot annotation, side-by-side comparison) for Jorge's explicit approval **BEFORE** any code changes are dispatched.

**REQUIRES preview before code:**
- Existing page layout changes
- Existing modal redesigns
- Existing list view changes (column reorder, filter additions)
- Existing form changes (field additions, repositioning)
- Existing navigation changes
- Color, spacing, typography changes
- Universal pattern rollouts applied to existing pages

**Does NOT need preview (additive-only):**
- New routes / new pages (preview optional but recommended)
- Backend-only changes (no UI impact)
- Adding `is_active` flag to existing entity (DB-only)
- Bug fixes that don't change visual output

**DEFAULT: if uncertain → treat as REQUIRES PREVIEW.**

**Process:**
1. Cursor/Claude propose change → produce visual preview (mockup or annotated screenshot)
2. Jorge reviews preview side-by-side with current state
3. Jorge approves or requests adjustments
4. Only then code changes are dispatched
5. Post-merge, actual UI must match the approved preview

**Enforcement:** block specs that touch existing UI must include `preview_provided: true` in manifest plus a link to the preview artifact. Without preview, block manifest fails validation.

---

## 🧭 META-PRINCIPLES (the "how" not the "what")

These should govern decision-making on every GAP block.

1. **HONESTY AS ENGINEERING DISCIPLINE**
   - Maintain a public "Known Limitations" doc.
   - When something breaks, write the post-mortem and SHARE it.
   - Don't claim certifications you don't have.
   - Protects you legally AND builds trust.

2. **THE "OFF-RAMP" RULE**
   - Every external dependency: document the off-ramp before you need it.
   - You don't have to use it. You have to know it exists.

3. **THE "TWO-WEEK ABSENCE" TEST**
   - Can the business operate for 2 weeks without you?
   - If no, that's the most important gap regardless of technical debt.

4. **THE "ONE GOOD CONSULTANT" RULE**
   - Before commercializing or 100 third-party trucks, hire ONE good security consultant for 1 week. They'll find things you can't see because you built it.

5. **THE "MEASURED DATA" RULE** *(you already have this)*
   - Standing order: "no guesses, real measured data."
   - Extend to capacity. Don't assume 300 trucks works. Test it.

6. **THE "OUTBOX TEST"**
   - For every new feature: "If the downstream system is down for 24 hours, does my user see an error or do I just queue?"
   - If error → not production-ready.

7. **THE "TRUST RECEIPT" RULE** *(new, 2026-06-06)*
   - For every financial mutation, ask: "Can I show Jorge a receipt of what happened, by whom, when, and prove nothing else changed?"
   - If no → audit gap.

8. **THE "ACTIVE/INACTIVE OVER DELETE" RULE** *(new, 2026-06-06)*
   - Every business entity supports soft-delete via `is_active` flag.
   - Hard DELETE only for ephemeral data (logs, cache, temp records) with explicit retention policy.
   - Every entity list endpoint accepts `?status=active|inactive|all` (default active).
   - Every UI list view has filter dropdown + row toggle + bulk action.
   - Every cron / automation filters by `is_active = true`.
   - CI rejects new business entity tables that lack `is_active` column.
   - The QuickBooks bar: nothing important is ever permanently deleted on first action. Everything can be reactivated. History is preserved.

---

## 🚛 HONEST ASSESSMENT: WHERE McLEOD DOES THINGS YOU HAVEN'T BUILT YET

**Not for comparison — for honest planning.** Jorge wants TRUST, not feature parity. But knowing what's missing prevents being surprised later.

1. **EDI 204/210/214 broker integration** — McLeod has 30 years of broker EDI tested in production. Your Phase 6 block is real work.
2. **Domain edge cases** — driver crossing time zones mid-HOS cycle, IFTA calc when refueling in Mexico. McLeod has hit these thousands of times. You'll hit them too.
3. **Compliance certifications already earned** — SOC 2 if applicable. Useful when selling to large shippers.
4. **Trained workforce** — dispatchers come pre-trained on McLeod. Non-McLeod onboarding is a real cost.
5. **Established broker/carrier integrations** — Project44, MacroPoint, RMIS, Highway, Truckstop, DAT. You'll need to build these.
6. **Battle-tested settlement edge cases** — owner-op % deals, mileage pay, hub miles vs PC*Miler, accessorials, advances, deductions. McLeod handles 95% of weird setups.
7. **Support infrastructure** — 24/7 phone support, certified consultants, user community.

**What this means:** Build IH35-TMS to be **trust-grade for IH35's needs**. Don't try to match McLeod's full feature surface. You'll lose. You win on architecture, modernity, multi-company, mobile, data ownership, AND the ability to evolve at your pace.

---

## 🎬 IMMEDIATE NEXT STEPS

1. **FINISH the current critical path**
   - D1-B D3-X → Gate 15 GO → Pass-2 ingest → ✅ UNPAUSE GAP NOW
   - Don't let this strategic conversation pull focus.

2. **Once GAP is unpaused, slot TIER 1 blocks first**
   - Observability, idempotency, security headers
   - These unblock everything else by making issues VISIBLE.

3. **Before slotting Tier 2/3 blocks, run an HONEST AUDIT**
   - Verify the L1 "128 tables" finding count
   - Check Sentry/APM is actually NOT installed
   - Run `vitest --coverage` and get the actual number
   - Document what backups actually exist + retention

4. **Schedule a DR drill within 30 days of GAP unpause**
   - Restore the DB to staging from yesterday's backup
   - Time it. Document what broke. Improve.

5. **Pick ONE thing from the "McLeod-better" list and acknowledge it publicly**
   - e.g., "We don't do EDI broker integration yet. Phase 6 work."
   - Honesty about gaps builds more trust than claims of superiority.

---

## 🎯 THE BOTTOM-BOTTOM LINE

You're building **the right TMS for IH35's specific operation** with the architectural sophistication to scale.

The path to 300 trucks without failure is not more features. It's:

- **Visibility** (observability)
- **Resilience** (circuit breakers, idempotency, DR drills)
- **Discipline** (RLS standardization, CI gates, test coverage)
- **Honesty** (known limitations, key-person risk, vendor lock-in)
- **Maturity** (runbooks, on-call, post-mortems)

When all eight trust criteria are green, settlements will be as trustworthy as QuickBooks. Bills will reconcile every time. Dispatching will be accurate without manual checks. That's the destination.

---

## 📎 APPENDICES

### A. Cursor's Self-Retrospective (2026-06-06, accurate)
- ✅ M2 emergency-patch-first ordering correct (security-first)
- ✅ Accepting existing findings commit as baseline correct (avoids rework)
- ✅ H1 fix mirroring sibling routes correct (pattern-match safety)
- ✅ Audit + cleanup in parallel correct (disjoint files)
- ✅ Caught stale-clone false positive (saved a round)
- ⚠️ Pre-clean gate over-restricted, 5-6× block (~45-60 min churn)
- ⚠️ Orphan ledger (360/378/379/380) should have been batched in one tx
- ⚠️ Audit should have targeted canonical repo from outset (not clone)
- ⚠️ D1-B re-probe should have been suggested immediately

### B. What to Discount in Cursor's Strategic Assessment
- "QBO outbox better than any TMS on market" — outbox is industry standard
- "McLeod never designed for multi-company" — overstated; it does, clunkily
- "McLeod has no CI discipline" — apples-to-oranges
- "Drivers will choose carriers using your system" — aspirational, depends on execution
- "Audit trail becomes trivial" — overstated, still requires work

### C. Reference Sequence (locked)
```
Gate 14: PASS-8-RUNTIME DEGRADED → PASS (D1-B D3-X in motion)
Gate 15: Jorge second GO on PASS-8-RUNTIME PASS
Gate 16: Pass-2 ingest to main
Gate 17: Claude "✅ UNPAUSE GAP NOW" signal
Then:    91 existing GAP blocks dispatch by wave
Then:    Slot TIER 1 new blocks (observability, idempotency, security headers)
Then:    Tier 2, 3, 4 woven through existing feature work
Goal:    All 8 trust criteria green before 300 trucks
```

### D. Maintenance of This Document

This document is the **persistent reference** for the trust-and-scale work. When new safety/integrity findings emerge:
1. Add to the appropriate category
2. Add a recommended GAP block if it's actionable
3. Update the trust criteria if a new dimension is identified
4. Note the date locked

Keep it honest. Keep it scoped. Keep it actionable.

---

**Document version:** 1.0 (2026-06-06)
**Locked by:** Jorge Pablo Munoz
**Stored at:** `/docs/trackers/SAFETY-TRUST-RECOMMENDATIONS.md` (canonical repo: github.com/tioperfumes07/IH35-TMS)
**Memory references:** Edits #6 (Trust Framing), #7 (7 Must-Do), #8 (New GAP Blocks), #9 (Trust Criteria)
