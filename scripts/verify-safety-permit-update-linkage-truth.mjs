#!/usr/bin/env node
import fs from "node:fs";
const source = fs.readFileSync("apps/backend/src/safety/permits.routes.ts", "utf8");
function verify(text) {
  const patch = text.slice(text.indexOf('app.patch("/api/v1/safety/permits/:id"'), text.indexOf('app.post("/api/v1/safety/permits/:id/archive"'));
  const failures = [];
  if (!/rateLimit: \{ max: 60, timeWindow: "1 minute" \}/.test(patch)) failures.push("update must be rate limited");
  for (const field of ["issuing_state", "issued_date", "unit_id", "notes"]) if (!patch.includes(`hasOwnProperty.call(body.data, "${field}")`)) failures.push(`${field} must preserve explicit-null presence`);
  if (!/COALESCE\(currently_leased_to_company_id, owner_company_id\) = \$2::uuid/.test(patch)) failures.push("replacement unit must be company scoped");
  if (!/unit_id = CASE WHEN \$11::boolean THEN \$12::uuid ELSE unit_id END/.test(patch)) failures.push("unit clear must not be a silent no-op");
  if (!/issuing_state = CASE WHEN \$5::boolean THEN \$6 ELSE issuing_state END/.test(patch) || !/issued_date = CASE WHEN \$8::boolean THEN \$9::date ELSE issued_date END/.test(patch) || !/notes = CASE WHEN \$13::boolean THEN \$14 ELSE notes END/.test(patch)) failures.push("nullable text/date fields must honor explicit null");
  if (!/updated\.kind === "unit_not_found"[\s\S]*?mdata_unit_not_found/.test(patch)) failures.push("invalid unit must return named 404");
  if (!/return \{ permit: updated\.row \}/.test(patch)) failures.push("response must use proven updated row");
  return failures;
}
const failures = verify(source);
if (failures.length) { console.error(`verify-safety-permit-update-linkage-truth: FAIL\n- ${failures.join("\n- ")}`); process.exit(1); }
if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace('app.patch("/api/v1/safety/permits/:id", { config: { rateLimit: { max: 60', 'app.patch("/api/v1/safety/permits/:id", { config: { rateLimit: { max: 0'),
    source.replace('hasOwnProperty.call(body.data, "unit_id")', 'hasOwnProperty.call(body.data, "wrong")'),
    source.replaceAll("COALESCE(currently_leased_to_company_id, owner_company_id) = $2::uuid", "true"),
    source.replace("unit_id = CASE WHEN $11::boolean THEN $12::uuid ELSE unit_id END", "unit_id = COALESCE($12::uuid, unit_id)"),
    source.replace("issuing_state = CASE WHEN $5::boolean THEN $6 ELSE issuing_state END", "issuing_state = COALESCE($6, issuing_state)"),
    source.replace('updated.kind === "unit_not_found"', 'false'),
    source.replace("return { permit: updated.row }", "return { permit: updated }"),
  ];
  const survived = mutations.filter((mutation) => verify(mutation).length === 0);
  if (survived.length) { console.error(`verify-safety-permit-update-linkage-truth --selftest: FAIL; ${survived.length} mutation(s) survived`); process.exit(1); }
  console.log("verify-safety-permit-update-linkage-truth --selftest: PASS (7/7 mutations red)");
} else console.log("verify-safety-permit-update-linkage-truth: PASS — update validates unit and honors explicit nullable clears");
