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
export const ALLOW_OFFLINE_SKIP =
  "static source scan; never connects to a database, so there is nothing to skip (E7 batch 2)";

const RESOLVER_PATH = "apps/backend/src/accounting/coa-roles/resolver.service.ts";
const MIGRATIONS_DIR = "db/migrations";

function extractRoleValues(resolverSrc) {
  const match = resolverSrc.match(/export const COA_ROLE_VALUES = \[([\s\S]*?)\] as const;/);
  if (!match) return null;
  const body = match[1];
  const values = [...body.matchAll(/"([a-z0-9_]+)"/g)].map((m) => m[1]);
  return values;
}

/** Held migrations never run on prod (db-migrate HELD-SKIP), so they cannot have widened the live CHECK. */
function heldMigrations(migrationsDir) {
  const p = path.join(migrationsDir, ".held-migrations.json");
  if (!fs.existsSync(p)) return new Set();
  return new Set((JSON.parse(fs.readFileSync(p, "utf8")).held ?? []).map((h) => h.file));
}

function checkMigrations(migrationsDir) {
  const held = heldMigrations(migrationsDir);
  return fs
    .readdirSync(migrationsDir)
    .filter((f) => /^\d+_.*\.sql$/.test(f))
    .filter((f) => !held.has(f))
    .filter((f) => {
      const src = fs.readFileSync(path.join(migrationsDir, f), "utf8");
      return src.includes("chart_of_accounts_roles_role_check") && /ADD CONSTRAINT/i.test(src);
    })
    .sort((a, b) => Number(a.match(/^\d+/)[0]) - Number(b.match(/^\d+/)[0]));
}

function extractCheckValues(migrationSrc) {
  // Two literal shapes, both full supersets: `CHECK (role IN ('a', …))` and `CHECK (role = ANY (ARRAY['a', …]))`.
  const match = migrationSrc.match(/CHECK \(role IN \(([\s\S]*?)\)\)/) ?? migrationSrc.match(/CHECK \(role = ANY \(ARRAY\[([\s\S]*?)\]/);
  if (!match) return null;
  const values = [...match[1].matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]);
  return values;
}

/**
 * The CHECK as the migrations leave it, read cumulatively. Two shapes widen it:
 *  - a LITERAL list (`CHECK (role IN ('a', 'b', …))`) — a full superset, so it resets the set;
 *  - a DYNAMIC rebuild (202615280600, 202615330600, …) that reads the live constraint and appends
 *    (`roles || ARRAY['x']`) — it adds only its own roles, so they are unioned onto the latest literal list.
 * The literal-only reader this replaces could not see the dynamic shape and crashed from 202615280600 on.
 */
function cumulativeCheckValues(migrationsDir) {
  const files = checkMigrations(migrationsDir);
  if (!files.length) return { files, values: null, latestLiteral: null };
  let values = null;
  let latestLiteral = null;
  for (const f of files) {
    const src = fs.readFileSync(path.join(migrationsDir, f), "utf8");
    const literal = extractCheckValues(src);
    if (literal && literal.length) {
      values = new Set(literal);
      latestLiteral = f;
      continue;
    }
    const added = [...src.matchAll(/roles\s*\|\|\s*ARRAY\[([^\]]*)\]/g)].flatMap((m) => [...m[1].matchAll(/'([a-z0-9_]+)'/g)].map((x) => x[1]));
    if (added.length && values) for (const r of added) values.add(r);
  }
  return { files, values, latestLiteral };
}

/**
 * NAMED DEBT — shrink-only, committed (ROUND 352 point 9). Each entry is a CoaRole the code already offers that the live
 * CHECK does not yet allow, with the reason. A NEW unregistered role fails; an entry here that becomes registered also
 * fails until it is removed from this list (so the list can only shrink).
 */
const KNOWN_UNREGISTERED = new Map([
  ["rou_asset", "lease ASC 842 — added only by HELD migration 202615210000_lease_to_own_lessee_asc842 (never runs on prod); board LEASE-ROLES-AHEAD-OF-HELD-MIGRATION-2026100301"],
  ["lease_liability", "lease ASC 842 — same held migration 202615210000"],
  ["accumulated_rou_amortization", "lease ASC 842 — same held migration 202615210000"],
  ["lease_interest_expense", "lease ASC 842 — same held migration 202615210000"],
]);

function violations(resolverSrc, migrationsDir) {
  const errors = [];
  const roleValues = extractRoleValues(resolverSrc);
  if (!roleValues || roleValues.length === 0) {
    errors.push("could not extract COA_ROLE_VALUES from resolver.service.ts -- source shape drifted");
    return errors;
  }
  const { files, values, latestLiteral } = cumulativeCheckValues(migrationsDir);
  if (!files.length) {
    errors.push("no db/migrations/*.sql file widens chart_of_accounts_roles_role_check -- source shape drifted");
    return errors;
  }
  if (!values || values.size === 0) {
    errors.push("could not extract a literal role IN (...) list from any chart_of_accounts_roles_role_check migration -- source shape drifted");
    return errors;
  }
  const latest = `${latestLiteral} + later dynamic widenings through ${files[files.length - 1]}`;
  const checkValues = [...values];
  const checkSet = new Set(checkValues);
  const missing = roleValues.filter((r) => !checkSet.has(r) && !KNOWN_UNREGISTERED.has(r));
  const nowRegistered = [...KNOWN_UNREGISTERED.keys()].filter((r) => checkSet.has(r));
  if (nowRegistered.length) {
    errors.push(`${nowRegistered.join(", ")} now registered in the CHECK — remove from KNOWN_UNREGISTERED (the debt list only shrinks)`);
  }
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
    // Insert an unregistered role just before the list closes — independent of which role happens to be last.
    resolverSrc.replace(/(export const COA_ROLE_VALUES = \[[\s\S]*?)(\n\] as const;)/, '$1\n  "never_registered_role",$2'),
  ];
  for (const [index, mutatedResolver] of mutations.entries()) {
    try { check(mutatedResolver, MIGRATIONS_DIR); }
    catch { caught += 1; continue; }
    throw new Error(`mutation ${index + 1} escaped detection`);
  }
  // The dynamic shape counts: a role only a dynamic migration adds must be REQUIRED to be in that migration.
  {
    const tmp = fs.mkdtempSync("/tmp/coa-role-check-");
    for (const f of checkMigrations(MIGRATIONS_DIR)) {
      const src = fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8");
      fs.writeFileSync(path.join(tmp, f), src.replace(/ARRAY\['fuel_wallet_relay'\]/g, "ARRAY['something_else']"));
    }
    try { check(resolverSrc, tmp); }
    catch (err) { if (err instanceof Error && err.message.includes("fuel_wallet_relay")) caught += 1; else throw err; }
    finally { fs.rmSync(tmp, { recursive: true, force: true }); }
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
  console.log(`PASS verify-coa-role-values-registered-in-check-constraint --selftest (${caught}/${mutations.length + 2})`);
} else {
  check(resolverSrc, MIGRATIONS_DIR);
  console.log(`PASS verify-coa-role-values-registered-in-check-constraint (every CoaRole is registered in the live DB CHECK constraint, except ${KNOWN_UNREGISTERED.size} named debt: ${[...KNOWN_UNREGISTERED.keys()].join(", ")})`);
}
