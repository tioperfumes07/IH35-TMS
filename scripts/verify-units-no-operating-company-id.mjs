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

const violations = [];
for (const file of tsFiles(BACKEND)) {
  const src = fs.readFileSync(file, "utf8");
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
        violations.push(`${path.relative(ROOT, file)}: alias '${alias}' (mdata.units) references ${alias}.operating_company_id — units has no such column (use owner_company_id / currently_leased_to_company_id)`);
      }
      re.lastIndex = 0;
    }
  }
}

if (violations.length > 0) {
  console.error("✘ verify-units-no-operating-company-id: mdata.units.operating_company_id antipattern found (§4 / 42703):");
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(1);
}
console.log("✅ verify-units-no-operating-company-id: no mdata.units.operating_company_id references");
