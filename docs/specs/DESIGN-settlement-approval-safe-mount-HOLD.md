# DESIGN HOLD — Safe mount of `settlements/approval.routes.ts` (internal-controls approval workflow)

**Status:** DESIGN-ONLY · **DOCS-ONLY PR** · **BUILD-AND-HOLD** · **DO NOT MERGE** without owner `JORGE-APPROVED`.
**Item:** `audit2-internal-controls-approval-workflow` (accounting-module GAP lane, 2026-07-21).
**No route mount, no code change, no Neon write ships with this document.**

Binds to: `docs/specs/QUALITY-STANDARD-LOCKED.md` (Rule #0), `.cursor/rules/13-financial-and-accounting-law.mdc` (settlement approve/finalize + escrow ledger writes = financial cluster, owner-gated), `.cursor/rules/14-linkage-law-enforcement.mdc`, `.cursor/rules/16-fix-not-patch-evidence-law.mdc`. Skills: `ih35-code-review`, `ih35-cpa-accounting-decisions`.

---

## 1. Verified current state (repo evidence, origin/main @ d8370fe83)

| Fact | Evidence |
|---|---|
| `registerSettlementApprovalRoutes` (D1 approval workflow: summary, line approve/reject, settlement approve/finalize, trip-link queue, PDF gate) is **built but never mounted** in `apps/backend/src/index.ts` | `apps/backend/src/settlements/approval.routes.ts:59`; no import/call in `index.ts` |
| It is **allowlisted as unmountable**: `["registerSettlementApprovalRoutes", "UNSAFE — collides with SettlementsMvp on /settlements/:id/approve"]` | `scripts/verify-no-orphan-routes.mjs:47` |
| The recorded collision reason is **imprecise**: approval.routes defines `POST /api/v1/settlements/approve` (static, `:158`) while settlements-mvp defines `POST /api/v1/settlements/:id/approve` (`settlements-mvp.routes.ts:221`) — different Fastify paths, and **settlements-mvp is itself unmounted** (allowlisted `:46`). No mounted route today claims `/api/v1/settlements/*` or `/api/v1/trip-link-queue` (mounted settlement surface lives under `/api/v1/driver-finance/settlements/*`, `driver-finance/settlements.routes.ts:102-440`). Mounting would not boot-crash — **the real blocker is scoping, below** | repo grep 2026-07-21 |
| **Entity-scoping gap (the true UNSAFE):** of the **9 handlers**, only **3** resolve membership via `resolveOperatingCompanyId` — line-items (`:95`, the xe-fin IDOR fix), trip-link-queue GET (`:213`), generate-pdf (`:277`). The other **6** (approval-summary `:62`, approve-line `:105`, reject-line `:131`, approve `:158`, finalize `:180`, trip-link assign `:239`) **trust the client-supplied `operating_company_id` query param without membership validation** — trip-link assign takes no company id at all and passes straight to the engine | `approval.routes.ts` (lines cited) |
| Handlers write money state: `driver_finance.settlement_lines` approve/reject, `driver_finance.driver_settlements` status, and **escrow**: `driver_finance.escrow_balances` upsert + `driver_finance.escrow_ledger` INSERT on line approval | `approval.service.ts:276,324,362-431,475,495` |
| **Zero frontend call sites** for any of the 9 endpoints (`/settlements/:id/approval-summary`, `approve-line`, `trip-link-queue`, …) | grep across `apps/frontend/src` 2026-07-21 |
| Role gate exists but is broad: Owner/Administrator/Manager/Accountant/Payroll (`authUser`, `approval.routes.ts:49-57`) — **no separation-of-duties** (the same role can approve lines, approve the settlement, and finalize) | `approval.routes.ts:52` |

**Verdict on the GAP claim: TRUE with corrections.** Built-but-unmounted confirmed; allowlist entry confirmed at `verify-no-orphan-routes.mjs:47`; the handler count is 9 (not 8) and the unscoped count is 6 (not 5). The stated collision is not the operative risk — the cross-entity IDOR on money-writing handlers is.

## 2. Why NOT blindly mount (what a blind mount would ship)

Mounting today would expose 6 handlers where any authenticated Manager/Payroll user can pass **any** `operating_company_id` and approve/reject/finalize **another entity's** settlement lines — including escrow ledger writes — with no membership check. That is a cross-entity financial write (linkage-law defect class) on the exact surface an internal-controls audit exists to protect. Approve/finalize also flips settlement state that downstream posting reads. Financial cluster → owner-gated.

## 3. Safe-mount design (each step a separate future PR; nothing ships here)

1. **Scope every handler (blocking prerequisite):** replicate the xe-fin pattern already present at `:95` — inside `withCurrentUser`, `const scoped = await resolveOperatingCompanyId(client, user.uuid, requestedCompanyId)`; 400 if absent, 403 if membership fails; pass **`scoped`** (never the raw param) to every `approval.service` call. Applies to all 6 unscoped handlers; trip-link assign additionally gets a company-scope predicate inside `assignTripLink`.
2. **Separation of duties (owner decision):** internal-controls standard (NetSuite approval workflow / QBO min-2-role) says line-approver ≠ finalizer. Proposal: `approve-line`/`reject-line` = Manager+; `approve` (settlement) = Accountant+; `finalize` = Owner/Administrator only. **HOLD until Jorge picks the matrix.**
3. **Collision hygiene at mount time:** keep `registerSettlementsMvpRoutes` unmounted (its allowlist entry stands on its own); mount only `registerSettlementApprovalRoutes`; boot-time duplicate-route check is CI-proven by existing route tests.
4. **Allowlist row removal in the SAME PR as the mount** (guard `verify-no-orphan-routes.mjs` then enforces it stays mounted) — allowlist text should be corrected to name the real historical reason (unscoped handlers), not the path collision.
5. **Frontend**: none exists — the approval UI (settlement detail approve/reject per line, finalize gate, trip-link queue screen) is its own block AFTER the safe mount; mounting first with zero callers is acceptable only because the handlers become entity-safe in step 1.
6. **Guard (Rule 17):** `scripts/verify-settlement-approval-scoped.mjs` + verify-step ≥1217 — greps `approval.routes.ts` and fails if any `app.(get|post)` handler reads `operating_company_id` from the query without a `resolveOperatingCompanyId` call in the same handler body, and fails if the raw param is passed to `approval.service.*`.
7. **Escrow write review (CPA):** line-approval side-effect writes `escrow_balances`/`escrow_ledger` (`approval.service.ts:362-431`). CPA must confirm this matches the locked escrow-as-liability model before the mount PR lands (no new GL math is added — but this dormant math becomes live).

## 4. REMAINING / blocking questions for Jorge

1. Approve the role matrix (§3.2) — separation of duties for line-approve vs settlement-approve vs finalize.
2. CPA sign-off on the dormant escrow write becoming reachable (§3.7).
3. Greenlight order: scoping PR → mount PR (+allowlist row removal + guard) → approval UI block.
