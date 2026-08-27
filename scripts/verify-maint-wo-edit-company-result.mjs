#!/usr/bin/env node
import fs from "node:fs";
const source = fs.readFileSync("apps/backend/src/maintenance/work-orders.routes.ts", "utf8");
function block(text) {
  const start = text.indexOf('app.patch("/api/v1/maintenance/work-orders/:id",');
  const end = text.indexOf('app.patch("/api/v1/maintenance/work-orders/:id/complete"', start);
  return text.slice(start, end);
}
function verify(text) {
  const b = block(text); const failures = [];
  if (!/WHERE id = \$1\s+AND operating_company_id = \$18::uuid\s+RETURNING \*/.test(b)) failures.push("WO edit UPDATE must repeat company scope");
  if (!/body\.repaired_by \?\? null,\s+companyId,/.test(b)) failures.push("WO edit must bind selected company to mutation");
  if (!/let updated = updatedRes\.rows\[0\] \?\? null;\s+if \(!updated\) return \{ notFound: true as const \};/.test(b)) failures.push("WO edit must require returned row before refresh/audit");
  return failures;
}
const failures = verify(source);
if (process.argv.includes("--selftest")) {
  const mutations = [source.replace("AND operating_company_id = $18::uuid", "AND true"), source.replace("          companyId,\n", ""), source.replace("if (!updated) return { notFound: true as const };", "")];
  const escaped = mutations.flatMap((text, index) => verify(text).length === 0 ? [index + 1] : []);
  if (escaped.length) { console.error(`SELFTEST FAIL: mutation(s) ${escaped.join(", ")} escaped`); process.exit(1); }
  console.log(`SELFTEST PASS: ${mutations.length}/${mutations.length} planted defects rejected`); process.exit(0);
}
if (failures.length) { failures.forEach((f) => console.error(`FAIL: ${f}`)); process.exit(1); }
console.log("PASS: maintenance WO edit is company-scoped and result-checked");
