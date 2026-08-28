#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const TARGET = path.join(ROOT, "apps", "backend", "src", "mdata", "drivers.routes.ts");

function fail(message) {
  console.error(`verify:driver-company-scope — FAILED\n- ${message}`);
  process.exit(1);
}

if (!fs.existsSync(TARGET)) {
  fail("apps/backend/src/mdata/drivers.routes.ts not found");
}

const text = fs.readFileSync(TARGET, "utf8");

if (!/createDriverBodySchema[\s\S]*operating_company_id:\s*z\.string\(\)\.uuid\(\)\.optional\(\)/m.test(text)) {
  fail("create driver schema must accept optional operating_company_id");
}

const insertMatch = text.match(
  /INSERT INTO mdata\.drivers\s*\(([\s\S]*?)\)\s*VALUES\s*\(([\s\S]*?)\)\s*RETURNING/mi
);
if (!insertMatch) {
  fail("could not locate INSERT INTO mdata.drivers statement");
}

const [, rawColumns, rawValues] = insertMatch;
if (!/\boperating_company_id\b/.test(rawColumns)) {
  fail("driver INSERT columns must include operating_company_id");
}

if (!/\bresolvedOperatingCompanyId\b/.test(text)) {
  fail("driver create flow must resolve operating_company_id from validated company context");
}

if (
  !/const res = await client\.query\([\s\S]*?\[\s*[\s\S]*?\bresolvedOperatingCompanyId\b[\s\S]*?\]\s*\)/m.test(text)
) {
  fail("driver INSERT parameter array must include resolvedOperatingCompanyId");
}

if (!/listQuerySchema[\s\S]*operating_company_id:\s*z\.string\(\)\.uuid\(\)\.optional\(\)/m.test(text)) {
  fail("driver list query schema must include optional operating_company_id");
}

// Accept either the classic filters.push form OR the canonical list predicate. The latter exposes
// drivers canonically owned by the selected company plus drivers with an active company authorization.
const listScopedViaFilters = /filters\.push\(`operating_company_id = \$\$\{values\.length\}`\)/.test(text);
function hasCanonicalListScope(source) {
  return (source.match(/WHERE \(operating_company_id = \$\$\{ociIdx\}::uuid OR EXISTS \(/g) ?? []).length === 2 &&
    (source.match(/canonical_list_dca\.company_id = \$\$\{ociIdx\}::uuid/g) ?? []).length === 2 &&
    (source.match(/canonical_list_dca\.is_authorized = true/g) ?? []).length === 2 &&
    (source.match(/canonical_list_dca\.deactivated_at IS NULL/g) ?? []).length === 2;
}
const listScopedViaTemplate = hasCanonicalListScope(text);
if (!listScopedViaFilters && !listScopedViaTemplate) {
  fail("driver list route must apply operating_company_id filter when provided");
}

if (process.argv.includes("--selftest")) {
  for (const token of [
    "WHERE (operating_company_id = $${ociIdx}::uuid OR EXISTS (",
    "canonical_list_dca.company_id = $${ociIdx}::uuid",
    "canonical_list_dca.is_authorized = true",
    "canonical_list_dca.deactivated_at IS NULL",
  ]) {
    if (hasCanonicalListScope(text.split(token).join("REMOVED"))) fail(`selftest mutation escaped: ${token}`);
  }
  console.log("verify:driver-company-scope — selftest PASS (4/4)");
}

console.log("verify:driver-company-scope — OK");
