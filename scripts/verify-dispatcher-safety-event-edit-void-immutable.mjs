#!/usr/bin/env node
import fs from "node:fs";

const file = "apps/backend/src/mdata/dispatcher-safety-events.routes.ts";
const source = fs.readFileSync(file, "utf8");

function editBlock(text) {
  const start = text.indexOf('app.patch("/api/v1/identity/users/:user_id/safety-events/:event_id",');
  const end = text.indexOf('app.post("/api/v1/identity/users/check-returning-dispatcher"', start);
  return text.slice(start, end);
}

function verify(text) {
  const block = editBlock(text);
  const predicates = block.match(/WHERE id = \$1 AND dispatcher_user_id = \$2 AND voided_at IS NULL/g) ?? [];
  const failures = [];
  if (predicates.length !== 2) failures.push(`edit pre-read and UPDATE must both require active state (found ${predicates.length}/2)`);
  if (!/const row = updateRes\.rows\[0\] \?\? null;\s+if \(!row\) return null;\s+await appendCrudAudit/.test(block)) failures.push("lost active-state race must fail before audit");
  return failures;
}

const failures = verify(source);
if (process.argv.includes("--selftest")) {
  const block = editBlock(source);
  const first = block.replace("WHERE id = $1 AND dispatcher_user_id = $2 AND voided_at IS NULL", "WHERE id = $1 AND dispatcher_user_id = $2");
  const second = block.replace(/WHERE id = \$1 AND dispatcher_user_id = \$2 AND voided_at IS NULL(?=[\s\S]*RETURNING \*)/, "WHERE id = $1 AND dispatcher_user_id = $2");
  const mutations = [source.replace(block, first), source.replace(block, second), source.replace("if (!row) return null;\n\n      await appendCrudAudit", "await appendCrudAudit")];
  const escaped = mutations.flatMap((text, index) => verify(text).length === 0 ? [index + 1] : []);
  if (escaped.length) { console.error(`SELFTEST FAIL: mutation(s) ${escaped.join(", ")} escaped`); process.exit(1); }
  console.log(`SELFTEST PASS: ${mutations.length}/${mutations.length} planted defects rejected`);
  process.exit(0);
}
if (failures.length) { failures.forEach((f) => console.error(`FAIL: ${f}`)); process.exit(1); }
console.log("PASS: voided dispatcher safety events are immutable through edit");
