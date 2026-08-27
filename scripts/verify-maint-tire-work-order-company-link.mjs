#!/usr/bin/env node
import fs from "node:fs";

export function run(root = process.cwd()) {
  const src = fs.readFileSync(`${root}/apps/backend/src/maintenance/tires.routes.ts`, "utf8");
  const failures = [];
  if (!/async function workOrderBelongsToCompany[\s\S]*?FROM maintenance\.work_orders[\s\S]*?operating_company_id = \$2::uuid[\s\S]*?voided_at IS NULL/.test(src)) {
    failures.push("tire work-order validator must require a live same-company maintenance.work_orders row");
  }
  const callCount = (src.match(/workOrderBelongsToCompany\(client, body\.operating_company_id, body\.work_order_id\)/g) ?? []).length;
  if (callCount !== 4) failures.push(`all four tire work-order write surfaces must validate the FK (found ${callCount}/4)`);
  const errorCount = (src.match(/work_order_not_in_operating_company/g) ?? []).length;
  if (errorCount < 4) failures.push(`all four validators must use the named failure (found ${errorCount}/4 markers)`);
  const responseCount = (src.match(/"__error" in (?:row|result)/g) ?? []).length;
  if (responseCount !== 4) failures.push(`all four tire routes must translate validation failure to HTTP (found ${responseCount}/4)`);
  return failures;
}

if (process.argv.includes("--selftest")) {
  const tmp = fs.mkdtempSync("/tmp/verify-maint-tire-wo-company-");
  const path = `${tmp}/apps/backend/src/maintenance`;
  fs.mkdirSync(path, { recursive: true });
  const good = `
async function workOrderBelongsToCompany(client, companyId, workOrderId) {
  return client.query(\`SELECT id FROM maintenance.work_orders WHERE id = $1::uuid AND operating_company_id = $2::uuid AND voided_at IS NULL\`, [workOrderId, companyId]);
}
${Array.from({ length: 4 }, () => `if (!(await workOrderBelongsToCompany(client, body.operating_company_id, body.work_order_id))) return { __error: "work_order_not_in_operating_company" };`).join("\n")}
${Array.from({ length: 4 }, () => `if (result && "__error" in result) return reply.send({ error: "work_order_not_in_operating_company" });`).join("\n")}
`;
  const write = (body) => fs.writeFileSync(`${path}/tires.routes.ts`, body);
  write(good);
  if (run(tmp).length) throw new Error(`PASS fixture failed: ${run(tmp).join("; ")}`);
  const mutations = [
    good.replace("AND operating_company_id = $2::uuid", ""),
    good.replace("AND voided_at IS NULL", ""),
    good.replace("workOrderBelongsToCompany(client, body.operating_company_id, body.work_order_id)", "true"),
    good.replace(/if \(result && "__error" in result\)[^\n]+/, ""),
  ];
  mutations.forEach((body, index) => {
    write(body);
    if (!run(tmp).length) throw new Error(`mutation ${index + 1} was not rejected`);
  });
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("verify-maint-tire-work-order-company-link --selftest OK (4/4)");
} else {
  const failures = run();
  if (failures.length) {
    console.error(failures.join("\n"));
    process.exit(1);
  }
  console.log("verify-maint-tire-work-order-company-link — OK");
}
