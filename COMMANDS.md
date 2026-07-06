# IH35-TMS Sweep Commands

Copy-paste these prompts to execute each sweep with SWE-1.6 model.

---

## 1. Correctness & Bugs

### error-swallowing
```
Scan the entire codebase for silent error swallowing. Find all try-catch blocks that catch errors without logging, re-throwing, or handling meaningfully. Look for empty catch blocks, catch blocks that only log to console.error without proper error tracking, and catch blocks that suppress errors without notifying the user. Report file paths and line numbers for each instance.
```

### enum/status drift
```
Check for enum/status drift between code and database. Find all enum definitions in TypeScript/JavaScript code and compare them against database enum definitions in migration files. Look for:
1. Enum values in code that don't exist in the database
2. Database enum values not referenced in code
3. Mismatched enum case or naming conventions
Report all discrepancies with file paths and line numbers.
```

---

## 2. Security

### authorization/IDOR
```
Perform an IDOR (Insecure Direct Object Reference) sweep. Check all API routes that accept an ID parameter (load_id, customer_id, driver_id, etc.) and verify they:
1. Have proper tenant isolation checks (tenant_id filtering)
2. Have row-level security (RLS) policies in place
3. Verify the requesting user has permission to access that specific resource
Report any routes that lack proper authorization checks with file paths and line numbers.
```

### SQL-injection/string-interpolation
```
Scan for SQL injection vulnerabilities. Find all database queries that use string interpolation or template literals instead of parameterized queries. Look for:
1. String concatenation in SQL queries
2. Template literals with user input in SQL
3. Direct variable interpolation in SQL strings
Report all instances with file paths, line numbers, and the vulnerable code snippet.
```

### secret leakage
```
Scan for leaked secrets in the codebase. Find:
1. API keys, access tokens, or secret keys hardcoded in source files
2. Passwords or credentials in code
3. Secrets logged to console or error messages
4. Environment variable names that might contain secrets
5. Check .env.example files for placeholder secrets that might be accidentally committed
Report all findings with file paths and line numbers, redacting the actual secret values.
```

### input-validation coverage
```
Check input validation coverage across all API endpoints. For each Fastify/Express route, verify:
1. Request body is validated with Zod schema or similar
2. Query parameters are validated
3. Path parameters are validated
4. File uploads have type/size validation
Report endpoints that lack proper input validation with file paths and line numbers.
```

### webhook signature verification
```
Verify webhook signature verification for Samsara, Plaid, and QBO integrations. Check:
1. Webhook endpoints verify HMAC signatures before processing
2. Signature verification uses the correct secret/key
3. Webhook failures are logged appropriately
4. Webhook replay attacks are prevented (timestamp checks, nonce)
Report any missing or incorrect signature verification with file paths.
```

### cookie/CORS/CSRF
```
Check cookie security, CORS, and CSRF protection. Verify:
1. Session cookies have HttpOnly, Secure, and SameSite flags
2. CORS configuration is restrictive (not wildcard origin)
3. CSRF tokens are implemented for state-changing requests
4. Cookie domains are properly scoped
Report any security misconfigurations with file paths and line numbers.
```

### file-upload safety
```
Verify file upload security. Check:
1. File uploads validate file type (MIME type, magic bytes)
2. File uploads have size limits
3. Uploaded files are stored outside web root or with proper access controls
4. File names are sanitized to prevent path traversal
5. File content is scanned if applicable
Report any vulnerabilities with file paths.
```

### dependency CVEs
```
Run npm audit to check for known vulnerabilities. Also manually review:
1. package.json for outdated dependencies
2. Dependencies with known security issues
3. Unused dependencies that should be removed
Report all vulnerabilities with severity levels and recommended fixes.
```

### PII in logs
```
Scan for PII (Personally Identifiable Information) in logs. Find:
1. Logging of SSNs, credit card numbers, passwords
2. Logging of full addresses, phone numbers, email addresses
3. Logging of sensitive financial data
4. Console.log statements with user data
Report all instances with file paths and line numbers.
```

