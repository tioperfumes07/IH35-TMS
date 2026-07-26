# ACCT-R-03 — Chart-of-Accounts merge was deactivate-only (2026-07-25)

**Finding:** ACCT-R-03 (ranked **ACCT-F13**) · pile `0091-m-lists-2`
**Lane:** FINANCIAL-HOLD — build-and-hold. Owner Neon-applies; Claude merges. Never self-merge.
**Manifest item:** `docs/module-completion/accounting.json` → `ACCT-R-03` (status FAIL until Neon proof)

## Root cause

`apps/frontend/src/pages/lists/accounting/CoaBatchActions.tsx` `handleMerge` looped the catalog
**deactivate** endpoint over every source account and called that a merge:

```ts
for (const source of mergeSources) {
  await chartOfAccountsCatalogClient.deactivate(source.id, operatingCompanyId);
}
```

Archiving a row is not a merge. After it ran:

* the source's **child accounts** still pointed at an archived parent,
* every **config pointer** that designates an account for FUTURE postings still designated the
  archived account — `catalogs.items.default_income_account_id` / `default_expense_account_id`,
  `catalogs.account_role_bindings.account_id`, `accounting.chart_of_accounts_roles.account_id`,
  `accounting.expense_category_account_map.account_id`, `accounting.banking_rules.then_account_id`,
  `accounting.escrow_accounts.coa_account_id`, `fixed_assets.asset_classes.*`, `finance.loans.*`,
  `banking.bank_accounts.ledger_account_id`,
* **no record of the merge existed**. `catalogs.account_merge_records`, required by blueprint
  MUST 3.18.4.3 step 5, is absent from every migration on `origin/main` (`grep account_merge_record`
  → 0 hits), so nothing downstream could distinguish a merge from a plain archive.

The UI looked correct — the rows disappeared from the list — which is exactly why this needed a CI
guard rather than a review note.

## Fix

| Layer | Change |
|---|---|
| Schema | `db/migrations/202608060000_acct_r03_catalogs_account_merge_records.sql` — **HELD**. Append-only `catalogs.account_merge_records` with SAME-ENTITY composite FKs `(operating_company_id, source/target_account_id) -> catalogs.accounts (operating_company_id, id)`, `CHECK source <> target`, `CHECK char_length(reason) >= 20`, FORCE RLS `company_scope` (GUC + `identity.is_lucia_bypass()`), `GRANT SELECT, INSERT` / `REVOKE UPDATE, DELETE` from `ih35_app`. |
| Service | `apps/backend/src/catalogs/account-merge.service.ts` — declarative `CONFIG_REMOUNT_TARGETS`; every remount UPDATE is entity-scoped; writes the merge record; archives (`deactivated_at` + `is_postable=false`) the source; emits `catalogs.account_merged` (critical) and the WF-064 owner-notification `workflow.requested` event. |
| Route | `POST /api/v1/catalogs/accounts/:id/merge` — Owner-only (`E_PERMISSION_DENIED` otherwise), membership asserted, `app.operating_company_id` GUC set, whole merge inside one `withCurrentUser` transaction. |
| Frontend | `handleMerge` calls `mergeCatalogAccounts()`; modal collects the required reason, blocks a cross-type merge before submit, and states plainly that posted history stays on the merged account and that merged accounts are archived, never deleted. |
| Guard | `scripts/verify-acct-r03-coa-merge-repoint.mjs` + `scripts/verify-steps/1488-…` |

## Deliberate refusal: `migrate_historical_postings: true`

The dispatch brief asked for an opt-in flag that would re-point historical journal postings. Two
blueprint MUSTs forbid it and the more protective reading wins:

* **MUST 3.18.4.3 step 3** — "All postings on account A are kept (the journal entries remain
  unchanged for audit integrity)."
* **MUST 3.18.7.1** — "The system MUST NOT migrate historical postings to new accounts; history is
  immutable."

So the API accepts the field (the contract is honest and reviewable) and **refuses `true`** with
`E_MERGE_HISTORICAL_POSTINGS_FORBIDDEN`, listing the pointers it will never move. The UI pins the
value to `false` and never offers a checkbox, so the two cannot drift into a promise the server
breaks. Re-pointing posted history remains an owner-approved journal-entry action, not a side effect
of a chart edit.

**If the owner ever wants history migration**, it needs its own block: an owner-written decision, a
reversing/reclassifying JE design reviewed by the Financial/Accounting agent, and period-close
interaction analysis. It is not deferred silently — it is refused loudly at runtime.

## What is NOT proven yet (UNVERIFIED)

1. `catalogs.account_merge_records` on prod — the migration is HELD; the owner applies it on Neon and
   ledger-backfills, then GUARD re-proves the table, policy and grants under `app.bypass_rls='lucia'`.
2. A live merge writing a record with 0 stale pointers at the source — requires (1) plus an Owner
   browser session.

Until both land, `ACCT-R-03` stays **FAIL** in `docs/module-completion/accounting.json`.

## What IS proven locally (throwaway Postgres, 2026-07-25)

Migration **apply-twice is no longer UNVERIFIED**. Validated on a throwaway `postgres:16-alpine`
container — the same image CI uses — never on prod:

* full migration chain applies clean with `202608060000` last (`Migrations applied successfully`);
* re-executing the same SQL file under `ON_ERROR_STOP=1` produces only
  `relation ... already exists, skipping` NOTICEs — **idempotent**;
* effect asserted, not assumed: `relrowsecurity = t`, `relforcerowsecurity = t`, `company_scope`
  policy `polcmd = '*'`, both same-entity composite FKs present, and
  `has_table_privilege('ih35_app', …)` = INSERT `t` / SELECT `t` / **UPDATE `f` / DELETE `f`**
  (append-only holds at the grant level, not just in the migration text);
* behaviour asserted with a **positive control** so the refusals are not vacuous — a cross-entity
  merge record is REFUSED (`foreign_key_violation`), a self-merge is REFUSED (check), a reason under
  20 chars is REFUSED (check), and a legitimate same-entity record is **ACCEPTED**.

This proves the schema is correct and safe to apply. It does **not** prove anything about prod.
