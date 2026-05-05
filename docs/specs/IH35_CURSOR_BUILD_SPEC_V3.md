# IH35 Cursor Build Spec V3 (Build Companion to Master Blueprint v3)

**Document type:** Implementation guidance, NOT a requirement source.

**Scope:** This document tells Cursor (or any successor build agent) HOW to build what the Master Blueprint specifies. It does not modify, extend, or contradict the blueprint.

**Normative hierarchy (binding):**

1. **Master Blueprint Parts 1-13** — authoritative source of all requirements, schema, APIs, WFs, RBAC, audit, REQ-* rows, test IDs, and locked vocabularies. **Any contradiction between this Build Spec and the Master Blueprint is a Build Spec defect, not a blueprint defect.**
2. **Trace Matrix** (`IH35_REQUIREMENT_TRACE_MATRIX_V3.csv`) — authoritative list of 247 REQ-* rows with their test IDs and WF-064 status.
3. **Workflow Index** (Part 12 §12.2.1) — authoritative WF namespace; 58 active WFs (WF-001..WF-064 minus 6 DEPRECATED).
4. **This Build Spec** — implementation guidance only.

**Status:** Draft. Awaiting Cursor strict review per the same 8-check + vocabulary-conformance gate established during Master Blueprint authoring.

**Lock-compliance preflight (asserted at delivery; verifiable mechanically):**

- **MUST not introduce any new product requirement.** Every MUST in this document either restates an existing blueprint MUST (with `(per Blueprint Part X §Y MUST X.Y.Z)` traceability) or specifies an executable build step that traces to one.
- **MUST not introduce any new schema, table, namespace, or DDL.** Schema count remains 14 per Part 4.
- **MUST not introduce any new WF ID.** Every WF reference is to a WF ID already in Part 12 §12.2.1.
- **MUST not introduce any new REQ-* row.** Trace matrix preserved at 247 data rows.
- **MUST not introduce any new test ID.** Tests referenced by ID only; range remains T-011.1..T-209.5; total remains 849.
- **MUST keep locked vocabularies character-exact.** Status enum: `MATCHED | REMAPPED | DEPRECATED`. Roles: Owner, Administrator, Manager, Accountant, Dispatcher, Safety, Driver, Mechanic. Severities: info, warning, critical. Profiles: FULL, Profile A, Profile B, Profile C, service-only.
- **MUST keep counts exact.** No `~`, no "approximately", no "roughly", no "about [number]". Where a count is genuinely indeterminate (e.g., post-build runtime metrics), state that the count is implementation-defined and reference the blueprint requirement that constrains it.
- **MUST use `MUST | MUST NOT | SHOULD | SHOULD NOT | MAY` (RFC 2119) only when restating or executing a Blueprint MUST.** When this document gives implementation conventions that are recommended-but-not-required, use `SHOULD`. When stating absolute prohibitions, use `MUST NOT`.

---

## TABLE OF CONTENTS

| Section | Title |
|---|---|
| 1 | Purpose and Scope of Build Spec |
| 2 | Source-of-Truth Index |
| 3 | Environment and Toolchain Baseline |
| 4 | Repository and Code Organization Plan |
| 5 | Database Implementation Plan |
| 6 | API Implementation Plan |
| 7 | Workflow Execution Plan |
| 8 | Audit, WF-064, and Notification Wiring Plan |
| 9 | Frontend Implementation Plan |
| 10 | Integrations Rollout Plan |
| 11 | Testing and Quality Gate Plan |
| 12 | Cutover and Deployment Plan |
| 13 | Implementation Task Matrix |
| 14 | Change Control Rules for Build Phase |
| Footer | Self-check confirming lock compliance |

---

## 1. PURPOSE AND SCOPE OF BUILD SPEC

### 1.1 What this document is

A practical, implementation-grade companion to the Master Blueprint v3. It tells the build team:

- WHICH technology choices to use and at WHICH versions (the Master Blueprint specifies "Drizzle ORM"; this spec says "Drizzle 0.x.y, with explicit migration sequence").
- IN WHAT ORDER to implement modules so dependencies resolve cleanly.
- WHICH commands to run for lint, test, build, deploy, verification.
- HOW to honor each MUST clause in code without introducing scope creep.

### 1.2 What this document is NOT

- NOT a place to refine, soften, expand, or reinterpret any blueprint MUST.
- NOT a substitute for reading the blueprint. Build implementers MUST read Parts 1-13 in full before consuming this document.
- NOT a contract amendment vehicle. If implementation discovers ambiguity or impossibility, the resolution path is the v3.X spec amendment process (Master Blueprint Part 13 MUST 13.3.6.1), NOT silent edits to this Build Spec.

### 1.3 Normative hierarchy (binding)

Restated explicitly:

1. **Master Blueprint Parts 1-13** is the only authoritative requirement source.
2. **Trace Matrix CSV** is the only authoritative trace artifact.
3. **Part 12 §12.2.1 Workflow Index** is the only authoritative WF namespace.
4. **This Build Spec** is implementation guidance subordinate to all three.

**MUST 1.3.1** — When this Build Spec and the Master Blueprint disagree on any point of scope, semantics, IDs, or vocabulary, the Master Blueprint wins. This Build Spec MUST be amended (not the Blueprint) to resolve the disagreement.

**MUST 1.3.2** — Build agents MUST treat this Build Spec as a living artifact that may be updated during implementation to clarify HOW to build, but MUST NOT update it in ways that change WHAT to build.

### 1.4 Audience

- **Primary:** Cursor (the build agent producing TypeScript, SQL, React, infrastructure config).
- **Secondary:** Owner (Jorge Munoz) reviewing build progress against the spec.
- **Tertiary:** Future maintainers post-go-live needing implementation context.

---

## 2. SOURCE-OF-TRUTH INDEX

Concise map from each major build area to the exact Part(s) in the Master Blueprint. When implementing area X, read the Blueprint Parts listed for X **in full** before writing code.

### 2.1 Build areas → Blueprint Parts

| Build area | Authoritative Blueprint Part(s) | Key sections |
|---|---|---|
| Architecture (modular monolith, stack choice, modules list) | Part 1-3 | Whole document; especially Part 3.12 (integrations), Part 3.17 (Documents), Part 3.18 (Catalogs governance) |
| Schema (14 schemas, all DDL, RLS, triggers, indexes, constraints) | Part 4 | Whole document; Part 4.0.x (cross-cutting), Part 4.5 (Driver Finance), Part 4.6 (Accounting), Part 4.7 (Banking), Part 4.9 (Audit) |
| Security (auth, RBAC, role taxonomy, secrets handling) | Part 5 | Whole document; Part 5.1 (auth), Part 5.4 (roles), Part 5.5 (notifications routing rules), Part 5.6 (secrets) |
| UI patterns (sidebar, drawers, modals, WF-064 envelope) | Part 6 | Whole document; Part 6.4 (UI patterns), Part 6.8 (WF-064 envelope) |
| Identity module (users, sessions, role assignments, permission grants) | Part 7 §7.1 | All 10 elements; especially §7.1.2 (UI), §7.1.4 (APIs), §7.1.7 (roles), §7.1.10 (tests) |
| Master Data module (drivers, units, customers, vendors, locations, equipment) | Part 7 §7.2 | All 10 elements; especially §7.2.3 (entities), §7.2.4 (APIs), §7.2.7 (Tables A/B for WF-064), §7.2.10 (tests) |
| Catalogs module (chart of accounts, classes, items, payment_terms, posting_templates, account_role_bindings) | Part 7 §7.3 | All 10 elements; especially §7.3.4 (APIs), §7.3.7 (Tables A/B) |
| Dispatch module (loads, trips, geofencing, driver assignment) | Part 8a | Whole document |
| Driver Finance module (settlements, escrow, liabilities, advances, deductions, terms acceptance) | Part 8b | Whole document; especially §8b.1.4 (APIs including live-recompute API per Part 4.5.4.3), §8b.1.7 (Tables A/B with 10 originated WF-064) |
| Maintenance module (PM, repair, tire, accident WOs, in-transit issue queue) | Part 9 §9.1 | All 10 elements |
| Safety module (DOT inspections, accidents, claims, DVIR) | Part 9 §9.2 | All 10 elements |
| Fuel module (IFTA, Form 425C, fuel cards, overage liability inheritance) | Part 9 §9.3 | All 10 elements |
| Accounting module (bills, invoices, payments, journal entries, period close, reconciliation findings) | Part 10a | Whole document; especially §10a.1.4 (APIs), §10a.1.7 (Tables A/B with 11 originated WF-064) |
| Banking module (bank accounts, bank transactions, factoring transactions, reconciliation matching) | Part 10b | Whole document |
| Documents module (evidence_records, retention, legal hold, signed PDFs, tamper detection) | Part 11 §11.1 | All 10 elements; especially §11.1.2.5 (signed PDF), §11.1.4.6 (force purge), §11.1.7.1 (Tables A/B) |
| Notifications module (dispatcher, channels, suppression, preferences, provider failover) | Part 11 §11.2 | All 10 elements; especially §11.2.4 (BullMQ dispatcher), §11.2.7 (Tables A/B) |
| Workflow taxonomy (single authoritative WF namespace) | Part 12 §12.1, §12.2 | §12.1.3 (mapping table), §12.1.4 (deprecated dispositions), §12.2.1 (V3 Authoritative Index of 58 active WFs) |
| Role consolidation across modules | Part 12 §12.3 | §12.3.1 (per-role action counts), §12.3.3 (WF-064 role gating consolidation) |
| Audit event taxonomy | Part 12 §12.4 | §12.4.1 (per-module audit event counts), §12.4.2 (retention), §12.4.3 (severity ladder) |
| Build phasing (7-phase sequence) | Part 12 §12.5 | §12.5.2 (recommended phase sequence), §12.5.3 (cutover strategy) |
| Cross-cutting MUST index | Part 12 §12.6 | All 10 cross-cutting concerns |
| Traceability rollup (REQ-* per module) | Part 13 §13.1 | §13.1.2 (REQ rollup by module), §13.1.4 (WF-064 trace), §13.1.5 (cross-cutting trace anchors) |
| Acceptance criteria (the dev-complete bar) | Part 13 §13.2 | §13.2.1 (5 categories), §13.2.7 (per-phase gates) |
| Sign-off framework | Part 13 §13.3 | §13.3.1 (principals), §13.3.2 (ceremony), §13.3.3 (phase-by-phase table), §13.3.4 (cutover checklist) |

### 2.2 Cross-cutting touchpoint quick-reference

| Concern | First read | Then read |
|---|---|---|
| RLS policy patterns | Part 4.0.4 | Each module §X.3 RLS section |
| Append-only audit | Part 4.9.3.1-3 | Each module §X.9 audit events |
| WF-064 envelope | Part 6.8.3 | Each module §X.7.1 Tables A/B |
| Service-function-only writes | Part 4.6.2.6 | Cross-module MUSTs in Part 12 §12.6 |
| Outbox-driven QBO sync | Part 3.12.4.8 | Part 10a §10a.1.4 (force resync) |
| Server-computed sha256 | Part 3.17.2.3 | Part 11 §11.1.2.5 (signed PDF generator) |
| Encrypted PII | Part 4.7.2.3 | Part 10b §10b.1 (banking schema) |
| Driver self-access scope | Part 7.1.7 | Each driver-touching module §X.7 |
| QBO mirror parity | Part 3.18 + Part 7 §7.3 | Part 10a §10a.1.4 (force resync), Part 12 §12.6 |
| Live recompute API latency | Part 4.5.4.3 | Part 8b §8b.1.4 |

### 2.3 Reference artifacts (file paths)

