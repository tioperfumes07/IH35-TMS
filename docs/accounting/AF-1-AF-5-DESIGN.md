# AF-1 + AF-5 — Design & Verification Record

**Status:** AF-1 already built + merged (verified, unchanged). AF-5 new build this pass: one HELD
migration + supporting code. **Both are financial cluster (`catalogs.*`) — neither is self-merged.**
Constitution §1.4/§1.3 applies: STOP for Jorge's explicit "OK to merge" before either lands, and the
`.held-migrations.json` DO-NOT-RUN ceremony (Neon-branch run by Jorge/GUARD → ledger-backfill →
only then can the PR merge) governs both migration files.

---

## AF-1 — Entity-scope the Chart of Accounts (`catalogs.accounts`)

### Verified current state (2026-07-06 re-check)

AF-1 is **already fully built and merged to `main`** — PR #1528
(`chore/af1-entity-coa-migration-hold`, merged 2026-06-26), migration
`db/migrations/202606272100_af1_catalogs_accounts_per_entity.sql`. It is on the HELD ledger
(`db/migrations/.held-migrations.json`) — merged to `main` but **never fired against prod**; the
held-migration-ledger guard (`verify-hold-migrations-registered`, PR #1897) makes `db:migrate` skip
any file listed there until Jorge runs it on a Neon branch and backfills the ledger. Downstream AF-2/
AF-2b/AF-2c/AF-3 (items, item→account mapping, classes — all per-entity) plus the cross-entity-leak
fixes for qbo-sync/fuel-posting were built and merged on top of this same HELD-but-unrun migration,
because AF-1 itself is pure schema/DDL — it does not require any application code change to be safe to
merge (existing code already tolerates a nullable `operating_company_id`).

**No re-build needed.** Re-authoring or editing this file would violate the "never edit an
already-applied/merged migration" rule — any further AF-1 change is a follow-up migration, not an edit.

### What it does (summary — full SQL is the migration file itself)

`catalogs.accounts` today is **global**: `operating_company_id` exists but is nullable, and two GLOBAL
uniques (`account_number`, `qbo_account_id`) span all three entities. That means TRK/TRANSP/USMCA data
is not truly isolated — a violation of the Complete Entity Independence mandate. The migration:

1. Resolves `TRANSP` / `TRK` / `USMCA` **by `org.companies.code`** (never hardcoded UUIDs — the fresh-CI
   DB seeds different ids than prod).
2. Builds an ownership map from the two existing per-entity binding tables
   (`accounting.chart_of_accounts_roles`, `accounting.expense_category_account_map`), falling back to
   `account_number` prefix (`TRK%`/`USMCA%`), defaulting unmapped rows to `TRANSP`.
3. **Splits** any account owned by more than one entity: the primary owner keeps the original row id;
   every additional owner gets a **new row** (same account_number/name/type), so no entity ever shares a
   physical `catalogs.accounts` row with another.
4. Swaps the two GLOBAL uniques for **per-entity composite uniques**:
   `(operating_company_id, account_number)` / `(operating_company_id, qbo_account_id)`.
5. **Re-keys 26 known FK columns** across 20 tables (`journal_entry_postings`, `bill_lines`,
   `invoice_lines`, `expense_lines`, `escrow_accounts`, `fixed_assets.*`, `finance.loans`, banking
   conditionals, etc.) so each child row points at **its own entity's** copy of the account.
6. Heals config bindings orphaned by a single-owner override (documented Q1: the generic `6999`
   Uncategorized Expenses account is TRANSP's, not TRK's) by re-pointing to the same-entity equivalent
   account (by number, or `<CODE>-<number>`), then **fails loud** (`RAISE EXCEPTION`) if any cross-entity
   binding survives — this can never regress silently.
7. Sets `operating_company_id NOT NULL`, converts to **FORCE ROW LEVEL SECURITY** with entity-scoped
   `USING (... operating_company_id::text = current_setting('app.operating_company_id', true))`
   policies (dropping the old role-only policies that would otherwise OR-override the new filter), and
   re-grants `ih35_app`.

Two catalog-config tables (`catalogs.items`, `catalogs.posting_templates`, `catalogs.account_role_bindings`)
have **no entity column of their own** today; their account FKs are re-keyed to the **TRANSP** copy by
default (documented as Q2, flagged not silently resolved — TRANSP is the only QBO-posting entity today).
If those catalogs need to become per-entity too, that is tracked as a separate, later decision.

**Posts nothing.** No GL math, no balances touched — pure schema/ownership restructuring.

### Path to prod

Unchanged from the original PR: Jorge/GUARD runs the file on a Neon branch, executes the V1–V5
validation SQL in the PR body (cross-entity binding count = 0, etc.), then backfills the ledger so
`db:migrate` no longer skips it. Until then, `catalogs.accounts` stays global-with-nullable-column in
prod and the app continues to work unchanged (the migration was written to be safe either way).

---

## AF-5 — Stub-catalog closeout

### Audit method

The task named two examples ("expense categories, account subtypes") as illustrative stub-catalog
targets. Before writing any migration, every catalog tile in the live `AllCatalogsMap`
(`apps/frontend/src/pages/lists/components/AllCatalogsMap.tsx`) was cross-checked against
`db/migrations/` and the existing `docs/recon/stub-inventory-2026-06-24.md` recon (a READ-ONLY pass
that already re-verified all 61 tiles column-by-column, superseding an earlier stale "~34 stub
catalogs" estimate).

### Findings — both named examples are ALREADY REAL (no action needed)

| Example named in task | Status | Where |
|---|---|---|
| Expense categories | **REAL**, per-entity | `catalogs.expense_categories` — migration `0152_p6_t11187_lists_hub_accounting_catalog_completion.sql`; routes `apps/backend/src/catalogs/accounting/index.ts` (`createCompanyScopedCatalogRoutes`) |
| Account subtypes | **REAL**, per-entity + global canonical | `catalogs.account_types` (global, 15 QBO types) + `catalogs.detail_types` (per-entity custom + canonical system rows) — migrations `202606080010_account_type_detail_type_catalog.sql` + `202607011700_detail_types_per_entity_custom.sql`; routes `account-type-catalog.routes.ts` / `detail-types-catalog.routes.ts`. Per the locked decision in memory `coa-detail-type-is-account-subtype`, `catalogs.accounts.account_subtype` stays free-text (no FK) — this catalog exists to **back a picker**, not to enforce a foreign key, and that remains unchanged here. |

### The one true remaining stub — Journal Entry Types (FIXED this pass)

`apps/backend/src/catalogs/accounting/factory.ts` (`registerJournalEntryTypesReadOnlyRoutes`, formerly
lines 512–583) served a **hardcoded in-file 3-row array** with synthetic fixed UUIDs
(`11111111-1111-4111-8111-111111111111`, etc.) and epoch timestamps — a real `SILENT-STUB` per the
recon. Writes already correctly 405'd ("catalog_read_only"), matching the READ-ONLY-LIST class already
used for Posting Templates / Account Role Bindings (real table, GET-only by design).

**Built this pass:**

- **Migration** `db/migrations/202607120000_af5_journal_entry_types_catalog.sql` (HELD, DO-NOT-RUN
  marker, registered in `.held-migrations.json`) creates `catalogs.journal_entry_types` as a **global**
  reference taxonomy (no `operating_company_id` — same shape as `catalogs.account_types` /
  `catalogs.posting_templates`, because a JE source/purpose label is a shared taxonomy every entity
  reads identically, not an entity-owned business record). FORCE RLS, open `SELECT`/write policy
  (matches the `reference.*` schema convention, migration `0340`) — the real write control is the
  API-layer `readOnly: true` (405 on POST/PATCH/DELETE). **No DELETE grant** (void-not-delete via
  `is_active`). Seeded with 16 QBO-parity + TMS-specific JE types (the original `GENERAL` /
  `SALES_INVOICE` / `PAYMENT_RECEIPT` codes are preserved verbatim so no existing consumer of those
  values breaks).
- **Backend**: `registerJournalEntryTypesReadOnlyRoutes` now delegates to the existing generic
  `registerLegacyAccountingCatalogRoutes({ readOnly: true, tableName: "journal_entry_types", ... })`
  factory (same one used for Posting Templates / Account Role Bindings) — **no new posting/GL code**,
  reuses existing infra. Same URL (`/api/v1/catalogs/accounting/journal-entry-types`), same exported
  function name, so the call site (`apps/backend/src/catalogs/accounting/index.ts`) is unchanged.
- **CI guard** `scripts/verify-journal-entry-types-real.mjs` (wired into `verify:arch-design`) locks
  the fix: fails if the hardcoded-array pattern ever comes back, if the HELD migration/marker/ledger
  entry goes missing, or if DELETE is ever granted on the table.
- `scripts/canonical-relations.json` + `docs/schema-parity-baseline.json` regenerated
  (`verify-schema-parity.mjs --update`) so the new table is tracked, not flagged as phantom.

**No FK exists anywhere from a posting/GL table into this catalog** (verified via
`grep -rl "journal_entry_type" db/migrations/`) — it is purely descriptive metadata for the JE-type
picker; adding a real FK later is a separate, explicit decision if a screen needs one.

**Validated locally** (never on prod, per §1.5): a throwaway Postgres 16 database
(`docker exec` against the existing `verify` container), migration applied twice — second run is a
clean no-op (`INSERT 0 0`), all DDL idempotent. Confirmed: 16 rows seeded, FORCE RLS on, grants
`SELECT/INSERT/UPDATE` present and `DELETE` absent for `ih35_app`.

### Explicitly out of scope this pass (flagged, not silently resolved)

Four `names_master` tiles are marked `live:false` ("In preparation") in `AllCatalogsMap.tsx`: **Shippers,
Consignees, Lenders, Insurance Carriers**. The 2026-06-24 recon classifies these as `IN-PREP` — an
honest, explicit "not built yet" marker, not a faked stub. They are **not** simple reference/lookup
catalogs like Journal Entry Types or Expense Categories: they would be canonical-naming/dedup registries
against free-text fields (load-stop shipper/consignee names, vendor/lender names, insurance carrier
directory) with their own data-model questions (dedup key, backfill source from existing free text,
merge/alias workflow) that were not part of this task's named examples. Recommend a dedicated
design-first block if/when prioritized; not built here to avoid a rushed, half-specified data model on
a financial-adjacent catalog. Tracked in `docs/trackers/DEFERRED-ITEMS.md`-style backlog via this doc.

---

## Verification performed (both AF-1 confirmation + AF-5 build)

- `cd apps/backend && npx tsc -b --pretty false` — clean.
- `npx vitest run src/catalogs/accounting/factory.entity-scope.test.ts src/catalogs/accounting/__tests__/detail-types-catalog.routes.test.ts` — 10/10 pass.
- `node scripts/verify-journal-entry-types-real.mjs` — OK.
- `node scripts/verify-hold-migrations-registered.mjs` — OK, 33 held migrations, all registered + marker-intact.
- `node scripts/verify-schema-parity.mjs` — OK, 544 tables / 8354 columns tracked (post `--update`).
- `npm run verify:referenced-tables-exist` / `verify:migration-chain-runbook` / `verify:startup-migration-drift-guard` / `verify:no-unledgered-migrations` / `lint:fastify-routes` — all OK.
- Local Postgres migration idempotency check (twice-applied, second run a clean no-op) — see above.
- **Not done (correctly gated):** no connection to Neon/prod (§1.5); no migration run against prod; no
  merge of either PR (§1.3/§1.4 — both are financial cluster, STOP for Jorge).
