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

1. **Secret rotation** — Twilio, QBO OAuth, Samsara, R2, Neon, JWT keys. When was each last rotated?
2. **PII encryption at column level** — driver SSNs, DLs, medical card numbers, passports. pgcrypto with separate KMS key. Regulatory requirement in some states (CCPA, Texas data-breach law).
3. **Audit log tamper-evidence** — cryptographic hash chain. Each row hashes the previous row's hash. Modification breaks the chain. SOX-grade.
4. **Rate limiting per OCI per endpoint** — express-rate-limit. 100 req/min/user, 1000/min/OCI.
5. **Security headers** — CSP, HSTS, X-Frame-Options, Permissions-Policy. helmet.js gives all of this in 3 lines.
6. **Dependency scanning** — Dependabot (free, GitHub-native).
7. **SAST in CI** — Semgrep free tier.
8. **External penetration test** — before commercializing or before 100 trucks of third-party data. ~$5-15K. Worth it.

**Recommended blocks:**
- `GAP-SECRETS-ROTATION`, `GAP-PII-ENCRYPTION`, `GAP-AUDIT-HASH-CHAIN`, `GAP-RATE-LIMIT`, `GAP-SECURITY-HEADERS`

---

### CATEGORY 4: SCALE READINESS (the 300-truck question)

1. **Load testing NOW** — k6 or Artillery. Simulate 300 trucks. Find breaking point in staging.
2. **Database query budget enforcement** — p95 latency budget per endpoint, CI check against seeded DB.
3. **Background job framework** — Bull/BullMQ on Redis. Web tier stays fast.
4. **Pagination on every list endpoint** — cursor pagination, not offset. At 300 trucks, `loads.list` returning 50K rows times out.
5. **Database partitioning for large tables** — `samsara.location_pings`, `hos.duty_changes`, `audit.event_log`. Critical by 150 trucks.
6. **CDN + cache strategy** — static assets through Cloudflare/R2. Frequent reads cached in Redis.

**Recommended blocks:** `GAP-LOAD-TEST-BASELINE`, `GAP-PERF-BUDGETS-CI`, `GAP-PAGINATION-AUDIT`, `GAP-PARTITION-HOT-TABLES`

---

### CATEGORY 5: RELIABILITY (graceful failure)

1. **Circuit breakers on every external call** — opossum library. Samsara down? Don't block every request.
2. **Retry with exponential backoff + jitter** — pure retry storms make outages worse.
3. **Graceful degradation matrix** — document: "If X is down, what works? What doesn't? What does user see?"
4. **Blue-green or canary deploys** — Render supports this. A bad deploy currently = downtime.
5. **Multi-region readiness** — document the plan. Honest answer matters.

**Recommended blocks:** `GAP-CIRCUIT-BREAKERS`, `GAP-DEGRADATION-MATRIX`, `GAP-CANARY-DEPLOY`

---

### CATEGORY 6: TESTING

1. **Actual unit test coverage %** — run `vitest --coverage`. Target: 70%+ on services, 90%+ on financial/RLS code.
2. **Does one failing test catch a real bug per PR?** — if not, the suite is decoration.
3. **End-to-end tests for 5 critical workflows** — Book load. Dispatch. Driver completes load. Settlement. Invoice + send. Playwright.
4. **Multi-tenant 403/200 test pair on every new endpoint** — non-negotiable CI gate.
5. **Chaos engineering** — kill Redis in staging mid-request. Document what breaks.

**Recommended blocks:** `GAP-E2E-CRITICAL-PATHS`, `GAP-RLS-TEST-GATE`, `GAP-COVERAGE-BASELINE`

---

### CATEGORY 7: BUSINESS CONTINUITY & HONESTY

1. **Key-person risk** — can the business operate 2 weeks without Jorge? Document deploy, restore, debug procedures.
2. **Vendor lock-in inventory** — Render → Heroku/Fly.io, Neon → RDS, R2 → S3, GitHub → GitLab. Know the off-ramps.
3. **Source code escrow** — if you ever sell access to other carriers.
4. **Cyber liability insurance** — at 300 trucks with sensitive PII + financial data.
5. **Known Limitations doc** — maintained, honest, public. Protects legally + builds trust.
6. **Data ownership clarity** — whose data is it? Especially for USMCA + future customers.

**Recommended blocks:** `GAP-OPS-RUNBOOKS`, `GAP-VENDOR-LOCKIN-DOC`, `GAP-KNOWN-LIMITATIONS`

---

## 💰 THE FINANCIAL TRUST LAYER (added 2026-06-06)

