#!/usr/bin/env node
/**
 * CLOSURE-32 H1 regression guard — mdata.drivers SELECT policy must be OCI-scoped.
 *
 * Static check over db/migrations (no DB connection required, so it runs in the
 * closure-checks workflow alongside the M2 guard): the latest migration that
 * (re)defines the `drivers_select` SELECT policy on mdata.drivers MUST scope by
 * operating_company_id via org.user_accessible_company_ids(), and MUST NOT be the
 * pre-H1 unscoped form (current_user_role() IS NOT NULL only).
 *
 * Exit 0 = OCI-scoped (pass). Exit 1 = missing/regressed (fail).
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const MIG_DIR = path.join(ROOT, "db", "migrations");
const MIGRATION_NAME = /^\d{4}[a-z]?_.+\.sql$/i;

function fail(message) {
  console.error(`verify:drivers-rls-scope FAILED\n- ${message}`);
  process.exit(1);
}

if (!fs.existsSync(MIG_DIR)) fail("db/migrations directory missing");

const files = fs
  .readdirSync(MIG_DIR)
  .filter((f) => MIGRATION_NAME.test(f))
  .sort((a, b) => a.localeCompare(b));

// Collect every migration block that creates a `drivers_select` SELECT policy on mdata.drivers.
const definitions = [];
for (const file of files) {
  const raw = fs.readFileSync(path.join(MIG_DIR, file), "utf8");
  // Strip SQL comments so commented-out DOWN/rollback DDL is never matched.
  const sql = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--[^\n]*/g, "");
  const re = /create\s+policy\s+drivers_select\b[\s\S]*?;/gi;
  let match;
  while ((match = re.exec(sql)) !== null) {
    const block = match[0];
    if (/on\s+mdata\.drivers/i.test(block) && /for\s+select/i.test(block)) {
      definitions.push({ file, block });
    }
  }
}

if (definitions.length === 0) {
  fail("no migration defines a SELECT policy `drivers_select` on mdata.drivers");
}

// Migrations are append-only; the authoritative definition is the highest-numbered one.
const latest = definitions[definitions.length - 1];
const block = latest.block.toLowerCase();

const hasOciColumn = block.includes("operating_company_id");
const hasAccessibleFn = block.includes("org.user_accessible_company_ids");

if (!hasOciColumn || !hasAccessibleFn) {
  fail(
    `latest drivers_select definition (${latest.file}) is NOT OCI-scoped — ` +
      "expected operating_company_id IN (SELECT org.user_accessible_company_ids())"
  );
}

console.log(`verify:drivers-rls-scope OK — drivers_select is OCI-scoped in ${latest.file}`);
process.exit(0);
