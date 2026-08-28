#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = { route: "apps/backend/src/telematics/hos.routes.ts", page: "apps/frontend/src/pages/drivers/DriverHosDetailPage.tsx" };
export function audit(src) {
  const failures = [];
  if (!/WHERE operating_company_id = \$1::uuid[\s\S]{0,140}driver_id = \$2::uuid[\s\S]{0,100}source = 'manual_edit'/.test(src.route)) failures.push(`${FILES.route}: manual-edit audit must retain exact company, driver, and source predicates`);
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
    ["scope", "route", /driver_id = \$2::uuid\n\s+AND source = 'manual_edit'/, "driver_id IS NOT NULL\n            AND source = 'manual_edit'"],
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