This is what specifically gives you the **QuickBooks feeling** in your own software.

### 1. Financial Double-Entry Enforcement at the DB Layer

```sql
-- QuickBooks cannot produce an unbalanced journal entry. Period.
CONSTRAINT balanced_entry CHECK (
  (SELECT SUM(debit) - SUM(credit) 
   FROM accounting.journal_lines 
   WHERE journal_entry_uuid = uuid) = 0
)
```
**New block: `GAP-DOUBLE-ENTRY-DB-ENFORCEMENT`** — Tier 1.

### 2. Every Number Must Have an Audit Trail

Every figure on every screen must be derivable from source records. CI check: every settlement/invoice/bill page renders source links.

**New block: `GAP-AUDIT-TRAIL-COVERAGE`** — Tier 2.

### 3. Immutable Finalized Records (Period Locking)

```
PERIOD STATUS = 'closed' → READ-ONLY at DB level.
Enforcement: trigger or RLS policy on accounting.* tables.
PERIOD STATUS = 'closed' → REJECT write.
```
**New block: `GAP-PERIOD-LOCK-DB-LEVEL`** — Tier 1.

### 4. Reconciliation Jobs That Catch Drift

```
GAP-FINANCIAL-RECONCILIATION — nightly job:
  1. Settlement totals MATCH journal_entry totals → variance > $0.01 alerts
  2. Invoice amounts MATCH payments received → variance alerts
  3. Outbox enqueues MATCH QBO sync confirmations → drift alerts
  4. Bill totals MATCH journal_entry totals → variance alerts
  5. Daily "everything balanced" confirmation email/dashboard
```
**New block: `GAP-FINANCIAL-RECONCILIATION`** — Tier 1. **THE QuickBooks-feeling block.**

### 5. Probes, Not Just Tests

A daily automated probe running one real end-to-end financial transaction in a test OCI, verifying numbers to the penny.

**New block: `GAP-DAILY-FINANCIAL-PROBE`** — Tier 1.

---

## 💎 DESIGN PRINCIPLE: ACTIVE/INACTIVE OVER DELETE (locked 2026-06-06)

**This is the QuickBooks pattern. For ALL entity work in the GAP program:**

- Default: `is_active = true`
- Soft delete: set `is_active = false` (NEVER hard DELETE business entities)
- Hard DELETE only for: ephemeral data (logs, temp records, cache) with explicit retention policy
- CI rejects PRs introducing new business entity tables without `is_active`

**Every business entity table needs:**
```sql
is_active           BOOLEAN      NOT NULL DEFAULT true,
inactivated_at      TIMESTAMPTZ  NULL,
inactivated_by      UUID         NULL,
inactivation_reason TEXT         NULL
```

**API pattern:** `PATCH /api/v1/<entity>/:id/status` + `GET ?status=active|inactive|all`

**UI pattern:** every list has filter dropdown (Active/Inactive/All) + row-level toggle + bulk action + greyed-out inactive rows

**Automation pattern:** every cron/job filters `WHERE is_active = true`

**QuickBooks test:**
- Mark a customer inactive? ✅ — their invoices still exist, history preserved
- Filter to show inactive? ✅ — dropdown
- Reactivate? ✅ — toggle back
- See historical invoices? ✅ — preserved forever

**Entities requiring this pattern (~30+ types):**
People: customers, vendors, drivers, employees, users, brokers, factors, insurance providers, maintenance vendors, fuel vendors
Assets: units (trucks), trailers, equipment, driver licenses, medical certificates
Operational: PM schedules, routes, rate confirmations, load templates, recurring lanes
Financial: chart of accounts, payment terms, tax codes, settlement rules, factoring agreements
Compliance: insurance policies, DOT permits, IFTA registrations, authority registrations, D&A program participants
System: document templates, notification rules, report definitions, user roles

**New block: `GAP-ACTIVE-INACTIVE-STANDARDIZATION`** — Tier 1. ⭐ **HIGHEST PRIORITY — every other block builds on this pattern.**

---

## 🤖 MODEL SELECTION RULE (locked 2026-06-06)

For every GAP block dispatch, ask the 5-dimensional question. If ANY dimension hits, use **Opus 4.8 thinking-high**. All NO = **Sonnet 4.6 medium-thinking**.

```
DIMENSION                    OPUS TRIGGER
────────────────────────────────────────────────────────────────────
1. Cost of failure           Bug = data integrity OR security problem
2. Reversibility             Hard to undo: schema, RLS, deletions, financial state
3. Ambiguity                 Spec has judgment calls vs mechanical execution
4. Cross-cutting reach       Touches 3+ modules OR multiple OCIs OR multiple schemas
5. First-of-kind             FIRST block establishing a new pattern
────────────────────────────────────────────────────────────────────
ANY YES → Opus    All NO → Sonnet
```

