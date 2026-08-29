#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(root, "apps/backend/src/mdata/driver-teams.routes.ts"), "utf8");
const start = source.indexOf('app.post("/api/v1/mdata/driver-teams/:id/replace-driver"');
const route = start < 0 ? "" : source.slice(start);

function failures(candidate) {
  const errors = [];
  const deactivateStart = candidate.indexOf("const deactivateRes = await client.query(");
  const deactivateEnd = candidate.indexOf("const createRes = await client.query(", deactivateStart);
  const deactivate = deactivateStart < 0 || deactivateEnd < 0 ? "" : candidate.slice(deactivateStart, deactivateEnd);
  if (!deactivate.includes("AND operating_company_id = $2::uuid")) errors.push("deactivation lacks company scope");
  if (!deactivate.includes("AND is_active = true")) errors.push("deactivation lacks active-state CAS");
  if (!deactivate.includes("[team.id, team.operating_company_id]")) errors.push("company bind missing");
  if (!deactivate.includes('if (!deactivated) return { error: "driver_team_state_changed" as const };')) errors.push("zero-row CAS not rejected");
  if (!candidate.includes('if (result.error === "driver_team_state_changed") return reply.code(409).send({ error: result.error });')) errors.push("race not mapped to 409");
  return errors;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    route.replace("WHERE id = $1\n              AND operating_company_id = $2::uuid\n              AND is_active = true", "WHERE id = $1\n              AND is_active = true"),
    route.replace("AND is_active = true", ""),
    route.replace("[team.id, team.operating_company_id]", "[team.id]"),
    route.replace('if (!deactivated) return { error: "driver_team_state_changed" as const };', ""),
    route.replace('result.error === "driver_team_state_changed"', 'result.error === "other"'),
  ];
  const escaped = mutations.filter((mutation) => failures(mutation).length === 0);
  if (escaped.length) {
    console.error(`verify-driver-team-replace-cas selftest FAIL — ${escaped.length}/5 mutations escaped`);
    process.exit(1);
  }
  console.log("verify-driver-team-replace-cas selftest PASS — 5/5 mutations red");
  process.exit(0);
}

const errors = failures(route);
if (errors.length) {
  console.error("verify-driver-team-replace-cas FAIL:\n" + errors.map((error) => ` - ${error}`).join("\n"));
  process.exit(1);
}
console.log("verify-driver-team-replace-cas PASS — replace-driver uses company-scoped active-state CAS and typed conflict");
