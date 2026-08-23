#!/usr/bin/env node
import fs from "node:fs";
const LABEL = "verify-driver-qualification-create-shared";
const source = fs.readFileSync("apps/backend/src/mdata/driver-profile.routes.ts", "utf8");
const api = fs.readFileSync("apps/frontend/src/api/mdata.ts", "utf8");
const page = fs.readFileSync("apps/frontend/src/pages/DriverDetail.tsx", "utf8");
const start = source.indexOf('app.post<{ Params: { id: string }; Querystring: { operating_company_id: string } }>("/api/v1/mdata/drivers/:id/qualifications"');
const end = source.indexOf('app.patch<{ Params: { id: string; qual_id: string }; Querystring: { operating_company_id: string } }>', start);
const handler = start >= 0 && end > start ? source.slice(start, end) : "";
const apiStart = api.indexOf("export function createDriverQualification(");
const apiEnd = api.indexOf("export function updateDriverQualification", apiStart);
const apiHandler = apiStart >= 0 && apiEnd > apiStart ? api.slice(apiStart, apiEnd) : "";
const checks = [
  ["backend", handler, "qualificationHistoryQuerySchema.safeParse(req.query ?? {})"],
  ["backend", handler, "resolveOperatingCompanyId(client, authUser.uuid, parsedQuery.data.operating_company_id)"],
  ["backend", handler, "FROM mdata.driver_company_authorizations qualification_create_dca"],
  ["backend", handler, "qualification_create_dca.driver_id = d.id"],
  ["backend", handler, "qualification_create_dca.company_id = $2::uuid"],
  ["backend", handler, "qualification_create_dca.is_authorized = true"],
  ["backend", handler, "qualification_create_dca.deactivated_at IS NULL"],
  ["backend", handler, 'return reply.code(404).send({ error: "mdata_driver_not_found" })'],
  ["backend", handler, "INSERT INTO mdata.driver_equipment_qualifications"],
  ["api", apiHandler, "operating_company_id=${encodeURIComponent(operatingCompanyId)}"],
  ["page", page, "createDriverQualification(driverId, body, companyId)"],
];
const audit = (candidate) => checks.filter(([key, , token]) => !candidate[key].includes(token)).map(([, , token]) => token);
const good = { backend: handler, api: apiHandler, page };
const missing = audit(good);
if (missing.length) { console.error(`${LABEL} FAIL — ${missing.join(", ")}`); process.exit(1); }
if (process.argv.includes("--selftest")) {
  let caught = 0;
  for (const [key, , token] of checks) { const mutated = { ...good, [key]: good[key].replace(token, "REMOVED") }; if (mutated[key] !== good[key] && audit(mutated).includes(token)) caught++; }
  if (caught !== checks.length) { console.error(`${LABEL} SELFTEST FAIL — ${caught}/${checks.length}`); process.exit(1); }
  console.log(`${LABEL} SELFTEST PASS — ${caught}/${checks.length} mutations rejected`);
}
console.log(`${LABEL} PASS — qualification create admits active selected-company shared drivers`);
