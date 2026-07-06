# IH35-TMS System Audit Sweep Catalog

**Project:** IH35-TMS-cascade  
**Date:** 2026-07-04  
**Status:** Active Audit  
**Primary Model:** SWE-1.6 (free)  
**Secondary Model:** Kimi K2 (for large context sweeps)

---

## Sweep Taxonomy (11 Families, ~50 Sweeps)

### 1. Correctness & Bugs

| Sweep | Status | Prompt | Impact | Gate |
|-------|--------|--------|--------|------|
| schema-phantom | ✅ Done | Check for phantom relations in schema where foreign keys reference non-existent tables/columns | High | Production Block |
| runtime-500 | ✅ Done | Sweep for unhandled 500 errors, missing try-catch blocks, unhandled promise rejections | Critical | Production Block |
| money-path linkage | ✅ Done | Verify all money fields (revenue, expenses, settlements) are properly linked to accounting posting paths | Critical | Financial Gate |
| creator persistence | ✅ Done | Ensure all records have creator_id/user_id persistence for audit trail | High | Compliance Gate |
| error-swallowing | ▢ Available | Find silent catch blocks that swallow errors without logging or re-throwing | High | Production Block |
| enum/status drift | ▢ Available | Check for enum values in code that don't match database enum definitions | Medium | Quality Gate |

---

### 2. Security

| Sweep | Status | Prompt | Impact | Gate |
|-------|--------|--------|--------|------|
| authorization/IDOR | ▢ Available | Can user A access user B's records? Check tenant isolation, row-level security gaps | Critical | Security Gate |
| SQL-injection/string-interpolation | ▢ Available | Find string interpolation in SQL queries instead of parameterized queries | Critical | Security Gate |
| secret leakage | ▢ Available | Scan for API keys, secrets, passwords in code, logs, or environment files | Critical | Security Gate |
| input-validation coverage | ▢ Available | Check all API endpoints for proper input validation (Zod schemas, type guards) | High | Security Gate |
| webhook signature verification | ▢ Available | Verify Samsara, Plaid, QBO webhooks validate signatures before processing | Critical | Security Gate |
| cookie/CORS/CSRF | ▢ Available | Check cookie security flags, CORS configuration, CSRF token implementation | High | Security Gate |
| file-upload safety | ▢ Available | Verify file uploads are validated for type, size, and sanitized paths | High | Security Gate |
| dependency CVEs | ▢ Available | Run npm audit to check for known vulnerabilities in dependencies | High | Security Gate |
| PII in logs | ▢ Available | Scan for logging of sensitive data (SSN, credit cards, passwords) | Critical | Compliance Gate |
| mass-assignment | ▢ Available | Check for over-posting vulnerabilities where users can set unintended fields | High | Security Gate |

---

### 3. Data Integrity

| Sweep | Status | Prompt | Impact | Gate |
|-------|--------|--------|--------|------|
| table inventory/dups/orphans | ✅ Done | Inventory all tables, find duplicates, identify orphaned records | High | Data Gate |
| schema-drift | ✅ Done | Compare migration files against live database schema for drift | Critical | Production Block |
| orphan rows | ▢ Available | Find rows with foreign keys pointing to deleted parent records | High | Data Gate |
| NOT-NULL/constraint coverage on money cols | ▢ Available | Ensure all money columns have NOT NULL and CHECK constraints | Critical | Financial Gate |
| timezone/date-boundary correctness | ▢ Available | Check for timezone handling issues, date boundary bugs (midnight, month-end) | High | Financial Gate |
| money-as-integer-cents | ▢ Available | Verify all money values are stored as integer cents, not floats | Critical | Financial Gate |
| duplicate records | ▢ Available | Find duplicate customers, vendors, drivers, loads based on natural keys | High | Data Gate |
| soft-delete consistency | ▢ Available | Ensure all deletions use soft-delete (void_not_delete) pattern | High | Data Gate |

---

### 4. Financial / Accounting

| Sweep | Status | Prompt | Impact | Gate |
|-------|--------|--------|--------|------|
| double-entry | ✅ Done | Verify all financial transactions follow double-entry accounting | Critical | Financial Gate |
| reconciliation | ✅ Done | Check reconciliation logic between TMS and QBO for accuracy | Critical | Financial Gate |
| flag-OFF | ✅ Done | Ensure all OFF flags are properly set for voided/cancelled records | High | Financial Gate |
| trial-balance tie-out | ▢ Available | Verify trial balance totals match across all accounting modules | Critical | Financial Gate |
| rounding/penny-recon | ▢ Available | Check for rounding errors, penny discrepancies in calculations | High | Financial Gate |
| tax calendars | ✅ Done | Verify tax calendar calculations and IFTA/2290 deadlines | High | Compliance Gate |
| factoring math | ▢ Available | Verify factoring fee calculations, reserve holdbacks, net floor | Critical | Financial Gate |
| settlement math | ▢ Available | Verify settlement net calculations, deductions, driver payouts | Critical | Financial Gate |
| period-close lock | ▢ Available | Ensure accounting periods can be locked and prevent modifications | High | Financial Gate |

