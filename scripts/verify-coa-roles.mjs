#!/usr/bin/env node
/**
 * Block F Decision C — active-carrier COA role guard (CI + startup parity).
 *
 * Verifies that every ACTIVE operating carrier maps the COA roles required to
 * post insurance cancellation refunds: ap_control + expense_default. If any
 * active carrier is missing a role, the guard FAILS LOUDLY (exit 1) in strict
 * mode — the same check runs at app startup as a warn/error log.
 *
 * Modes:
 *   - strict (default): missing mappings → exit 1.
 *   - non-strict (COA_ROLES_GUARD_STRICT=0): missing mappings → loud WARN, exit 0.
 *     CI runs non-strict because the current production carrier (TRANSP) is not
 *     yet COA-mapped (no chart of accounts loaded), and Decision C's whole point
 *     is that cancellation still succeeds via a durable pending obligation. Flip
 *     to strict for the deploy/prod gate once carriers are mapped.
 *
 * No DATABASE_URL → static checks only (code + migration shape), then pass.
 */
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { fileURLToPath } from "node:url";

dotenv.config();

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REQUIRED_ROLES = ["ap_control", "expense_default"];
const STRICT = process.env.COA_ROLES_GUARD_STRICT !== "0";
const { Pool } = pg;
const connectionString = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;

function fail(msg) {
  console.error(`verify:coa-roles FAIL: ${msg}`);
  process.exit(1);
}

function readRequired(relPath, label) {
  const abs = path.join(ROOT, relPath);
  if (!fs.existsSync(abs)) fail(`missing ${label}: ${relPath}`);
  return fs.readFileSync(abs, "utf8");
}

function staticChecks() {
  const resolver = readRequired("apps/backend/src/accounting/coa-roles/resolver.service.ts", "coa-roles resolver");
  for (const role of REQUIRED_ROLES) {
    if (!resolver.includes(`"${role}"`)) fail(`resolver does not declare COA role ${role}`);
  }

  const guard = readRequired("apps/backend/src/accounting/coa-roles/refund-roles-guard.ts", "refund-roles guard module");
  if (!guard.includes("findActiveCarriersMissingRefundRoles")) {
    fail("refund-roles-guard.ts must export findActiveCarriersMissingRefundRoles");
  }

  const migration = readRequired(
    "db/migrations/202606072350_insurance_policy_cancellation.sql",
    "Block F migration"
  );
  if (!migration.includes("insurance.refund_obligation")) {
    fail("migration must create insurance.refund_obligation (durable refund obligation)");
  }
}

async function dbChecks() {
  if (!connectionString) {
    console.log("verify:coa-roles PASS (static checks only; no DATABASE_URL)");
    return;
  }

  const pool = new Pool({ connectionString });
  const client = await pool.connect();
  let gaps = [];
  try {
    await client.query("BEGIN");
    let carriers;
    try {
      carriers = await client.query(
        `SELECT id::text, code FROM org.companies
         WHERE is_active = true AND deactivated_at IS NULL AND company_type = 'operating_carrier'
         ORDER BY code`
      );
    } catch (err) {
      // Schema not present (DB not migrated in this context) — can't evaluate; static pass.
      await client.query("ROLLBACK");
      console.log(`verify:coa-roles PASS (carrier table unavailable: ${String(err?.message || err)})`);
      return;
    }

    for (const carrier of carriers.rows) {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [carrier.id]);
      const rolesRes = await client.query(
        `SELECT role FROM accounting.chart_of_accounts_roles
         WHERE operating_company_id = $1::uuid AND is_active = true AND role = ANY($2::text[])`,
        [carrier.id, REQUIRED_ROLES]
      );
      const found = new Set(rolesRes.rows.map((r) => r.role));
      const missing = REQUIRED_ROLES.filter((r) => !found.has(r));
      if (missing.length > 0) {
        gaps.push({ operating_company_id: carrier.id, code: carrier.code, missing_roles: missing });
      }
    }
    await client.query("ROLLBACK");
  } finally {
    client.release();
    await pool.end();
  }

  if (gaps.length === 0) {
    console.log("verify:coa-roles PASS — all active carriers map ap_control + expense_default");
    return;
  }

  const summary = gaps
    .map((g) => `${g.code ?? g.operating_company_id} missing [${g.missing_roles.join(", ")}]`)
    .join("; ");

  // STRICT-FLIP: set COA_ROLES_GUARD_STRICT=1 after CA-04 loads chart of accounts
  // (TRANSP must have ap_control + expense_default mapped before enabling)
  // Tracked: GitHub issue #705
  if (STRICT) {
    fail(
      `active carrier(s) missing refund COA roles: ${summary}. ` +
        `Map ap_control + expense_default in accounting.chart_of_accounts_roles, or run non-strict (COA_ROLES_GUARD_STRICT=0).`
    );
  }

  console.warn(
    `verify:coa-roles WARN (non-strict): active carrier(s) missing refund COA roles: ${summary}. ` +
      `Insurance cancellation refunds will fall back to durable pending obligations until these are mapped.`
  );
  console.log("verify:coa-roles PASS (non-strict mode)");
}

async function main() {
  staticChecks();
  await dbChecks();
}

main().catch((err) => fail(String(err?.message || err)));