**First-of-kind blocks requiring Opus (template establishment):**
`GAP-OBSERV-FOUNDATION`, `GAP-CIRCUIT-BREAKERS`, `GAP-IDEMP-KEYS`, `GAP-RLS-TEST-GATE`, `GAP-FINANCIAL-RECONCILIATION`, `GAP-DAILY-FINANCIAL-PROBE`, `GAP-ACTIVE-INACTIVE-STANDARDIZATION`

**Across all ~115 blocks:** ~57 Opus, ~58 Sonnet expected. The model fee is the cheapest insurance on the critical path.

---

## 🎯 THE 10 MUST-DO BEFORE 300 TRUCKS (updated 2026-06-06)

| # | Item | Cost | Payoff |
|---|------|------|--------|
| 1 | Observability foundation | 2 days | See issues before customers do |
| 2 | RLS cast standardization (128 `::text` → canonical) | 1 block | Eliminate isolation drift |
| 3 | Migration rename CI guard | 1 day | Prevents orphan cluster recurrence |
| 4 | Idempotency keys on all mutating endpoints | 2 days | No duplicate invoices under retry |
| 5 | Load test baseline (k6 at 300-truck scale) | 2 days | Find breaking point in staging |
| 6 | Disaster recovery drill | 1 day | Actually have backups, not just config |
| 7 | Operational runbooks | 3-5 days | Business survives Jorge's absence |
| **8** | **Financial reconciliation jobs** | **3 days** | **THE QuickBooks feeling** |
| **9** | **Double-entry DB constraint** | **1 day** | **Unbalanced entries impossible** |
| **10** | **Period-lock DB enforcement** | **2 days** | **Closed periods immutable** |

---

## 📋 ALL NEW GAP BLOCKS PROPOSED (in addition to existing 91)

### TIER 1 — First wave after GAP unpause
- `GAP-ACTIVE-INACTIVE-STANDARDIZATION` *(first-of-kind: Opus — every other block inherits this)* ⭐ **FIRST**
- `GAP-OBSERV-FOUNDATION` *(first-of-kind: Opus)*
- `GAP-IDEMP-KEYS` *(first-of-kind: Opus)*
- `GAP-SECURITY-HEADERS`
- `GAP-DEPENDABOT-VERIFY`
- `GAP-FINANCIAL-RECONCILIATION` *(first-of-kind: Opus)* ⭐
- `GAP-DOUBLE-ENTRY-DB-ENFORCEMENT` *(Opus: data integrity)* ⭐
- `GAP-PERIOD-LOCK-DB-LEVEL` *(Opus: data integrity)* ⭐
- `GAP-DAILY-FINANCIAL-PROBE` *(first-of-kind: Opus)* ⭐
- `GAP-RLS-STANDARDIZE-128` *(Opus: cross-cutting RLS)*
- `GAP-MIGRATION-RENAME-CI-GUARD`
- `GAP-TEST-DATA-CLEANUP` *(Opus: destructive ops + full FK chain audit)* ⭐
- `GAP-CRON-AUDIT-AND-RETUNE` *(audit all scheduled jobs; verify frequency matches operational reality; note: PM cron confirmed hourly at :05, not every-5-min as initially hypothesized 2026-06-06)*
- `GAP-OPERATIONAL-TUNING-CATALOG` *(document all operationally-significant settings with rationale)*

### TIER 2 — Parallel with feature GAP blocks
- `GAP-RATE-LIMIT`
- `GAP-CIRCUIT-BREAKERS` *(first-of-kind: Opus)*
- `GAP-OUTBOX-DLQ`
- `GAP-PAGINATION-AUDIT`
- `GAP-LOAD-TEST-BASELINE`
- `GAP-E2E-CRITICAL-PATHS`
- `GAP-RLS-TEST-GATE` *(first-of-kind: Opus)*
- `GAP-AUDIT-TRAIL-COVERAGE` ⭐
- `GAP-DESTRUCTIVE-OP-PREFLIGHT` *(CI tool: FK chain audit + active write path inventory before any destructive SQL block; lesson from Pass-2 ingest 2026-06-06)* ⭐

### TIER 3 — Before 200 trucks
- `GAP-PII-ENCRYPTION` *(Opus: security + regulatory)*
- `GAP-AUDIT-HASH-CHAIN` *(Opus: security)*
- `GAP-SECRETS-ROTATION`
- `GAP-DR-DRILL`
- `GAP-OPS-RUNBOOKS`
- `GAP-DEGRADATION-MATRIX`