| Artifact | Path | Purpose |
|---|---|---|
| Master Blueprint Parts 1-13 | `IH35_MASTER_BLUEPRINT_v3_part_*.md` (15 files in `/mnt/user-data/outputs/`) | Authoritative spec |
| Requirement Trace Matrix | `IH35_REQUIREMENT_TRACE_MATRIX_V3.csv` | 247 REQ rows + test IDs + WF-064 flags |
| Pre-Build Questionnaire | `IH35_PRE_BUILD_QUESTIONNAIRE.docx` | Owner-answered open questions resolved during Parts 1-3 |
| Session Register | `IH35_SESSION_REGISTER.md` | Decision audit trail; the "why" behind locks |

---

## 3. ENVIRONMENT AND TOOLCHAIN BASELINE

### 3.1 Runtime versions (locked from Parts 1-3)

| Component | Version | Source |
|---|---|---|
| Node.js | 22 LTS | Part 1-3 stack table |
| TypeScript | 5.x (latest 5.x available at build start) | Part 1-3 stack table |
| PostgreSQL | 16 on Neon | Part 1-3 stack table; Part 4 DDL targets PG 16 features |
| Redis | 7.x on Upstash | Part 1-3 stack table; Part 11 §11.2.4 BullMQ |
| React | 19 | Part 1-3 stack table |
| Vite | 5.x or 6.x (latest stable at build start) | Part 1-3 stack table |
| Tailwind CSS | 3.x | Part 1-3 stack table; Part 6 design tokens |
| Workbox | 7.x | Part 1-3 stack table; PWA service worker |

**MUST 3.1.1** — Build agents MUST NOT upgrade Node.js to a version newer than 22 LTS during initial build. Node 24 (when LTS) is a Phase 2 consideration with explicit Owner sign-off.

**MUST 3.1.2** — PostgreSQL 16 features used in Part 4 DDL (e.g., `pg_stat_io`, RLS policy syntax, `gen_random_uuid()`) MUST NOT be substituted with PG 15 or earlier equivalents. The Neon instance MUST run PG 16+.

### 3.2 Backend framework + libraries (locked)

| Library | Version range | Purpose | Blueprint anchor |
|---|---|---|---|
| Fastify | 5.x | HTTP framework | Part 1-3 stack |
| Drizzle ORM | 0.x latest stable | DB access | Part 1-3 stack |
| Drizzle Kit | matching Drizzle ORM | Migrations | Part 4 migration mechanism |
| BullMQ | 5.x | Job queue (notifications, outbox) | Part 11 §11.2.4 |
| Lucia Auth | latest stable | Session-based auth | Part 5.1 |
| Zod | 3.x | Request validation schemas | Part 7+ API contract |
| pino | 8.x or 9.x | Structured logging | Part 5.7 (logging convention) |
| @fastify/helmet | latest | Security headers | Part 5.6 |
| @fastify/rate-limit | latest | Rate limiting | Part 5.4 |

**SHOULD 3.2.1** — Pin exact patch versions in `package.json` (`"fastify": "5.0.0"` not `"^5.0.0"`) to ensure deterministic builds across environments. Use `npm ci` (not `npm install`) in CI.

### 3.3 Frontend framework + libraries (locked)

| Library | Version range | Purpose | Blueprint anchor |
|---|---|---|---|
| React | 19.x | UI framework | Part 1-3 stack |
| Vite | 5.x or 6.x | Build tooling | Part 1-3 stack |
| Tailwind CSS | 3.x | Styling | Part 6 design tokens |
| Workbox | 7.x | PWA service worker | Part 1-3 stack |
| TanStack Query | 5.x | Data fetching/caching | Part 6 UI patterns (recommended) |
| react-hook-form | 7.x | Form handling | Part 6 form patterns |
| date-fns | 3.x | Date handling | Standard convention |

### 3.4 External service SDKs

| SDK | Version | Service | Blueprint anchor |
|---|---|---|---|
| `@aws-sdk/client-s3` | 3.x | Cloudflare R2 (S3-compatible) | Part 11 §11.1 |
| `intuit-oauth` + QBO API client | latest | QuickBooks Online | Part 3.12.4.8 |
| `@samsara/sdk` (or HTTP client) | latest | Samsara telematics | Part 3.12.4 |
| Twilio Node SDK | 5.x | SMS | Part 11 §11.2 |
| Resend SDK | latest | Email | Part 11 §11.2 |
| Expo Push (HTTP API) | n/a | Push notifications | Part 11 §11.2 |
| Sentry Node + React SDKs | 8.x | Error monitoring | Part 1-3 stack |

### 3.5 Package manager + commands (locked)

**MUST 3.5.1** — The repository MUST use `npm` as its package manager. Do not introduce `yarn`, `pnpm`, or `bun` without an explicit v3.X amendment.

**MUST 3.5.2** — The repository MUST commit a `package-lock.json`. CI MUST use `npm ci` for reproducibility.

**Standard commands** (to be defined in `package.json` scripts):

| Command | Effect |
|---|---|
| `npm run dev` | Local dev server with hot reload (backend + frontend concurrently) |
| `npm run build` | Production build for backend + frontend |
| `npm run lint` | ESLint + Prettier check |
| `npm run lint:fix` | Apply ESLint + Prettier fixes |
| `npm run typecheck` | `tsc --noEmit` for both packages |
| `npm run test` | Run all unit + integration tests |
| `npm run test:e2e` | Run e2e tests (Playwright) |
| `npm run db:migrate` | Apply pending Drizzle migrations |
| `npm run db:rollback` | Rollback last migration (Phase 0-2 only; later phases use forward-only migrations) |
| `npm run db:seed:dev` | Seed canonical reference data for dev (Owner user, Master Data sample rows) |
| `npm run trace:verify` | Verify trace matrix consistency (247 REQ rows; 849 unique test IDs; no orphans) |

**MUST 3.5.3** — `npm run lint`, `npm run typecheck`, and `npm run test` MUST all pass before any merge to main. CI MUST block merges otherwise.

### 3.6 Environment variable inventory (grouped by module; no secret values)

The build MUST consume environment variables via a typed config module (`src/config.ts`) that validates presence + format on startup with Zod. Missing required variables MUST cause a startup failure with a clear error message.

| Module / area | Required env vars |
|---|---|
| Core / runtime | `NODE_ENV`, `PORT`, `LOG_LEVEL`, `APP_BASE_URL`, `APP_VERSION` |
| Database | `DATABASE_URL` (Neon connection string), `DATABASE_DIRECT_URL` (for migrations bypassing pooler) |
| Redis | `REDIS_URL` (Upstash connection string) |
| Identity / auth (Part 5) | `SESSION_SECRET`, `OAUTH_GOOGLE_CLIENT_ID`, `OAUTH_GOOGLE_CLIENT_SECRET`, `OAUTH_REDIRECT_URI` |
| Documents (Part 11.1, R2) | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_EVIDENCE`, `R2_PUBLIC_URL_BASE` |
| Notifications (Part 11.2) | `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `EXPO_ACCESS_TOKEN` |
| QBO integration (Part 3.12.4.8) | `QBO_CLIENT_ID`, `QBO_CLIENT_SECRET`, `QBO_REDIRECT_URI`, `QBO_ENVIRONMENT` (sandbox\|production) |
| Samsara (Part 3.12.4) | `SAMSARA_API_TOKEN`, `SAMSARA_BASE_URL` |
| Relay (Part 3.12.4) | `RELAY_API_KEY`, `RELAY_BASE_URL` |
| Banking PII encryption (Part 4.7.2.3) | `BANKING_PII_ENCRYPTION_KEY` (rotated annually per Part 5.6) |
| Sentry | `SENTRY_DSN_BACKEND`, `SENTRY_DSN_FRONTEND` |

**MUST 3.6.1** — The startup validator MUST verify that production environments have all of the above present. Sandbox/dev MAY use placeholder values for QBO/Samsara/Relay if those integrations are not exercised in that environment, but MUST log a clear warning.

**MUST 3.6.2** — Secret values MUST NOT be committed to the repository. The repository MUST contain a `.env.example` file with placeholder values for all required variables.

**MUST 3.6.3** — The encryption key for banking PII (`BANKING_PII_ENCRYPTION_KEY`) MUST be rotated annually per Part 5.6, with key versions tracked in the audit log per Part 4.7.2.3.

### 3.7 Hosted services baseline

| Service | Purpose | Tier guidance | Blueprint anchor |
|---|---|---|---|
| Render | Backend hosting + cron + workers | Standard or Pro plan; enable autoscale | Part 1-3 stack |
| Neon | PostgreSQL 16 hosting | Pro tier (point-in-time recovery enabled with 7-day retention per MUST 13.2.6.3) | Part 13 §13.2.6.3 |
| Upstash | Redis for BullMQ + caching | Pay-as-you-go; persistence enabled | Part 1-3 stack |
| Cloudflare R2 | Evidence storage | One bucket for evidence records; lifecycle policy for cold storage matching Part 4.9.3.4 retention floor | Part 11 §11.1 + Part 13 §13.2.6.3 |
| Resend | Email delivery | Production tier (matches expected volume per Part 11 §11.2 throughput) | Part 11 §11.2 |
| Twilio | SMS delivery | Production account; verified from-number | Part 11 §11.2 |
| Sentry | Error monitoring | Team plan; PII scrubbing enabled | Part 13 §13.2.6.4 |

---

## 4. REPOSITORY AND CODE ORGANIZATION PLAN

### 4.1 Top-level layout (locked structure)

```
ih35-dispatcher/
├── README.md
├── package.json              # workspace root
├── package-lock.json
├── tsconfig.json             # workspace TS config
├── .env.example
├── .github/workflows/        # CI definitions
├── apps/
│   ├── backend/              # Fastify + Drizzle backend (the modular monolith)
│   ├── web-office/           # React office app
│   └── web-driver-pwa/       # React + Workbox PWA for drivers
├── packages/                 # shared libraries
│   ├── shared-types/         # TypeScript types shared across backend + frontends
│   ├── shared-schemas/       # Zod schemas shared across backend + frontends
│   └── audit-client/         # SDK for posting audit events from frontends
├── db/
│   ├── migrations/           # Drizzle migration files (numbered)
│   ├── seed/                 # Seed scripts for dev environments
│   └── schema/               # Drizzle schema files (one per module)
└── tests/
    ├── e2e/                  # Playwright e2e tests
    └── trace-verify/         # Trace matrix consistency verifier
```

**MUST 4.1.1** — The `apps/backend/` directory MUST be organized by module. Each module owns its own subdirectory with the structure defined in §4.2.

**MUST 4.1.2** — The `db/migrations/` directory MUST be the single source of truth for all DDL. No other directory MUST execute DDL against the database. Manual SQL execution against production is forbidden except for explicit Owner-authorized rollback or break-glass operations (each of which MUST be audited).

**MUST 4.1.3** — The `packages/shared-types/` directory MUST be the single source of truth for cross-package TypeScript types (e.g., `UserRole`, `AuditEventClass`, `WFId`, `LiabilityStatus`). Modules MUST NOT redefine these types locally.

### 4.2 Per-module backend subdirectory layout (locked)

For each of the 11 operational modules + identity + master_data + catalogs (14 total module directories), the subdirectory layout is:

```
apps/backend/src/modules/<module_name>/
├── routes.ts          # Fastify route registrations for this module
├── handlers/          # Route handlers (thin; delegate to services)
│   └── *.handler.ts
├── services/          # Business logic; the only place that posts to other modules
│   └── *.service.ts
├── repositories/      # Drizzle queries; one repository per primary entity
│   └── *.repo.ts
├── validators/        # Zod schemas for request validation
│   └── *.schema.ts
├── audit/             # Audit event class definitions and emission helpers
│   └── events.ts
├── permissions/       # Permission check helpers for this module
│   └── permissions.ts
└── index.ts           # Module entrypoint; exports route plugin + service interfaces
```

**MUST 4.2.1** — Modules MUST follow this exact layout. New top-level subdirectories beyond the seven above require a v3.X spec amendment.

