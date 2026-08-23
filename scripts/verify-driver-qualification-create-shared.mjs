#!/usr/bin/env node
import fs from "node:fs";
const LABEL = "verify-driver-qualification-create-shared";
const source = fs.readFileSync("apps/backend/src/mdata/driver-profile.routes.ts", "utf8");
const start = source.indexOf('app.post<{ Params: { id: string } }>("/api/v1/mdata/drivers/:id/qualifications"');
const end = source.indexOf('app.patch<{ Params: { id: string; qual_id: string } }>', start);
const handler = start >= 0 && end > start ? source.slice(start, end) : "";
const tokens = ["FROM mdata.driver_company_authorizations qualification_create_dca", "qualification_create_dca.driver_id = d.id", "qualification_create_dca.company_id = $2::uuid", "qualification_create_dca.is_authorized = true", "qualification_create_dca.deactivated_at IS NULL", 'return reply.code(404).send({ error: "mdata_driver_not_found" })', "INSERT INTO mdata.driver_equipment_qualifications"];
const audit = (candidate) => tokens.filter((token) => !candidate.includes(token));
const missing = audit(handler);
if (missing.length) { console.error(`${LABEL} FAIL — ${missing.join(", ")}`); process.exit(1); }
if (process.argv.includes("--selftest")) {
  let caught = 0;
  for (const token of tokens) { const mutated = handler.replace(token, "REMOVED"); if (mutated !== handler && audit(mutated).includes(token)) caught++; }
  if (caught !== tokens.length) { console.error(`${LABEL} SELFTEST FAIL — ${caught}/${tokens.length}`); process.exit(1); }
  console.log(`${LABEL} SELFTEST PASS — ${caught}/${tokens.length} mutations rejected`);
}
console.log(`${LABEL} PASS — qualification create admits active selected-company shared drivers`);
