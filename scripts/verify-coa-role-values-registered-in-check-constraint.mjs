#!/usr/bin/env node
/**
 * verify-coa-role-values-registered-in-check-constraint.mjs
 *
 * Found live 2026-09-04 while wiring the fuel-advance COA role: 'detention_pay_expense' was already
 * a first-class CoaRole in resolver.service.ts's COA_ROLE_VALUES union (since DWELL-01-D3,
 * 2026-08-30) but was never added to the live DB CHECK constraint that gates INSERTs into
 * accounting.chart_of_accounts_roles -- designating it on the CoaRoles page would fail the INSERT
 * with a constraint violation even though the TypeScript type accepts it as valid. The exact same
 * gap ND-INV-01's 'broker_customer_advance_liability' role had before 202612811700 reconciled it.
 *
 * This guard prevents that class of drift recurring: every value in COA_ROLE_VALUES must appear in
 * the role IN (...) list of the highest-numbered db/migrations/*.sql file that widens
 * chart_of_accounts_roles_role_check (each widen migration is a cumulative superset of every prior
 * one, per 202612811700's own documented convention, so the latest one is authoritative).
 *
 * Source-level regression lock -- no DB connection required, static on purpose so it runs everywhere
 * (local, CI, no DATABASE_URL needed).
 */
import fs from "node:fs";
import path from "node:path";

const RESOLVER_PATH = "apps/backend/src/accounting/coa-roles/resolver.service.ts";
const MIGRATIONS_DIR = "db/migrations";

function extractRoleValues(resolverSrc) {
  const match = resolverSrc.match(/export const COA_ROLE_VALUES = \[([\s\S]*?)\] as const;/);
  if (!match) return null;
  const body = match[1];
  const values = [...body.matchAll(/"([a-z0-9_]+)"/g)].map((m) => m[1]);
  return values;
}

function latestCheckMigration(migrationsDir) {
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => /^\d+_.*\.sql$/.test(f))
    .filter((f) => {
      const src = fs.readFileSync(path.join(migrationsDir, f), "utf8");
      return src.includes("chart_of_accounts_roles_role_check") && /ADD CONSTRAINT/i.test(src);
    })
    .sort((a, b) => Number(a.match(/^\d+/)[0]) - Number(b.match(/^\d+/)[0]));
  return files.length ? files[files.length - 1] : null;
}

function extractCheckValues(migrationSrc) {
  const match = migrationSrc.match(/CHECK \(role IN \(([\s\S]*?)\)\)/);
  if (!match) return null;
  const values = [...match[1].matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]);
  return values;
}

function violations(resolverSrc, migrationsDir) {
  const errors = [];
  const roleValues = extractRoleValues(resolverSrc);
  if (!roleValues || roleValues.length === 0) {
    errors.push("could not extract COA_ROLE_VALUES from resolver.service.ts -- source shape drifted");
    return errors;
  }
  const latest = latestCheckMigration(migrationsDir);
  if (!latest) {
    errors.push("no db/migrations/*.sql file widens chart_of_accounts_roles_role_check -- source shape drifted");
    return errors;
  }
  const checkSrc = fs.readFileSync(path.join(migrationsDir, latest), "utf8");
  const checkValues = extractCheckValues(checkSrc);
  if (!checkValues || checkValues.length === 0) {
    errors.push(`could not extract role IN (...) list from ${latest} -- source shape drifted`);
    return errors;
  }
  const checkSet = new Set(checkValues);
  const missing = roleValues.filter((r) => !checkSet.has(r));
  if (missing.length > 0) {
    errors.push(
      `${missing.length} CoaRole value(s) in resolver.service.ts's COA_ROLE_VALUES are NOT in the live DB CHECK constraint (${latest}): ${missing.join(", ")} -- designating any of these on the CoaRoles page would fail the INSERT`
    );
  }
  return errors;
}

function check(resolverSrc, migrationsDir) {
  const errors = violations(resolverSrc, migrationsDir);
  if (errors.length) throw new Error(errors.join("; "));
}

const resolverSrc = fs.readFileSync(RESOLVER_PATH, "utf8");

if (process.argv.includes("--selftest")) {
  let caught = 0;
  const mutations = [
    resolverSrc.replace('"company_fuel_advance_expense",\n] as const;', '"never_registered_role",\n] as const;'),
  ];
  for (const [index, mutatedResolver] of mutations.entries()) {
    try { check(mutatedResolver, MIGRATIONS_DIR); }
    catch { caught += 1; continue; }
    throw new Error(`mutation ${index + 1} escaped detection`);
  }
  // Structural: an empty/malformed migrations dir must fail closed, not vacuously pass.
  try {
    check(resolverSrc, "scripts");
    throw new Error("empty-migrations-dir mutation escaped detection");
  } catch (err) {
    if (!(err instanceof Error) || !err.message.includes("chart_of_accounts_roles_role_check")) throw err;
    caught += 1;
  }
  check(resolverSrc, MIGRATIONS_DIR);
  console.log(`PASS verify-coa-role-values-registered-in-check-constraint --selftest (${caught}/${mutations.length + 1})`);
} else {
  check(resolverSrc, MIGRATIONS_DIR);
  console.log("PASS verify-coa-role-values-registered-in-check-constraint (every CoaRole is registered in the live DB CHECK constraint)");
}