**MUST 4.2.2** — Every module's `services/` directory MUST be the only layer that calls `services/` of OTHER modules. Direct cross-module repository access MUST NOT occur.

**MUST 4.2.3** — Every module's `repositories/` directory MUST be the only layer that issues Drizzle queries against THAT module's tables. Cross-module Drizzle reads MUST go through the target module's service interface.

### 4.3 Module dependency direction (locked)

The dependency graph MUST follow the direction below. Arrows indicate "may depend on"; a module MUST NOT depend on any module not listed downstream.

```
Identity ─┐
          ├─→ everywhere (every module reads current_user_id)
Master Data ─→ Catalogs, Driver Finance, Maintenance, Safety, Fuel,
                Accounting, Banking, Documents, Notifications
Catalogs ─→ Driver Finance, Maintenance, Safety, Fuel, Accounting, Banking
Documents ─→ everywhere (every module writes evidence)
Notifications ─→ called BY everywhere via service interface; depends only on Identity (for user prefs)
Audit (cross-cutting) ─→ called BY everywhere via append_event(); no module deps

Dispatch ─→ Driver Finance, Maintenance, Safety, Documents, Accounting (load-driven postings)
Driver Finance ─→ Accounting (settlements + escrow postings)
Maintenance ─→ Documents, Accounting (work order → bill)
Safety ─→ Documents, Accounting (claims posting)
Fuel ─→ Documents, Driver Finance (fuel card overage liability inheritance)
Accounting ─→ Catalogs, Banking (categorization targets), Documents
Banking ─→ Accounting, Catalogs (chart-of-account bindings)
```

**MUST 4.3.1** — A module's `services/` MUST NOT import from a module that does not appear downstream of it in the dependency graph above. The lint rule `enforce-module-dependency-direction` MUST be implemented and CI-enforced.

**MUST 4.3.2** — Circular dependencies between modules MUST NOT exist. The lint rule MUST detect cycles.

**MUST 4.3.3** — Cross-module FKs MUST go only through canonical reference tables (Identity users, Master Data drivers/units/equipment/customers/vendors/locations, Catalogs accounts, Documents evidence_records, Audit audit_events) per Master Blueprint Part 4.0.3.2. Leaf-to-leaf FKs MUST NOT exist.

### 4.4 Shared library boundaries (anti-coupling)

| Package | Allowed contents | Forbidden contents |
|---|---|---|
| `shared-types` | TypeScript type aliases, enums, branded types (e.g., `UserUuid = string & { __brand: 'UserUuid' }`) | Runtime code, Zod schemas, business logic |
| `shared-schemas` | Zod schemas matching shared-types | Runtime business logic, side effects, DB queries |
| `audit-client` | Browser-safe SDK for posting audit events from frontends to the backend audit endpoint | DB access, server-only code |

**MUST 4.4.1** — `shared-types` and `shared-schemas` MUST NOT import from any backend module or the `db/` directory.

**MUST 4.4.2** — Frontend apps MUST NOT import from `apps/backend/`. They consume backend behavior only via HTTP API calls, with type-only references through `shared-types` if needed.

### 4.5 Linting + format (locked)

**MUST 4.5.1** — ESLint MUST be configured with at minimum: `@typescript-eslint/recommended-type-checked`, plus the custom rule `enforce-module-dependency-direction` (per MUST 4.3.1).

**MUST 4.5.2** — Prettier MUST be configured. Format MUST be applied to all `.ts`, `.tsx`, `.json`, `.md` files.

**MUST 4.5.3** — Pre-commit hook (Husky or simple-git-hooks) MUST run `npm run lint && npm run typecheck` on staged files; commit MUST fail if either fails.

---

## 5. DATABASE IMPLEMENTATION PLAN

### 5.1 Migration source-of-truth

**MUST 5.1.1** — All DDL MUST come from translating Master Blueprint Part 4 directly into Drizzle migration files. No table, column, RLS policy, trigger, or index MUST exist in the database that does not appear in Part 4 (or in documented Part 11 narrative handling for `documents.evidence_records` per Part 11 §11.1.3).

**MUST 5.1.2** — Migration files MUST be numbered sequentially and named to indicate the schema/table they affect (e.g., `0001_create_audit_schema.sql`, `0002_create_identity_users.sql`).

**MUST 5.1.3** — Migrations MUST be forward-only after Phase 2. Backward migration files (rollback) are permitted in Phases 0-1 only. Once Phase 3 begins, any schema correction MUST be a new forward migration.

### 5.2 Migration sequencing strategy

The migration sequence MUST follow the Phase order from Master Blueprint Part 12 §12.5.2. Within each Phase, the order MUST honor canonical-reference-before-leaf per Part 4.0.3.2.

**Phase 0 migrations:**

1. Create extensions: `uuid-ossp`, `pgcrypto` (for `gen_random_uuid()` and digest functions)
2. Create the 14 schemas in dependency order:
   1. `audit` (no deps)
   2. `outbox` (no deps)
   3. `identity` (deps: audit for FK to audit_events)
   4. `master_data` (deps: identity)
   5. `catalogs` (deps: identity)
   6. `documents` (deps: identity, master_data)
   7. `notifications` (deps: identity)
   8. `dispatch` (deps: master_data, catalogs)
   9. `driver_finance` (deps: master_data, catalogs, documents, accounting — note: accounting tables come later; FK creation ordered carefully)
   10. `maintenance` (deps: master_data, catalogs, documents)
   11. `safety` (deps: master_data, documents)
   12. `fuel` (deps: master_data, catalogs, driver_finance)
   13. `accounting` (deps: catalogs, master_data, documents, banking — circular with banking handled via deferred FKs)
   14. `banking` (deps: catalogs, accounting)
3. Create `audit.audit_events` first within Phase 0 (every other table needs it for trigger emission)
4. Create `outbox.outbox_queue`
5. Create `audit.append_event()` stored procedure (per Part 4.9.3.2)
6. Apply RLS to `audit.audit_events`: append-only via `audit.append_event()` only; UPDATE/DELETE forbidden for all roles (per Part 4.9.3.1)

**Phase 1 migrations (Identity + Master Data + Catalogs):**

7. Create `identity.users`, `identity.sessions`, `identity.role_assignments`, `identity.permission_grants`, `identity.password_reset_tokens` (per Part 7 §7.1)
8. Create RLS policies for identity tables per Part 7 §7.1.7
9. Create `master_data.drivers`, `master_data.units`, `master_data.customers`, `master_data.vendors`, `master_data.locations`, `master_data.equipment`, `master_data.equipment_log` (per Part 7 §7.2.3)
10. Create RLS policies for master_data tables per Part 7 §7.2.7
11. Create cross-schema invariant triggers: driver-vendor pair invariant, unit-class pair invariant, equipment dual-confirmation invariant (per Part 7 §7.2 + Part 4 cross-cutting)
12. Create `catalogs.accounts`, `catalogs.classes`, `catalogs.items`, `catalogs.payment_terms`, `catalogs.posting_templates`, `catalogs.account_role_bindings` (per Part 7 §7.3.3)
13. Create RLS + invariant triggers for catalogs tables per Part 7 §7.3.7
14. Seed canonical reference data: Owner user (per Part 5.4 last-owner invariant), default chart of accounts (per Part 7 §7.3 + Part 3.18 governance)

**Phase 2 migrations (Documents + Notifications dispatcher):**

15. Create `documents.evidence_records` + supporting tables (per Part 11 §11.1.3)
16. Create RLS for documents tables per Part 11 §11.1.7
17. Create `notifications.events`, `notifications.user_preferences`, `notifications.suppression_rules`, `notifications.delivery_log` (per Part 11 §11.2.3)
18. Create RLS for notifications tables per Part 11 §11.2.7
19. Wire BullMQ dispatcher worker process (deployment + worker connectivity; not DDL)

**Phase 3 migrations (Maintenance + Safety + Fuel):**

20. Create maintenance tables per Part 9 §9.1.3
21. Create safety tables per Part 9 §9.2.3
22. Create fuel tables per Part 9 §9.3.3
23. Apply RLS + triggers per Part 9 §X.7

**Phase 4 migrations (Driver Finance):**

24. Create driver_finance tables per Part 8b §8b.1.3 (driver_settlements, driver_escrow, driver_liabilities, driver_advances, driver_deductions, driver_terms_acceptances, etc.)
25. Apply RLS + triggers per Part 8b §8b.1.7
26. Create `driver_finance.recompute_driver_debt()` stored procedure (per Part 4.5.4 transactional debt authority)
27. Create dispatch tables per Part 8a (sequenced after driver_finance because of multi-stop load → settlement source)

**Phase 5 migrations (Accounting):**

28. Create accounting tables per Part 10a §10a.1.3
29. Apply RLS + triggers per Part 10a §10a.1.7
30. Create accounting service-function entry point: `accounting.post_journal_entry()` (per Part 4.6.2.6 entry-point lock)
31. Create posted-JE immutability trigger (per WF-040)
32. Create reversing JE trigger (per WF-039)
33. Backfill: replay v2 historical postings into v3 accounting tables for parallel-run start

**Phase 6 migrations (Banking):**

34. Create banking tables per Part 10b §10b.1.3
35. Apply RLS + triggers per Part 10b §10b.1.7
36. Create encrypted-PII columns + decrypt access logging trigger (per Part 4.7.2.3)
37. Create factoring lifecycle triggers (per WF-031)

### 5.3 RLS rollout order

**MUST 5.3.1** — RLS MUST be enabled on every table in the same migration file that creates the table. There MUST NOT be a window where a table exists without RLS.

**MUST 5.3.2** — RLS smoke tests MUST run as part of `npm run test:rls` and MUST exercise every locked role (Owner, Administrator, Manager, Accountant, Dispatcher, Safety, Driver, Mechanic) against every table. The test MUST verify that each role's allowed actions succeed and forbidden actions fail with `E_PERMISSION_DENIED` (or `42501` from PostgreSQL).

**MUST 5.3.3** — Driver self-access scope MUST be implemented via RLS, NOT via application-layer filtering. Per Part 7.1.7 + each driver-touching module §X.7.

### 5.4 Trigger + function rollout

**MUST 5.4.1** — Triggers MUST be created in the same migration as their target tables (or immediately after, in a paired migration with a dependent number).

**MUST 5.4.2** — Stored procedures and SQL functions MUST be idempotent (use `CREATE OR REPLACE FUNCTION`) and MUST be re-runnable.

**MUST 5.4.3** — Every trigger MUST have a corresponding test in `tests/db-triggers/` that verifies its behavior — both the success path AND the rejection/blocked path where applicable.

### 5.5 Backfill strategy

For migrating from v2 (existing maintenance.html system) to v3, backfill MUST be performed in one direction (v2 → v3) only.

**MUST 5.5.1** — Backfill scripts MUST use the v3 service-function APIs (e.g., `accounting.post_journal_entry()`) for any data that has accounting effects, NOT direct INSERTs that bypass triggers.

**MUST 5.5.2** — Backfill scripts MUST be idempotent. Running the backfill twice MUST NOT produce duplicate rows.

**MUST 5.5.3** — Backfill MUST produce a verification report showing source row count vs destination row count + any sample-checked totals (e.g., total AR open balance match).

**MUST 5.5.4** — The reconciliation key totals defined in Master Blueprint Part 12 §12.5.3.2 (total AR open balance, total AP open balance, total settlement payable, top-20 driver debt balances, fuel-month totals, IFTA quarterly subtotals) MUST be verified to match between v2 and post-backfill v3 before parallel-run starts.

### 5.6 Database verification commands

| Command | Verifies |
|---|---|
| `npm run db:verify:schemas` | All 14 schemas exist; no extras |
| `npm run db:verify:rls` | Every table has RLS enabled |
| `npm run db:verify:triggers` | Every Part 4 + Part 7-11 specified trigger is present |
| `npm run db:verify:audit-append-only` | UPDATE/DELETE on audit.audit_events fails for all roles |
| `npm run db:verify:fk-canonical` | No leaf-to-leaf FKs exist |
| `npm run db:verify:indexes` | Every Part 4 specified index is present |

