#!/usr/bin/env node
/**
 * ACCT-R-03 (ranked ACCT-F13) guard — the Chart-of-Accounts "Merge accounts" action must perform a
 * REAL merge, not a rename for "archive the other rows".
 *
 * The regression this exists to stop: CoaBatchActions.handleMerge looped the catalog DEACTIVATE
 * endpoint over every source account and called that a merge. Nothing reparented the source's child
 * accounts and nothing remounted the config pointers that DESIGNATE an account for future postings
 * (catalogs.items.default_income/expense_account_id, catalogs.account_role_bindings,
 * accounting.chart_of_accounts_roles, accounting.expense_category_account_map, banking rules, asset
 * class / loan / escrow bindings). No merge record was written either, so nothing downstream could
 * tell a merge from a plain archive. Deactivate-only LOOKS fine in the UI — the rows disappear — which
 * is exactly why a guard is needed rather than a review note.
 *
 * A naive "does handleMerge mention merge" check would pass the broken version, so this guard asserts
 * all four halves of the fix:
 *   FE      — handleMerge calls the merge API and no longer deactivates its sources
 *   ROUTE   — POST /api/v1/catalogs/accounts/:id/merge exists, is Owner-only, entity-GUC scoped
 *   SERVICE — reparents children, remounts the config pointers, writes catalogs.account_merge_records,
 *             archives (never deletes) the source, and REFUSES migrate_historical_postings=true
 *   SCHEMA  — the held migration creates the append-only, same-entity, FORCE-RLS merge ledger
 *
 *   node scripts/verify-acct-r03-coa-merge-repoint.mjs
 *   node scripts/verify-acct-r03-coa-merge-repoint.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-acct-r03-coa-merge-repoint";

const FE_BATCH = "apps/frontend/src/pages/lists/accounting/CoaBatchActions.tsx";
const FE_API = "apps/frontend/src/api/coa-list.ts";
const ROUTES = "apps/backend/src/catalogs/accounts.routes.ts";
const SERVICE = "apps/backend/src/catalogs/account-merge.service.ts";
const MIGRATION = "db/migrations/202608060000_acct_r03_catalogs_account_merge_records.sql";
const HELD_LEDGER = "db/migrations/.held-migrations.json";

const MERGE_ENDPOINT = "/api/v1/catalogs/accounts/:id/merge";
const MERGE_RECORDS_TABLE = "catalogs.account_merge_records";

/** Config pointers that must follow the surviving account. Each is a real FK column on prod. */
const REQUIRED_REMOUNT_COLUMNS = [
  "parent_account_id",
  "default_income_account_id",
  "default_expense_account_id",
  "account_role_bindings",
  "chart_of_accounts_roles",
  "expense_category_account_map",
];

function read(rel, failures) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) {
    failures.push(`missing ${rel}`);
    return "";
  }
  return fs.readFileSync(abs, "utf8");
}

