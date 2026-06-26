# GL / CoA Endpoint Audit — 2026-06-26

Task GL-COA-ENDPOINT-AUDIT (Tier-3, audit-only — **no routes changed**). Answers grounded in the repo
(`apps/backend`, `apps/frontend`, `docs/`), not guessing. GUARD reported two prod 404s:
`/api/v1/accounting/general-ledger` and `/api/v1/accounting/chart-of-accounts`.

## 1. `accounting/general-ledger` — no route, and no in-repo caller

- **Backend:** there is **no registered route** for `accounting/general-ledger` anywhere in `apps/backend/src`
  (grep for `general-ledger|general_ledger|generalLedger` across routes = 0 hits). So a request to
  `/api/v1/accounting/general-ledger` 404s because **the endpoint is genuinely not implemented** — not
  mounted-wrong, not flag-gated, not a prefix bug. It does not exist.
- **Frontend:** there is **no caller** of `accounting/general-ledger` in `apps/frontend/src` either
  (0 hits for `general-ledger|generalLedger|general_ledger`; `AccountingHubPage.tsx` makes no such call; no
  `api/*` client method for a GL report). **So the prod 404's caller is not in the current codebase.**
  - Likely sources to confirm (GUARD, from a live network capture): a stale/cached frontend bundle, a
    removed-but-still-deployed call, or a non-repo client. **Recommend GUARD capture the exact request
    initiator (referrer + bundle hash) before any code action** — there's nothing in `main` to "fix."
- **Spec:** `docs/accounting/IH35_ACCOUNTING_BACKBONE_SPEC.md` lists **"General ledger: PARTIAL."** The real
  ledger data lives in **`accounting.journal_entry_postings`** (the JE detail-lines table). A GL *report*
  endpoint is consistent with the spec but **is not built**.
- **Recommendation:** if a GL report is wanted, build `/api/v1/accounting/general-ledger` as a **read** over
  `accounting.journal_entry_postings` (+ `journal_entries`), entity-scoped (RLS), cash/accrual basis per the
  existing report contract — a separate, scoped block (gated if it changes any money-read RLS). Do **not**
  alias it to something unrelated. If the 404 turns out to be dead-call cruft, remove the caller instead.

## 2. `accounting/chart-of-accounts` — CoA is a catalog, served elsewhere

- **No** `/api/v1/accounting/chart-of-accounts` route exists → that path 404s **by design**.
- **The real CoA read path is `/api/v1/catalogs/accounts`** — CoA is implemented as a **catalog**:
  - Backend: `apps/backend/src/catalogs/accounting/index.ts` (`urlSegment: "chart-of-accounts"`,
    `tableName: chart_of_accounts_seeds`), served through the catalogs system; the live accounts table is
    **`catalogs.accounts`**.
  - Frontend client: `apps/frontend/src/api/catalog-accounts.ts` → `GET /api/v1/catalogs/accounts`
    (list/create/get/deactivate). This is the canonical CoA read/write surface.
  - The FE route `/lists/accounting/chart-of-accounts` (`ChartOfAccountsListPage`, `routes/manifest.tsx`) is
    a **UI route**, and the per-account drill-in is `/accounting/chart-of-accounts/register/:id` (also a UI
    route) — neither is an API endpoint.
- **Recommendation:** any client calling `/api/v1/accounting/chart-of-accounts` should call
  **`/api/v1/catalogs/accounts`** instead (catalogKey `chart-of-accounts`). If a stable accounting-prefixed
  alias is desired for external/legacy callers, add a thin redirect in a follow-up — **not** in this audit.

## 3. Summary

| Endpoint | Status | Reality | Action (separate from this audit) |
|---|---|---|---|
| `/api/v1/accounting/general-ledger` | **404 — not implemented; no in-repo caller** | GL data is in `accounting.journal_entry_postings`; GL report = PARTIAL per spec | GUARD: capture the live caller. Then either build a scoped GL-report read endpoint, or remove the dead call. |
| `/api/v1/accounting/chart-of-accounts` | **404 by design** | CoA served at `/api/v1/catalogs/accounts` (catalog `chart-of-accounts`, table `catalogs.accounts`) | Point callers to `/api/v1/catalogs/accounts`; optional thin alias later. |

**No routes were changed.** Both items need a follow-up decision (build vs re-point/remove) — out of scope here.