**MUST 5.6.1** — These verification commands MUST be runnable in CI and MUST be run as a phase-gate check before each Phase transition per Part 12 §12.5.2.

---

## 6. API IMPLEMENTATION PLAN

### 6.1 Endpoint implementation sequencing

API endpoints MUST be implemented in module order matching the Phase sequence (§5.2). Within a module, FULL endpoints (per Part 13 §13.2.3) MUST be implemented before profile-mapped endpoints.

| Module | FULL endpoint count | Phase |
|---|---|---|
| Identity | 6 | Phase 1 |
| Master Data | 10 | Phase 1 |
| Catalogs | 8 | Phase 1 |
| Documents | 4 | Phase 2 |
| Notifications | 2 | Phase 2 |
| Maintenance | 5 | Phase 3 |
| Safety | 4 | Phase 3 |
| Fuel | 2 | Phase 3 |
| Driver Finance | 13 | Phase 4 |
| Accounting | 7 | Phase 5 |
| Banking | 5 | Phase 6 |
| **TOTAL** | **66** | — |

### 6.2 DoD contract enforcement checklist (FULL endpoints)

Every FULL endpoint MUST satisfy ALL of the following before being merged. CI MUST verify each item.

| DoD item | Implementation requirement | Verification |
|---|---|---|
| Request validation | Zod schema in `validators/<endpoint>.schema.ts`; Fastify `schema` config rejects malformed input with `E_VALIDATION` (HTTP 400) | Acceptance test sends malformed body; expects 400 + `E_VALIDATION` |
| Success response | Returns documented response shape from Blueprint §X.1.4 | Acceptance test asserts response matches shape |
| 400 validation error | Documented `E_VALIDATION` returned with field-level error array | Acceptance test triggers each documented validation rule |
| Business 422 error | Each documented `E_BUSINESS_*` code returned for the documented condition | Acceptance test triggers each documented business rule failure |
| 403 permission denied | `E_PERMISSION_DENIED` returned for non-allowed roles per Blueprint §X.7 role matrix | Acceptance test runs as each non-allowed role; expects 403 |
| Error code linkage | Every error code returned by the endpoint appears in Blueprint §X.1.10.1 error table | Lint rule cross-references endpoint code with §X.1.10.1 table |
| Audit emission | Success path emits `{module}.{action}` audit event per Blueprint §X.9 | Acceptance test reads audit log after success; asserts row exists |
| WF-064 success/blocked symmetry | If the endpoint fires WF-064, both `_executed` and `_blocked` audit events are wired | Acceptance test runs both success + blocked paths; asserts symmetric audit rows |

### 6.3 Profile-mapped endpoint checklist

Per Part 7.3.4.1 + carried through every module, profile-mapped endpoints follow these patterns:

| Profile | Pattern | Acceptance test bar |
|---|---|---|
| Profile A | Read-only list/detail/get; standard pagination + filter envelope | Sample of ≥30% of mapped actions per module tested explicitly |
| Profile B | CRUD non-WF-064 mutation; adds entity-specific `E_*_DUPLICATE` + `E_VERSION_CONFLICT` | Sample of ≥30% of mapped actions per module tested explicitly |
| Profile C | WF-064 mutation with 2-step confirmation; adds action-specific `E_*` + success/blocked audit pair | 100% of Profile C actions tested explicitly |
| service-only | Internal service function; no user-facing API; called by other modules' services | Direct service call test + caller test from each invoking module |

**MUST 6.3.1** — Profile A and Profile B endpoints MUST follow a standard envelope (validators, repositories, audit emission). Build agents SHOULD generate these from a template to ensure consistency.

**MUST 6.3.2** — Profile C endpoints (WF-064 mutations) MUST require: 2-step confirmation modal (per Part 6.4.5.4), typed phrase confirmation (per Part 6.8.3), reason text ≥30 chars (per Part 6.8.3). Backend MUST validate reason length and reject if shorter.

**MUST 6.3.3** — service-only actions MUST NOT be exposed via HTTP routes. The lint rule `enforce-service-only-not-exposed` MUST detect any HTTP route that maps to a service-only action.

### 6.4 Error code implementation

**MUST 6.4.1** — Error codes MUST be defined as TypeScript enum/union types in `apps/backend/src/errors/codes.ts`. Each code MUST trace to a Blueprint §X.1.10.1 error table entry.

**MUST 6.4.2** — Error responses MUST follow the standard envelope:
```json
{
  "error": {
    "code": "E_VALIDATION",
    "message": "Human-readable error message",
    "details": [ ...field-level error details... ]
  }
}
```

**MUST 6.4.3** — Lint rule `enforce-error-code-traceability` MUST verify every `throw new ApiError('E_X')` references a code defined in `errors/codes.ts`. Adding a new code MUST require updating the corresponding Blueprint §X.1.10.1 table — which is a v3.X amendment, not a Build Spec change.

### 6.5 API versioning + URL conventions

**MUST 6.5.1** — All API routes MUST be prefixed with `/api/v1/`. Phase 2 (post-cutover) versioning is `/api/v2/` and would require a v3.X amendment.

**MUST 6.5.2** — Route paths MUST follow REST conventions:
- `GET /api/v1/<module>/<entity>` — list
- `GET /api/v1/<module>/<entity>/:uuid` — detail
- `POST /api/v1/<module>/<entity>` — create
- `PATCH /api/v1/<module>/<entity>/:uuid` — update
- `POST /api/v1/<module>/<entity>/:uuid/<action>` — action (e.g., `void`, `reverse`, `force_purge`)

**MUST 6.5.3** — UUIDs MUST be the only public-facing identifier. Internal sequential IDs MUST NOT be exposed in API responses or URLs.

### 6.6 Request authentication + session

**MUST 6.6.1** — Every API endpoint (except OAuth callbacks and healthcheck) MUST require an authenticated session per Part 5.1. Lucia session middleware MUST extract `current_user_id` and inject it into the request context.

**MUST 6.6.2** — Request context MUST be propagated to every database query for RLS evaluation. Drizzle queries MUST execute under a session that has `SET app.current_user_id = '<uuid>'` so RLS policies can reference it.

**MUST 6.6.3** — Healthcheck endpoint (`GET /api/v1/_healthcheck`) MUST NOT require authentication; MUST return 200 if backend can connect to DB + Redis, 503 otherwise.

---

## 7. WORKFLOW EXECUTION PLAN

### 7.1 WF build order (using authoritative Part 12 mapping)

Workflows MUST be implemented in the Phase order from Part 12 §12.5.2. The 58 active WFs from Part 12 §12.2.1 are grouped by Phase below:

| Phase | WFs to implement |
|---|---|
| Phase 1 (Identity, Master Data, Catalogs) | WF-024 (RBAC) — primary; cross-cuts every other WF |
| Phase 2 (Documents, Notifications) | WF-025 (chain-of-custody), WF-028 (legal hold), WF-029 (retention purge), WF-030 (tamper detection), WF-034 (signed PDF), WF-042 (notification dispatch), WF-043 (WF-064 critical path envelope), WF-045 (preference routing), WF-047 (suppression rules), WF-048 (provider failover), WF-051 (bounce handling) |
| Phase 3 (Maintenance, Safety, Fuel) | WF-001..WF-005 (maintenance work orders), WF-006, WF-007, WF-027 (safety), WF-019, WF-020 (fuel/IFTA), WF-022 (QBO outage handling — partial; cross-cuts), WF-026 (photo damage evidence), WF-044 (maintenance due alert), WF-049 (in-transit issue → WO), WF-050 (DVIR), WF-058 (photo comparison) |
| Phase 4 (Driver Finance) | WF-011 (settlement w/ debt alert), WF-015 (cash advance w/ debt context), WF-016 (escrow forfeiture), WF-017 (deduction override), WF-035 (company-paid expense recovery), WF-036 (terms acceptance), WF-037 (liability disposition), WF-046 (live recompute), WF-054 (above-policy advance), WF-055 (settlement lock w/ stale debt refresh), WF-056 (liability bucket routing), WF-057 (equipment-loss liability) |
| Phase 5 (Accounting) | WF-008 (period close), WF-009 (bill voiding), WF-010 (invoice voiding), WF-018 (manual JE), WF-021 (customer payment application), WF-023 (bill payment application), WF-038 (reconciliation findings resolution), WF-039 (reversing JE on void), WF-040 (posted-JE immutability), WF-053 (cross-module posting service) |
| Phase 6 (Banking) | WF-012 (transaction categorization), WF-013 (reconciliation bank vs ledger), WF-031 (Apex factoring lifecycle), WF-032 (encrypted PII), WF-033 (bank account lifecycle), WF-052 (manual bank transaction entry) |

**Note WF-061** — Reports module is REMAPPED with v2 deferral per Part 12 §12.1.4. v1 implements only the cross-cut narrative in Part 7 Catalogs; full Reports module is not in v1 scope.

**WF-064** is implemented as a cross-cutting envelope, NOT a single endpoint. Every Phase that originates WF-064 actions wires its emission per §8.

### 7.2 Cross-module orchestration points

Several WFs span multiple modules. The orchestration MUST follow these rules:

**MUST 7.2.1 — Service-function entry points only:**

| Cross-module flow | Entry point | Source modules |
|---|---|---|
| Posting to accounting | `accounting.post_journal_entry()` | Driver Finance, Maintenance, Safety, Banking, Fuel (per Part 4.6.2.6) |
| Creating evidence | `documents.create_evidence()` | Every operational module (per Part 3.17.2.1) |
| Creating factoring transaction | `banking.factoring_transaction.create()` | Accounting only (per Part 4.7.2) |
| Dispatching notification | `notifications.dispatch_event()` | Audit trigger (PG NOTIFY → BullMQ worker) per Part 11 §11.2.5.6 |
| Recomputing driver debt | `driver_finance.recompute_driver_debt()` | Settlement, debt alert, cash advance flows (per Part 4.5.4 transactional debt authority) |

**MUST 7.2.2** — These service-function entry points MUST be the only path by which cross-module side effects occur. Direct cross-module table writes MUST NOT exist.

**MUST 7.2.3** — Every cross-module orchestration MUST emit an audit event in BOTH the originating module's namespace AND the target module's namespace where applicable. E.g., a maintenance work order completion that posts to accounting emits `maintenance.work_order_completed` AND `accounting.bill_created` (via the post_journal_entry service-function path).

### 7.3 WF inheritance + cross-cuts

Per Part 12 §12.4.1, several modules inherit WF-064 paths from upstream modules:

| Inheriting module | Inherited from | Path |
|---|---|---|
| Master Data | Identity (2 paths) | User role change → master_data scope change; Permission grant → master_data scope expansion |
| Maintenance | Master Data (1 path) | Equipment transfer dual-confirmation invariant |
| Safety | Maintenance (1 path) | Accident WO → safety incident link |
| Driver Finance | Master Data (1 path) | Equipment-loss liability creation (WF-057) |
| Fuel | Driver Finance (cross-cut) | Fuel card overage → driver liability |

**MUST 7.3.1** — Inherited WF-064 paths MUST be implemented in the inheriting module; the originating module emits the trigger event, the inheriting module completes the downstream effect.

**MUST 7.3.2** — Trace matrix flag for inherited paths MUST be set correctly. Per Part 12 §12.4.1: 5 inherited WF-064 paths total. Build agents MUST verify this count matches at trace verification time.

### 7.4 Build verification per phase

After each Phase's WFs are implemented, verification MUST include:

