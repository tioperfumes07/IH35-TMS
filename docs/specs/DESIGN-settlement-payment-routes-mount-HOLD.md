# DESIGN (build-and-HOLD) — Mount `registerSettlementPaymentRoutes` in `index.ts`

- **Block:** `0441-mod10-payment-status-panel-404`
- **Status:** DESIGN ONLY. **No money code. Do NOT open a code PR that mounts payment routes.** This document is the plan; the actual one-line mount + preconditions ship in a **separate owner-gated PR** after `JORGE-APPROVED`.
- **Branch:** `design/settlement-payment-routes-mount-hold` (pinned to `origin/main` @ `cde575b64`)
- **CPA posture (loaded `ih35-accounting-decisions`):** reuse the existing poster, **write NO new GL math**, all money-posting flags stay **default OFF**, per-entity override only. An agent never posts/moves money; the flip is the owner's hand + owner sign-off.
- **Financial cluster → build-and-HOLD (Rule 13):** these are money endpoints; **never self-merge**, HOLD for owner merge even though the mount itself is schema-free.

---

## 1. Problem statement (verified on `origin/main`, not memory)

The settlement payment-status panel returns 404 because its backend is authored but never wired.

| Claim | Evidence (`origin/main` @ `cde575b64`) | Verdict |
|---|---|---|
| `registerSettlementPaymentRoutes` exists | `apps/backend/src/driver-finance/settlement-payment.routes.ts` exports it; 6 endpoints defined | ✅ CONFIRMED |
| It is NOT imported in `index.ts` | `git show origin/main:apps/backend/src/index.ts` → **no** `settlement-payment.routes` import, **no** `registerSettlementPaymentRoutes` call | ✅ CONFIRMED (unwired) |
| CAS / `FOR UPDATE` mitigation landed | `#3079` (`4807e2489`) is an ancestor of `origin/main`: *"settlement double-pay TOCTOU — CAS + row lock + idempotency latch on all 5 payment transitions (Phase 2, HOLD)"* | ✅ CONFIRMED merged |

Tracker line (`docs/trackers/LIVE-AUDIT-GAPS-2026-07-21.md`):
> `0441-mod10-payment-status-panel-404` (settlements, AUDIT-NOTE) — OPEN: `apps/backend/src/index.ts` never imports `registerSettlementPaymentRoutes` … and never awaits it in the registration block.

**Root cause:** a missing route registration (a wiring gap), **not** a missing feature and **not** a GL defect. The fix is additive wiring only — no schema, no new posting math.

### The 6 endpoints (all under `/api/v1/driver-pay/settlements/:id/…`)

| # | Method | Path | Role gate (in code) | Money effect |
|---|---|---|---|---|
| 1 | POST | `/queue-payment` | Owner/Admin/Accountant | state → `queued` |
| 2 | POST | `/mark-sent` | Owner/Admin/Accountant | state → `sent_to_bank` |
| 3 | POST | `/mark-cleared` | Owner/Admin/Accountant | state → `cleared` (enqueues QBO sync job) |
| 4 | POST | `/mark-bounced` | Owner/Admin/Accountant | state → `bounced` (owner email) |
| 5 | POST | `/mark-paid-manually` | Owner/Admin only | state → `manual_paid` |
| 6 | GET | `/payment-events` | Owner/Admin/Accountant | read-only event ledger |

These transition a **payment lifecycle state** on `driver_finance.driver_settlements` and append events to `driver_finance.settlement_payment_events`. They do **not** author a new journal entry — `mark-cleared` reuses the existing `enqueueSyncJob` path; GL posting remains governed by `SETTLEMENT_GL_POSTING_ENABLED` (per-entity, default OFF) in the poster, untouched by this mount.

---

## 2. Exact mount site in `index.ts`

Wire it **inside the driver-finance registration cluster**, immediately after the driver-payment-method register and before the payment-methods catalog register, so the payment-lifecycle route sits with its siblings (line numbers per `origin/main` @ `cde575b64`).

### 2a. Import (add next to the sibling imports at lines 133–152)