### mass-assignment
```
Check for mass assignment vulnerabilities. Find:
1. API endpoints that accept request bodies and directly assign to database models without allowlisting
2. Routes that use req.body directly in update/insert operations
3. Missing field validation that allows users to set unintended fields (admin flags, status fields)
Report vulnerable endpoints with file paths.
```

---

## 3. Data Integrity

### orphan rows
```
Find orphaned rows in the database. Check for:
1. Rows with foreign keys pointing to deleted parent records
2. Soft-deleted parent records with active child records
3. Load records without valid customer/driver references
4. Settlement records without valid load references
Report the SQL queries to identify orphans and estimated counts.
```

### NOT-NULL/constraint coverage on money cols
```
Verify money column constraints. Check all money-related columns (amount, rate, total, etc.) for:
1. NOT NULL constraints where appropriate
2. CHECK constraints for non-negative values
3. DECIMAL/NUMERIC type with proper precision (not FLOAT)
4. Default values where appropriate
Report any missing constraints with table and column names.
```

### timezone/date-boundary correctness
```
Check timezone and date boundary handling. Find:
1. Date comparisons that don't account for timezone
2. Month-end/year-end calculations that might be off by one day
3. Midnight boundary issues in date ranges
4. Missing timezone conversions when storing/displaying dates
5. Use of Date constructor without timezone awareness
Report all issues with file paths and line numbers.
```

### money-as-integer-cents
```
Verify all money values are stored as integer cents. Check:
1. Database columns for money use INTEGER/NUMERIC, not FLOAT
2. No floating-point arithmetic for money calculations
3. Proper conversion between dollars and cents
4. Display formatting converts cents to dollars correctly
Report any floating-point money usage with file paths.
```

### duplicate records
```
Find duplicate records based on natural keys. Check for:
1. Duplicate customers (by name, email, phone)
2. Duplicate vendors (by name, tax ID)
3. Duplicate drivers (by license number, SSN)
4. Duplicate loads (by load number, BOL number)
Provide SQL queries to identify duplicates and recommend deduplication strategy.
```

### soft-delete consistency
```
Verify soft-delete consistency across the codebase. Check:
1. All delete operations use soft-delete (set deleted_at, status='void') instead of hard DELETE
2. Queries filter out soft-deleted records where appropriate
3. Cascade soft-deletes to related records
4. No hard DELETE queries in migration files (except for cleanup)
Report any hard deletes that should be soft deletes with file paths.
```

---

## 4. Financial / Accounting

### trial-balance tie-out
```
Verify trial balance tie-out. Check:
1. Debits equal credits across all accounting entries
2. Trial balance report sums correctly
3. No orphaned accounting entries
4. All financial transactions post to correct accounts
Provide SQL queries to verify trial balance and report any discrepancies.
```

### rounding/penny-recon
```
Check for rounding errors and penny discrepancies. Find:
1. Floating-point arithmetic in financial calculations
2. Division operations that might lose precision
3. Summation of rounded values vs rounding of sums
4. Penny discrepancies in settlements, invoices, factoring
Report all rounding issues with file paths and recommended fixes.
```

### factoring math
```
Verify factoring calculations. Check:
1. Factoring fee calculations (percentage of invoice amount)
2. Reserve holdback calculations
3. Net floor calculations (invoice - fee - reserve)
4. Fee rebate calculations on payment
5. Advance amount calculations
Report any calculation errors with file paths and correct formulas.
```

### settlement math
```
Verify settlement calculations. Check:
1. Driver percentage calculations
2. Deduction calculations (fuel, advances, fees)
3. Net settlement amount (revenue - deductions)
4. Per-mile rate calculations
5. Bonus calculations
Report any calculation errors with file paths and correct formulas.
```

### period-close lock
```
Verify accounting period close functionality. Check:
1. Accounting periods can be locked
2. Locked periods prevent modifications to transactions
3. Period close validates all transactions are posted
4. Period close generates trial balance
5. Cannot reopen closed periods without proper authorization
Report any missing period-close controls with file paths.
```

