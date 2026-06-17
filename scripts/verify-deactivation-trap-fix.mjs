#!/usr/bin/env node
// Guard: the equipment/units soft-delete deactivation trap stays fixed — the LATEST equipment_select and
// units_select policy definitions must let Owner/Administrator/Manager see soft-deleted rows within their
// accessible companies (so the soft-delete UPDATE's post-update row passes select-visibility instead of
// throwing 42501 in ExecWithCheckOptions). Per-entity (owner/leased in user_accessible_company_ids);
// non-managers still see active-only.
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fail = (m) => { console.error(`FAIL verify-deactivation-trap-fix: ${m}`); process.exit(1); };
const migDir = join(root, "db/migrations");
const files = readdirSync(migDir).filter((f) => f.endsWith(".sql")).sort();

// Find the LAST migration that (re)defines each *_select policy and assert it carries the manager-sees-
// deactivated escape clause alongside the entity scope.
for (const [policy, table] of [["equipment_select", "mdata.equipment"], ["units_select", "mdata.units"]]) {
  let lastDef = null;
  for (const f of files) {
    const src = readFileSync(join(migDir, f), "utf8");
    const re = new RegExp(`CREATE POLICY ${policy} ON ${table.replace(".", "\\.")}[\\s\\S]*?;`, "g");
    const matches = src.match(re);
    if (matches) lastDef = matches[matches.length - 1];
  }
  if (!lastDef) fail(`${policy} definition not found`);
  if (!/deactivated_at IS NULL/.test(lastDef)) fail(`${policy}: active-row visibility (deactivated_at IS NULL) must remain`);
  if (!/user_accessible_company_ids/.test(lastDef)) fail(`${policy}: per-entity scope (user_accessible_company_ids) must remain`);
  if (!/deactivated_at IS NULL\s*OR\s*identity\.current_user_role\(\) IN \('Owner', 'Administrator', 'Manager'\)/.test(lastDef)) {
    fail(`${policy}: managers must be able to see soft-deleted rows (deactivation-trap fix) — escape clause missing in the latest definition`);
  }
}
console.log("PASS verify-deactivation-trap-fix");