```ts
// after line 144: import { registerDriverPaymentMethodRoutes } from "./driver-finance/driver-payment-methods.routes.js";
import { registerSettlementPaymentRoutes } from "./driver-finance/settlement-payment.routes.js";
```

### 2b. Registration call (add in the async register block; siblings at lines 861–881)

```ts
  await registerDriverPaymentMethodRoutes(app);        // existing (line 877)
  await registerSettlementPaymentRoutes(app);          // ← ADD HERE (payment lifecycle, sibling of driver-pay)
  registerPaymentMethodsCatalogRoutes(app);            // existing (line 878)
```

Rationale for placement:
- It is a `driver-finance/*` route → belongs in the driver-finance cluster (lines 861–881), not the generic route list.
- Placed after `registerDriverPaymentMethodRoutes` because the ACH-token precondition inside `queuePayment` resolves the driver's default method via `resolveDefaultAchToken` (same `DRIVER_PAYMENT_METHODS_ENABLED` domain) — grouping keeps the mental model intact.
- `await` form to match every other `register…Routes` in that block (the two non-awaited ones — catalog + payrun-close — are the exception, not the pattern).

**This is the ONLY code change of the eventual mount PR** (plus the two preconditions in §3). It touches `index.ts` only; it does **not** touch `settlement-payment.routes.ts`, `settlement-payment.service.ts`, migrations, or `package.json`.

---

## 3. Preconditions — ALL must be true before the mount PR merges

The mount exposes money endpoints to the network. It must **not** merge until every box below is green. Two of these are **not yet satisfied on `origin/main`** and are additive prerequisites of the mount PR itself.

### 3.1 CAS / concurrency mitigation present — ✅ SATISFIED (`#3079`)

`settlement-payment.service.ts` on `origin/main` already guards every transition with:
- **`FOR UPDATE` row lock** at the read (serializes concurrent mutators),
- a **CAS predicate** on every `UPDATE` (the load-bearing guard — the UPDATE only fires from the expected prior state),
- an **idempotency latch** (`payment_release_idempotency_key` + `ON CONFLICT (settlement_id, event_type, idempotency_key)`) so a double-click / retry is an idempotent no-op (no second event, no second audit row).

No further concurrency work is needed for the mount; this is the double-pay mitigation cited in §6.

### 3.2 Feature flag, default OFF, per-entity override only — ⚠️ NOT YET SATISFIED (mount PR must add)

Today the routes call **no** `isEnabled(...)` gate. The mount PR must add a per-entity-gated flag so exposing the endpoints does not turn payment actions on for every entity at once.

- **New flag key:** `SETTLEMENT_PAYMENT_ROUTES_ENABLED` (money-affecting → belongs in the **per-entity-only** set).
- **Enrollment:** add the key to `PER_ENTITY_ONLY_FLAG_KEYS` in `apps/backend/src/lib/feature-flags/service.ts` so `resolveFlagEnabled` refuses any global `default_enabled`/`rollout_pct` enable and honors **only** an explicit per-entity (`operating_company_id`) or per-user override. (This mirrors `DRIVER_PAYMENT_METHODS_ENABLED` / `SETTLEMENT_DEDUCTION_APPLY_ENABLED`.)
- **Seed:** default OFF (owner flips per entity, TRANSP first). Seeding a `lib.feature_flags` row is **not** DDL and is not part of `accounting.*` — but see §5 on the HOLD.
- **Gate placement:** at the top of each of the 6 handlers (or a shared preamble), resolve `isEnabled(client, "SETTLEMENT_PAYMENT_ROUTES_ENABLED", { operating_company_id, user_uuid })` and return `404`/`403` when OFF, so an unflipped entity behaves exactly as today (panel 404) — no behavior change until the owner flips.

> Design decision (autonomy): flag **name** and reusing the per-entity-only pattern is chosen to match the existing `DRIVER_PAYMENT_METHODS_ENABLED` precedent. If the owner prefers a single umbrella flag, that is a one-line key change.

### 3.3 Entity-scoped membership check on ALL 6 endpoints — ⚠️ PARTIALLY SATISFIED (mount PR must close)

