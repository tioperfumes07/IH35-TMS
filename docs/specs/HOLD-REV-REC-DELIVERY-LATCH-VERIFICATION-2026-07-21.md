# HOLD — Revenue Recognition Delivery Two-Event Latch — Step 4 Verification (2026-07-21)

> **HOLD LANGUAGE SUPERSEDED — OWNER LAW 2026-08-03 / owner directive 2026-08-06.** There are NO holds and no approval gate. All owner questions are asked-and-answered. Coders build, apply on Neon, and MERGE ON GREEN with proof. Any "build-and-hold", "Jorge merges", "never self-merge" or "wait for approval" wording below is HISTORICAL RECORD ONLY and must not be followed.

**Status: HOLD — design/verification record only. NO code change. NO GL math. NO flag flip. Owner (Jorge) gates everything below.**

Read-only verification of delivery-based revenue recognition wiring (two-event latch + GL posting) against `origin/main` @ `109f7c8bcb1a339d6e3e17984d9bedc13dc930ac` and the locked design (Blueprint Additions §18, LOCKED — OWNER, 2026-07-19).

## Verdict: PARTIAL

Data model, chart-of-accounts prerequisite, read-only ASC 606 surface, flags (OFF), and the decision lock + guard are all BUILT and on `origin/main`. The **earn-first two-event posting engine itself is MISSING** — there is no code path anywhere in the backend that posts Event 1 (DR Unbilled Revenue / CR Line-Haul Income at `delivered`/`delivered_pending_docs`) or Event 2 (DR A/R / CR Unbilled Revenue at `completed_docs_received`). That is a financial posting build → per financial law (Rule 13, build-and-ship) this doc records the gap; it does not build it.

## BUILT (with evidence)

| Piece | Evidence | State |
|---|---|---|
| Rev-rec data model (contracts / obligations / recognition_rows, FORCED RLS) | `db/migrations/202606281070_revenue_recognition_data_model.sql` (RLS at lines 130–136) | On origin/main; tables verified on prod (`to_regclass` all non-null, br-fancy-credit-akjnd07a, 2026-07-21) |
| Feature flags seeded default OFF | same migration lines 138–146 | Prod verified 2026-07-21: `REVENUE_RECOGNITION_POST_ENABLED default_enabled=false`; `REVENUE_RECOGNITION_ENABLED default_enabled=true` (read-only UI flag) |
| Unbilled Revenue CoA prerequisite (TRANSP 1240 / USMCA 1150, TRK excluded) | `db/migrations/202607620000_unbilled_revenue_accounts.sql` | On origin/main AND applied on prod — verified 2026-07-21 with `app.bypass_rls='lucia'` in-transaction: both rows exist, `system_purpose='unbilled_revenue'`, `is_postable=true`. The §18 HARD PREREQUISITE is now SATISFIED. |
| Read-only ASC 606 routes (list/detail, computed schedule, gated JE preview) | `apps/backend/src/accounting/revenue-recognition.routes.ts` (POST_FLAG at line 18; `isEnabled(client, POST_FLAG)` at line 303) | Mounted via `@fastify/autoload` in `apps/backend/src/accounting/index.ts` (matchFilter `.routes.ts`, line 13), registered at `apps/backend/src/index.ts:1042`. No route-mount gap. |
| Read-only guard test | `apps/backend/src/accounting/revenue-recognition.guard.test.ts` — no INSERT/UPDATE/DELETE, no JE write, entity-scoped | On origin/main |
| Two-event latch decision lock + Rule 17 guard | `docs/specs/IH35_UNIFIED_BLUEPRINT_ADDITIONS.md` §18; `scripts/verify-revenue-recognition-two-event-latch-decisions.mjs` + `scripts/verify-steps/936-…` | On origin/main; guard enforces anchors incl. "never one combined POD+delivered gate" |
| Frontend surface | `apps/frontend/src/pages/accounting/RevenueRecognitionPage.tsx` (shows "GL Posting GATED — OFF" at line 92) | On origin/main |

## MISSING (the gap)

1. **Two-event latch poster (financial)** — zero backend references to `unbilled_revenue` / "Unbilled Revenue" outside the migration (repo-wide grep, 2026-07-21). `apps/backend/src/dispatch/load-state-machine.ts` has no accounting hook; the delivery status transition posts nothing. Existing invoice A/R posting (`apps/backend/src/accounting/posting-engine.service.ts`, gated by `INVOICE_AR_GL_POSTING_ENABLED`) credits revenue accounts directly (bill-first) and does not relieve Unbilled Revenue. Per §18 "reuse the existing poster — write no new GL math," the earn-first path must extend the existing posting engine, in a finance-gated block, owner-approved. **NOT built here.**
2. **Flag entity-context wiring (already-tracked 0243-h3-2, NEEDS-JORGE-GATE)** — `revenue-recognition.routes.ts:303` calls `isEnabled(client, POST_FLAG)` with no `operating_company_id` context, and the flag is not in `POSTING_FLAG_KEYS` (`apps/backend/src/lib/feature-flags/service.ts`), so per-entity overrides ("TRANSP first, USMCA dormant") cannot take effect — the flag is effectively global-only. This is tracked as OPEN in `docs/trackers/backlog-verify/dispatch.md` (0243-h3-2) with a Jorge gate; it is intentionally NOT fixed in this docs-only PR because the fix choice (rename to `*_POSTING_ENABLED` vs. register in `POSTING_FLAG_KEYS` + pass opco context) is gated.

## What remains before REVENUE_RECOGNITION_POST_ENABLED may flip (owner-gated, in order)

1. ~~Seed Unbilled Revenue TRANSP + USMCA~~ — **DONE, prod-verified 2026-07-21** (see table above).
2. Build the earn-first two-event posting path (Event 1 + Event 2 + status-revert reversal + invoice-before-delivery mirror) reusing the existing poster — **financial cluster, build-and-ship, `JORGE-APPROVED` required**.
3. Resolve 0243-h3-2 flag entity-context so per-entity enablement (TRANSP first) actually works.
4. Owner flips the flag per entity. **No agent flips flags.**

## Non-goals of this PR

Docs only. No GL math, no CoA seeding, no flag changes, no route changes, no migration. Never merged by the agent — owner merges or closes.
