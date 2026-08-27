#!/usr/bin/env node
import fs from "node:fs";

const file = "apps/backend/src/mdata/dispatcher-safety-events.routes.ts";
const source = fs.readFileSync(file, "utf8");

function blocks(text) {
  const voidStart = text.indexOf('app.patch("/api/v1/identity/users/:user_id/safety-events/:event_id/void"');
  const editStart = text.indexOf('app.patch("/api/v1/identity/users/:user_id/safety-events/:event_id",', voidStart);
  const end = text.indexOf('app.post("/api/v1/identity/users/check-returning-dispatcher"', editStart);
  return { voidBlock: text.slice(voidStart, editStart), editBlock: text.slice(editStart, end) };
}

function verify(text) {
  const { voidBlock, editBlock } = blocks(text);
  const failures = [];
  if (!/SET voided_at = now\(\)[\s\S]{0,180}updated_by_user_id = \$3, updated_at = now\(\)/.test(voidBlock)) failures.push("void must advance updated_at");
  if (!/sets\.push\("updated_by_user_id = \$3"\);\s+sets\.push\("updated_at = now\(\)"\);/.test(editBlock)) failures.push("edit must advance updated_at");
  return failures;
}

const failures = verify(source);
if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace(", updated_at = now()\n          WHERE", "\n          WHERE"),
    source.replace('sets.push("updated_at = now()");', ""),
  ];
  const escaped = mutations.flatMap((text, index) => verify(text).length === 0 ? [index + 1] : []);
  if (escaped.length) { console.error(`SELFTEST FAIL: mutation(s) ${escaped.join(", ")} escaped`); process.exit(1); }
  console.log(`SELFTEST PASS: ${mutations.length}/${mutations.length} planted defects rejected`);
  process.exit(0);
}
if (failures.length) { failures.forEach((f) => console.error(`FAIL: ${f}`)); process.exit(1); }
console.log("PASS: dispatcher safety-event edit and void advance updated_at");