- The **5 POST** handlers call `parseCompanyQuery(...)` → `assertCompanyMembership(userId, operating_company_id)` **before** acting. ✅
- The **6th** endpoint, **GET `/payment-events`** (routes.ts ~line 161–170 on `origin/main`), validates `companyQuerySchema` but passes `operating_company_id` **straight to `listPaymentEvents` WITHOUT** `assertCompanyMembership`. The service sets the RLS GUC from that same unverified value, so a user could read another company's payment-event ledger by supplying a foreign `operating_company_id`. ❌

**Required in the mount PR:** route GET `/payment-events` through `parseCompanyQuery` (identical to the 5 POST handlers) so membership is asserted on all 6 endpoints. This is the same defect class as sibling `0091-g1-3` (see §7) — do not repeat it here.

### 3.4 Poster untouched / no new GL math — ✅ (design constraint)

The mount adds no posting logic. `mark-cleared`'s `enqueueSyncJob` and the `SETTLEMENT_GL_POSTING_ENABLED`-gated poster are pre-existing and out of scope. **No new GL math is written** (CPA posture).

---

## 4. Linkage matrix (total-connectivity law — forward AND reverse)

Every settlement payment action must link both ways to its financial primitives, operational entities, and audit. Canonical tables only (no RETIRE tables — `driver_finance.*` is canonical for settlements; `mdata.*` for hubs; `accounting.*` for GL; `audit.audit_events` for audit).

```
                       driver_finance.driver_settlements  (payment_state lifecycle)
                                     │  operating_company_id (RLS FORCED)  ← entity scope
        ┌────────────────────────────┼───────────────────────────────────────────────┐
        │                            │                                                │
   driver_id                    settlement_id                                   status=locked|final
        ▼                            ▼                                                (precondition)
  mdata.drivers  ──qbo_vendor_id──▶  mdata.qbo_vendors        driver_finance.settlement_payment_events
   (driver = payee)                 (driver-as-VENDOR)         (append-only per-transition ledger)
        │                            │                                                │
        │                            ▼                                                ▼
        │          Bill + BillPayment settlement model                      audit.audit_events
        │        (ARCHITECTURE-BLUEPRINT: driver settlement =              (event_class = driver_pay.settlement.*,
        │         Bill → BillPayment; GL via existing poster,               severity, actor_user_uuid, source)
        │         SETTLEMENT_GL_POSTING_ENABLED per-entity OFF)
        ▼
  Cost of Labor–Mexico Drivers (GL account, via poster only — NOT authored here)
        │
   mark-cleared ──▶ enqueueSyncJob(operating_company_id, "settlement", id, payloadHash, userId)
                    (existing QBO parallel-books reconcile path; NO write-back authored here)
```

| Link | Forward | Reverse | Where enforced |
|---|---|---|---|
| Settlement → driver | `driver_settlements.driver_id` | driver's settlements list | RLS + FK |
| Settlement → driver-as-vendor | `mdata.drivers.qbo_vendor_id` → `mdata.qbo_vendors` | vendor → driver payments | existing mapping (samsara vendor-mapping-integrity) |
| Settlement → Bill/BillPayment | Bill + BillPayment settlement model (Law of the Land) | BillPayment → settlement | existing poster (flag OFF) |
| Settlement → GL | `Cost of Labor–Mexico Drivers` via poster | JE → settlement | `SETTLEMENT_GL_POSTING_ENABLED` (per-entity, OFF) |
| Settlement → event ledger | `settlement_payment_events` (one row/transition) | event → settlement | service `appendPaymentEvent` |
| Settlement → audit | `audit.audit_events` `driver_pay.settlement.*` | audit → resource_id | service `appendCrudAudit` |
| Settlement → entity | `operating_company_id` FORCED RLS on all reads/writes | entity → settlements | RLS policy + GUC set before lookup |

**No orphans:** the mount creates no new rows and no new ids; it only exposes an already-linked surface. The one linkage **gap** the mount PR must fix is the missing membership assertion on GET `/payment-events` (§3.3) — a reverse-scope leak, not an orphan.

---

## 5. Owner-gate & Neon requirement