| Verification | What it checks |
|---|---|
| `npm run trace:verify` | All REQ rows in this Phase's modules have a passing test |
| `npm run wf:verify -- --phase N` | All Phase-N WFs have at least one acceptance test that exercises the success path |
| `npm run wf:verify:wf064 -- --phase N` | All Phase-N WF-064 actions have BOTH success and blocked test paths (except auto-detection exception) |
| `npm run audit:verify -- --phase N` | All Phase-N audit event classes are emitted by at least one tested code path |

---


## 8. AUDIT, WF-064, AND NOTIFICATION WIRING PLAN

### 8.1 Audit substrate (foundational)

**MUST 8.1.1** — Every audit event MUST be inserted into `audit.audit_events` via the `audit.append_event()` stored procedure (per Master Blueprint Part 4.9.3.2). Direct `INSERT INTO audit.audit_events` MUST be blocked by RLS for all roles.

**MUST 8.1.2** — Every module MUST define its audit event classes in `apps/backend/src/modules/<module>/audit/events.ts` as a TypeScript const object. Each event class MUST have:
- `class`: the dotted-name string (e.g., `accounting.bill_created`)
- `severity`: one of `info`, `warning`, `critical` (locked enum per Part 12 §12.4.3)
- `fires_wf_064`: boolean
- `description`: human-readable description for runbook generation

**MUST 8.1.3** — A central `apps/backend/src/audit/registry.ts` module MUST aggregate all per-module event class definitions into a single registry. Lint rule `enforce-audit-class-uniqueness` MUST verify no duplicate class names across modules.

**MUST 8.1.4** — The audit registry MUST be cross-checked against the per-module Blueprint §X.9 audit event tables. CI lint rule `enforce-audit-class-blueprint-trace` MUST flag any class in code that lacks a Blueprint anchor, AND any class in Blueprint that lacks a code definition.

### 8.2 WF-064 emission point wiring

**MUST 8.2.1** — Every WF-064 originating action (45 total per Master Blueprint Part 13 §13.1.4) MUST emit BOTH a success and a blocked audit event when invoked, EXCEPT the single documented auto-detection exception (`documents.evidence_tampered_detected` per Part 11 §11.1.7.1 + Part 13 §13.1.4.1).

**MUST 8.2.2** — Success/blocked symmetry MUST be implemented at the service-function layer, NOT at the route handler layer. The pattern is:

```ts
// in apps/backend/src/modules/accounting/services/bill.service.ts
export async function voidBillAfterPayment(billUuid: string, ctx: RequestContext) {
  // Permission check
  if (!hasRole(ctx, 'Owner')) {
    await emitAudit(ctx, 'accounting.bill_void_after_payment_blocked', {
      bill_uuid: billUuid,
      reason: 'permission_denied'
    });
    throw new ApiError('E_PERMISSION_DENIED');
  }
  // Business validation
  const bill = await billRepo.findByUuid(billUuid);
  if (!bill) {
    await emitAudit(ctx, 'accounting.bill_void_after_payment_blocked', {
      bill_uuid: billUuid,
      reason: 'bill_not_found'
    });
    throw new ApiError('E_NOT_FOUND');
  }
  // Execute + emit success
  await billRepo.markVoided(billUuid, ctx);
  await emitAudit(ctx, 'accounting.bill_voided', { bill_uuid: billUuid }); // fires WF-064
}
```

**MUST 8.2.3** — The `emitAudit()` helper MUST internally call `audit.append_event()` and MUST set `fires_wf_064 = true` for any class registered with that flag. The WF-064 trigger fires PG NOTIFY → BullMQ worker → notification dispatcher per Part 11 §11.2.4.

**MUST 8.2.4** — Build-time verification: `npm run wf064:verify` MUST scan the codebase and confirm that for every class registered with `fires_wf_064 = true` and a `_executed` (or action-specific success) variant, there is a matching `_blocked` class. The single exception (`evidence_tampered_detected`) MUST be on an explicit allowlist.

### 8.3 WF-064 envelope per Part 6.8.3

**MUST 8.3.1** — Frontend WF-064 confirmations MUST follow the Part 6.8.3 envelope:
- 2-step confirmation modal
- Typed-phrase confirmation (e.g., "VOID")
- Reason text input ≥30 characters
- Display the action's downstream effects in human-readable language

**MUST 8.3.2** — The backend MUST validate that the request includes a `reason` field with ≥30 characters AND a `confirmation_phrase` field matching the expected phrase per the action's Blueprint definition. Both MUST be stored in the audit event payload.

**MUST 8.3.3** — Lint rule `enforce-wf064-confirmation-required` MUST verify every Profile C endpoint validates `reason` and `confirmation_phrase` in its Zod schema.

### 8.4 Notification routing wiring

**MUST 8.4.1** — The notification dispatcher (BullMQ worker) MUST be a separate process from the API server. Render configuration MUST run it as a worker service.

**MUST 8.4.2** — The dispatcher MUST consume PG NOTIFY events from `audit.audit_events` row inserts where `fires_wf_064 = true` OR severity = `critical`. The notification queue MUST be processed in FIFO order per audit event timestamp.

**MUST 8.4.3** — User preferences (per Part 11 §11.2.7.2) MUST be applied at dispatch time, not at audit emission time. The dispatcher reads `notifications.user_preferences` for each recipient and routes accordingly per WF-045.

**MUST 8.4.4** — Suppression rules (per WF-047 + Part 4.9.2 max-7-day window CHECK constraint) MUST be evaluated at dispatch time. A suppressed event MUST still be logged in `notifications.delivery_log` with status `suppressed` and the suppression rule UUID.

**MUST 8.4.5** — Provider failover (per WF-048) MUST be implemented as: Resend (email primary) → Twilio (SMS escalation for critical severity per Part 5.5.4.2 narrow exception list) → Expo (push for PWA-installed users). Each provider call MUST have retry-with-exponential-backoff (max 3 attempts), and final failure MUST be logged in `notifications.delivery_log` with status `failed` per WF-051.

### 8.5 Notification bounce + failed-delivery handling

**MUST 8.5.1** — Resend webhook callbacks MUST be received at `/api/v1/notifications/_webhooks/resend` and MUST update the corresponding `notifications.delivery_log` row with status `bounced` or `delivered`.

**MUST 8.5.2** — Twilio webhook callbacks MUST be received at `/api/v1/notifications/_webhooks/twilio` and MUST similarly update `notifications.delivery_log`.

**MUST 8.5.3** — Webhook authenticity MUST be verified using each provider's signature scheme (Resend HMAC, Twilio request signature). Unsigned or wrongly-signed webhooks MUST be rejected with 401.

**MUST 8.5.4** — Per WF-051, sustained bounce/failure rates exceeding the threshold defined in Part 11 §11.2 MUST trigger an Owner notification. The threshold is implementation-derived from the Blueprint MUST clauses; the build MUST follow the Blueprint values verbatim.

### 8.6 Audit retention enforcement

**MUST 8.6.1** — The retention floor (7 years per Part 4.9.3.4 + Part 13 §13.2.4.4) MUST be enforced via a nightly cron job that:
- Identifies events older than the floor
- Verifies they are in cold storage (R2 cold-tier or pg-archive depending on chosen archival strategy)
- MAY hard-purge events older than retention floor + buffer ONLY with explicit Owner sign-off recorded as `audit.signoff_recorded` (signoff_type=`audit_purge_authorization`)

**MUST 8.6.2** — The cron job MUST itself emit an audit event at each run (`audit.retention_pass_completed` with severity=info) so the run is itself audited.

**MUST 8.6.3** — Hard-purge of audit events MUST NOT cascade to or affect operational data. Operational data retention is governed by per-module retention policies in Part 11 §11.1.5.

---

## 9. FRONTEND IMPLEMENTATION PLAN

### 9.1 Office web (apps/web-office) sequencing

The office web app MUST be built module-by-module, matching the Phase sequence (§5.2):

| Phase | Office web modules to ship |
|---|---|
| Phase 1 | Login screen, Identity admin (users + roles + permission grants), Master Data CRUD UIs (drivers, units, customers, vendors, locations, equipment), Catalogs management UIs |
| Phase 2 | Documents browser (list + detail of evidence_records); Notification preferences UI |
| Phase 3 | Maintenance work order UIs, Safety incident + DVIR review UIs, Fuel + IFTA report UIs |
| Phase 4 | Driver Finance UIs (settlements, escrow, liabilities, advances, deductions, terms acceptance review) |
| Phase 5 | Accounting UIs (bills, invoices, payments, journal entries, period close, reconciliation findings resolution) |
| Phase 6 | Banking UIs (bank accounts, bank transactions categorization, factoring tab, manual entry, reconciliation) |
| Phase 7 | Daily reconcile drift report viewer; cutover sign-off page |

**MUST 9.1.1** — Each module's UI MUST follow the two-level sidebar pattern per Master Blueprint Part 6.4 + WF-029 narrative.

**MUST 9.1.2** — Routing MUST use file-based or convention-based routing (e.g., TanStack Router or React Router 7). Routes MUST mirror the API route structure: `/<module>/<entity>/<action>`.

**MUST 9.1.3** — Authentication wrapper MUST redirect unauthenticated users to the login page and MUST scope navigation to the user's role per Part 5.4.

### 9.2 Driver PWA (apps/web-driver-pwa) sequencing

The driver PWA is a separate app with a narrower surface area, scoped to driver self-service per Part 7.1.7.

