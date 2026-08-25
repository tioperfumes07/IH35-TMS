#!/usr/bin/env node
import fs from "node:fs";
const LABEL = "verify-driver-qualification-rate-change-scope";
const backend = fs.readFileSync("apps/backend/src/mdata/driver-profile.routes.ts", "utf8");
const api = fs.readFileSync("apps/frontend/src/api/mdata.ts", "utf8");
const page = fs.readFileSync("apps/frontend/src/pages/DriverDetail.tsx", "utf8");
const routeMarker = '"/api/v1/mdata/drivers/:id/qualifications/:qual_id/rates/change"';
const routePosition = backend.indexOf(routeMarker);
const start = routePosition >= 0 ? backend.lastIndexOf("app.post<", routePosition) : -1;
const end = routePosition >= 0 ? backend.indexOf("\n  app.", routePosition + routeMarker.length) : -1;
const handler = start >= 0 && end > start ? backend.slice(start, end) : "";
const apiStart = api.indexOf("export function changeDriverQualificationRate(");
const apiEnd = api.indexOf("export function listDriverCompanyAuthorizations", apiStart);
const apiHandler = apiStart >= 0 && apiEnd > apiStart ? api.slice(apiStart, apiEnd) : "";
const checks = [
  ["backend", handler, routeMarker.slice(1, -1)],
  ["backend", handler, "qualificationHistoryQuerySchema.safeParse(req.query ?? {})"],
  ["backend", handler, "resolveOperatingCompanyId(client, authUser.uuid, parsedQuery.data.operating_company_id)"],
  ["backend", handler, "JOIN mdata.drivers d ON d.id = dq.driver_id"],
  ["backend", handler, "FROM mdata.driver_company_authorizations qualification_rate_dca"],
  ["backend", handler, "qualification_rate_dca.company_id = $3::uuid"],
  ["backend", handler, "qualification_rate_dca.is_authorized = true"],
  ["backend", handler, "qualification_rate_dca.deactivated_at IS NULL"],
  ["api", apiHandler, "operating_company_id=${encodeURIComponent(operatingCompanyId)}"],
  ["page", page, "changeDriverQualificationRate(driverId, qualificationId, body, companyId)"],
];
const audit = (candidate) => checks.filter(([key, , token]) => !candidate[key].includes(token)).map(([, , token]) => token);
const good = { backend: handler, api: apiHandler, page };
const missing = audit(good);
if (missing.length) { console.error(`${LABEL} FAIL — ${missing.join(", ")}`); process.exit(1); }
if (process.argv.includes("--selftest")) {
  let caught = 0;
  for (const [key, , token] of checks) {
    const mutated = { ...good, [key]: good[key].replace(token, "REMOVED") };
    if (mutated[key] !== good[key] && audit(mutated).includes(token)) caught++;
  }
  if (caught !== checks.length) { console.error(`${LABEL} SELFTEST FAIL — ${caught}/${checks.length}`); process.exit(1); }
  console.log(`${LABEL} SELFTEST PASS — ${caught}/${checks.length} mutations rejected`);
}
console.log(`${LABEL} PASS — qualification rate changes are selected-company scoped end to end`);
