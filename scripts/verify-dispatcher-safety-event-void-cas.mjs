#!/usr/bin/env node
import fs from "node:fs";

const file = "apps/backend/src/mdata/dispatcher-safety-events.routes.ts";
const source = fs.readFileSync(file, "utf8");

function voidBlock(text) {
  const start = text.indexOf('app.patch("/api/v1/identity/users/:user_id/safety-events/:event_id/void"');
  const end = text.indexOf('app.patch("/api/v1/identity/users/:user_id/safety-events/:event_id"', start + 1);
  return text.slice(start, end);
}

function verify(text) {
  const block = voidBlock(text);
  const failures = [];
  if (!/WHERE id = \$1 AND dispatcher_user_id = \$2 AND voided_at IS NULL\s+RETURNING \*/.test(block)) failures.push("void UPDATE must compare active state");
  if (!/const row = updateRes\.rows\[0\] \?\? null;\s+if \(!row\) return \{ error: "already_voided" as const \};\s+await appendCrudAudit/.test(block)) failures.push("zero-row void must fail before audit");
  return failures;
}

const failures = verify(source);
if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace("WHERE id = $1 AND dispatcher_user_id = $2 AND voided_at IS NULL", "WHERE id = $1 AND dispatcher_user_id = $2"),
    source.replace('if (!row) return { error: "already_voided" as const };', "if (!row) return null;"),
    source.replace("const row = updateRes.rows[0] ?? null;", "const row = updateRes.rows[0];"),
  ];
  const escaped = mutations.flatMap((text, index) => verify(text).length === 0 ? [index + 1] : []);
  if (escaped.length) { console.error(`SELFTEST FAIL: mutation(s) ${escaped.join(", ")} escaped`); process.exit(1); }
  console.log(`SELFTEST PASS: ${mutations.length}/${mutations.length} planted defects rejected`);
  process.exit(0);
}
if (failures.length) { failures.forEach((f) => console.error(`FAIL: ${f}`)); process.exit(1); }
console.log("PASS: dispatcher safety-event void is active-state CAS and zero-row safe");