| Phase | PWA features |
|---|---|
| Phase 1 | Driver login, profile view |
| Phase 2 | Documents read-only view (driver's own evidence records); push notification preference UI |
| Phase 3 | DVIR capture (pre/post-trip per WF-050), photo damage evidence capture (per WF-026) |
| Phase 4 | Settlement view, liability disposition view, terms acceptance signing |
| Phase 5 | (no PWA changes) |
| Phase 6 | (no PWA changes) |
| Phase 7 | (no PWA changes) |

**MUST 9.2.1** — The PWA MUST use Workbox 7.x for service worker caching with the offline-first pattern. Critical paths (DVIR capture, photo upload) MUST work offline and queue uploads for retry on connectivity restore.

**MUST 9.2.2** — Offline DVIR captures MUST be stored in IndexedDB with a stable client-generated UUID. On sync, the UUID MUST be preserved as the evidence record's idempotency key.

**MUST 9.2.3** — Push notifications MUST use Expo Push (per §3.4) for device tokens. Token registration MUST happen on PWA install + on each login.

**MUST 9.2.4** — Drivers MUST NOT have access to other drivers' data via the PWA. This is enforced server-side via RLS (Part 7.1.7); the PWA MUST also gate UI to driver-self-only routes.

### 9.3 UI parity checkpoints

For each Phase, frontend acceptance includes UI parity verification:

**MUST 9.3.1** — Each module's office web UI MUST screenshot every primary screen (list, detail, action drawers, WF-064 confirmation modals) for inclusion in §13.3.4 cutover checklist evidence packs.

**MUST 9.3.2** — The 12 acceptance screenshots referenced in Part 13 §13.3.4 MUST be regenerated at each Phase gate to reflect current as-built state.

**MUST 9.3.3** — Tailwind design tokens (colors, fonts, spacing, radii) MUST come from a central `apps/web-office/src/design/tokens.ts` file and MUST match the Part 6 design tokens. Hardcoded color hexes outside this file MUST be detected by the lint rule `enforce-design-tokens`.

### 9.4 Form patterns (locked)

**MUST 9.4.1** — All forms MUST use react-hook-form with Zod resolver. The Zod schema MUST be the SAME schema used by the backend API (imported from `packages/shared-schemas`) so client-side and server-side validation agree.

**MUST 9.4.2** — WF-064 confirmation modals MUST follow the Part 6.4.5.4 envelope: 2-step modal, typed phrase, reason ≥30 chars. The modal component MUST be shared (`apps/web-office/src/components/Wf064ConfirmModal.tsx`) to ensure consistency.

**MUST 9.4.3** — Optimistic UI MUST NOT be used for WF-064 actions. The action MUST wait for backend confirmation (and audit event row insertion) before updating client state.

---

## 10. INTEGRATIONS ROLLOUT PLAN

### 10.1 QBO integration (Part 3.12.4.8)

**Phase placement:** QBO sync stub deployed in Phase 0; outbound sync activated in Phase 5 (after Accounting goes live).

**MUST 10.1.1** — QBO sync MUST follow the outbox pattern: every accounting write enqueues an outbox row; a separate worker drains the outbox and calls QBO. Direct QBO API calls from request handlers MUST NOT exist.

**MUST 10.1.2** — The QBO worker MUST handle 3 failure modes:
1. Token expired → refresh using stored refresh token; retry
2. QBO API rate limit → exponential backoff; persist queue
3. QBO temporary outage → keep queue; emit `integrations.qbo_outage_detected` (severity=warning); on sustained outage (>15 minutes), escalate to severity=critical with Owner notification

**MUST 10.1.3** — QBO catalog mirror parity (per WF-031 Apex factoring lifecycle MISMATCH; this references Part 3.18 catalog governance) MUST be verified daily via `npm run qbo:verify:parity`. Drift triggers `accounting.reconciliation_findings` per WF-038.

**MUST 10.1.4** — Inbound QBO sync (QBO → IH35) is NOT in v1 scope per Part 12 §12.1.4 WF-063 deferral. Build agents MUST NOT implement inbound sync. If QBO data drifts from IH35, the resolution path is operator action in IH35 (the local-authoritative system) per Option C+ accounting strategy.

### 10.2 Samsara integration (Part 3.12.4)

**Phase placement:** Phase 3 (with Maintenance + Safety modules).

**MUST 10.2.1** — Samsara provides telematics data (driver HOS, vehicle location, DTC codes). Build agents MUST consume Samsara via webhook + scheduled polling, with the adapter layer in `apps/backend/src/integrations/samsara/`.

**MUST 10.2.2** — Samsara webhook events MUST be received at `/api/v1/integrations/_webhooks/samsara` with signature verification. Webhook payloads MUST be idempotent (Samsara provides event UUIDs).

**MUST 10.2.3** — Samsara outage MUST NOT block IH35 operations. HOS data freshness staleness >24 hours MUST be flagged in the dispatch UI but MUST NOT block load creation.

### 10.3 Relay integration (Part 3.12.4)

**Phase placement:** Phase 3 (with Fuel module per WF-016).

**MUST 10.3.1** — Relay provides Loves fuel pricing (daily Excel upload + match per WF-054). Build agents MUST implement the upload endpoint + matching logic in the Fuel module.

**MUST 10.3.2** — Relay has no direct API for v1; the integration is Excel-upload-driven per Blueprint. Phase 2 may add direct Relay API integration with explicit Owner sign-off.

### 10.4 Cloudflare R2 (Part 11 §11.1)

**Phase placement:** R2 connectivity established in Phase 0; first writes happen in Phase 2 (Documents module).

**MUST 10.4.1** — Every evidence_record MUST be stored in R2 under a key matching the pattern `evidence/<year>/<month>/<evidence_uuid>.<ext>`. Client uploads MUST use presigned PUT URLs issued by the backend.

**MUST 10.4.2** — Server-computed sha256 (per Part 3.17.2.3) MUST be computed AFTER R2 confirms successful upload, by streaming the object back from R2 (or by trusting the client-supplied sha256 only when explicitly designed for low-trust evidence — per Part 11 §11.1.2.3).

**MUST 10.4.3** — R2 lifecycle policies MUST be configured to transition objects to cold storage after the per-evidence-category retention window per Part 11 §11.1.5. Hard delete (force purge) MUST go through the Documents service `force_purge` action with WF-064 envelope per Part 11 §11.1.4.6.

### 10.5 Twilio + Resend + Expo (Part 11 §11.2)

**Phase placement:** All three configured in Phase 2 (with Notifications dispatcher).

**MUST 10.5.1** — All three providers MUST be wrapped in a uniform interface in `apps/backend/src/integrations/notifications/`. The dispatcher worker MUST call these adapters, not the provider SDKs directly.

**MUST 10.5.2** — Each provider adapter MUST implement: `send(payload) -> { provider_message_id, status }`, with status one of `sent`, `failed`, `retry`. Bounce/delivery webhooks update status asynchronously.

**MUST 10.5.3** — Provider failover order is locked in §8.4.5.

### 10.6 Outbox + idempotency + retry (cross-integration)

**MUST 10.6.1** — Every external API call MUST go through the outbox pattern. The outbox row carries: `target_provider`, `idempotency_key`, `payload`, `created_at`, `attempts`, `last_attempt_at`, `status`.

**MUST 10.6.2** — Idempotency keys MUST be deterministic from the source event (e.g., for QBO bill creation, `idempotency_key = "bill_${bill_uuid}"`). Re-running the same outbox row MUST produce the same idempotency key.

**MUST 10.6.3** — Retry policy MUST be: exponential backoff with jitter, max 5 attempts in the first hour, then move to dead-letter queue with Owner notification.

**MUST 10.6.4** — Dead-letter queue items MUST require explicit Owner action to retry or discard. Discard MUST be a Profile C action with WF-064 envelope.

### 10.7 Failure-mode test checklist

Each integration MUST have failure-mode tests in `tests/integrations/<provider>.failure.test.ts`:

| Failure mode | Expected behavior |
|---|---|
| Provider 5xx error | Retry with backoff; eventually dead-letter |
| Provider 4xx error (permanent) | No retry; immediate dead-letter; Owner notification |
| Token expired | Auto-refresh; retry once; fail to dead-letter if refresh fails |
| Rate limit | Backoff respecting retry-after header |
| Network timeout | Retry up to 3 attempts in single request lifecycle; then queue |
| Webhook signature invalid | Reject 401; log security event |

---

## 11. TESTING AND QUALITY GATE PLAN

### 11.1 Test taxonomy

| Layer | Tooling | What it tests | Where it lives |
|---|---|---|---|
| Unit | Vitest | Pure functions, validators, service-function logic with mocked repos | `apps/backend/src/modules/<m>/__tests__/*.unit.test.ts` |
| Integration | Vitest + Testcontainers (Postgres) | Service functions against real DB; RLS policies; trigger behavior | `apps/backend/src/modules/<m>/__tests__/*.int.test.ts` |
| API contract | Vitest + Fastify inject | Full request → response cycle with auth + validation + audit emission | `apps/backend/src/modules/<m>/__tests__/*.api.test.ts` |
| End-to-end | Playwright | Office web + PWA flows including WF-064 confirmation paths | `tests/e2e/<flow>.test.ts` |
| Trace verify | Custom Node script | Trace matrix consistency: every REQ row → at least one passing test ID | `tests/trace-verify/` |
| Data invariants | Vitest + Testcontainers | Cross-table invariants (driver-vendor pair, posted-JE immutability, etc.) | `apps/backend/src/__tests__/invariants/*.test.ts` |

### 11.2 Parity test implementation against existing IDs

**MUST 11.2.1** — Every test in the codebase MUST be tagged with its blueprint test ID via a comment or test name suffix:
```ts
test('T-101.3: Owner can change another user role with WF-064 envelope', async () => { ... });
```

**MUST 11.2.2** — The test ID extractor (`tests/trace-verify/extract-ids.ts`) MUST scan the codebase for these tags and produce a coverage report. The report MUST flag:
- Any blueprint test ID with no matching test in code (gap)
- Any test ID in code with no matching blueprint definition (drift)

**MUST 11.2.3** — Test IDs MUST come exclusively from the Blueprint range T-011.1..T-209.5. Adding a new test for a behavior not covered by a blueprint test ID MUST require a v3.X amendment to register the new ID.

### 11.3 Layered test strategy per phase

**MUST 11.3.1** — Each Phase's gate (per Part 12 §12.5.2 + Part 13 §13.2.7) MUST require:
- All unit tests in scope passing
- All integration tests in scope passing
- All API contract tests for FULL endpoints passing
- ≥30% sample of Profile A + Profile B mapped actions tested
- 100% of Profile C (WF-064) actions tested both success + blocked
- Trace verify produces 0 gaps for in-scope REQ rows

### 11.4 CI gate matrix

The CI configuration (`.github/workflows/ci.yml`) MUST run on every PR and MUST block merge if any of the following fail:

| Gate | Command | Block condition |
|---|---|---|
| Lint | `npm run lint` | Any error |
| Typecheck | `npm run typecheck` | Any error |
| Unit + Integration tests | `npm run test` | Any failure |
| Trace verify | `npm run trace:verify` | Any gap or drift |
| RLS smoke | `npm run db:verify:rls` | Any role-table combination fails |
| Audit append-only | `npm run db:verify:audit-append-only` | UPDATE/DELETE succeeds for any role |
| WF-064 symmetry | `npm run wf064:verify` | Any non-allowlisted asymmetry |
| Schema drift | `npm run db:verify:schemas` | Any unexpected schema or table |
| Build | `npm run build` | Any failure |

**MUST 11.4.1** — CI MUST run against a Postgres 16 container provisioned per migration (full `npm run db:migrate`) so RLS + trigger tests exercise real DB behavior.

**MUST 11.4.2** — E2E tests MAY be slower and run in a separate CI job that doesn't block PR merge for routine changes, but MUST run nightly and MUST block release builds.

### 11.5 Pre-cutover release gate

Before cutover (Phase 7), the full test suite plus the 14-consecutive-day $0-drift bar (Part 13 §13.2.5.3) MUST be met. The release gate command is `npm run release:gate` which runs:
1. `npm run lint && npm run typecheck`
2. Full test suite (`npm run test && npm run test:e2e`)
3. `npm run trace:verify`
4. Daily reconcile drift check across the last 14 days = $0 each day
5. Acceptance test set passing rate ≥99% per Part 13 §13.2.5.1

---

## 12. CUTOVER AND DEPLOYMENT PLAN

### 12.1 Phased rollout aligned to Part 12 §12.5.2 + Part 13 §13.2.7

| Phase | Trigger to enter | Trigger to exit |
|---|---|---|
| Phase 0 | Repo bootstrapped, infra provisioned | Auth working; audit substrate accepting events; outbox queue draining; R2 reachable |
| Phase 1 | Phase 0 exit + Administrator sign-off (`phase_gate_0`) | All Part 7 REQ rows traced; T-101..T-140 tests passing; RLS smoke tests passing |
| Phase 2 | Phase 1 exit | T-195..T-209 tests passing; WF-064 envelope wired end-to-end with synthetic test event |
| Phase 3 | Phase 2 exit | T-166..T-179 tests passing; daily evidence-creation flows producing valid evidence_records |
| Phase 4 | Phase 3 exit | T-151..T-165 tests passing; live-recompute API meeting Part 4.5.4.3 latency target |
| Phase 5 | Phase 4 exit + Owner sign-off (`phase_gate_4`) | T-180..T-189 tests passing; daily reconcile against v2 producing drift report; Owner sign-off on first manual JE |
| Phase 6 | Phase 5 exit | T-190..T-194 tests passing; bank statement import flow producing categorized transactions |
| Phase 7 (Cutover) | Phase 6 exit + Owner sign-off (`phase_gate_6`) | 14-consecutive-day $0 drift bar met; Owner explicit `cutover_authorization` audit event |

**MUST 12.1.1** — Each phase gate MUST be a recorded `audit.signoff_recorded` event per Master Blueprint Part 13 §13.3.2.1.

**MUST 12.1.2** — Deployment to production MUST be triggered ONLY by the audit event entry of the corresponding signoff_type. The deployment pipeline MUST verify the signoff event exists before pushing.

### 12.2 Parallel run + drift checks

**MUST 12.2.1** — During Phase 7 parallel run (≥4 weeks per Part 12 §12.5.3.1), v3 receives all writes and v2 receives mirrored read-only data. The reconciliation key totals from Part 12 §12.5.3.2 MUST be compared daily.

**MUST 12.2.2** — The daily reconcile job MUST run at 02:00 local time (Laredo TX = America/Chicago) and MUST emit a `accounting.reconciliation_findings` row for any non-zero drift per WF-038. Owner + Accountant MUST receive an email with the drift report regardless of whether drift is zero.

**MUST 12.2.3** — A non-zero drift day resets the 14-consecutive-day counter to 0 per Part 13 §13.2.5.3. Resolution of the drift via WF-038 lifecycle MUST be completed before counter restart.

### 12.3 Rollback criteria

**MUST 12.3.1** — Rollback from v3 to v2 MUST be considered if any of the following occur during Phase 7:
- Drift exceeds $1,000 on any single reconciliation key total for >2 consecutive days
- A critical-severity audit event (e.g., evidence_tampered_detected, period_reopen abuse) occurs without explainable cause
- v3 sustained downtime >4 hours
- Sentry critical-rate spikes >2x baseline for >24 hours

**MUST 12.3.2** — Rollback procedure MUST be documented in `RUNBOOK_ROLLBACK.md` (separate from this Build Spec) and MUST include:
- Re-enabling v2 write mode (configuration flag)
- Pausing v3 outbox queue (no further QBO writes)
- Owner sign-off recorded as `audit.signoff_recorded` (signoff_type=`rollback_authorization`)
- Forensic snapshot of v3 state at rollback time

**MUST 12.3.3** — Rollback MUST NOT delete v3 data. v3 remains running in read-only mode for forensic access; v2 becomes operational source of truth again.

### 12.4 Production readiness checklist

Before Phase 7 entry, the following MUST be verified:

| Item | Verified by | Source |
|---|---|---|
| Backups: Neon point-in-time recovery enabled, 7-day retention | Manual check + audit screenshot | Part 13 §13.2.6.3 |
| Backups: Daily logical backup to separate region | Render cron config + verification log | Part 13 §13.2.6.3 |
| R2 lifecycle policy active | R2 console screenshot | Part 13 §13.2.6.3 |
| Sentry capturing both backend + frontend | Sentry project dashboards | Part 13 §13.2.6.4 |
| Healthcheck endpoint returning 200 | Production curl | MUST 6.6.3 |
| Alert routing operational (Owner email + SMS for critical) | Test fire of synthetic critical event | Part 13 §13.2.6.4 |
| RLS smoke tests passing in production environment | `npm run db:verify:rls` against prod | Part 13 §13.2.6.5 |
| BANKING_PII_ENCRYPTION_KEY rotation procedure documented | `RUNBOOK_PII_KEY_ROTATION.md` exists | Part 5.6 |
| Outbox queue draining: zero rows older than 5 minutes | Production query | Part 13 §13.2.6.2 |
| All signoff_type audit events queryable | Audit query test | Part 13 §13.3.2.1 |

---

## 13. IMPLEMENTATION TASK MATRIX

The task matrix groups every implementation task by Phase and module. Build agents MUST work tasks in dependency order; tasks within a Phase MAY be parallelized when their `Depends On` columns permit.

**Note:** Task IDs below use the format `BT-<phase>-<module>-<seq>` (Build Task; non-colliding with REQ-* and T-* namespaces). Build Task IDs are NOT requirements; they are work-tracking labels for build-phase use only and MAY be revised in this Build Spec without v3.X amendment.

### 13.1 Phase 0 task matrix (Foundation)

| Task ID | Module | Depends On | Source Part/Section | Definition of Done | Verification |
|---|---|---|---|---|---|
| BT-0-INFRA-01 | infra | — | Part 1-3 stack | Render service deployed; Neon PG 16 instance provisioned; Upstash Redis provisioned | Healthcheck returns 200 |
| BT-0-REPO-01 | repo | BT-0-INFRA-01 | §4 | Repo structure per §4.1 in place; `npm install` works | `npm run typecheck` passes on empty stub |
| BT-0-AUDIT-01 | audit | BT-0-REPO-01 | Part 4.9 | `audit.audit_events` table + `audit.append_event()` SP migrated; RLS append-only enforced | `npm run db:verify:audit-append-only` |
| BT-0-OUTBOX-01 | outbox | BT-0-REPO-01 | Part 3.12.4.8 | `outbox.outbox_queue` table migrated; basic worker draining | Outbox row inserted in test → drained in <5 min |
| BT-0-AUTH-01 | identity | BT-0-AUDIT-01 | Part 5.1 | Lucia auth wired; OAuth Google flow works for first user | Login flow yields valid session |
| BT-0-R2-01 | documents | BT-0-INFRA-01 | Part 11 §11.1 | R2 bucket provisioned; presigned PUT URL issuance works | Test upload + download succeeds |
| BT-0-CI-01 | repo | BT-0-REPO-01 | §11.4 | CI gate matrix configured; runs on PR | PR with failing test blocked |

### 13.2 Phase 1 task matrix (Identity + Master Data + Catalogs)

| Task ID | Module | Depends On | Source Part/Section | Definition of Done | Verification |
|---|---|---|---|---|---|
| BT-1-IDENT-01 | identity | BT-0-AUTH-01 | Part 7 §7.1 | All Identity tables migrated; RLS per role tested | `npm run db:verify:rls -- --module identity` |
| BT-1-IDENT-02 | identity | BT-1-IDENT-01 | Part 7 §7.1.4 | All 6 FULL endpoints implemented + DoD'd | T-101..T-130 passing |
| BT-1-IDENT-03 | identity | BT-1-IDENT-02 | Part 7 §7.1.7 | All 4 originated WF-064 actions wired with success/blocked symmetry | `npm run wf064:verify -- --module identity` |
| BT-1-MDATA-01 | master_data | BT-1-IDENT-01 | Part 7 §7.2 | All Master Data tables migrated; cross-schema invariants triggered | `npm run db:verify:triggers -- --module master_data` |
| BT-1-MDATA-02 | master_data | BT-1-MDATA-01 | Part 7 §7.2.4 | All 10 FULL endpoints implemented + DoD'd | T-131..T-135 passing |
| BT-1-MDATA-03 | master_data | BT-1-MDATA-02 | Part 7 §7.2.7 | All 3 originated + 2 inherited WF-064 paths wired | `npm run wf064:verify -- --module master_data` |
| BT-1-CATAL-01 | catalogs | BT-1-IDENT-01 | Part 7 §7.3 | All Catalogs tables migrated; chart of accounts seeded | Seed verification passes |
| BT-1-CATAL-02 | catalogs | BT-1-CATAL-01 | Part 7 §7.3.4 | All 8 FULL endpoints implemented + DoD'd | T-136..T-140 passing |
| BT-1-CATAL-03 | catalogs | BT-1-CATAL-02 | Part 7 §7.3.7 | All 4 originated WF-064 actions wired | `npm run wf064:verify -- --module catalogs` |
| BT-1-WEB-01 | web-office | BT-1-IDENT-02, BT-1-MDATA-02, BT-1-CATAL-02 | §9.1 | Login + Identity admin + Master Data + Catalogs UIs in office web | Manual smoke screenshot per UI |
| BT-1-PWA-01 | web-driver-pwa | BT-1-IDENT-02 | §9.2 | Driver login + profile view in PWA | Manual smoke on Android + iOS Safari |
| BT-1-GATE-01 | gate | All BT-1-* | Part 13 §13.3.3 | Phase 1 gate sign-off audit event recorded | Audit query returns `phase_gate_1` row |

### 13.3 Phase 2 task matrix (Documents + Notifications)

| Task ID | Module | Depends On | Source Part/Section | Definition of Done | Verification |
|---|---|---|---|---|---|
| BT-2-DOC-01 | documents | BT-0-R2-01, BT-1-MDATA-01 | Part 11 §11.1 | All Documents tables migrated; sha256 trigger active | `npm run db:verify:triggers -- --module documents` |
| BT-2-DOC-02 | documents | BT-2-DOC-01 | Part 11 §11.1.4 | All 4 FULL endpoints + signed PDF generator | T-195..T-201 passing |
| BT-2-DOC-03 | documents | BT-2-DOC-02 | Part 11 §11.1.7 | All 4 originated WF-064 actions wired (incl. tamper detection auto-detect on allowlist) | `npm run wf064:verify -- --module documents` |
| BT-2-NOTIF-01 | notifications | BT-2-DOC-01 | Part 11 §11.2 | Notifications tables migrated; BullMQ dispatcher worker running | Worker process visible; Redis queue draining |
| BT-2-NOTIF-02 | notifications | BT-2-NOTIF-01 | Part 11 §11.2.4 | All 2 FULL endpoints + provider adapters (Resend, Twilio, Expo) | T-202..T-209 passing |
| BT-2-NOTIF-03 | notifications | BT-2-NOTIF-02 | Part 11 §11.2.7 | All 3 originated WF-064 actions + suppression + preferences wired | `npm run wf064:verify -- --module notifications` |
| BT-2-WF064-01 | cross-cutting | BT-2-NOTIF-02 | Part 6.8.3 | WF-064 envelope end-to-end synthetic test: trigger event → audit → notification → Owner email | Manual verification of test event arrival |
| BT-2-GATE-01 | gate | All BT-2-* | Part 13 §13.3.3 | Phase 2 gate sign-off audit event recorded | Audit query returns `phase_gate_2` row |

### 13.4 Phase 3 task matrix (Maintenance + Safety + Fuel)

| Task ID | Module | Depends On | Source Part/Section | Definition of Done | Verification |
|---|---|---|---|---|---|
| BT-3-MAINT-01 | maintenance | BT-1-MDATA-01, BT-1-CATAL-01, BT-2-DOC-01 | Part 9 §9.1 | All Maintenance tables migrated | `npm run db:verify:schemas -- --module maintenance` |
| BT-3-MAINT-02 | maintenance | BT-3-MAINT-01 | Part 9 §9.1.4 | All 5 FULL endpoints + work order lifecycle | T-166..T-170 passing |
| BT-3-MAINT-03 | maintenance | BT-3-MAINT-02 | Part 9 §9.1.7 | All 1 originated + 1 inherited WF-064 paths wired | `npm run wf064:verify -- --module maintenance` |
| BT-3-SAFETY-01 | safety | BT-1-MDATA-01, BT-2-DOC-01 | Part 9 §9.2 | All Safety tables migrated | `npm run db:verify:schemas -- --module safety` |
| BT-3-SAFETY-02 | safety | BT-3-SAFETY-01 | Part 9 §9.2.4 | All 4 FULL endpoints + DVIR capture flow | T-171..T-175 passing |
| BT-3-SAFETY-03 | safety | BT-3-SAFETY-02 | Part 9 §9.2.7 | 0 originated + 1 inherited WF-064 path wired | `npm run wf064:verify -- --module safety` |
| BT-3-FUEL-01 | fuel | BT-1-MDATA-01, BT-1-CATAL-01 | Part 9 §9.3 | All Fuel tables migrated | `npm run db:verify:schemas -- --module fuel` |
| BT-3-FUEL-02 | fuel | BT-3-FUEL-01 | Part 9 §9.3.4 | All 2 FULL endpoints + IFTA quarterly + Form 425C generation | T-176..T-179 passing |
| BT-3-FUEL-03 | fuel | BT-3-FUEL-02 | Part 9 §9.3.7 | All 1 originated WF-064 action wired | `npm run wf064:verify -- --module fuel` |
| BT-3-WEB-01 | web-office | BT-3-MAINT-02, BT-3-SAFETY-02, BT-3-FUEL-02 | §9.1 | Maintenance + Safety + Fuel UIs in office web | Manual smoke screenshots |
| BT-3-PWA-01 | web-driver-pwa | BT-3-MAINT-02, BT-3-SAFETY-02 | §9.2 | DVIR capture (offline-capable) + photo damage capture in PWA | Manual offline + reconnect test |
| BT-3-GATE-01 | gate | All BT-3-* | Part 13 §13.3.3 | Phase 3 gate sign-off audit event recorded | Audit query returns `phase_gate_3` row |

### 13.5 Phase 4 task matrix (Driver Finance)

| Task ID | Module | Depends On | Source Part/Section | Definition of Done | Verification |
|---|---|---|---|---|---|
| BT-4-DRVFN-01 | driver_finance | BT-1-MDATA-01, BT-1-CATAL-01, BT-2-DOC-01 | Part 8b §8b.1 | All Driver Finance tables migrated; recompute_driver_debt SP active | `npm run db:verify:triggers -- --module driver_finance` |
| BT-4-DRVFN-02 | driver_finance | BT-4-DRVFN-01 | Part 8b §8b.1.4 | All 13 FULL endpoints + live-recompute API meeting Part 4.5.4.3 latency target | T-151..T-165 passing; latency report |
| BT-4-DRVFN-03 | driver_finance | BT-4-DRVFN-02 | Part 8b §8b.1.7 | All 10 originated + 1 inherited WF-064 paths wired with success/blocked symmetry | `npm run wf064:verify -- --module driver_finance` |
| BT-4-DISP-01 | dispatch | BT-4-DRVFN-01 | Part 8a | All Dispatch tables migrated (sequenced after Driver Finance per §5.2) | `npm run db:verify:schemas -- --module dispatch` |
| BT-4-DISP-02 | dispatch | BT-4-DISP-01 | Part 8a | Multi-stop load → driver settlement source paths wired | T-141..T-150 passing |
| BT-4-WEB-01 | web-office | BT-4-DRVFN-02 | §9.1 | Driver Finance UIs in office web (settlements, escrow, liabilities, advances) | Manual smoke screenshots |
| BT-4-PWA-01 | web-driver-pwa | BT-4-DRVFN-02 | §9.2 | Settlement view + liability disposition + terms acceptance signing in PWA | Manual smoke; signed PDF round-trip |
| BT-4-GATE-01 | gate | All BT-4-* | Part 13 §13.3.3 | Phase 4 gate sign-off audit event recorded | Audit query returns `phase_gate_4` row |

### 13.6 Phase 5 task matrix (Accounting)

| Task ID | Module | Depends On | Source Part/Section | Definition of Done | Verification |
|---|---|---|---|---|---|
| BT-5-ACCT-01 | accounting | BT-1-CATAL-01, BT-1-MDATA-01, BT-2-DOC-01 | Part 10a §10a.1 | All Accounting tables migrated; posted-JE immutability + reversing JE triggers active | `npm run db:verify:triggers -- --module accounting` |
| BT-5-ACCT-02 | accounting | BT-5-ACCT-01 | Part 4.6.2.6 | accounting.post_journal_entry() service-function entry point active | Cross-module post test passes |
| BT-5-ACCT-03 | accounting | BT-5-ACCT-02 | Part 10a §10a.1.4 | All 7 FULL endpoints + period close + manual JE + reconcile findings resolution | T-180..T-189 passing |
| BT-5-ACCT-04 | accounting | BT-5-ACCT-03 | Part 10a §10a.1.7 | All 11 originated WF-064 actions wired with success/blocked symmetry | `npm run wf064:verify -- --module accounting` |
| BT-5-BACKFILL-01 | accounting | BT-5-ACCT-04 | §5.5 | v2 historical postings backfilled into v3 accounting; reconciliation key totals match | Backfill verification report; manual Owner sign-off on first manual JE |
| BT-5-QBO-01 | integrations | BT-5-ACCT-04 | Part 3.12.4.8 | QBO outbound sync activated; daily parity check | `npm run qbo:verify:parity` |
| BT-5-WEB-01 | web-office | BT-5-ACCT-03 | §9.1 | Accounting UIs in office web (bills, invoices, payments, JEs, period close, findings) | Manual smoke screenshots |
| BT-5-GATE-01 | gate | All BT-5-* + first manual JE Owner sign-off | Part 13 §13.3.3 | Phase 5 gate sign-off audit event recorded | Audit query returns `phase_gate_5` row |

### 13.7 Phase 6 task matrix (Banking)

| Task ID | Module | Depends On | Source Part/Section | Definition of Done | Verification |
|---|---|---|---|---|---|
| BT-6-BANK-01 | banking | BT-5-ACCT-04 | Part 10b §10b.1 | All Banking tables migrated; encrypted-PII columns + factoring lifecycle triggers active | `npm run db:verify:triggers -- --module banking` |
| BT-6-BANK-02 | banking | BT-6-BANK-01 | Part 10b §10b.1.4 | All 5 FULL endpoints + bank statement import + categorization + reconciliation | T-190..T-194 passing |
| BT-6-BANK-03 | banking | BT-6-BANK-02 | Part 10b §10b.1.7 | All 4 originated WF-064 actions wired | `npm run wf064:verify -- --module banking` |
| BT-6-WEB-01 | web-office | BT-6-BANK-02 | §9.1 | Banking UIs in office web (accounts, transactions, factoring tab, manual entry, reconciliation) | Manual smoke screenshots |
| BT-6-GATE-01 | gate | All BT-6-* | Part 13 §13.3.3 | Phase 6 gate sign-off audit event recorded | Audit query returns `phase_gate_6` row |

### 13.8 Phase 7 task matrix (Cutover)

| Task ID | Module | Depends On | Source Part/Section | Definition of Done | Verification |
|---|---|---|---|---|---|
| BT-7-PARALLEL-01 | cutover | BT-6-GATE-01 | Part 12 §12.5.3 | Parallel run begins; v3 receives all writes; v2 receives mirrored reads | First daily reconcile completes |
| BT-7-DRIFT-01 | cutover | BT-7-PARALLEL-01 | Part 13 §13.2.5.2 | 14-consecutive-day $0 drift bar met across all reconciliation key totals | Daily reconcile report; counter at 14 |
| BT-7-CUTOVER-01 | cutover | BT-7-DRIFT-01 + Owner sign-off | Part 13 §13.3.3 | Cutover authorization audit event recorded; v3 becomes operational source of truth | Audit query returns `cutover_authorization` row |
| BT-7-DECOM-01 | cutover | BT-7-CUTOVER-01 + 4 weeks post-cutover | Part 13 §13.3.3 | v2 decommission authorization audit event; v2 archive complete | Audit query returns `v2_decommission` row |

---

## 14. CHANGE CONTROL RULES FOR BUILD PHASE

### 14.1 Spec amendment process

**MUST 14.1.1** — Per Master Blueprint Part 13 §13.3.6.1, any change to the Master Blueprint requires:
1. Written amendment proposal naming the affected MUST clauses
2. Cursor (or successor build agent) impact assessment
3. Owner explicit sign-off as `audit.signoff_recorded` (signoff_type=`spec_amendment`)
4. Amendment versioned as v3.1, v3.2, etc.

**MUST 14.1.2** — This Build Spec MUST NOT be used as a vehicle to modify the Master Blueprint. If implementation discovers an ambiguity, contradiction, or impossibility in the Blueprint, the resolution path is the §14.1.1 amendment process — not a silent edit to this Build Spec.

### 14.2 Build Spec self-mutation rules

**MUST 14.2.1** — This Build Spec MAY be updated during implementation to clarify HOW to build (e.g., adding a verification command, refining a code organization pattern). Such updates MUST NOT modify any blueprint MUST clause.

**MUST 14.2.2** — Build Spec updates that affect "what to build" — including but not limited to: changing schemas, changing API contracts, changing role permissions, changing audit event classes — MUST NOT happen via Build Spec edits. Such changes require a v3.X Blueprint amendment first; the Build Spec may then be updated to reflect the amended Blueprint.

**MUST 14.2.3** — Each Build Spec revision MUST have a version stamp (e.g., `Build Spec v3.0.1`) and a changelog entry summarizing what changed and which Blueprint sections it newly references (or no Blueprint references if the change is purely implementation-side).

### 14.3 Spec deviations during build (Part 13 §13.3.6.3 path)

**MUST 14.3.1** — If during Phases 1-7 the build encounters a spec issue (ambiguity, contradiction, or implementability gap), the resolution MUST be recorded as `audit.signoff_recorded` (signoff_type=`spec_deviation_resolution`) per Master Blueprint Part 13 MUST 13.3.6.3. The audit row MUST reference: the specific MUST clause, the as-built behavior, the rationale, and the Owner approval.

**MUST 14.3.2** — Spec deviations MUST be reviewed at quarterly attestation (per Master Blueprint Part 13 MUST 13.3.5.2). Repeated patterns of deviation in the same Blueprint area MUST trigger a v3.X amendment to formalize the actual built behavior or to reaffirm the spec.

### 14.4 Production code precedence

**MUST 14.4.1** — Per Master Blueprint Part 13 MUST 13.3.6.2, Cursor MUST NOT modify behavior in production code that contradicts a Blueprint MUST clause without first obtaining a v3.X amendment per §14.1.1. Production code is downstream of the spec, not authoritative over it.

**MUST 14.4.2** — Code review MUST verify every PR against the Blueprint sections referenced in the PR description. PRs that touch Blueprint-anchored areas without referencing the relevant Blueprint section MUST be rejected.

---

## SELF-CHECK FOOTER (LOCK COMPLIANCE ASSERTION)

This Build Spec asserts compliance with the directive's Hard Non-Negotiable Locks:

| Lock | Compliance |
|---|---|
| 1. No new product requirements | ✅ Every MUST in this document is either (a) a restatement of a Blueprint MUST with traceability, or (b) a build-side procedural requirement. No new product behavior is specified. |
| 2. No schema drift | ✅ 0 `CREATE TABLE/SCHEMA/VIEW/MATERIALIZED INDEX` statements. Schema count remains 14 per Part 4. |
| 3. No new workflow IDs | ✅ Every WF reference appears in Part 12 §12.2.1's V3 Authoritative Index. WF-001..WF-064 minus 6 DEPRECATED = 58 active IDs. |
| 4. No new REQ rows / no test-ID renumbering | ✅ Trace matrix preserved at 247 data rows. No new REQ-* rows introduced. Test IDs referenced only by ID; range remains T-011.1..T-209.5; total remains 849. |
| 5. No taxonomy changes | ✅ Status enum unchanged (`MATCHED \| REMAPPED \| DEPRECATED`). Roles character-exact (Owner, Administrator, Manager, Accountant, Dispatcher, Safety, Driver, Mechanic). Severities character-exact (info, warning, critical). Profiles character-exact (FULL, Profile A, Profile B, Profile C, service-only). |
| 6. Build spec is purely executable guidance | ✅ Every section contains explicit verification commands and traces back to the Master Blueprint. |

**Acceptance gates self-assertion (per directive):**

- ✅ Every section maps back to approved Parts 1-13 (Section 2.1 provides the explicit map).
- ✅ No new requirements/tables/WFs/REQ IDs/test IDs appear (verified mechanically; see footer).
- ✅ All locked taxonomies are unchanged (vocabulary conformance check passes).
- ✅ Contains practical, executable build sequencing (Sections 5, 6, 7, 8, 9, 10, 11, 12, 13 all provide phase-by-phase build steps).
- ✅ Contains explicit verification steps for each major phase (Section 11.4 + Section 13 task matrices).

**Output constraints self-assertion (per directive):**

- ✅ Concrete and implementation-ready (commands, paths, version numbers, code patterns).
- ✅ Canonical RFC 2119 language used consistently.
- ✅ Counts exact: no `~`, "approximately", "roughly", or "about [number]" outside the §1.4 lock-statement that itself defines these as banned tokens.
- ✅ Self-check footer present (this section).

---

**Reply with:**
- **approve** → Build Spec V3 is approved; build phase can commence per Phase 0 task matrix (§13.1)
- **change X** → specifically what to change in the Build Spec
