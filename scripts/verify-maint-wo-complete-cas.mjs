#!/usr/bin/env node
import fs from "node:fs";

const file = "apps/backend/src/maintenance/work-orders.routes.ts";
const source = fs.readFileSync(file, "utf8");

function block(text) {
  const start = text.indexOf('app.patch("/api/v1/maintenance/work-orders/:id/complete"');
  const end = text.indexOf('app.patch("/api/v1/maintenance/work-orders/:id/transition"', start);
  return text.slice(start, end);
}
function verify(text) {
  const b = block(text);
  const failures = [];
  if (!/if \(current\.status !== "in_progress"\)[\s\S]*invalid: true/.test(b)) failures.push("completion must enforce canonical source state");
  if (!/WHERE id = \$1\s+AND operating_company_id = \$2::uuid\s+AND status = 'in_progress'\s+RETURNING \*/.test(b)) failures.push("completion UPDATE must be company+source-state CAS");
  if (!/const completed = updateRes\.rows\[0\] \?\? null;\s+if \(!completed\) return \{ conflict: true as const \};\s+await appendCrudAudit/.test(b)) failures.push("zero-row completion must stop before audit");
  if (!/if \("conflict" in result\) return reply\.code\(409\)/.test(b)) failures.push("lost completion race must return 409");
  return failures;
}
const failures = verify(source);
if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace('if (current.status !== "in_progress") {', "if (false) {"),
    source.replace("AND operating_company_id = $2::uuid\n              AND status = 'in_progress'", ""),
    source.replace("if (!completed) return { conflict: true as const };", ""),
    source.replace('if ("conflict" in result) return reply.code(409)', 'if ("conflict" in result) return reply.code(200)'),
  ];
  const escaped = mutations.flatMap((text, index) => verify(text).length === 0 ? [index + 1] : []);
  if (escaped.length) { console.error(`SELFTEST FAIL: mutation(s) ${escaped.join(", ")} escaped`); process.exit(1); }
  console.log(`SELFTEST PASS: ${mutations.length}/${mutations.length} planted defects rejected`); process.exit(0);
}
if (failures.length) { failures.forEach((f) => console.error(`FAIL: ${f}`)); process.exit(1); }
console.log("PASS: maintenance WO completion is canonical company-scoped CAS");