---

## 5. Frontend & UX

### accessibility (a11y)
```
Run accessibility sweep. Check:
1. All images have alt text
2. Form inputs have associated labels
3. Color contrast meets WCAG AA standards
4. Keyboard navigation works for all interactive elements
5. ARIA labels for screen readers
6. Focus indicators are visible
Report all a11y issues with component names and file paths.
```

### mobile-responsive
```
Test mobile responsiveness. Check:
1. All pages render correctly at 375px width
2. No horizontal scrolling on mobile
3. Touch targets are at least 44x44px
4. Text is readable without zooming
5. Modals and dropdowns work on mobile
Report responsive design issues with page/component names.
```

### loading/error/empty states
```
Check loading, error, and empty states. For each list page and data view:
1. Has loading spinner/skeleton while data fetches
2. Has error message when fetch fails
3. Has empty state message when no data
4. Has retry mechanism on error
Report pages missing any of these states with file paths.
```

### console errors
```
Scan for console errors. Check:
1. No undefined variable errors on page load
2. No null reference errors
3. No unhandled promise rejections
4. No missing import errors
5. No type errors in browser console
Report all console errors with file paths and reproduction steps.
```

### Spanish/English i18n
```
Verify internationalization coverage. Check:
1. All UI strings use i18n function instead of hardcoded text
2. Spanish translations exist for all English strings
3. Number/date/currency formatting uses locale
4. RTL (right-to-left) support if needed
Report missing translations with component names and file paths.
```

### print/PDF layouts
```
Test print/PDF layouts. Check:
1. Invoice PDF layout is correct
2. BOL (Bill of Lading) PDF layout is correct
3. Settlement PDF layout is correct
4. Print stylesheets hide navigation/buttons
5. PDFs generate correctly with Puppeteer
Report any layout issues with component names.
```

---

## 6. Performance & Scale

### N+1 queries
```
Find N+1 query performance issues. Check:
1. Database queries inside loops
2. Missing eager loading (JOIN, include) for related data
3. Separate queries for related entities that could be batched
4. Queries that could be optimized with subqueries or CTEs
Report all N+1 issues with file paths and optimization suggestions.
```

### missing DB indexes
```
Check for missing database indexes. Review:
1. Slow query logs from Neon
2. Foreign key columns that lack indexes
3. Frequently filtered columns without indexes
4. Composite indexes for common query patterns
Report missing indexes with table/column names and query patterns.
```

### pagination caps
```
Verify pagination limits. Check:
1. All list pages have pagination (no unbounded lists)
2. Pagination limit is enforced server-side (50 driver class)
3. Cannot override pagination limit via URL params
4. Total count queries are optimized
Report any unbounded queries with file paths.
```

### payload/bundle size
```
Check frontend bundle size. Analyze:
1. Total JavaScript bundle size
2. Largest dependencies by size
3. Code splitting opportunities
4. Unused imports that can be removed
5. Tree-shaking effectiveness
Report bundle size analysis with optimization recommendations.
```

### connection-pool exhaustion
```
Verify database connection pool settings. Check:
1. Connection pool size is appropriate for expected load
2. Connection timeout is configured
3. Idle connections are properly closed
4. Pool exhaustion is monitored and alerted
Report any connection pool issues with configuration file paths.
```

---

## 7. Reliability & Ops

### idempotency/double-submit
```
Check idempotency and double-submit protection. Verify:
1. All write operations are idempotent (can be safely retried)
2. POST requests have idempotency keys
3. Form submissions have CSRF protection
4. Duplicate submissions are detected and rejected
Report non-idempotent operations with file paths.
```

### transaction boundaries
```
Check transaction boundaries. Find:
1. Multi-step operations that lack database transactions
2. Partial writes that could leave data in inconsistent state
3. Missing rollback on error
4. Transactions that span too many operations (should be split)
Report transaction issues with file paths.
```

