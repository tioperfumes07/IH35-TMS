# IH35-TMS — System Architecture

> ⚠️ **SUPERSEDED (2026-06-27).** This file is from 2026-06-15 and is stale (it says "2 entities / 4
> trucks"; reality is **3 entities**). The live, verified current-state doc is
> **`docs/IH35-TMS-ARCHITECTURE-AND-BLUEPRINT.md`**. Kept for history (archive, never delete).

_Current-state architecture. Updated for the Phase 3 module-build cycle._

---

## 1. What IH35-TMS is

A Transportation Management System for **IH 35**, a small (4-truck) trucking operation based in Laredo, Texas. It runs the whole operation: dispatch, maintenance, fuel, safety/compliance, driver settlements, accounting, banking, factoring, and regulatory reporting (IFTA / Form 425C). It is in production today.

Owner / sole operator: **Jorge Munoz** (non-technical — Cursor writes the code, Claude cross-checks and designs).

## 2. Operating companies

Two legal entities, both tenants of the same system:

| Code | Entity | Notes |
|---|---|---|
| `TRK` | IH 35 Trucking LLC | UUID `b49a737b-6cf0-43bb-8758-a6c8ff8a2c4e` |
| `TRANSP` | IH 35 Transportation LLC | Chapter 11 DIP — audit obligations are existential | UUID `91e0bf0a-133f-4ce8-a734-2586cfa66d96` |

Every query is scoped to an `operating_company_id`. The top bar carries a company switcher. Multi-tenancy is foundational (built in from Phase 1, `org.companies` / `org.user_company_access`) and is the basis of a possible future SaaS productization.

## 3. Tech stack & apps

| App | Path | Stack | Purpose |
|---|---|---|---|
| Backend API | `apps/backend` | Node.js + TypeScript | REST API, business logic, integrations |
| Office web | `apps/frontend` | React + TypeScript (project references) | The desktop office product |
| Driver PWA | `apps/driver-pwa` | Vite + React + TypeScript + i18next | Driver mobile app — dark theme, EN/ES bilingual, offline IndexedDB queue |

**Authoritative build verification** — local `npm run typecheck` (`--noEmit`) is **not** sufficient and has caused hotfixes. The real checks are:
- Backend: `npm run build:backend` (EMIT mode — matches Render)
- Frontend: `cd apps/frontend && npx tsc -b`

## 4. Hosting & environments

- **Deployment:** Render. API service auto-deploys `main`. Separate services for API, office web, and the driver PWA.
- **Domains:** `app.ih35dispatch.com` (office) · `driver.ih35dispatch.com` (driver PWA) · `api.ih35dispatch.com` (API).
- **Database:** Neon Postgres (project `tiny-field-89581227`). The default branch **is** production — treat it as production.
- **Repo:** `github.com/tioperfumes07/IH35-TMS` (private).

## 5. Database schemas

Postgres, schema-per-domain. Cross-schema writes go through **service functions only** — never direct cross-schema `INSERT`.

| Schema | Owns |
|---|---|
| `identity` | users, sessions, auth, `user_preferences` |
| `org` | companies, user-company access (multi-tenancy) |
| `master_data` (`mdata`) | units, trailers, drivers, vendors, equipment |
| `catalogs` | chart of accounts, products/services, reference catalogs |
| `maintenance` | work orders, parts, PM schedules |
| `dispatch` | loads, stops, settlements, in-transit issues, ETA predictions |
| `driver_finance` | driver liabilities, advances, deduction schedules, settlement lines |
| `accounting` | bills, expenses, journal entries, payments |
| `safety` | accident records, inspections, violations, claims |
| `fuel` | fuel transactions, IFTA, fuel-card data |
| `documents` | evidence records, R2-backed document store, chain-of-custody |
| `audit` | append-only audit events |
| `outbox` | event queue (drives QBO sync etc.) |

## 6. Integrations (live — do not break)

| Integration | Role |
|---|---|
| QuickBooks Online | Accounting source of truth for bills/expenses/payments; office payroll for W-2 staff. Sync via `outbox` |
| Samsara | Telematics — vehicle GPS, HOS, mileage (100 vehicles) |
| Relay | Fuel-card network — pump transactions → expenses → IFTA gallons |
| Plaid | Bank-feed connectivity for the Banking module |
| Resend | Transactional email |
| Twilio | SMS / WhatsApp notifications |
| Cloudflare R2 | Document / evidence bucket |

Top bar shows live health pills: "QuickBooks · Samsara · Relay connected".

## 7. Modules (the office product)

The sidebar is **12 items, fixed**, in this order:

`HOME · MAINT · ACCTG · BANK · FUEL · SAFETY · DRIVERS · DISPATCH · LISTS · REPORTS · 425C · DRV APP`

| Module | Purpose |
|---|---|
| Home | Dashboard — KPI row, section quick-jumps with new-in-3-days badges, attention list, fleet snapshot |
| Maintenance | Work order lifecycle (PM / Repair / Tire / Accident), R&M status, PM schedule, in-transit issues |
| Accounting | Bills, expenses, journal entries, receive payment, financial reporting |
| Bank | Bank feeds — categorize & match transactions, reconciliation, driver escrow |
| Fuel | HOS-aware fuel planner, Relay inbox, expense mapping, savings tracking |
| Safety | Driver files, hours/fatigue, inspections, accidents/claims, fines, compliance docs |
| Drivers | Driver roster, profiles, settlements, pre-settlements, cash advances, permits, pay-rate templates, deductions, leave |
| Dispatch | Load board (units with/without a load), Book Load, settlements, geofence, factoring packets |
| Lists | Lists & Catalogs hub — master reference data |
| Reports | Report library + IFTA quarterly preparer |
| 425C | Form 425C monthly generation |
| Drv App | Driver PWA (the mobile app surface) |

## 8. Design system

The office product is a **professional desktop application** — navy / charcoal / grey / white, **IBM Plex Sans** (IBM Plex Mono for numerics). Dense, data-first, no decoration.

- **Shell:** 48px fixed top bar (navy) + 72px fixed sidebar (navy, icon + ALL-CAPS label). Content area below.
- **Section header band** below the breadcrumb on every page.
- **KPI cards:** single row, ~30px tall, label-left / number-right, tabular numerals.
- **Tables:** dense — small row text, ~18px rows, sticky headers when >10 rows.
- **Sub-nav:** single horizontal line per module, hover-dropdowns where applicable.
- The production sidebar styling is **locked** — do not recolor or restyle it.

> QuickBooks Online is referenced only as a **functional** model (how categorize/match, inline-create, and combobox pickers behave). It is **never** a visual reference. The IH35-TMS look is its own navy/grey/white system.

## 9. Universal components (use everywhere they apply)

| Component | Where | Spec |
|---|---|---|
| **Cost Breakdown Box** | Work Order, Bill, Expense, Accident, Fines, Damage Report — anywhere money is recorded | One bordered card: navy "Cost Breakdown" strip → **Section A — Category lines** (Category · Description · Qty · Cost · Total) → **Section B — Item lines** (Product/Service · Description · Location · Qty · Cost · Total) + **Parts & Labor** sub-panel (Part # · Part Name · Location · Qty · Cost · Subtotal). Subtotal A / Subtotal B rows. |
| **Totals Stack** | Every money form | Subtotal → Tax (editable %, default 8.25% Laredo/Texas) → grand total (white on navy). `total = subtotal + subtotal × rate/100`. |
| **12×6 Header Grid** | Work Order / Bill / Expense / Accident headers | 6-column grid; section label ("Work Order Details" etc.). Field placement follows the locked master-rules Excel. |
| **Combobox** | **Every list-picking field, app-wide** | Click → full scrollable list; type → live substring filter; keyboard navigable; optional pinned "+ Add new…" for inline create. This is the locked standard for all dropdowns. |
| Hover-dropdown sub-nav | Module sub-navs | Sized to longest item; 150ms in / 300ms out. |

## 10. Security, RBAC & high-risk actions

- **Roles:** Owner, Administrator, Manager, Mechanic, Dispatcher, Safety, Accounting.
- **RLS:** every table is row-level-security scoped by `operating_company_id`.
- **WF-064 envelope:** high-risk / irreversible actions (manual journal entries, above-policy cash advances, unit retirement with open WO, IFTA generation, override of dispatch blocks) are gated — typically Owner-only, lightning-bolt ⚡ marked, with a reason field and a 2-step confirm. Every such action writes an audit event.
- **Audit:** every mutation appends to `audit.audit_events` (append-only).
- **Credentials** are never placed in chat — Render env vars only.

## 11. Core data-flow patterns

- **Lockstep INSERT** — multi-row creates that must be atomic are written in a single transaction (established as a hard pattern after a Phase 1 customer-create bug).
- **Service functions for cross-schema writes** — e.g. an accident Work Order creates the `safety.accident_records` row via `safety.create_accident_from_wo()`; a Work Order's external parts/labor creates `accounting.bills` via `accounting.create_bill_for_wo()`. No module reaches directly into another schema.
- **Append-then-sync** — mutations append to `audit` and enqueue to `outbox`; `outbox` drives downstream sync (QBO) asynchronously.
- **Status DAGs** — entities move along fixed state machines (e.g. Work Order: `open → in_progress → completed → closed`, or `open → cancelled`; backward transitions forbidden). Loads have a 7-state lifecycle.
- **Live recompute over cached values** — driver debt on a settlement screen is recomputed live (`recompute_driver_debt`), never read from a stale cache, with a 5-second freshness lockout.

---

_This document describes the system as it stands. For the build plan and module specs see the Blueprint; for working rules see the Agent Handoff._