- **`JORGE-APPROVED` required before merge:** YES. These are money endpoints (Rule 13 financial cluster → build-and-HOLD, never self-merge).
- **Neon apply required for the mount itself:** **NO — IF the mount PR carries no schema/DDL.** The mount is import + register-call. If the flag row (`SETTLEMENT_PAYMENT_ROUTES_ENABLED`) is seeded via the standard `lib.feature_flags` seed migration, that is idempotent flag-seed (not `accounting.*` DDL) and follows the normal migrate path; `ih35_app` cannot run DDL, so any migration is owner-applied on Neon per the standard pattern. **No opening balances, no GL schema, no new posting table.**
- **Still HOLD for owner merge** even though mount-only is schema-light, because turning on network-reachable money endpoints is an owner decision. Sequence: owner reviews design → owner approves → mount PR opened → CI green → **owner merges** → owner flips `SETTLEMENT_PAYMENT_ROUTES_ENABLED` per entity (TRANSP first) → GUARD re-proves live via health SHA + endpoint 200 with membership enforced.

---

## 6. Risks & mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| **Exposing endpoints before FE is ready** | Medium | Flag `SETTLEMENT_PAYMENT_ROUTES_ENABLED` default OFF → endpoints return 404/403 for every entity until owner flips. Mount is inert until (a) flag flipped AND (b) FE payment-status panel shipped. Ship FE + flip together per entity. |
| **Double-pay (TOCTOU on payment transition)** | High | **Mitigated by `#3079`** — `FOR UPDATE` row lock + CAS predicate on every UPDATE + idempotency latch (`payment_release_idempotency_key`, `ON CONFLICT`). A concurrent/retry request is an idempotent no-op; the loser blocks on the lock then sees state already advanced and the CAS predicate fails safely. No new concurrency code needed. |
| **Cross-entity ledger read via GET `/payment-events`** | High | §3.3 — mount PR MUST add `assertCompanyMembership` to the GET handler (same as the 5 POST handlers) before merge. Do not mount until closed. |
| **Global flag flip lights up all entities** | High | Flag enrolled in `PER_ENTITY_ONLY_FLAG_KEYS` → resolver ignores global `default_enabled`/`rollout_pct`; enable only via explicit per-entity override. |
| **Unintended GL posting on mount** | High | No poster change; `SETTLEMENT_GL_POSTING_ENABLED` unchanged (per-entity OFF). `mark-cleared` reuses existing `enqueueSyncJob` (reconcile-only, no QBO write-back). |
| **Guard hot-file thrash (Rule 17)** | Low | New guard via verify-step only; no `package.json` / `locked-guards.yml` / `ci.yml` edits (§8). |

---

## 7. Related CRITICAL siblings still OPEN (context — NOT fixed by this block)

Both are on `docs/trackers/LIVE-AUDIT-GAPS-2026-07-21.md` and are **settlements/FIN CRITICAL, still OPEN**. They are noted so the owner sees the cluster; they are **out of scope** for this mount block.

- **`0091-g1-3` — approval OC scoping.** `settlements/approval.routes.ts` has **no** `assertCompanyMembership` / `withCompanyScope` on **any** of its 8 handlers (lines 68, 89, 115, 141, 168, 190, 207, 271); `operating_company_id` is trusted **raw from the query**. Same defect class as the GET `/payment-events` gap in §3.3 — a cross-entity scope leak on the approval surface. **This mount PR must not replicate that pattern**; it should instead close it locally on `/payment-events`.
- **`0441-mod10-deductions-never-reduce-settlement`.** `driver-finance/weekly-close.routes.ts` never queries `driver_finance.deduction_schedule` (the string is absent from the file) and never writes a `line_type='deduction'` settlement line, so `deductions_total` never reduces net pay owed. A driver could be paid **without** scheduled deductions applied — a money-correctness defect that interacts with the payment lifecycle this block mounts. **Sequencing note:** the owner may want `0441-mod10-deductions-never-reduce-settlement` resolved before flipping `SETTLEMENT_PAYMENT_ROUTES_ENABLED` in production, so payments aren't sent on under-deducted settlements.