### health-check completeness
```
Verify health check endpoints. Check:
1. Health check covers database connectivity
2. Health check covers external dependencies (QBO, Plaid, Samsara)
3. Health check covers Redis/cache
4. Health check returns appropriate HTTP status codes
5. Health check is used by load balancer/orchestrator
Report missing health checks with file paths.
```

### deploy/migration-on-boot safety
```
Verify migration safety on boot. Check:
1. Migrations run automatically on application start
2. Migrations are idempotent (can be re-run safely)
3. Migrations have rollback capability
4. Migration failures prevent application start
5. Migration status is tracked and logged
Report any unsafe migration practices with file paths.
```

### Sentry/observability coverage
```
Check Sentry error tracking coverage. Verify:
1. All API routes have error tracking
2. Critical user flows have error tracking
3. Error context includes user ID, tenant ID
4. Performance monitoring is enabled
5. Source maps are uploaded for deobfuscation
Report missing observability with file paths.
```

### outbox/queue drain
```
Verify outbox pattern implementation. Check:
1. Outbox table records all events
2. Outbox worker drains events reliably
3. Outbox worker resumes on restart
4. Failed events are retried with backoff
5. Outbox events are eventually consistent
Report any outbox issues with file paths.
```

---

## 8. Integrations

### API-contract drift
```
Check API contract drift. Verify:
1. Frontend TypeScript types match backend route contracts
2. OpenAPI/Swagger docs match actual API behavior
3. Response shapes are consistent between dev/staging/prod
4. No breaking changes without versioning
Report contract drift with file paths and specific mismatches.
```

### token-refresh/expiry
```
Verify OAuth token refresh. Check:
1. Access tokens refresh before expiry
2. Refresh token rotation is implemented
3. Token refresh failures are handled gracefully
4. Expired tokens trigger re-authentication
5. Token storage is secure (HttpOnly cookie or secure storage)
Report token management issues with file paths.
```

### vendor deprecation (Faro→RTS)
```
Check for deprecated Faro factoring references. Find:
1. References to Faro API endpoints
2. Faro-specific configuration
3. Faro webhook handlers
4. Migration path to RTS factoring
Report all Faro references with file paths and migration plan.
```

---

## 9. Compliance & Legal

### evidence chain
```
Verify evidence chain for POD/BOL retention. Check:
1. POD (Proof of Delivery) documents are retained for 7 years
2. BOL documents are retained for 7 years
3. Documents have immutable audit trail
4. Document deletion is prevented by policy
5. Document storage is compliant with retention requirements
Report any retention issues with file paths.
```

### audit hash-chain verification
```
Verify audit trail hash chain. Check:
1. Audit records have cryptographic hash of previous record
2. Hash chain prevents tampering detection
3. Hash chain is verified on audit export
4. Audit records are append-only (no updates/deletes)
Report any audit trail issues with file paths.
```

### contract/legal linkage
```
Verify customer contract linkage. Check:
1. Customer contracts are linked to customer records
2. Contract terms drive billing calculations
3. Contract expiration triggers notifications
4. Contract changes require approval workflow
5. Contract terms are enforced in business logic
Report missing contract linkages with file paths.
```

### MOR/Ch.11 reporting accuracy
```
Verify MOR and Chapter 11 bankruptcy reporting. Check:
1. MOR (Monthly Operating Report) calculations are accurate
2. Chapter 11 trustee reporting is accurate
3. Financial data matches QBO exports
4. Asset listings are complete
5. Creditor claims are tracked accurately
Report any reporting discrepancies with file paths.
```

---

## 10. Code Quality

### TODO/FIXME/HACK inventory
```
Scan for TODO, FIXME, HACK comments. Find:
1. All TODO comments with context and priority
2. All FIXME comments with context
3. All HACK comments with explanation
4. Categorize by severity and urgency
5. Create actionable backlog from findings
Report all technical debt markers with file paths and recommendations.
```

