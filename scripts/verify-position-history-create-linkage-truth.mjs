#!/usr/bin/env node
import fs from "node:fs";
const source = fs.readFileSync("apps/backend/src/safety/position-history/position-history.routes.ts", "utf8");
function verify(text) {
  const create = text.slice(text.indexOf('fastify.post("/api/v1/safety/position-history"'), text.indexOf('fastify.get("/api/v1/safety/position-history/timeline'));
  const failures = [];
  if (!/rateLimit: \{ max: 60, timeWindow: "1 minute" \}/.test(create)) failures.push("creator must be rate limited");
  if (!/FROM mdata\.units u[\s\S]*?u\.deactivated_at IS NULL[\s\S]*?COALESCE\(u\.currently_leased_to_company_id, u\.owner_company_id\) = \$1::uuid/.test(create)) failures.push("unit must be active and company operated");
  if (!/FROM maint\.position_set ps[\s\S]*?ps\.operating_company_id = \$1::uuid[\s\S]*?ps\.is_active = true[\s\S]*?ps\.positions @> jsonb_build_array/.test(create)) failures.push("position set/code must be active and company scoped");
  if (!/FROM maint\.part p[\s\S]*?p\.tenant_id = \$1::uuid/.test(create)) failures.push("part must be company scoped");
  for (const error of ["mdata_unit_not_found", "position_not_found", "part_not_found"]) if (!create.includes(error)) failures.push(`missing named error ${error}`);
  if (!/if \(!row\?\.id\) throw new Error\("maintenance_position_history_insert_failed"\)/.test(create)) failures.push("creator must require inserted identity");
  if (!/resource_id: row\.id/.test(create)) failures.push("audit must use proven identity");
  return failures;
}
const failures = verify(source);
if (failures.length) { console.error(`verify-position-history-create-linkage-truth: FAIL\n- ${failures.join("\n- ")}`); process.exit(1); }
if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace('fastify.post("/api/v1/safety/position-history", { config: { rateLimit: { max: 60', 'fastify.post("/api/v1/safety/position-history", { config: { rateLimit: { max: 0'),
    source.replaceAll("u.deactivated_at IS NULL", "true"),
    source.replaceAll("COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = $1::uuid", "true"),
    source.replaceAll("ps.operating_company_id = $1::uuid", "true"),
    source.replaceAll("ps.positions @> jsonb_build_array", "false AND jsonb_build_array"),
    source.replaceAll("p.tenant_id = $1::uuid", "true"),
    source.replace("if (!row?.id)", "if (false)"),
    source.replace("resource_id: row.id", "resource_id: null"),
  ];
  const survived = mutations.filter((mutation) => verify(mutation).length === 0);
  if (survived.length) { console.error(`verify-position-history-create-linkage-truth --selftest: FAIL; ${survived.length} mutation(s) survived`); process.exit(1); }
  console.log("verify-position-history-create-linkage-truth --selftest: PASS (8/8 mutations red)");
} else console.log("verify-position-history-create-linkage-truth: PASS — creator proves unit/position/part and inserted audit identity");