---

## 8. Acceptance[] / verify-guard plan (verify-step only — Rule 17, no `package.json`)

The eventual mount PR (owner-gated, separate) proves DONE via `acceptance[]` on live evidence. Guard is wired **as a verify-step only** — Rule 17: add `scripts/verify-settlement-payment-routes-mounted.mjs` + `scripts/verify-steps/<NNN>-verify-settlement-payment-routes-mounted.mjs`; **do NOT** edit `package.json`, `.github/workflows/locked-guards.yml`, or `ci.yml`. `verify:pre-commit` auto-discovers the step.

```jsonc
acceptance: [
  // static wiring
  { id: "import-present",   proof: "grep registerSettlementPaymentRoutes in apps/backend/src/index.ts import block" },
  { id: "register-called",  proof: "grep 'await registerSettlementPaymentRoutes(app)' in index.ts register block" },
  // preconditions
  { id: "flag-enrolled",    proof: "SETTLEMENT_PAYMENT_ROUTES_ENABLED ∈ PER_ENTITY_ONLY_FLAG_KEYS; resolver returns false w/o per-entity override" },
  { id: "flag-default-off", proof: "lib.feature_flags row seeded default_enabled=false; no global rollout" },
  { id: "membership-all-6", proof: "assertCompanyMembership reachable on all 6 handlers incl. GET /payment-events" },
  { id: "cas-intact",       proof: "#3079 FOR UPDATE + CAS + idempotency latch unchanged (no regression)" },
  { id: "no-new-gl",        proof: "no poster/GL-math diff; SETTLEMENT_GL_POSTING_ENABLED untouched" },
  // live proof (owner/GUARD, post-merge)
  { id: "deployed-sha",     proof: "GET /api/v1/healthz/shallow version == merge SHA" },
  { id: "endpoint-live-off", proof: "with flag OFF, POST queue-payment → 404/403 (inert, unchanged behavior)" },
  { id: "endpoint-live-on",  proof: "with per-entity flag ON (TRANSP), authorized Owner/Admin/Accountant → 200; foreign operating_company_id on GET /payment-events → 403 (membership enforced)" },
  { id: "guard-wired",      proof: "verify-step 'verify-settlement-payment-routes-mounted' runs in verify:pre-commit; planted-failure (comment out register call) turns it red" }
]
```

### Guard sketch (`scripts/verify-settlement-payment-routes-mounted.mjs`)
- Read `apps/backend/src/index.ts`; **fail** unless it both imports `registerSettlementPaymentRoutes` from `./driver-finance/settlement-payment.routes.js` **and** calls `registerSettlementPaymentRoutes(app)` in the register block.
- Read `settlement-payment.routes.ts`; **fail** unless all 6 handlers reach `assertCompanyMembership` (regex/AST that GET `/payment-events` goes through `parseCompanyQuery`).
- Read `lib/feature-flags/service.ts`; **fail** unless `SETTLEMENT_PAYMENT_ROUTES_ENABLED` is in `PER_ENTITY_ONLY_FLAG_KEYS`.
- Planted-failure proof: commenting out the register line must turn the guard red (prove the guard bites).

---

## 9. Out of scope (explicit)

- Any GL / posting / JE math (poster reused, not modified).
- FE payment-status panel implementation (separate FE block; flip together per entity).
- Sibling fixes `0091-g1-3` and `0441-mod10-deductions-never-reduce-settlement` (§7 — noted, not fixed here).
- Any schema beyond the (optional) idempotent `lib.feature_flags` flag seed.
- `package.json` / `locked-guards.yml` / `ci.yml` edits (Rule 17).

---

## 10. Summary

Mount `registerSettlementPaymentRoutes` in `index.ts` (one import + one `await` call in the driver-finance cluster), **gated behind** a new per-entity-only `SETTLEMENT_PAYMENT_ROUTES_ENABLED` flag (default OFF), **after** closing the GET `/payment-events` membership gap, with the `#3079` CAS/row-lock/idempotency mitigation already in place. **Design only — HOLD for `JORGE-APPROVED` owner merge; no money code, no route mount ships in this PR.**