### type-safety (any/ts-ignore)
```
Find type safety issues. Check:
1. All uses of `any` type
2. All uses of `@ts-ignore` directive
3. All uses of `as any` type assertions
4. Missing type annotations where inferred as any
Report all type safety issues with file paths and refactoring suggestions.
```

### test-coverage gaps
```
Check test coverage. Run coverage report and identify:
1. Critical paths with <80% coverage
2. Uncovered error handling paths
3. Missing integration tests for API endpoints
4. Missing E2E tests for user journeys
5. Components with no unit tests
Report coverage gaps with file paths and priority recommendations.
```

### circular dependencies
```
Detect circular import dependencies. Check:
1. Module A imports B, B imports C, C imports A
2. Circular dependencies between packages
3. Circular dependencies between components
4. Use tools like madge or dependency-cruiser
Report all circular dependencies with file paths and resolution suggestions.
```

---

## 11. Business Logic & Domain

### workflow/status-transition completeness
```
Check state machine completeness. For each entity with status (load, settlement, invoice, work_order):
1. All status transitions are defined
2. Invalid transitions are prevented
3. Transition conditions are validated
4. Transition side effects are executed
5. Status history is tracked
Report incomplete state machines with entity names and missing transitions.
```

### race conditions/concurrency
```
Find race conditions. Check:
1. Concurrent settlement calculations
2. Concurrent invoice generation
3. Concurrent load status updates
4. Concurrent inventory adjustments
5. Missing optimistic locking or row versioning
Report race condition risks with file paths and mitigation strategies.
```

### role-permission matrix
```
Verify RBAC matrix. Check:
1. All roles are defined (admin, dispatcher, driver, accountant, etc.)
2. All permissions are defined per role
3. All actions have permission checks
4. Permission checks are enforced at API level
5. Permission checks are enforced at UI level
Report missing permission checks with file paths.
```

### report-aggregation accuracy
```
Verify report aggregation accuracy. Check:
1. Report totals match source data queries
2. Aggregation joins are correct (no duplicate counting)
3. Date filters are applied correctly
4. NULL handling in aggregations
5. Rounding in aggregations is consistent
Report aggregation discrepancies with report names and SQL queries.
```

### search correctness
```
Test search functionality. Check:
1. Search handles empty results gracefully
2. Search handles special characters
3. Search is case-insensitive where appropriate
4. Search pagination works correctly
5. Search ranking/relevance is reasonable
Report search issues with component names and file paths.
```

---

## 12. Infrastructure & DevOps

### backup/restore verification
```
Verify backup and restore procedures. Check:
1. Database backups run on schedule
2. Backup retention policy is enforced
3. Restore procedure is documented
4. Restore procedure has been tested
5. Backups include all critical data
Report backup/restore issues with configuration file paths.
```

### disaster recovery plan
```
Verify disaster recovery plan. Check:
1. DR plan documentation exists
2. RTO (Recovery Time Objective) is defined
3. RPO (Recovery Point Objective) is defined
4. Failover procedure is documented
5. DR plan has been tested
Report missing DR plan elements with documentation paths.
```

### rate limiting coverage
```
Check rate limiting. Verify:
1. All public APIs have rate limiting
2. Rate limits are appropriate per endpoint
3. Rate limit headers are returned
4. Rate limit bypass is prevented
5. Rate limiting is monitored
Report missing rate limits with API route paths.
```

### log retention policy
```
Verify log retention. Check:
1. Logs are retained per policy (e.g., 90 days)
2. Log rotation is configured
3. Sensitive data is not logged
4. Log storage costs are monitored
5. Log export is available for audit
Report log retention issues with configuration file paths.
```

### monitoring alert coverage
```
Check monitoring alerts. Verify:
1. All critical services have uptime monitoring
2. Error rates are monitored and alerted
3. Performance metrics are monitored
4. Database health is monitored
5. External dependency health is monitored
Report missing alerts with service names.
```

---

## 13. Testing & QA

