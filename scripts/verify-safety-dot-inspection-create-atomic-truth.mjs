#!/usr/bin/env node
import fs from "node:fs";
const source = fs.readFileSync("apps/backend/src/safety/safety-v5.routes.ts", "utf8");
function verify(text) {
  const create = text.slice(text.indexOf('app.post("/api/v1/safety/v5/dot-inspections"'), text.indexOf('app.post("/api/v1/safety/internal-fines"'));
  const failures = [];
  if (!/rateLimit: \{ max: 60, timeWindow: "1 minute" \}/.test(create)) failures.push("creator must be rate limited");
  if (/client\.query\("(?:BEGIN|COMMIT|ROLLBACK)"\)/.test(create)) failures.push("creator must use the wrapper transaction, never nested transaction control");
  if (!/d\.archived_at IS NULL[\s\S]*?dot_inspection_driver_dca/.test(create)) failures.push("driver must be active and company owned/authorized");
  if (!/COALESCE\(currently_leased_to_company_id, owner_company_id\) = \$2::uuid/.test(create)) failures.push("unit must be active and company operated");
  if (!/mdata_driver_not_found/.test(create) || !/mdata_unit_not_found/.test(create)) failures.push("invalid parents must return named 404s");
  if (!/if \(!inspection\?\.id\) throw new Error\("safety_dot_inspection_insert_failed"\)/.test(create)) failures.push("creator must require inserted inspection identity");
  if (!/spawned_wo_id IS NULL[\s\S]*?dot_inspection_work_order_backlink_failed/.test(create)) failures.push("OOS work-order backlink must be compare-and-set required");
  if (!/inspection: created\.inspection, spawned_wo: created\.spawned_wo/.test(create)) failures.push("201 must return proven inspection result");
  return failures;
}
const failures = verify(source);
if (failures.length) { console.error(`verify-safety-dot-inspection-create-atomic-truth: FAIL\n- ${failures.join("\n- ")}`); process.exit(1); }
if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace('app.post("/api/v1/safety/v5/dot-inspections", { config: { rateLimit: { max: 60', 'app.post("/api/v1/safety/v5/dot-inspections", { config: { rateLimit: { max: 0'),
    source.replace("const created = await withCompany(user.uuid", 'const created = await withCompany(user.uuid').replace("if (body.data.driver_uuid) {", 'await client.query("BEGIN");\n      if (body.data.driver_uuid) {'),
    source.replace("AND d.archived_at IS NULL", "AND true"),
    source.replaceAll("COALESCE(currently_leased_to_company_id, owner_company_id) = $2::uuid", "true"),
    source.replace('mdata_driver_not_found', 'not_found'),
    source.replace("if (!inspection?.id)", "if (false)"),
    source.replace("AND spawned_wo_id IS NULL", "AND true"),
    source.replace("inspection: created.inspection, spawned_wo: created.spawned_wo", "inspection: created"),
  ];
  const survived = mutations.filter((mutation) => verify(mutation).length === 0);
  if (survived.length) { console.error(`verify-safety-dot-inspection-create-atomic-truth --selftest: FAIL; ${survived.length} mutation(s) survived`); process.exit(1); }
  console.log("verify-safety-dot-inspection-create-atomic-truth --selftest: PASS (8/8 mutations red)");
} else console.log("verify-safety-dot-inspection-create-atomic-truth: PASS — creator uses one scoped transaction and proves driver/unit/inspection/OOS backlink");
