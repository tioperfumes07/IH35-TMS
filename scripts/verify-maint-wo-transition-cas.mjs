#!/usr/bin/env node
import fs from "node:fs";

const file = "apps/backend/src/maintenance/work-orders.routes.ts";
const source = fs.readFileSync(file, "utf8");
function span(text) {
  const start = text.indexOf('app.patch("/api/v1/maintenance/work-orders/:id/transition"');
  const end = text.indexOf('app.post("/api/v1/maintenance/work-orders/:id/line-items"', start);
  return text.slice(start, end);
}
function verify(text) {
  const b = span(text);
  const cas = b.match(/const transitionRes = await client\.query\(`UPDATE maintenance\.work_orders SET status = \$2, updated_at = now\(\) WHERE id = \$1 AND operating_company_id = \$3::uuid AND status = \$4 RETURNING id::text`/g) ?? [];
  const stops = b.match(/if \(!transitionRes\.rows\[0\]\) return \{ conflict: true as const \};/g) ?? [];
  const replies = b.match(/if \("conflict" in result\) return reply\.code\(409\)/g) ?? [];
  const failures = [];
  if (cas.length !== 2) failures.push(`both mounted transition writers must source-state CAS (found ${cas.length}/2)`);
  if (stops.length !== 2) failures.push(`both writers must stop before history/audit on zero rows (found ${stops.length}/2)`);
  if (replies.length !== 2) failures.push(`both writers must expose conflict as 409 (found ${replies.length}/2)`);
  return failures;
}
const failures = verify(source);
if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace(" AND status = $4 RETURNING id::text", ""),
    source.replace("if (!transitionRes.rows[0]) return { conflict: true as const };", ""),
    source.replace("return reply.code(409).send({ error: \"work_order_transition_conflict\" })", "return reply.code(200).send({ error: \"work_order_transition_conflict\" })"),
  ];
  const escaped = mutations.flatMap((text, index) => verify(text).length === 0 ? [index + 1] : []);
  if (escaped.length) { console.error(`SELFTEST FAIL: mutation(s) ${escaped.join(", ")} escaped`); process.exit(1); }
  console.log(`SELFTEST PASS: ${mutations.length}/${mutations.length} planted defects rejected`); process.exit(0);
}
if (failures.length) { failures.forEach((f) => console.error(`FAIL: ${f}`)); process.exit(1); }
console.log("PASS: both maintenance WO status writers are source-state CAS");
