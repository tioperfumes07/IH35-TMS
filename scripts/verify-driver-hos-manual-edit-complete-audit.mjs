#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = { route: "apps/backend/src/telematics/hos.routes.ts", page: "apps/frontend/src/pages/drivers/DriverHosDetailPage.tsx" };
export function audit(src) {
  const failures = [];
  // Row 81 (c26916d6c5, 443.260): the driver predicate follows merged shells — the driver OR a record of THIS company merged
  // into them. Accept exactly that shape (or the plain driver form); a bare `merged_into_driver_id = $2` must not satisfy it.
  const plain = /WHERE operating_company_id = \$1::uuid\s+AND driver_id = \$2::uuid\s+AND source = 'manual_edit'/;
  const merged = /WHERE operating_company_id = \$1::uuid\s+AND \(driver_id = \$2::uuid\s+OR driver_id IN \(\s*SELECT id FROM mdata\.drivers\s+WHERE operating_company_id = \$1::uuid\s+AND merged_into_driver_id = \$2::uuid\s*\)\)\s+AND source = 'manual_edit'/;
  if (!plain.test(src.route) && !merged.test(src.route)) failures.push(`${FILES.route}: manual-edit audit must retain exact company, driver (incl. this company's merged shells), and source predicates`);
  if (!/source = 'manual_edit'[\s\S]{0,100}ORDER BY started_at DESC, id DESC/.test(src.route)) failures.push(`${FILES.route}: manual-edit audit needs deterministic timestamp/id ordering`);
  if (/source = 'manual_edit'[\s\S]{0,140}LIMIT\s+\d+/i.test(src.route)) failures.push(`${FILES.route}: manual-edit audit must not silently cap regulated edit history`);
  if (!/Current count: \{hosQuery\.data\.manual_edits\.count\}/.test(src.page) || !/hosQuery\.data\.manual_edits\.events\.map/.test(src.page)) failures.push(`${FILES.page}: mounted HOS detail must render and count the authoritative manual-edit range`);
  return failures;
}
const load = () => Object.fromEntries(Object.entries(FILES).map(([k, f]) => [k, fs.readFileSync(path.join(ROOT, f), "utf8")]));
const good = load();
if (process.argv.includes("--selftest")) {
  if (audit(good).length) process.exit(1);
  const mutations = [
    ["cap", "route", /ORDER BY started_at DESC, id DESC/, "ORDER BY started_at DESC LIMIT 100"],
    // anchored to the manual-edit query (the file has another `AND (driver_id = $2::uuid` query above it)
    ["scope", "route", /AND \(driver_id = \$2::uuid(?=(?:(?!hos\.duty_status_events)[\s\S])*?source = 'manual_edit')/, "AND (driver_id IS NOT NULL"],
    ["merged-shell scope", "route", /WHERE operating_company_id = \$1::uuid\s+AND merged_into_driver_id = \$2::uuid(?=(?:(?!hos\.duty_status_events)[\s\S])*?source = 'manual_edit')/, "WHERE merged_into_driver_id = $2::uuid"],
    ["source", "route", /source = 'manual_edit'/, "source IS NOT NULL"],
    ["order", "route", /ORDER BY started_at DESC, id DESC/, "ORDER BY started_at DESC"],
    ["render", "page", /hosQuery\.data\.manual_edits\.events\.map/, "[].map"],
  ];
  for (const [name, key, pattern, replacement] of mutations) {
    const mutated = { ...good, [key]: good[key].replace(pattern, replacement) };
    if (mutated[key] === good[key] || audit(mutated).length === 0) { console.error(`verify-driver-hos-manual-edit-complete-audit SELFTEST FAIL — ${name}`); process.exit(1); }
  }
  console.log(`verify-driver-hos-manual-edit-complete-audit SELFTEST PASS — ${mutations.length}/${mutations.length} mutations detected`); process.exit(0);
}
const failures = audit(good);
if (failures.length) { console.error(`verify-driver-hos-manual-edit-complete-audit FAIL\n- ${failures.join("\n- ")}`); process.exit(1); }
console.log("verify-driver-hos-manual-edit-complete-audit PASS — Driver HOS exposes the complete scoped manual-edit audit");
