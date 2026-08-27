#!/usr/bin/env node
import fs from "node:fs";

const source = fs.readFileSync("apps/backend/src/safety/driver-qualification.routes.ts", "utf8");
function verify(text) {
  const create = text.slice(text.indexOf('app.post("/api/v1/safety/driver-qualification/items"'), text.indexOf('app.patch("/api/v1/safety/driver-qualification/items/:id"'));
  const failures = [];
  if (!/d\.archived_at IS NULL[\s\S]*?qualification_create_driver_dca/.test(create)) failures.push("creator must reject archived drivers");
  if (!/const qualificationItem = insertRes\.rows\[0\];[\s\S]*?if \(!qualificationItem\?\.id\) throw new Error\("safety_driver_qualification_insert_failed"\)/.test(create)) failures.push("creator must require inserted identity");
  if (!/resource_id: qualificationItem\.id/.test(create)) failures.push("audit must use proven identity");
  if (!/return qualificationItem;/.test(create)) failures.push("201 must return proven row");
  return failures;
}
const failures = verify(source);
if (failures.length) { console.error(`verify-safety-driver-qualification-create-truth: FAIL\n- ${failures.join("\n- ")}`); process.exit(1); }
if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace("AND d.archived_at IS NULL\n           AND (d.operating_company_id", "AND true\n           AND (d.operating_company_id"),
    source.replace("if (!qualificationItem?.id)", "if (false)"),
    source.replace("resource_id: qualificationItem.id", "resource_id: null"),
    source.replace("return qualificationItem;", "return insertRes.rows[0];"),
  ];
  const survived = mutations.filter((mutation) => verify(mutation).length === 0);
  if (survived.length) { console.error(`verify-safety-driver-qualification-create-truth --selftest: FAIL; ${survived.length} mutation(s) survived`); process.exit(1); }
  console.log("verify-safety-driver-qualification-create-truth --selftest: PASS (4/4 mutations red)");
} else console.log("verify-safety-driver-qualification-create-truth: PASS — creator rejects archived drivers and requires its inserted audit identity");