### TIER 4 — Before 300 trucks
- `GAP-PARTITION-HOT-TABLES` *(Opus: migration risk)*
- `GAP-CANARY-DEPLOY`
- `GAP-VENDOR-LOCKIN-DOC`
- `GAP-KNOWN-LIMITATIONS`

---

## 🧭 META-PRINCIPLES

1. **HONESTY AS ENGINEERING DISCIPLINE** — Known Limitations doc, post-mortems, no claimed certifications.
2. **THE "OFF-RAMP" RULE** — document every external dependency's off-ramp before you need it.
3. **THE "TWO-WEEK ABSENCE" TEST** — can the business operate 2 weeks without Jorge?
4. **THE "ONE GOOD CONSULTANT" RULE** — before commercializing or 100 third-party trucks.
5. **THE "MEASURED DATA" RULE** — no guesses, real measured data. Extend to capacity.
6. **THE "OUTBOX TEST"** — for every new feature: "If downstream is down 24 hours, error or queue?" If error → not production-ready.
7. **THE "TRUST RECEIPT" RULE** *(2026-06-06)* — for every financial mutation: can I show Jorge a receipt, by whom, when, and prove nothing else changed? If no → audit gap.
8. **THE "ACTIVE/INACTIVE OVER DELETE" RULE** *(2026-06-06)* — soft delete for ALL business entities. Hard DELETE only for ephemeral data. History is sacred. Everything is reversible. The QuickBooks bar.

---

## 🚛 HONEST: WHERE McLEOD DOES THINGS YOU HAVEN'T BUILT YET

Not for comparison — for honest planning:

1. EDI 204/210/214 broker integration (30 years tested in prod)
2. Domain edge cases (time zone mid-HOS, IFTA Mexico fueling)
3. Compliance certifications (SOC 2)
4. Trained workforce (dispatchers come pre-trained on McLeod)
5. Established integrations (Project44, MacroPoint, RMIS, DAT, Truckstop)
6. Battle-tested settlement edge cases (owner-op %, hub miles, accessorials)
7. Support infrastructure (24/7 phone, certified consultants)

**What this means:** Build trust-grade for IH35's needs. Win on architecture, modernity, multi-company, mobile, data ownership.

---

## 📎 APPENDICES

### A. Cursor's Self-Retrospective (2026-06-06)
- ✅ M2 emergency-patch-first, hardening-second
- ✅ Accepting existing findings commit as baseline
- ✅ H1 fix mirroring sibling routes
- ✅ Audit + cleanup in parallel
- ✅ Caught stale-clone false positive
- ⚠️ Pre-clean gate over-restricted 5-6× (~45-60 min churn)
- ⚠️ Orphan ledger should have been batched in one tx
- ⚠️ Audit should have targeted canonical repo from outset
- ⚠️ D1-B re-probe should have been suggested immediately

### B. What to Discount in Cursor's Strategic Assessment
- "QBO outbox better than any TMS on market" — industry standard, not unique
- "McLeod never designed for multi-company" — overstated
- "McLeod has no CI discipline" — apples-to-oranges
- "Drivers will choose carriers using your system" — aspirational
- "Audit trail becomes trivial" — overstated

### C. Reference Sequence (locked)
```
Gate 14: PASS-8-RUNTIME DEGRADED → PASS (D1-B D3-X)
Gate 15: Jorge second GO ✅
Gate 16: Pass-2 ingest DEFERRED to GAP-TEST-DATA-CLEANUP (2026-06-06)
Gate 17: ✅ UNPAUSE GAP NOW
Then:    91 existing GAP blocks dispatch by wave
Then:    Slot TIER 1 new blocks (active/inactive first, then observability, etc.)
Then:    Tier 2, 3, 4 woven through feature work
Goal:    All 8 trust criteria green before 300 trucks
```

### D. Maintenance of This Document

When new safety/integrity findings emerge:
1. Add to the appropriate category
2. Add a recommended GAP block if actionable
3. Update trust criteria if a new dimension is identified
4. Note the date locked

---

**Document version:** 1.1 (2026-06-06 — active/inactive principle, cron audit note, PM cron clarification, Pass-2 lessons)**  
**Locked by:** Jorge Pablo Munoz  
**Stored at:** `docs/trackers/SAFETY-TRUST-RECOMMENDATIONS.md` (canonical repo: github.com/tioperfumes07/IH35-TMS)
