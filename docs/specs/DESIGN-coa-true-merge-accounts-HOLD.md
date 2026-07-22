# DESIGN HOLD — CoA "Merge accounts": true merge (repoint references), not deactivate-only

**Status:** DESIGN-ONLY · **DOCS-ONLY PR** · **BUILD-AND-HOLD** · **DO NOT MERGE** without owner `JORGE-APPROVED`.
**Item:** `0091-m-lists-2` (accounting-module GAP lane, 2026-07-21).
**No code, no migration, no Neon write ships with this document.**

Binds to: `docs/specs/QUALITY-STANDARD-LOCKED.md` (Rule #0), `docs/specs/ARCHITECTURE-BLUEPRINT-2026-07-05.md` (linkage law), `.cursor/rules/07-never-delete-only-add.mdc` (archive-never-delete), `.cursor/rules/13-financial-and-accounting-law.mdc` (financial cluster = owner-gated; no new GL math solo), `.cursor/rules/16-fix-not-patch-evidence-law.mdc`. Skills: `ih35-cpa-accounting-decisions`, `ih35-financial-migrations`.

---

## 1. Verified current behavior (repo evidence, origin/main @ d8370fe83)

| Fact | Evidence |
|---|---|
| The Lists → Chart of Accounts batch bar has a **"Merge accounts"** button (enabled at ≥2 selected rows) that opens a modal choosing a **surviving account** | `apps/frontend/src/pages/lists/accounting/CoaBatchActions.tsx:92-100` (button), `:104-139` (modal) |
| `handleMerge` **only deactivates each source account** — `chartOfAccountsCatalogClient.deactivate(source.id, …)` with a fallback to `deactivateCatalogAccount(source.id)`. It never touches the target and never repoints a single reference | `CoaBatchActions.tsx:56-81` (loop at `:67-73`) |
| The confirm text is honest about archival ("Source accounts will be archived (never deleted)") but the **action name promises a merge that does not happen** | `CoaBatchActions.tsx:59-61` |
| There is **no backend merge endpoint at all**. `apps/backend/src/catalogs/accounts.routes.ts` exposes CRUD + `POST /api/v1/catalogs/accounts/:id/deactivate` (`accounts.routes.ts:395`); grep for "merge" across `apps/backend/src/catalogs/` and `apps/backend/src/accounting/` finds no account-merge service | repo grep 2026-07-21 |
| Deactivation is already void-not-delete (`deactivated_at`, locked-row guard) — the archive law itself is respected | `accounts.routes.ts:404-431` |

**Verdict on the GAP claim: TRUE (not stale).** "Merge accounts" is a deactivate-only patch wearing a merge label. Historic postings, open documents, and configuration that reference the source account **stay on the source account**, which is now inactive — reports keep showing balances on archived accounts, and the surviving account never receives the activity the user was promised.

## 2. Why this is a financial change (and therefore HOLD, not code now)

A true merge, per the QuickBooks standard (QBO "merge accounts" moves **all existing transactions** into the surviving account) and the NetSuite control pattern (never leave postings against a retired account without an audit trail), requires **repointing every reference** from source → target:

- **Posted GL**: journal-entry lines referencing the account (e.g. `accounting` JE line tables; manual JE lines FK `catalogs.accounts(id)` since `db/migrations/0092_p5_d4_manual_journal_entries.sql`). Two GAAP-legal shapes exist — (a) UPDATE line account_id in place, or (b) reclass JE per period. **Choice is a CPA/owner decision** (affects audit trail, closed-period immutability, QBO-parallel-books tie-out).
- **Open documents**: bill lines, expense lines, invoice/item mappings, recurring templates.
- **Configuration**: `accounting.chart_of_accounts_roles` (primary role registry — a merged-away control account must be re-designated, never guessed), posting templates, `mdata.vendors.default_expense_account_id` (and the held driver equivalent, PR #3123), item income/expense accounts, opening-balance rows.
- **Hierarchy**: children of the source account must be re-parented to the target (or explicitly kept).
- **Closed periods**: any repoint touching a closed period must either be blocked or produce a dated reclass JE — never a silent UPDATE across a close.
- **Parallel books**: TMS-side merge must NOT write to QBO (reconcile-only law); the twice-daily recon must be told about the mapping change or it will flag every merged posting as drift.

Every one of those is `accounting.*` / posting / GL territory → **financial cluster → build-and-HOLD, owner-gated, CPA review required** (`13-financial-and-accounting-law.mdc`). Writing this merge engine solo without the owner/CPA decision on (a)-vs-(b) would be exactly the "new GL math without approval" the law forbids.

## 3. Proposed design (for owner/CPA review — each step a separate future PR)

1. **Backend `POST /api/v1/catalogs/accounts/merge`** (new, owner-role only): `{ target_id, source_ids[] }`, entity-scoped via `resolveOperatingCompanyId` + `withCompanyScope`; rejects locked accounts, cross-entity pairs, type/subtype-incompatible pairs (QBO refuses cross-type merges too), and any source with children unless `reparent_children: true`.
2. **Reference repoint, in one transaction** (lockstep pattern): configuration + open-document references UPDATE source→target; each table touched emits an append-only audit event.
3. **Posted-GL treatment = CPA decision (blocking question)**: (a) in-place account_id repoint on JE lines in OPEN periods only + reclass JE for closed periods, or (b) reclass JE for everything (no historic UPDATE). Recommendation: **(b) for closed periods, (a) for open**, matching QBO merge behavior while protecting closed-period immutability. **HOLD until Jorge/CPA picks.**
4. **Archive source** (existing deactivate path, `deactivated_at`) + write `merged_into_account_id` (new nullable column, held migration) so the archived row permanently points at its survivor — forward/reverse drill-through preserved (linkage law).
5. **Frontend**: same modal, but calls the merge endpoint; result panel lists every repointed reference count; label stays "Merge accounts".
6. **Guard (Rule 17)**: `scripts/verify-coa-merge-repoints-references.mjs` + verify-step — fails if the merge endpoint deactivates without repointing (greps service for the repoint transaction) and if the frontend "Merge" path calls deactivate-only.

## 4. Interim honesty fix (allowed now, non-financial — optional separate PR)

Until the true merge ships, the modal's primary button and confirm copy should say what it does: **"Archive into target"** semantics are NOT what the button delivers — it archives only. Minimal non-financial truth fix: keep the button (never delete a surface, Rule 07) but change modal copy to state explicitly that references are NOT moved yet and link this design doc. Not shipped in this PR; listed for the owner to greenlight.

## 5. REMAINING / blocking questions for Jorge

1. Posted-GL treatment (a) vs (b) vs hybrid (§3.3) — CPA call.
2. Should merge be Owner-only or Owner+Accountant?
3. Greenlight the interim copy fix (§4)?