---

### 5. Frontend & UX

| Sweep | Status | Prompt | Impact | Gate |
|-------|--------|--------|--------|------|
| design-lock | ✅ Done | Verify UI matches approved design system | Medium | UX Gate |
| accessibility (a11y) | ▢ Available | Run axe-core scan for WCAG 2.1 AA compliance (12 critical open) | High | Compliance Gate |
| mobile-responsive | ▢ Available | Test all pages at 375px width for mobile responsiveness | High | UX Gate |
| dead routes | ✅ Done | Find routes that 404 or have no mounted components | Medium | Quality Gate |
| loading/error/empty states | ▢ Available | Check all list pages have loading, error, and empty states | Medium | UX Gate |
| console errors | ▢ Available | Scan browser console for runtime errors on page load | High | Quality Gate |
| Spanish/English i18n | ▢ Available | Verify all UI strings support Spanish/English localization | Medium | UX Gate |
| print/PDF layouts | ▢ Available | Test invoice, BOL, settlement PDF layouts for correctness | High | UX Gate |

---

### 6. Performance & Scale

| Sweep | Status | Prompt | Impact | Gate |
|-------|--------|--------|--------|------|
| N+1 queries | ▢ Available | Find database queries inside loops that cause N+1 performance issues | High | Performance Gate |
| missing DB indexes | ▢ Available | Check Neon slow-query log for missing indexes on frequently queried columns | High | Performance Gate |
| pagination caps | ▢ Available | Ensure all list pages have pagination limits (50 driver class system-wide) | High | Performance Gate |
| payload/bundle size | ▢ Available | Check frontend bundle size, identify large dependencies | Medium | Performance Gate |
| connection-pool exhaustion | ▢ Available | Verify database connection pool settings prevent exhaustion under load | High | Performance Gate |

---

### 7. Reliability & Ops

| Sweep | Status | Prompt | Impact | Gate |
|-------|--------|--------|--------|------|
| env parity | ✅ Done | Verify dev/staging/production environment parity | High | Ops Gate |
| idempotency/double-submit | ▢ Available | Ensure all write operations are idempotent to prevent double-submit | Critical | Ops Gate |
| transaction boundaries | ▢ Available | Check for partial writes — ensure multi-step ops use transactions | Critical | Data Gate |
| health-check completeness | ▢ Available | Verify health check endpoints cover all critical dependencies | High | Ops Gate |
| deploy/migration-on-boot safety | ▢ Available | Ensure migrations run safely on boot without data loss | Critical | Ops Gate |
| Sentry/observability coverage | ▢ Available | Check all critical paths have Sentry error tracking | High | Ops Gate |
| outbox/queue drain | ▢ Available | Verify outbox pattern drains reliably on restart | High | Ops Gate |

---

### 8. Integrations

| Sweep | Status | Prompt | Impact | Gate |
|-------|--------|--------|--------|------|
| QBO | ✅ Done | Verify QuickBooks integration sync accuracy | Critical | Integration Gate |
| Plaid | ✅ Done | Verify Plaid bank feed integration | Critical | Integration Gate |
| Samsara | ✅ Done | Verify Samsara ELD integration | Critical | Integration Gate |
| API-contract drift | ▢ Available | Check frontend client types match backend route contracts | High | Integration Gate |
| token-refresh/expiry | ▢ Available | Verify OAuth tokens refresh before expiry | High | Integration Gate |
| vendor deprecation (Faro→RTS) | ▢ Available | Check for deprecated Faro factoring references, migration to RTS | High | Integration Gate |

---

### 9. Compliance & Legal

| Sweep | Status | Prompt | Impact | Gate |
|-------|--------|--------|--------|------|
| FMCSA/IFTA/2290 | ✅ Done | Verify FMCSA, IFTA, Form 2290 compliance reporting | Critical | Compliance Gate |
| evidence chain | ▢ Available | Verify POD/BOL retention chain (7 years) | Critical | Compliance Gate |
| audit hash-chain verification | ▢ Available | Verify audit trail has hash chain for tamper evidence | High | Compliance Gate |
| contract/legal linkage | ▢ Available | Ensure customer contracts are linked to billing terms | High | Legal Gate |
| MOR/Ch.11 reporting accuracy | ▢ Available | Verify MOR and Chapter 11 bankruptcy reporting accuracy | Critical | Legal Gate |

