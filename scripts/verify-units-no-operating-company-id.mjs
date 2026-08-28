#!/usr/bin/env node
/**
 * §4 landmine guard: mdata.units has NO `operating_company_id` column — it carries `owner_company_id`
 * (TRK owns) + `currently_leased_to_company_id` (TRANSP/USMCA lease). Any SQL that aliases mdata.units and
 * then references <alias>.operating_company_id throws Postgres 42703 (undefined_column) → runtime 500.
 * This recurred in dispatch/planner.service.ts + dispatch/load-profitability.service.ts (the empty Timeline).
 * Scope units through owner_company_id / currently_leased_to_company_id (or the entity-scoped driver/load), never
 * units.operating_company_id.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const BACKEND = path.join(ROOT, "apps/backend/src");
const MIGRATIONS = path.join(ROOT, "db/migrations");

// db/migrations SQL functions filter mdata.units UNALIASED (`FROM mdata.units WHERE ... operating_company_id`),
// which the TS/alias scan below cannot see — that gap let WOID-1 (maintenance.next_wo_display_id) ship a
// phantom-column 42703. 0049 first shipped that bad body; migration 202607051000 CREATE-OR-REPLACEs it with the
// correct COALESCE(currently_leased_to_company_id, owner_company_id). 0049's on-disk text is dead/superseded, so
// it is allowlisted here; any NEW migration reintroducing the antipattern still fails.
const MIGRATION_ALLOWLIST = new Set(["0049_p3_t11_6_1_wo_format_vendor_inventory_integrity.sql"]);
// Unaliased `FROM mdata.units` followed by a bare `operating_company_id =` filter with no COALESCE in between.
const UNALIASED_UNITS_OPCO = /FROM\s+mdata\.units\s+WHERE\b(?:(?!COALESCE\s*\()[\s\S]){0,160}?\boperating_company_id\s*=/i;

/** Recursively collect .ts files (skip tests + node_modules). */
function tsFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      out.push(...tsFiles(full));
    } else if (entry.name.endsWith(".ts") && !entry.name.includes(".test.")) {
      out.push(full);
    }
  }
  return out;
}

function aliasedUnitViolations(src, relativeFile) {
  const found = [];
  // Collect aliases bound to mdata.units, e.g. "FROM mdata.units u" / "JOIN mdata.units AS un".
  const aliases = new Set();
  for (const m of src.matchAll(/mdata\.units\s+(?:AS\s+)?([a-zA-Z_]\w*)/g)) {
    const alias = m[1];
    // Ignore SQL keywords that can follow the table name when there's no alias.
    if (!["ON", "WHERE", "USING", "LEFT", "RIGHT", "INNER", "JOIN", "AS", "u"].includes(alias.toUpperCase()) || alias === "u" || alias.length <= 3) {
      aliases.add(alias);
    }
  }
  for (const alias of aliases) {
    // A real reference to <alias>.operating_company_id (skip lines that are SQL comments "-- ...").
    const re = new RegExp(`\\b${alias}\\.operating_company_id\\b`, "g");
    for (const line of src.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.startsWith("--") || trimmed.startsWith("//") || trimmed.startsWith("*")) continue;
      if (re.test(line)) {
        found.push(`${relativeFile}: alias '${alias}' (mdata.units) references ${alias}.operating_company_id — units has no such column (use owner_company_id / currently_leased_to_company_id)`);
      }
      re.lastIndex = 0;
    }
  }
  return found;
}

const violations = [];
for (const file of tsFiles(BACKEND)) {
  const src = fs.readFileSync(file, "utf8");
  violations.push(...aliasedUnitViolations(src, path.relative(ROOT, file)));
}

// WOID-1: also scan db/migrations SQL for the unaliased `FROM mdata.units ... operating_company_id` form.
if (fs.existsSync(MIGRATIONS)) {
  for (const name of fs.readdirSync(MIGRATIONS)) {
    if (!name.endsWith(".sql")) continue;
    if (MIGRATION_ALLOWLIST.has(name)) continue;
    const src = fs.readFileSync(path.join(MIGRATIONS, name), "utf8");
    if (UNALIASED_UNITS_OPCO.test(src)) {
      violations.push(`db/migrations/${name}: 'FROM mdata.units ... operating_company_id =' (unaliased) — units has no operating_company_id column; use COALESCE(currently_leased_to_company_id, owner_company_id)`);
    }
  }
}

const arrivingSoonFile = path.join(BACKEND, "maintenance/arriving-soon.routes.ts");
const arrivingSoonSource = fs.readFileSync(arrivingSoonFile, "utf8");
if (!/UPDATE mdata\.units AS u[\s\S]{0,420}COALESCE\(u\.currently_leased_to_company_id, u\.owner_company_id\) = \$4::uuid[\s\S]{0,420}l\.operating_company_id = \$4::uuid[\s\S]{0,240}l\.assigned_unit_id = u\.id/.test(arrivingSoonSource)) {
  violations.push("apps/backend/src/maintenance/arriving-soon.routes.ts: severe issue unit block must use canonical lease-aware unit scope plus selected-company load ownership");
}

if (process.argv.includes("--selftest")) {
  const broken = arrivingSoonSource.replace(
    "COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = $4::uuid",
    "u.operating_company_id = $4::uuid",
  );
  const caught = aliasedUnitViolations(broken, "planted-arriving-soon.routes.ts");
  if (broken === arrivingSoonSource || caught.length !== 1) {
    console.error("verify-units-no-operating-company-id SELFTEST FAIL — planted arriving-soon phantom column escaped");
    process.exit(1);
  }
  console.log("verify-units-no-operating-company-id SELFTEST PASS — arriving-soon phantom column caught");
  process.exit(0);
}

if (violations.length > 0) {
  console.error("✘ verify-units-no-operating-company-id: mdata.units.operating_company_id antipattern found (§4 / 42703):");
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(1);
}
console.log("✅ verify-units-no-operating-company-id: no mdata.units.operating_company_id references");
