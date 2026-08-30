#!/usr/bin/env node
import fs from "node:fs";
const source = fs.readFileSync("apps/backend/src/safety/permits.routes.ts", "utf8");
function verify(text) {
  const create = text.slice(text.indexOf('app.post("/api/v1/safety/permits"'), text.indexOf('app.patch("/api/v1/safety/permits/:id"'));
  const failures = [];
  if (!/rateLimit: \{ max: 60, timeWindow: "1 minute" \}/.test(create)) failures.push("creator must be rate limited");
  if (!/FROM mdata\.units[\s\S]*?deactivated_at IS NULL[\s\S]*?COALESCE\(currently_leased_to_company_id, owner_company_id\) = \$2::uuid/.test(create)) failures.push("unit must be active and scoped by current operator");
  if (!/return \{ kind: "unit_not_found" as const \}/.test(create) || !/mdata_unit_not_found/.test(create)) failures.push("invalid unit must return named 404");
  if (!/if \(!row\?\.id\) throw new Error\("safety_permit_insert_failed"\)/.test(create)) failures.push("creator must require inserted identity");
  if (!/resource_id: row\.id/.test(create)) failures.push("audit must use proven identity");
  if (!/permit: created\.row/.test(create)) failures.push("201 must return proven row");
  return failures;
}
const failures = verify(source);
if (failures.length) { console.error(`verify-safety-permit-create-linkage-truth: FAIL\n- ${failures.join("\n- ")}`); process.exit(1); }
if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace('app.post("/api/v1/safety/permits", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }', 'app.post("/api/v1/safety/permits", { config: { rateLimit: { max: 0, timeWindow: "1 minute" } } }'),
    source.replace("AND deactivated_at IS NULL", "AND true"),
    source.replace("COALESCE(currently_leased_to_company_id, owner_company_id) = $2::uuid", "true"),
    source.replace('return { kind: "unit_not_found" as const }', 'return { kind: "ok" as const, row: null }'),
    source.replace("if (!row?.id)", "if (false)"),
    source.replace("resource_id: row.id", "resource_id: null"),
    source.replace("permit: created.row", "permit: created"),
  ];
  const survived = mutations.filter((mutation) => verify(mutation).length === 0);
  if (survived.length) { console.error(`verify-safety-permit-create-linkage-truth --selftest: FAIL; ${survived.length} mutation(s) survived`); process.exit(1); }
  console.log("verify-safety-permit-create-linkage-truth --selftest: PASS (7/7 mutations red)");
} else console.log("verify-safety-permit-create-linkage-truth: PASS — creator validates active operated unit and requires its inserted audit identity");