---

### 10. Code Quality

| Sweep | Status | Prompt | Impact | Gate |
|-------|--------|--------|--------|------|
| dead components | ✅ Done | Find unused React components, dead code | Medium | Quality Gate |
| TODO/FIXME/HACK inventory | ▢ Available | Scan for TODO, FIXME, HACK comments — inventory and prioritize | Medium | Quality Gate |
| type-safety (any/ts-ignore) | ▢ Available | Find all `any` types and `@ts-ignore` directives | High | Quality Gate |
| test-coverage gaps | ▢ Available | Run coverage report, identify untested critical paths | High | Quality Gate |
| circular dependencies | ▢ Available | Detect circular import dependencies | Medium | Quality Gate |
| doc-vs-code drift | ✅ Done | Compare documentation against actual code implementation | Medium | Quality Gate |

---

### 11. Business Logic & Domain

| Sweep | Status | Prompt | Impact | Gate |
|-------|--------|--------|--------|------|
| separation-reason catalog | ✅ Done | Verify driver separation reason catalog completeness | High | Business Gate |
| workflow/status-transition completeness | ▢ Available | Check all state machines have complete transition definitions | High | Business Gate |
| race conditions/concurrency | ▢ Available | Find race conditions in concurrent operations (settlements, invoicing) | Critical | Business Gate |
| role-permission matrix | ▢ Available | Verify RBAC matrix covers all actions and roles | High | Security Gate |
| report-aggregation accuracy | ▢ Available | Verify report aggregations match source data | High | Business Gate |
| search correctness | ▢ Available | Test search functionality for edge cases, empty results, special chars | Medium | UX Gate |

---

## Additional Sweeps (Cascade Recommendations)

### 12. Infrastructure & DevOps

| Sweep | Status | Prompt | Impact | Gate |
|-------|--------|--------|--------|------|
| backup/restore verification | ▢ Available | Test database backup and restore procedures | Critical | Ops Gate |
| disaster recovery plan | ▢ Available | Verify DR plan documentation and runbook completeness | High | Ops Gate |
| rate limiting coverage | ▢ Available | Check all public APIs have rate limiting | High | Security Gate |
| log retention policy | ▢ Available | Verify logs are retained per policy and rotated | Medium | Compliance Gate |
| monitoring alert coverage | ▢ Available | Ensure all critical services have monitoring alerts | High | Ops Gate |

### 13. Testing & QA

| Sweep | Status | Prompt | Impact | Gate |
|-------|--------|--------|--------|------|
| E2E test coverage | ▢ Available | Verify critical user journeys have E2E tests | High | Quality Gate |
| integration test coverage | ▢ Available | Check API endpoints have integration tests | High | Quality Gate |
| contract testing | ▢ Available | Verify API contracts match between services | High | Integration Gate |
| load testing | ▢ Available | Run load tests for peak traffic scenarios | High | Performance Gate |

### 14. Data Privacy

| Sweep | Status | Prompt | Impact | Gate |
|-------|--------|--------|--------|------|
| GDPR right-to-forget | ▢ Available | Verify data deletion process for GDPR requests | Critical | Compliance Gate |
| data encryption at rest | ▢ Available | Verify sensitive data is encrypted at rest | Critical | Security Gate |
| data encryption in transit | ▢ Available | Verify TLS 1.3 for all connections | Critical | Security Gate |
| data minimization | ▢ Available | Check for unnecessary data collection | Medium | Compliance Gate |

### 15. API Design

| Sweep | Status | Prompt | Impact | Gate |
|-------|--------|--------|--------|------|
| API versioning strategy | ▢ Available | Verify API has versioning strategy for breaking changes | High | Integration Gate |
| API documentation completeness | ▢ Available | Check OpenAPI/Swagger docs cover all endpoints | Medium | Quality Gate |
| API error response consistency | ▢ Available | Verify error responses follow consistent format | Medium | Quality Gate |
| API rate limit headers | ▢ Available | Ensure rate limit headers are returned | Medium | Integration Gate |

---

## Execution Priority

### Phase 1: Critical (Must Complete Before Production)
- All Security sweeps
- All Financial/Accounting sweeps
- Data Integrity sweeps
- Reliability & Ops sweeps
- Compliance & Legal sweeps

### Phase 2: High Priority
- Performance & Scale sweeps
- Frontend & UX sweeps
- Integration sweeps
- Business Logic sweeps

### Phase 3: Medium Priority
- Code Quality sweeps
- Additional Infrastructure sweeps
- Testing & QA sweeps

### Phase 4: Low Priority
- Documentation sweeps
- Nice-to-have UX improvements

---

## Commands File

Copy-paste prompts for each sweep are maintained in `COMMANDS.md` (separate file).
