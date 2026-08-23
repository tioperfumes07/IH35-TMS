#!/usr/bin/env node
import fs from "node:fs";
const LABEL = "verify-driver-qualification-patch-scope";
const backend = fs.readFileSync("apps/backend/src/mdata/driver-profile.routes.ts", "utf8");
const api = fs.readFileSync("apps/frontend/src/api/mdata.ts", "utf8");
const page = fs.readFileSync("apps/frontend/src/pages/DriverDetail.tsx", "utf8");
const start = backend.indexOf('app.patch<{ Params: { id: string; qual_id: string }; Querystring: { operating_company_id: string } }>("/api/v1/mdata/drivers/:id/qualifications/:qual_id"');
const end = backend.indexOf('app.get<{ Params: { id: string; qual_id: string } }>', start);
const handler = start >= 0 && end > start ? backend.slice(start, end) : "";
const checks = [
  ["backend", handler, "qualificationHistoryQuerySchema.safeParse(req.query ?? {})"],
  ["backend", handler, "return withCurrentUser(authUser.uuid"],
  ["backend", handler, "FROM mdata.driver_company_authorizations qualification_patch_dca"],
  ["backend", handler, "qualification_patch_dca.driver_id = d.id"],
  ["backend", handler, "qualification_patch_dca.company_id = $"],
  ["backend", handler, "qualification_patch_dca.is_authorized = true"],
  ["backend", handler, "qualification_patch_dca.deactivated_at IS NULL"],
  ["api", api, "deactivateDriverQualification(driverId: string, qualificationId: string, operatingCompanyId: string)"],
  ["page", page, "deactivateDriverQualification(driverId, qualificationId, companyId)"],
];
const audit = (candidate) => checks.filter(([key, , token]) => !candidate[key].includes(token)).map(([, , token]) => token);
const good = { backend: handler, api, page };
const missing = audit(good);
if (missing.length) { console.error(`${LABEL} FAIL — ${missing.join(", ")}`); process.exit(1); }
if (process.argv.includes("--selftest")) {
  let caught = 0;
  for (const [key, , token] of checks) { const mutated = { ...good, [key]: good[key].replace(token, "REMOVED") }; if (mutated[key] !== good[key] && audit(mutated).includes(token)) caught++; }
  if (caught !== checks.length) { console.error(`${LABEL} SELFTEST FAIL — ${caught}/${checks.length}`); process.exit(1); }
  console.log(`${LABEL} SELFTEST PASS — ${caught}/${checks.length} mutations rejected`);
}
console.log(`${LABEL} PASS — qualification PATCH is company scoped and returns its result`);
