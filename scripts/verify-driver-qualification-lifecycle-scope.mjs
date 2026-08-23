#!/usr/bin/env node
import fs from "node:fs";

const LABEL = "verify-driver-qualification-lifecycle-scope";
const backend = fs.readFileSync("apps/backend/src/mdata/driver-profile.routes.ts", "utf8");
const api = fs.readFileSync("apps/frontend/src/api/mdata.ts", "utf8");
const page = fs.readFileSync("apps/frontend/src/pages/DriverDetail.tsx", "utf8");

const deleteStart = backend.indexOf('app.delete<{ Params: { id: string; qual_id: string }; Querystring: { operating_company_id: string } }>("/api/v1/mdata/drivers/:id/qualifications/:qual_id"');
const reactivateStart = backend.indexOf('app.post<{ Params: { id: string; qual_id: string }; Querystring: { operating_company_id: string } }>(', deleteStart);
const reactivateEnd = backend.indexOf('app.get<{ Params: { id: string } }>', reactivateStart);
const deleteHandler = deleteStart >= 0 && reactivateStart > deleteStart ? backend.slice(deleteStart, reactivateStart) : "";
const reactivateHandler = reactivateStart >= 0 && reactivateEnd > reactivateStart ? backend.slice(reactivateStart, reactivateEnd) : "";
const apiStart = api.indexOf("export function reactivateQualification(");
const apiEnd = api.indexOf("export function getDriverQualificationRateHistory", apiStart);
const apiHandler = apiStart >= 0 && apiEnd > apiStart ? api.slice(apiStart, apiEnd) : "";

const checks = [
  ["delete", deleteHandler, "qualificationHistoryQuerySchema.safeParse(req.query ?? {})"],
  ["delete", deleteHandler, "resolveOperatingCompanyId(client, authUser.uuid, parsedQuery.data.operating_company_id)"],
  ["delete", deleteHandler, "FROM mdata.driver_company_authorizations qualification_delete_dca"],
  ["delete", deleteHandler, "qualification_delete_dca.company_id = $4::uuid"],
  ["delete", deleteHandler, "qualification_delete_dca.is_authorized = true"],
  ["delete", deleteHandler, "qualification_delete_dca.deactivated_at IS NULL"],
  ["reactivate", reactivateHandler, "qualificationHistoryQuerySchema.safeParse(req.query ?? {})"],
  ["reactivate", reactivateHandler, "resolveOperatingCompanyId(client, authUser.uuid, parsedQuery.data.operating_company_id)"],
  ["reactivate", reactivateHandler, "JOIN mdata.drivers d ON d.id = dq.driver_id"],
  ["reactivate", reactivateHandler, "FROM mdata.driver_company_authorizations qualification_reactivate_dca"],
  ["reactivate", reactivateHandler, "qualification_reactivate_dca.company_id = $3::uuid"],
  ["reactivate", reactivateHandler, "qualification_reactivate_dca.is_authorized = true"],
  ["reactivate", reactivateHandler, "qualification_reactivate_dca.deactivated_at IS NULL"],
  ["api", apiHandler, "reactivateQualification(driverId: string, qualificationId: string, operatingCompanyId: string)"],
  ["api", apiHandler, "operating_company_id=${encodeURIComponent(operatingCompanyId)}"],
  ["page", page, "reactivateQualification(driverId, qualificationId, companyId)"],
];

const audit = (candidate) => checks
  .filter(([key, , token]) => !candidate[key].includes(token))
  .map(([, , token]) => token);
const good = { delete: deleteHandler, reactivate: reactivateHandler, api: apiHandler, page };
const missing = audit(good);
if (missing.length) {
  console.error(`${LABEL} FAIL — ${missing.join(", ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  let caught = 0;
  for (const [key, , token] of checks) {
    const mutated = { ...good, [key]: good[key].replace(token, "REMOVED") };
    if (mutated[key] !== good[key] && audit(mutated).includes(token)) caught++;
  }
  if (caught !== checks.length) {
    console.error(`${LABEL} SELFTEST FAIL — ${caught}/${checks.length}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — ${caught}/${checks.length} mutations rejected`);
}

console.log(`${LABEL} PASS — qualification delete/reactivate are selected-company scoped end to end`);
