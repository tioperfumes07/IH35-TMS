#!/usr/bin/env node
import fs from "node:fs";
const routePath = new URL("../apps/backend/src/mdata/unit-plates.routes.ts", import.meta.url);
const source = fs.readFileSync(routePath, "utf8");
function verify(text) {
  const start = text.indexOf('app.patch("/api/v1/mdata/units/:id/plates/:plate_id"');
  const end = text.indexOf('app.post("/api/v1/mdata/units/:id/plates/:plate_id/archive"', start);
  const block = start >= 0 && end > start ? text.slice(start, end) : "";
  const failures = [];
  if (!/values\.push\(params\.data\.plate_id, params\.data\.id, query\.data\.operating_company_id\);[^]*?WHERE id = \$\$\{values\.length - 2\}::uuid[^]*?AND unit_id = \$\$\{values\.length - 1\}::uuid[^]*?AND operating_company_id = \$\$\{values\.length\}::uuid[^]*?AND status <> 'archived'/m.test(block)) failures.push("unit-plate edit must bind plate, unit, company, and active state");
  if (!/const row = res\.rows\[0\];\s*if \(!row\) return null;\s*await appendCrudAudit/m.test(block)) failures.push("unit-plate edit must reject zero-row UPDATE before audit");
  if (!/operating_company_id: query\.data\.operating_company_id,\s*changes: body\.data/m.test(block)) failures.push("unit-plate edit audit must carry canonical company linkage");
  return failures;
}
const failures = verify(source);
if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace("AND unit_id = $${values.length - 1}::uuid", "AND true"),
    source.replace("AND operating_company_id = $${values.length}::uuid", "AND true"),
    source.replace("AND status <> 'archived'\n         RETURNING *`,\n        values", "AND true\n         RETURNING *`,\n        values"),
    source.replace('if (!row) return null;\n      await appendCrudAudit(client, user.uuid, "mdata.unit_plates.updated"', 'if (false) return null;\n      await appendCrudAudit(client, user.uuid, "mdata.unit_plates.updated"'),
    source.replace("operating_company_id: query.data.operating_company_id,\n        changes: body.data", "changes: body.data"),
  ];
  const escaped = mutations.filter((mutation) => verify(mutation).length === 0);
  if (escaped.length) { console.error(`FAIL unit-plate CAS selftest: ${escaped.length} mutation(s) escaped`); process.exit(1); }
  console.log(`PASS unit-plate CAS selftest (${mutations.length} mutations rejected)`); process.exit(0);
}
if (failures.length) { failures.forEach((failure) => console.error(`FAIL ${failure}`)); process.exit(1); }
console.log("PASS unit-plate edit is an active company+unit CAS and fails before audit");