### E2E test coverage
```
Verify E2E test coverage. Check:
1. Critical user journeys have E2E tests (load creation, settlement, invoicing)
2. E2E tests run in CI/CD
3. E2E tests are stable (no flakiness)
4. E2E tests cover happy path and error paths
5. E2E tests use realistic test data
Report missing E2E tests with user journey names.
```

### integration test coverage
```
Check integration test coverage. Verify:
1. All API endpoints have integration tests
2. Integration tests use test database
3. Integration tests are isolated (no shared state)
4. Integration tests run in CI/CD
5. Integration tests cover error responses
Report missing integration tests with API route paths.
```

### contract testing
```
Verify API contract testing. Check:
1. API contracts are defined (OpenAPI/Swagger)
2. Contract tests validate response shapes
3. Contract tests run in CI/CD
4. Contract changes require approval
5. Contract tests prevent breaking changes
Report missing contract tests with API route paths.
```

### load testing
```
Check load testing. Verify:
1. Load tests exist for peak traffic scenarios
2. Load tests identify performance bottlenecks
3. Load tests run before major releases
4. Load test results are documented
5. Performance targets are defined
Report missing load tests with scenario names.
```

---

## 14. Data Privacy

### GDPR right-to-forget
```
Verify GDPR right-to-forget. Check:
1. Data deletion process exists for user requests
2. Deletion removes all personal data (logs, backups, archives)
3. Deletion is confirmed and logged
4. Retention exceptions are documented
5. Deletion request workflow is implemented
Report GDPR compliance issues with file paths.
```

### data encryption at rest
```
Verify data encryption at rest. Check:
1. Database encryption is enabled (TDE)
2. Sensitive columns are encrypted (SSN, credit cards)
3. Encryption keys are managed securely
4. Backups are encrypted
5. Encryption algorithm is current (AES-256)
Report encryption issues with configuration file paths.
```

### data encryption in transit
```
Verify data encryption in transit. Check:
1. All connections use TLS 1.3 or TLS 1.2
2. HTTP is disabled, only HTTPS allowed
3. Certificate management is automated
4. HSTS headers are set
5. Mixed content is prevented
Report encryption issues with configuration file paths.
```

### data minimization
```
Check data minimization. Verify:
1. Only necessary data is collected
2. Unnecessary data fields are removed
3. Data collection is justified per privacy policy
4. Data retention periods are defined
5. Data is deleted after retention period
Report data minimization issues with file paths.
```

---

## 15. API Design

### API versioning strategy
```
Verify API versioning. Check:
1. API has versioning strategy (e.g., /v1/, /v2/)
2. Breaking changes require new version
3. Old versions are deprecated with timeline
4. Version deprecation is communicated
5. Multiple versions can coexist
Report versioning issues with API route paths.
```

### API documentation completeness
```
Check API documentation. Verify:
1. OpenAPI/Swagger docs exist
2. All endpoints are documented
3. Request/response schemas are documented
4. Authentication is documented
5. Error responses are documented
Report missing documentation with endpoint paths.
```

### API error response consistency
```
Verify error response consistency. Check:
1. All errors follow consistent format
2. Error codes are standardized
3. Error messages are user-friendly
4. Error details include context
5. HTTP status codes are correct
Report inconsistent error responses with endpoint paths.
```

### API rate limit headers
```
Check rate limit headers. Verify:
1. Rate limit headers are returned (X-RateLimit-Limit, etc.)
2. Rate limit remaining is accurate
3. Rate limit reset time is provided
4. Rate limit headers are documented
5. Rate limit exceeded returns 429 status
Report missing rate limit headers with endpoint paths.
```

---

## Execution Notes

1. **Switch to SWE-1.6 model** before running these sweeps
2. **Work through sweeps in priority order** (Phase 1 → Phase 4)
3. **Document findings** in FINDINGS.md as you complete each sweep
4. **Mark sweeps as complete** in SWEEP-CATALOG.md with ✅
5. **For large context sweeps** (full codebase), consider using Kimi K2 if SWE-1.6 context is insufficient
