#!/usr/bin/env node
/**
 * GUARD (LST-F09): account_role_bindings CRUD must be entity-scoped.
 *
 * Fails if the writable route still uses withCurrentUser-only (no GUC) or INSERT omits
 * operating_company_id — the USMCA launch blocker (global role_key resolution).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROUTE = "apps/backend/src/catalogs/account-role-bindings.routes.ts";
const MIG = "db/migrations/202607990000_account_role_bindings_entity_scope_finish.sql";
const LABEL = "verify-account-role-bindings-entity-scoped";

export function assertRoleBindingsEntityScoped(routeSrc, migSrc) {
  const problems = [];
  const code = routeSrc
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !/^\s*(\/\/|\*)/.test(l))
    .join("\n");

  if (!/set_config\(\s*['"]app\.operating_company_id['"]/.test(code)) {
    problems.push(`${ROUTE}: must set app.operating_company_id GUC (FORCE RLS company_scope)`);
  }
  if (!/operating_company_id_required/.test(code)) {
    problems.push(`${ROUTE}: list/get must require operating_company_id (400 if omitted)`);
  }
  if (!/INSERT INTO catalogs\.account_role_bindings\s*\([\s\S]*?operating_company_id/.test(code)) {
    problems.push(`${ROUTE}: INSERT must write operating_company_id`);
  }
  // Reject the pre-fix pattern: SELECT by role_key alone with LIMIT 1 (entity-blind).
  if (/SELECT id FROM catalogs\.account_role_bindings WHERE role_key = \$1 LIMIT 1/.test(code)) {
    problems.push(`${ROUTE}: still resolves binding by role_key alone (lowest/global hijack class)`);
  }
  if (!/FORCE ROW LEVEL SECURITY/.test(migSrc) || !/company_scope/.test(migSrc)) {
    problems.push(`${MIG}: must FORCE RLS + company_scope policy`);
  }
  if (!/REVOKE DELETE/.test(migSrc)) {
    problems.push(`${MIG}: must REVOKE DELETE from ih35_app`);
  }
  if (/91e0bf0a-133f-4ce8-a734-2586cfa66d96/.test(migSrc)) {
    problems.push(`${MIG}: hardcoded TRANSP UUID forbidden — resolve via org.companies.code`);
  }
  if (!/code\s*=\s*'TRANSP'/.test(migSrc)) {
    problems.push(`${MIG}: must resolve primary via org.companies.code='TRANSP'`);
  }
  return problems;
}

const IS_MAIN = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (IS_MAIN && process.argv.includes("--selftest")) {
  const route = fs.readFileSync(path.join(ROOT, ROUTE), "utf8");
  const mig = fs.readFileSync(path.join(ROOT, MIG), "utf8");
  const brokenRoute = route
    .replace(/set_config\(\s*['"]app\.operating_company_id['"][\s\S]*?\);/, "")
    .replace(
      /INSERT INTO catalogs\.account_role_bindings\s*\([\s\S]*?\) VALUES/,
      "INSERT INTO catalogs.account_role_bindings (role_key, account_id, description, created_by_user_id, updated_by_user_id) VALUES"
    );
  const brokenProblems = assertRoleBindingsEntityScoped(brokenRoute, mig);
  if (brokenProblems.length === 0) {
    console.error(`${LABEL} --selftest FAIL: mutated unscoped route was not flagged`);
    process.exit(1);
  }
  const good = assertRoleBindingsEntityScoped(route, mig);
  if (good.length > 0) {
    console.error(`${LABEL} --selftest FAIL: corrected source flagged:\n${good.join("\n")}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest OK`);
  process.exit(0);
}

if (IS_MAIN) {
  const route = fs.readFileSync(path.join(ROOT, ROUTE), "utf8");
  const mig = fs.readFileSync(path.join(ROOT, MIG), "utf8");
  const problems = assertRoleBindingsEntityScoped(route, mig);
  if (problems.length) {
    console.error(`${LABEL} FAIL:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — route sets GUC + writes operating_company_id; HELD migration FORCE RLS company_scope.`);
}