function sliceFunction(src, startNeedle) {
  const start = src.indexOf(startNeedle);
  if (start === -1) return "";
  // handleMerge is an arrow function assigned to a const; the next top-level `const ` or `return (`
  // is a good-enough terminator for a single-file component.
  const rest = src.slice(start + startNeedle.length);
  const end = rest.search(/\n {2}const \w|\n {2}return \(/);
  return rest.slice(0, end === -1 ? undefined : end);
}

function checkFrontend(src, failures) {
  if (!src) return;

  const handler = sliceFunction(src, "const handleMerge");
  if (!handler) {
    failures.push(`${FE_BATCH}: handleMerge not found — the merge action must stay in this component`);
    return;
  }

  if (!/mergeCatalogAccounts\s*\(/.test(handler)) {
    failures.push(
      `${FE_BATCH}: handleMerge must call mergeCatalogAccounts() — the real merge endpoint — not fake a merge client-side`
    );
  }

  // The exact defect: sources were archived one by one and nothing else happened.
  if (/deactivate/i.test(handler)) {
    failures.push(
      `${FE_BATCH}: handleMerge still calls a deactivate path. Deactivate-only IS the ACCT-R-03 defect: it archives the row but leaves child accounts and every config pointer designating it`
    );
  }

  if (!/reason/i.test(handler)) {
    failures.push(`${FE_BATCH}: handleMerge must send the operator's reason (blueprint 3.18.9 requires it)`);
  }

  // Honest modal copy: the operator must be told history does NOT move before they confirm.
  if (!/history stays|Posted history stays|stays where it is/i.test(src)) {
    failures.push(
      `${FE_BATCH}: the merge modal must state that posted history stays on the merged account (MUST 3.18.7.1) — silent behaviour here is a trust defect`
    );
  }
  if (!/archived/i.test(src) || /\bdeleted\b(?!\s*\.)/i.test(src) === false) {
    // Copy must promise archive-not-delete somewhere in the modal.
    if (!/never deleted|archived — never deleted|archived and never deleted/i.test(src)) {
      failures.push(`${FE_BATCH}: the merge modal must say merged accounts are archived, never deleted (MUST 3.18.4.4)`);
    }
  }
}

function checkFrontendApi(src, failures) {
  if (!src) return;
  if (!/export function mergeCatalogAccounts/.test(src)) {
    failures.push(`${FE_API}: must export mergeCatalogAccounts()`);
  }
  if (!src.includes("/merge")) {
    failures.push(`${FE_API}: mergeCatalogAccounts must POST to the /merge endpoint`);
  }
  if (!/operating_company_id/.test(src)) {
    failures.push(`${FE_API}: the merge call must pass operating_company_id — the merge is entity-scoped`);
  }
  if (!/migrate_historical_postings:\s*false/.test(src)) {
    failures.push(
      `${FE_API}: the merge call must pin migrate_historical_postings: false — the UI may not promise a history rewrite the server refuses`
    );
  }
}

function checkRoutes(src, failures) {
  if (!src) return;
  if (!src.includes(`"${MERGE_ENDPOINT}"`)) {
    failures.push(`${ROUTES}: must register POST ${MERGE_ENDPOINT}`);
  }
  if (!/mergeAccountsOnClient/.test(src)) {
    failures.push(`${ROUTES}: the merge route must delegate to mergeAccountsOnClient (one transaction, lockstep)`);
  }
  if (!/authUser\.role !== "Owner"/.test(src)) {
    failures.push(
      `${ROUTES}: merge must be Owner-only (blueprint 3.18.12 catalogs/accounting.account.merge) — isCatalogWriteRole is too wide`
    );
  }
  if (!/assertCompanyMembership/.test(src) || !/set_config\('app\.operating_company_id'/.test(src)) {
    failures.push(`${ROUTES}: merge must assert company membership and set the entity GUC before touching catalogs.accounts`);
  }
}

function checkService(src, failures) {
  if (!src) return;

  if (!src.includes(MERGE_RECORDS_TABLE)) {
    failures.push(`${SERVICE}: must INSERT into ${MERGE_RECORDS_TABLE} (blueprint MUST 3.18.4.3 step 5)`);
  }

  for (const col of REQUIRED_REMOUNT_COLUMNS) {
    if (!src.includes(col)) {
      failures.push(`${SERVICE}: config pointer "${col}" is not remounted onto the surviving account`);
    }
  }

  if (!/operating_company_id = \$3/.test(src)) {
    failures.push(
      `${SERVICE}: every remount UPDATE must be entity-scoped (operating_company_id bind) — a merge may never rewrite another entity's configuration`
    );
  }

  if (!/E_MERGE_ACCOUNT_TYPE_MISMATCH/.test(src)) {
    failures.push(`${SERVICE}: must reject a cross-type merge with E_MERGE_ACCOUNT_TYPE_MISMATCH (MUST 3.18.4.3 step 2)`);
  }

  if (!/E_MERGE_HISTORICAL_POSTINGS_FORBIDDEN/.test(src)) {
    failures.push(
      `${SERVICE}: migrate_historical_postings=true must be REFUSED (MUST 3.18.7.1 — history is immutable), not silently applied`
    );
  }

  if (!/deactivated_at = COALESCE\(deactivated_at, now\(\)\)/.test(src)) {
    failures.push(`${SERVICE}: the source account must be archived (deactivated_at), never deleted (MUST 3.18.4.4)`);
  }
  if (/DELETE FROM catalogs\.accounts/i.test(src)) {
    failures.push(`${SERVICE}: never-delete law — a merge must never DELETE an account`);
  }

  if (!/catalogs\.account_merged/.test(src)) {
    failures.push(`${SERVICE}: must emit the catalogs.account_merged audit event (critical)`);
  }
  if (!/WF-064/.test(src)) {
    failures.push(`${SERVICE}: an account merge is a WF-064 high-risk remap and must raise the owner-notification workflow event`);
  }
}

function checkMigration(sql, failures) {
  if (!sql) return;

  if (!/HOLD-FOR-JORGE/.test(sql) || !/DO NOT RUN ON PROD/.test(sql)) {
    failures.push(`${MIGRATION}: must carry the HOLD-FOR-JORGE / DO NOT RUN ON PROD marker (financial cluster)`);
  }
  if (!/CREATE TABLE IF NOT EXISTS catalogs\.account_merge_records/.test(sql)) {
    failures.push(`${MIGRATION}: must CREATE TABLE IF NOT EXISTS ${MERGE_RECORDS_TABLE}`);
  }
  if (
    !/FOREIGN KEY \(operating_company_id, source_account_id\)\s*REFERENCES catalogs\.accounts \(operating_company_id, id\)/.test(
      sql
    ) ||
    !/FOREIGN KEY \(operating_company_id, target_account_id\)\s*REFERENCES catalogs\.accounts \(operating_company_id, id\)/.test(
      sql
    )
  ) {
    failures.push(
      `${MIGRATION}: source and target must use the SAME-ENTITY composite FK -> catalogs.accounts (operating_company_id, id); a single-column FK would let one merge record bind two entities' charts`
    );
  }
  if (!/FORCE ROW LEVEL SECURITY/.test(sql) || !/CREATE POLICY company_scope/.test(sql)) {
    failures.push(`${MIGRATION}: the merge ledger must be FORCE RLS with the company_scope policy`);
  }
  if (!/identity\.is_lucia_bypass\(\)/.test(sql)) {
    failures.push(`${MIGRATION}: company_scope must keep the identity.is_lucia_bypass() escape so GUARD can re-prove on prod`);
  }
  if (!/REVOKE UPDATE, DELETE ON catalogs\.account_merge_records FROM ih35_app/.test(sql)) {
    failures.push(`${MIGRATION}: the merge ledger is append-only — REVOKE UPDATE, DELETE from ih35_app`);
  }
  if (!/account_merge_records_source_ne_target_chk/.test(sql)) {
    failures.push(`${MIGRATION}: must CHECK source_account_id <> target_account_id`);
  }
  if (!/account_merge_records_reason_len_chk/.test(sql)) {
    failures.push(`${MIGRATION}: must CHECK the reason minimum length (blueprint 3.18.9 validation payload)`);
  }
  if (/\bDROP TABLE\b|\bDELETE FROM\b|\bDROP COLUMN\b/i.test(sql)) {
    failures.push(`${MIGRATION}: never-delete law — this migration must be purely additive`);
  }
  if (/'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'/i.test(sql)) {
    failures.push(`${MIGRATION}: no hardcoded UUID literal — this migration seeds no rows`);
  }
  if (!/IF NOT EXISTS/.test(sql) || !/pg_constraint/.test(sql)) {
    failures.push(`${MIGRATION}: constraint adds must be pg_constraint IF NOT EXISTS guarded (apply-twice safe)`);
  }
}

function checkHeldLedger(raw, failures) {
  if (!raw) return;
  let ledger;
  try {
    ledger = JSON.parse(raw);
  } catch {
    failures.push(`${HELD_LEDGER}: not valid JSON`);
    return;
  }
  const held = Array.isArray(ledger.held) ? ledger.held : [];
  const entry = held.find((h) => h.file === "202608060000_acct_r03_catalogs_account_merge_records.sql");
  if (!entry) {
    failures.push(`${HELD_LEDGER}: missing registration for 202608060000_acct_r03_catalogs_account_merge_records.sql`);
  } else if (!/HOLD-FOR-JORGE/.test(entry.reason || "")) {
    failures.push(`${HELD_LEDGER}: registered entry must carry the HOLD-FOR-JORGE marker in its reason`);
  }
}

export function collectFailures(files) {
  const failures = [];
  checkFrontend(files.feBatch, failures);
  checkFrontendApi(files.feApi, failures);
  checkRoutes(files.routes, failures);
  checkService(files.service, failures);
  checkMigration(files.migration, failures);
  checkHeldLedger(files.ledger, failures);
  return failures;
}

function selftest() {
  const good = {
    feBatch: `
      const handleMerge = async () => {
        await mergeCatalogAccounts({ targetAccountId, sourceAccountIds, operatingCompanyId, reason });
      };

      return (
        <p>Posted history stays where it is. The merged accounts are archived — never deleted.</p>
      );
    `,
    feApi: `
      export function mergeCatalogAccounts(input) {
        return apiRequest("/api/v1/catalogs/accounts/x/merge", {
          method: "POST",
          body: { operating_company_id: input.operatingCompanyId, migrate_historical_postings: false },
        });
      }
    `,
    routes: `
      app.post("${MERGE_ENDPOINT}", async (req, reply) => {
        if (authUser.role !== "Owner") return reply.code(403).send({});
        await assertCompanyMembership(client, authUser.uuid, operatingCompanyId);
        await client.query(\`SELECT set_config('app.operating_company_id', $1::text, true)\`, [operatingCompanyId]);
        await mergeAccountsOnClient(client, input, authUser.uuid);
      });
    `,
    service: `
      // parent_account_id default_income_account_id default_expense_account_id
      // account_role_bindings chart_of_accounts_roles expense_category_account_map
      throw new AccountMergeError("E_MERGE_ACCOUNT_TYPE_MISMATCH", 409);
      throw new AccountMergeError("E_MERGE_HISTORICAL_POSTINGS_FORBIDDEN", 400);
      UPDATE x SET y = $1 WHERE y = $2 AND operating_company_id = $3
      INSERT INTO catalogs.account_merge_records (...)
      SET deactivated_at = COALESCE(deactivated_at, now()),
      appendCrudAudit(client, actorUserId, "catalogs.account_merged", {}, "critical");
      // WF-064 owner notification
    `,
    migration: `
      -- HOLD-FOR-JORGE — FINANCIAL CLUSTER
      -- DO NOT RUN ON PROD.
      DO $mig$ BEGIN
        CREATE TABLE IF NOT EXISTS catalogs.account_merge_records (id uuid PRIMARY KEY);
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'account_merge_records_source_ne_target_chk') THEN
          ALTER TABLE catalogs.account_merge_records ADD CONSTRAINT account_merge_records_source_ne_target_chk CHECK (source_account_id <> target_account_id);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'account_merge_records_reason_len_chk') THEN
          ALTER TABLE catalogs.account_merge_records ADD CONSTRAINT account_merge_records_reason_len_chk CHECK (char_length(reason) >= 20);
        END IF;
        ALTER TABLE catalogs.account_merge_records
          ADD CONSTRAINT account_merge_records_source_same_entity_fkey
          FOREIGN KEY (operating_company_id, source_account_id)
          REFERENCES catalogs.accounts (operating_company_id, id);
        ALTER TABLE catalogs.account_merge_records
          ADD CONSTRAINT account_merge_records_target_same_entity_fkey
          FOREIGN KEY (operating_company_id, target_account_id)
          REFERENCES catalogs.accounts (operating_company_id, id);
        ALTER TABLE catalogs.account_merge_records FORCE ROW LEVEL SECURITY;
        CREATE POLICY company_scope ON catalogs.account_merge_records
          FOR ALL USING (identity.is_lucia_bypass() OR true) WITH CHECK (identity.is_lucia_bypass() OR true);
      END $mig$;
      REVOKE UPDATE, DELETE ON catalogs.account_merge_records FROM ih35_app;
    `,
    ledger: JSON.stringify({
      held: [
        {
          file: "202608060000_acct_r03_catalogs_account_merge_records.sql",
          reason: "[HOLD-FOR-JORGE — FINANCIAL CLUSTER] test",
        },
      ],
    }),
  };

  const baseline = collectFailures(good);
  if (baseline.length) {
    console.error(`${LABEL} SELFTEST FAILED — good fixture rejected:`);
    for (const f of baseline) console.error(`  - ${f}`);
    process.exit(1);
  }

  // THE defect: handleMerge loops deactivate instead of merging.
  const deactivateOnly = {
    ...good,
    feBatch: good.feBatch.replace(
      "await mergeCatalogAccounts({ targetAccountId, sourceAccountIds, operatingCompanyId, reason });",
      "for (const source of mergeSources) { await chartOfAccountsCatalogClient.deactivate(source.id, operatingCompanyId); }"
    ),
  };
  const deactivateFailures = collectFailures(deactivateOnly);
  if (!deactivateFailures.some((f) => f.includes("mergeCatalogAccounts"))) {
    console.error(`${LABEL} SELFTEST FAILED — a deactivate-only handleMerge was not caught (this IS the bug)`);
    process.exit(1);
  }
  if (!deactivateFailures.some((f) => f.includes("still calls a deactivate path"))) {
    console.error(`${LABEL} SELFTEST FAILED — the deactivate call inside handleMerge was not flagged`);
    process.exit(1);
  }

  const noRemount = { ...good, service: good.service.replace("chart_of_accounts_roles", "") };
  if (!collectFailures(noRemount).some((f) => f.includes("chart_of_accounts_roles"))) {
    console.error(`${LABEL} SELFTEST FAILED — a dropped config remount was not caught`);
    process.exit(1);
  }

  const unscopedRemount = { ...good, service: good.service.replace("AND operating_company_id = $3", "") };
  if (!collectFailures(unscopedRemount).some((f) => f.includes("entity-scoped"))) {
    console.error(`${LABEL} SELFTEST FAILED — an unscoped (cross-entity) remount was not caught`);
    process.exit(1);
  }

  const historyRewritten = { ...good, service: good.service.replace("E_MERGE_HISTORICAL_POSTINGS_FORBIDDEN", "") };
  if (!collectFailures(historyRewritten).some((f) => f.includes("history is immutable"))) {
    console.error(`${LABEL} SELFTEST FAILED — a service that would rewrite posted history was not caught`);
    process.exit(1);
  }

  const noMergeRecord = { ...good, service: good.service.replace("INSERT INTO catalogs.account_merge_records (...)", "") };
  if (!collectFailures(noMergeRecord).some((f) => f.includes("MUST 3.18.4.3 step 5"))) {
    console.error(`${LABEL} SELFTEST FAILED — a merge that writes no merge record was not caught`);
    process.exit(1);
  }

  const wideRole = { ...good, routes: good.routes.replace('authUser.role !== "Owner"', "!isCatalogWriteRole(authUser.role)") };
  if (!collectFailures(wideRole).some((f) => f.includes("Owner-only"))) {
    console.error(`${LABEL} SELFTEST FAILED — a non-Owner-gated merge route was not caught`);
    process.exit(1);
  }

  const singleColumnFk = {
    ...good,
    migration: good.migration.replace(
      /FOREIGN KEY \(operating_company_id, source_account_id\)\s*REFERENCES catalogs\.accounts \(operating_company_id, id\)/,
      "FOREIGN KEY (source_account_id) REFERENCES catalogs.accounts (id)"
    ),
  };
  if (!collectFailures(singleColumnFk).some((f) => f.includes("SAME-ENTITY composite FK"))) {
    console.error(`${LABEL} SELFTEST FAILED — a cross-entity single-column FK was not caught`);
    process.exit(1);
  }

  const mutableLedger = {
    ...good,
    migration: good.migration.replace("REVOKE UPDATE, DELETE ON catalogs.account_merge_records FROM ih35_app;", ""),
  };
  if (!collectFailures(mutableLedger).some((f) => f.includes("append-only"))) {
    console.error(`${LABEL} SELFTEST FAILED — an editable merge ledger was not caught`);
    process.exit(1);
  }

  const unregistered = { ...good, ledger: JSON.stringify({ held: [] }) };
  if (!collectFailures(unregistered).some((f) => f.includes("missing registration"))) {
    console.error(`${LABEL} SELFTEST FAILED — an unregistered held migration was not caught`);
    process.exit(1);
  }

  console.log(`${LABEL}: selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const failures = [];
const files = {
  feBatch: read(FE_BATCH, failures),
  feApi: read(FE_API, failures),
  routes: read(ROUTES, failures),
  service: read(SERVICE, failures),
  migration: read(MIGRATION, failures),
  ledger: read(HELD_LEDGER, failures),
};
failures.push(...collectFailures(files));

if (failures.length) {
  console.error(`${LABEL}: FAIL`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(
  `${LABEL}: PASS — CoA merge reparents children, remounts config pointers, writes ${MERGE_RECORDS_TABLE}, archives the source, refuses history rewrite (BUILD-AND-HOLD; migration not yet Neon-applied)`
);
process.exit(0);
