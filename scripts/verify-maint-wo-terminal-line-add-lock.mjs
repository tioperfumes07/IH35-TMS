#!/usr/bin/env node
import fs from "node:fs";

const source = fs.readFileSync("apps/backend/src/maintenance/work-orders.routes.ts", "utf8");

function routeBlock(text) {
  const start = text.indexOf('app.post("/api/v1/maintenance/work-orders/:id/line-items"');
  const end = text.indexOf('app.delete("/api/v1/maintenance/work-orders/:id/line-items/:lid"', start);
  return text.slice(start, end);
}

function verify(text) {
  const block = routeBlock(text);
  const failures = [];
  if (!/SELECT id, status FROM maintenance\.work_orders WHERE id = \$1 AND operating_company_id = \$2::uuid LIMIT 1/.test(block)) {
    failures.push("line-add must read canonical status under selected-company scope");
  }
  if (!/const status = String\(wo\.rows\[0\]\?\.status \?\? ""\)\.toLowerCase\(\);\s+if \(CLOSED_STATUSES\.has\(status\)\) throw new WoTerminalCostMutationError\(status\);/.test(block)) {
    failures.push("line-add must reject every canonical/legacy terminal status before insert");
  }
  if (!/if \(error instanceof WoTerminalCostMutationError\)[\s\S]*reply\.code\(409\)\.send\(\{ error: error\.message, status: error\.status \}\)/.test(block)) {
    failures.push("terminal line-add must surface a named 409 conflict");
  }
  return failures;
}

const failures = verify(source);
if (process.argv.includes("--selftest")) {
  const block = routeBlock(source);
  const mutations = [
    source.replace(block, block.replace("SELECT id, status", "SELECT id")),
    source.replace(block, block.replace("if (CLOSED_STATUSES.has(status)) throw new WoTerminalCostMutationError(status);", "")),
    source.replace(block, block.replace("return reply.code(409).send({ error: error.message, status: error.status });", "return reply.code(200).send({ ok: true });")),
  ];
  const escaped = mutations.flatMap((text, index) => (verify(text).length === 0 ? [index + 1] : []));
  if (escaped.length) {
    console.error(`SELFTEST FAIL: mutation(s) ${escaped.join(", ")} escaped`);
    process.exit(1);
  }
  console.log(`SELFTEST PASS: ${mutations.length}/${mutations.length} planted defects rejected`);
  process.exit(0);
}
if (failures.length) {
  failures.forEach((failure) => console.error(`FAIL: ${failure}`));
  process.exit(1);
}
console.log("PASS: terminal maintenance work orders reject new cost lines with a named conflict");
