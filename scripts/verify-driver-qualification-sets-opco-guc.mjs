#!/usr/bin/env node
/**
 * PAY-RATE-CREATE-BROKEN — POST /mdata/drivers/:id/qualifications must set
 * app.operating_company_id after resolveOperatingCompanyId so catalogs.equipment_types
 * RLS company_scope can see the type (same as equipment-types list scopeToCompany).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = path.join(ROOT, "apps/backend/src/mdata/driver-profile.routes.ts");

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

function checkSource(src, label) {
  const sliceStart = src.indexOf(
    'app.post<{ Params: { id: string }; Querystring: { operating_company_id: string } }>("/api/v1/mdata/drivers/:id/qualifications"'
  );
  if (sliceStart < 0) return `${label}: POST qualifications handler signature missing`;
  const slice = src.slice(sliceStart, sliceStart + 3500);
  if (!/resolveOperatingCompanyId\(/.test(slice)) {
    return `${label}: POST must resolve operating company`;
  }
  if (!/set_config\(\s*['"]app\.operating_company_id['"]/.test(slice)) {
    return `${label}: POST must set_config app.operating_company_id before equipment_types lookup`;
  }
  const setIdx = slice.search(/set_config\(\s*['"]app\.operating_company_id['"]/);
  const equipIdx = slice.indexOf("FROM catalogs.equipment_types");
  if (equipIdx < 0) return `${label}: equipment_types lookup missing`;
  if (!(setIdx >= 0 && setIdx < equipIdx)) {
    return `${label}: set_config must precede equipment_types SELECT`;
  }
  return null;
}

function selftest() {
  const good = `
  app.post<{ Params: { id: string }; Querystring: { operating_company_id: string } }>("/api/v1/mdata/drivers/:id/qualifications", async () => {
    const companyId = await resolveOperatingCompanyId(client, u, q);
    await client.query(\`SELECT set_config('app.operating_company_id', $1::text, true)\`, [companyId]);
    await client.query(\`SELECT id FROM catalogs.equipment_types WHERE id = $1\`);
  });
  `;
  const bad = `
  app.post<{ Params: { id: string }; Querystring: { operating_company_id: string } }>("/api/v1/mdata/drivers/:id/qualifications", async () => {
    const companyId = await resolveOperatingCompanyId(client, u, q);
    await client.query(\`SELECT id FROM catalogs.equipment_types WHERE id = $1\`);
  });
  `;
  const badErr = checkSource(bad, "planted-bad");
  if (!badErr) fail("selftest: planted-bad must FAIL");
  const goodErr = checkSource(good, "selftest-good");
  if (goodErr) fail(`selftest: planted-good must PASS (${goodErr})`);
  console.log("verify-driver-qualification-sets-opco-guc --selftest PASS");
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const err = checkSource(fs.readFileSync(TARGET, "utf8"), TARGET);
if (err) fail(err);
console.log("verify-driver-qualification-sets-opco-guc PASS");
